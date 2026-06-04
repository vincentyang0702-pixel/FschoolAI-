/**
 * NeuroAGI Brain Context Window Writer
 *
 * Writes a pre-computed intelligence snapshot for each person before every session.
 * FschoolAI reads this at session start — zero latency, brain already knows what matters.
 *
 * The context window contains everything Claude needs to respond like a brain, not a chatbot:
 *   - Current stress level and momentum state
 *   - Active deadlines and academic pressure
 *   - Confirmed hypotheses about how this person responds
 *   - Pending intervention (if any) — what the brain wants to say
 *   - What the brain is watching for right now
 *   - What NOT to mention (defensive topics, recent sensitivities)
 *   - Voice and communication preferences
 *   - Recent patterns (last 48h signals summary)
 *
 * Refreshed:
 *   - On every new message (debounced 3s)
 *   - After every reflection
 *   - After every grade event
 *   - After every intervention is queued
 *   - On a 30-minute heartbeat (catch anything missed)
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
});

// ─────────────────────────────────────────────────────────────────────────────
// Context Window Writer
// ─────────────────────────────────────────────────────────────────────────────

export class ContextWindowWriter {
  // In-memory cache — avoid rewriting if nothing changed
  private lastWritten: Map<string, { hash: string; at: number }> = new Map();
  private writeInProgress: Set<string> = new Set();

  /**
   * Refresh the context window for a person.
   * Called automatically by Realtime events and the scheduler.
   */
  async refresh(personId: string): Promise<{ success: boolean; skipped?: boolean }> {
    // Prevent concurrent writes for the same person
    if (this.writeInProgress.has(personId)) {
      return { success: true, skipped: true };
    }

    this.writeInProgress.add(personId);

    try {
      // Gather all the data the brain needs
      const data = await this.gatherData(personId);
      if (!data) return { success: false };

      // Build the context window object
      const contextWindow = this.buildContextWindow(data);

      // Check if anything meaningful changed (avoid unnecessary writes)
      const hash = this.hashContext(contextWindow);
      const last = this.lastWritten.get(personId);
      if (last && last.hash === hash && Date.now() - last.at < 5 * 60 * 1000) {
        return { success: true, skipped: true }; // Nothing changed in last 5 min
      }

      // Write to database
      await supabase
        .schema('brain')
        .from('context_window')
        .upsert(
          {
            person_id: personId,
            ...contextWindow,
            written_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6h TTL
          },
          { onConflict: 'person_id' }
        );

      this.lastWritten.set(personId, { hash, at: Date.now() });
      console.log(`[ContextWindow] Refreshed for ${personId.slice(0, 8)}...`);

      return { success: true };
    } catch (err) {
      console.error('[ContextWindow] Refresh error:', err);
      return { success: false };
    } finally {
      this.writeInProgress.delete(personId);
    }
  }

  /**
   * Read the context window for a person.
   * Called by FschoolAI at session start — this is the zero-latency read.
   */
  async read(personId: string): Promise<BrainContextWindow | null> {
    try {
      const { data, error } = await supabase
        .schema('brain')
        .from('context_window')
        .select('*')
        .eq('person_id', personId)
        .single();

      if (error || !data) {
        // No context window yet — write one now (first time)
        await this.refresh(personId);
        const { data: fresh } = await supabase
          .schema('brain')
          .from('context_window')
          .select('*')
          .eq('person_id', personId)
          .single();
        return fresh as BrainContextWindow || null;
      }

      // Check if expired
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        // Expired — refresh in background, return stale data for now
        this.refresh(personId).catch(console.error);
      }

      return data as BrainContextWindow;
    } catch (err) {
      console.error('[ContextWindow] Read error:', err);
      return null;
    }
  }

  /**
   * Format context window as a system prompt injection for Claude.
   * This is what FschoolAI passes to Claude as additional system context.
   */
  formatAsSystemPrompt(ctx: BrainContextWindow): string {
    const lines: string[] = [
      '## Brain Context (NeuroAGI — live intelligence snapshot)',
      '',
    ];

    // Person state
    lines.push(`**Current State:** Stress ${Math.round((ctx.stress_level || 0) * 100)}% | Momentum: ${ctx.momentum_state || 'unknown'} | Sleep last night: ${ctx.sleep_hours_last_night ? ctx.sleep_hours_last_night + 'h' : 'unknown'}`);

    // Active deadline
    if (ctx.most_urgent_deadline) {
      lines.push(`**Most Urgent Deadline:** ${ctx.most_urgent_deadline.name} — due in ${ctx.most_urgent_deadline.hours_remaining}h (${ctx.most_urgent_deadline.course})`);
    }

    // Pending intervention
    if (ctx.pending_intervention) {
      lines.push(`**Brain's Intended Message:** ${ctx.pending_intervention}`);
      lines.push(`*(Weave this into your response naturally — do not quote it directly)*`);
    }

    // Confirmed hypotheses
    if (ctx.confirmed_hypotheses && ctx.confirmed_hypotheses.length > 0) {
      lines.push('');
      lines.push('**Confirmed Patterns About This Person:**');
      ctx.confirmed_hypotheses.forEach(h => lines.push(`- ${h}`));
    }

    // What brain is watching
    if (ctx.watching_for) {
      lines.push('');
      lines.push(`**Brain is watching for:** ${ctx.watching_for}`);
    }

    // Do not mention
    if (ctx.do_not_mention && ctx.do_not_mention.length > 0) {
      lines.push('');
      lines.push('**Do NOT mention or bring up:**');
      ctx.do_not_mention.forEach(d => lines.push(`- ${d}`));
    }

    // Voice preferences
    if (ctx.voice_preferences) {
      lines.push('');
      lines.push(`**Communication Style:** ${ctx.voice_preferences}`);
    }

    // Recent context
    if (ctx.recent_context_summary) {
      lines.push('');
      lines.push(`**Recent Context (last 48h):** ${ctx.recent_context_summary}`);
    }

    return lines.join('\n');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Data Gathering
  // ─────────────────────────────────────────────────────────────────────────

  private async gatherData(personId: string): Promise<ContextData | null> {
    try {
      const now = new Date();
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

      const [
        personResult,
        momentumResult,
        lastReflectionResult,
        hypothesesResult,
        pendingInterventionResult,
        recentSignalsResult,
        upcomingDeadlinesResult,
        voiceResult,
        preferencesResult,
        recentPatternsResult,
      ] = await Promise.all([
        supabase.schema('neuro').from('persons').select('id,name,timezone,university,programme').eq('id', personId).single(),
        supabase.schema('brain').from('momentum').select('*').eq('person_id', personId).single(),
        supabase.schema('brain').from('reflections').select('summary,stress_level,momentum_assessment,key_insights,do_not_mention,watching_for').eq('person_id', personId).order('created_at', { ascending: false }).limit(1).single(),
        supabase.schema('brain').from('hypotheses').select('hypothesis,domain').eq('person_id', personId).eq('status', 'confirmed').order('confidence', { ascending: false }).limit(8),
        supabase.schema('brain').from('interventions').select('message,approach,urgency').eq('person_id', personId).eq('status', 'queued').order('urgency', { ascending: false }).limit(1).single(),
        supabase.schema('brain').from('signals').select('signal_type,subtype,value,value_text,occurred_at').eq('person_id', personId).gte('occurred_at', fortyEightHoursAgo).order('occurred_at', { ascending: false }).limit(30),
        supabase.schema('fschool').from('assignments').select('id,name,title,due_date,course_id,points_possible').gte('due_date', now.toISOString()).lte('due_date', new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()).order('due_date', { ascending: true }).limit(5),
        supabase.schema('neuro').from('voice').select('*').eq('person_id', personId).single(),
        supabase.schema('neuro').from('preferences').select('*').eq('person_id', personId).single(),
        supabase.schema('neuro').from('patterns').select('pattern,category,confidence').eq('person_id', personId).gte('confidence', 0.7).order('confidence', { ascending: false }).limit(10),
      ]);

      return {
        person: personResult.data,
        momentum: momentumResult.data,
        lastReflection: lastReflectionResult.data,
        hypotheses: hypothesesResult.data || [],
        pendingIntervention: pendingInterventionResult.data,
        recentSignals: recentSignalsResult.data || [],
        upcomingDeadlines: upcomingDeadlinesResult.data || [],
        voice: voiceResult.data,
        preferences: preferencesResult.data,
        recentPatterns: recentPatternsResult.data || [],
      };
    } catch (err) {
      console.error('[ContextWindow] Data gathering error:', err);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Context Window Builder
  // ─────────────────────────────────────────────────────────────────────────

  private buildContextWindow(data: ContextData): Partial<BrainContextWindow> {
    const ctx: Partial<BrainContextWindow> = {};

    // Stress level — from last reflection or recent stress signals
    if (data.lastReflection?.stress_level !== undefined) {
      ctx.stress_level = data.lastReflection.stress_level;
    } else {
      const stressSignals = data.recentSignals.filter(s => s.signal_type === 'stress');
      if (stressSignals.length > 0) {
        ctx.stress_level = stressSignals.reduce((sum, s) => sum + (s.value || 0), 0) / stressSignals.length;
      }
    }

    // Momentum state
    ctx.momentum_state = data.momentum?.state || data.lastReflection?.momentum_assessment || 'unknown';

    // Sleep — from recent sleep signals
    const sleepSignals = data.recentSignals.filter(s => s.signal_type === 'sleep' && s.subtype === 'hours_slept');
    if (sleepSignals.length > 0) {
      ctx.sleep_hours_last_night = sleepSignals[0].value || null;
    }

    // Most urgent deadline
    if (data.upcomingDeadlines.length > 0) {
      const deadline = data.upcomingDeadlines[0];
      const hoursRemaining = Math.round((new Date(deadline.due_date).getTime() - Date.now()) / (1000 * 60 * 60));
      ctx.most_urgent_deadline = {
        name: deadline.name || deadline.title || 'Assignment',
        hours_remaining: hoursRemaining,
        course: deadline.course_id || 'Unknown Course',
        assignment_id: deadline.id,
      };
    }

    // Pending intervention
    if (data.pendingIntervention?.message) {
      ctx.pending_intervention = data.pendingIntervention.message;
      ctx.intervention_approach = data.pendingIntervention.approach;
    }

    // Confirmed hypotheses (as plain strings)
    ctx.confirmed_hypotheses = data.hypotheses.map(h => h.hypothesis);

    // What brain is watching
    ctx.watching_for = data.lastReflection?.watching_for || null;

    // Do not mention
    ctx.do_not_mention = data.lastReflection?.do_not_mention || [];

    // Voice preferences
    if (data.voice) {
      const voiceParts = [];
      if (data.voice.register) voiceParts.push(data.voice.register);
      if (data.voice.preferred_length) voiceParts.push(`prefers ${data.voice.preferred_length} responses`);
      if (data.voice.tone_preference) voiceParts.push(data.voice.tone_preference);
      ctx.voice_preferences = voiceParts.join(', ') || null;
    }

    // Recent context summary (last 48h signals in plain language)
    ctx.recent_context_summary = this.summarizeRecentSignals(data.recentSignals);

    // Key insights from last reflection
    ctx.key_insights = data.lastReflection?.key_insights || null;

    // Active goals count
    ctx.active_goals_count = 0; // Will be updated separately

    return ctx;
  }

  private summarizeRecentSignals(signals: any[]): string {
    if (signals.length === 0) return 'No recent signals.';

    const summary: string[] = [];

    const stressSignals = signals.filter(s => s.signal_type === 'stress');
    const academicSignals = signals.filter(s => s.signal_type === 'academic');
    const behavioralSignals = signals.filter(s => s.signal_type === 'behavioral');
    const sleepSignals = signals.filter(s => s.signal_type === 'sleep');

    if (sleepSignals.length > 0) {
      const avgSleep = sleepSignals.reduce((sum, s) => sum + (s.value || 0), 0) / sleepSignals.length;
      summary.push(`Sleep: avg ${avgSleep.toFixed(1)}h`);
    }

    if (stressSignals.length > 0) {
      const avgStress = stressSignals.reduce((sum, s) => sum + (s.value || 0), 0) / stressSignals.length;
      summary.push(`Stress: ${Math.round(avgStress * 100)}% avg`);
    }

    if (academicSignals.length > 0) {
      const gradeEvents = academicSignals.filter(s => s.subtype === 'grade_received');
      if (gradeEvents.length > 0) summary.push(`${gradeEvents.length} grade(s) received`);
    }

    if (behavioralSignals.length > 0) {
      const sessions = behavioralSignals.filter(s => s.subtype === 'session_started');
      if (sessions.length > 0) summary.push(`${sessions.length} session(s) in 48h`);
    }

    return summary.length > 0 ? summary.join(' | ') : 'Normal activity patterns.';
  }

  private hashContext(ctx: Partial<BrainContextWindow>): string {
    // Simple hash — just check the key fields that matter
    return JSON.stringify({
      stress: Math.round((ctx.stress_level || 0) * 10),
      momentum: ctx.momentum_state,
      intervention: ctx.pending_intervention?.slice(0, 50),
      deadline: ctx.most_urgent_deadline?.name,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BrainContextWindow {
  person_id: string;
  written_at: string;
  expires_at: string;

  // Current state
  stress_level: number | null;        // 0-1
  momentum_state: string | null;      // 'building' | 'stuck' | 'flowing' | 'recovering'
  sleep_hours_last_night: number | null;

  // Academic pressure
  most_urgent_deadline: {
    name: string;
    hours_remaining: number;
    course: string;
    assignment_id: string;
  } | null;

  // Brain's intent
  pending_intervention: string | null;
  intervention_approach: string | null;
  watching_for: string | null;

  // Person intelligence
  confirmed_hypotheses: string[];
  do_not_mention: string[];
  voice_preferences: string | null;
  key_insights: string | null;

  // Recent context
  recent_context_summary: string | null;
  active_goals_count: number;
}

interface ContextData {
  person: any;
  momentum: any;
  lastReflection: any;
  hypotheses: any[];
  pendingIntervention: any;
  recentSignals: any[];
  upcomingDeadlines: any[];
  voice: any;
  preferences: any;
  recentPatterns: any[];
}

export const contextWindowWriter = new ContextWindowWriter();
