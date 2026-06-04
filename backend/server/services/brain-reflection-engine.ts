/**
 * NeuroAGI Brain — Reflection Engine
 * 
 * Runs nightly at 2 AM. Reviews everything that happened today.
 * Extracts insights, detects patterns, tracks emotions, assesses goal progress.
 * 
 * This is the brain's "journaling" — it processes the day and stores
 * structured intelligence that the synthesis engine uses the next day.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getBrainClient, BrainClaudeClient } from './brain-claude-client.js';

// ============================================================
// TYPES
// ============================================================

interface Signal {
  id: string;
  signal_type: string;
  payload: Record<string, unknown>;
  product_source: string;
  created_at: string;
}

interface Message {
  id: string;
  content: string;
  role: string;
  created_at: string;
  session_id: string;
}

interface Pattern {
  pattern: string;
  strength: number;
  category: string;
}

interface MemoryFact {
  fact: string;
  category: string;
}

interface Goal {
  id: string;
  goal: string;
  progress: number;
  priority: number;
  category: string;
  deadline: string | null;
}

interface PersonContext {
  personId: string;
  displayName: string;
  goals: Goal[];
  patterns: Pattern[];
  memoryFacts: MemoryFact[];
  previousReflection?: Record<string, unknown> | null;
}

interface DayData {
  date: string;
  signals: Signal[];
  messages: Message[];
  signalCount: number;
  messageCount: number;
  signalsByType: Record<string, number>;
  messagesByHour: Record<string, number>;
  productSources: string[];
}

interface ReflectionOutput {
  dailySummary: string;
  keyInsights: Array<{ insight: string; source: string; confidence: number }>;
  patternsObserved: Array<{ pattern: string; strength: number; category: string }>;
  decisionsAnalyzed: Array<{ decision: string; outcome: string; lesson: string }>;
  emotionsDetected: Array<{ emotion: string; intensity: number; trigger: string }>;
  timeAllocation: Record<string, number>;
  goalsProgress: Record<string, number>;
  tomorrowFocus: string;
}

// ============================================================
// REFLECTION ENGINE
// ============================================================

export class BrainReflectionEngine {
  private supabase: SupabaseClient;
  private claude: BrainClaudeClient;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    this.claude = getBrainClient();
  }

  // ============================================================
  // MAIN: Run nightly reflection for all active persons
  // ============================================================

  async runNightlyReflection(): Promise<void> {
    console.log('[ReflectionEngine] Starting nightly reflection...');
    const startTime = Date.now();

    try {
      // Get all active persons
      const { data: persons, error } = await this.supabase
        .from('neuro.persons')
        .select('id, display_name')
        .eq('is_test', false);

      if (error) throw error;
      if (!persons || persons.length === 0) {
        console.log('[ReflectionEngine] No active persons found');
        return;
      }

      console.log(`[ReflectionEngine] Processing ${persons.length} persons...`);

      for (const person of persons) {
        try {
          await this.reflectForPerson(person.id, person.display_name);
        } catch (err) {
          console.error(`[ReflectionEngine] Failed for person ${person.id}:`, err);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[ReflectionEngine] Nightly reflection complete in ${duration}ms`);
    } catch (err) {
      console.error('[ReflectionEngine] Fatal error in nightly reflection:', err);
      throw err;
    }
  }

  // ============================================================
  // REFLECT FOR A SINGLE PERSON
  // ============================================================

  async reflectForPerson(personId: string, displayName: string, date?: Date): Promise<void> {
    const targetDate = date || new Date();
    const dateStr = targetDate.toISOString().split('T')[0];

    console.log(`[ReflectionEngine] Reflecting for ${displayName} (${personId}) on ${dateStr}`);

    // Start brain session
    const sessionId = await this.startBrainSession(personId);

    try {
      // 1. Load person context
      const personContext = await this.loadPersonContext(personId);

      // 2. Load day's data
      const dayData = await this.loadDayData(personId, targetDate);

      if (dayData.signalCount === 0 && dayData.messageCount === 0) {
        console.log(`[ReflectionEngine] No data for ${displayName} on ${dateStr} — skipping`);
        await this.endBrainSession(sessionId, 'completed', 'No data to reflect on');
        return;
      }

      console.log(`[ReflectionEngine] Loaded ${dayData.signalCount} signals, ${dayData.messageCount} messages`);

      // 3. Generate reflection via Claude
      const claudeResult = await this.claude.generateReflection(personId, dayData, personContext);

      // 4. Parse Claude's response
      let reflection: ReflectionOutput;
      try {
        reflection = BrainClaudeClient.parseJSON<ReflectionOutput>(claudeResult.content);
      } catch (parseErr) {
        console.error('[ReflectionEngine] Failed to parse Claude response:', parseErr);
        console.error('[ReflectionEngine] Raw response:', claudeResult.content.substring(0, 500));
        throw new Error('Failed to parse reflection JSON from Claude');
      }

      // 5. Store reflection in database
      await this.storeReflection(personId, dateStr, reflection, dayData, claudeResult);

      // 6. Update patterns from reflection
      await this.updatePatterns(personId, reflection.patternsObserved);

      // 7. Update goal progress
      await this.updateGoalProgress(personId, reflection.goalsProgress);

      // 8. Update brain session
      await this.endBrainSession(sessionId, 'completed', reflection.dailySummary, {
        signalsProcessed: dayData.signalCount,
        insightsGenerated: reflection.keyInsights?.length || 0,
        tokensUsed: claudeResult.totalTokens,
        cost: claudeResult.costUsd,
      });

      console.log(`[ReflectionEngine] ✓ Reflection stored for ${displayName} on ${dateStr}`);
      console.log(`[ReflectionEngine]   Insights: ${reflection.keyInsights?.length || 0}`);
      console.log(`[ReflectionEngine]   Patterns: ${reflection.patternsObserved?.length || 0}`);
      console.log(`[ReflectionEngine]   Cost: $${claudeResult.costUsd.toFixed(6)}`);

    } catch (err) {
      await this.endBrainSession(sessionId, 'failed', String(err));
      throw err;
    }
  }

  // ============================================================
  // DATA LOADING
  // ============================================================

  private async loadPersonContext(personId: string): Promise<PersonContext> {
    // Load person
    const { data: person } = await this.supabase
      .from('neuro.persons')
      .select('id, display_name')
      .eq('id', personId)
      .single();

    // Load active goals
    const { data: goals } = await this.supabase
      .from('brain.goals')
      .select('id, goal, progress, priority, category, deadline')
      .eq('person_id', personId)
      .eq('status', 'active')
      .order('priority', { ascending: false });

    // Load behavioral patterns
    const { data: patterns } = await this.supabase
      .from('neuro.patterns')
      .select('pattern, strength, category')
      .eq('person_id', personId)
      .order('strength', { ascending: false })
      .limit(20);

    // Load memory facts
    const { data: memoryFacts } = await this.supabase
      .from('neuro.memory')
      .select('fact, category')
      .eq('person_id', personId)
      .limit(20);

    // Load previous reflection
    const { data: prevReflection } = await this.supabase
      .from('brain.reflections')
      .select('daily_summary, key_insights, patterns_observed, reflection_date')
      .eq('person_id', personId)
      .order('reflection_date', { ascending: false })
      .limit(1)
      .single();

    return {
      personId,
      displayName: person?.display_name || 'Unknown',
      goals: goals || [],
      patterns: patterns || [],
      memoryFacts: memoryFacts || [],
      previousReflection: prevReflection || null,
    };
  }

  private async loadDayData(personId: string, date: Date): Promise<DayData> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const dateStr = date.toISOString().split('T')[0];

    // Load signals for the day
    const { data: signals } = await this.supabase
      .from('brain.signals')
      .select('id, signal_type, payload, product_source, created_at')
      .eq('person_id', personId)
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString())
      .order('created_at', { ascending: true })
      .limit(500);

    // Load messages for the day
    const { data: sessions } = await this.supabase
      .from('agents.sessions')
      .select('id')
      .eq('person_id', personId)
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());

    const sessionIds = sessions?.map(s => s.id) || [];
    let messages: Message[] = [];

    if (sessionIds.length > 0) {
      const { data: msgs } = await this.supabase
        .from('agents.messages')
        .select('id, content, role, created_at, session_id')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: true })
        .limit(200);
      messages = msgs || [];
    }

    // Aggregate signal types
    const signalsByType: Record<string, number> = {};
    const productSources = new Set<string>();

    for (const signal of signals || []) {
      signalsByType[signal.signal_type] = (signalsByType[signal.signal_type] || 0) + 1;
      productSources.add(signal.product_source);
    }

    // Aggregate messages by hour
    const messagesByHour: Record<string, number> = {};
    for (const msg of messages) {
      const hour = new Date(msg.created_at).getHours().toString();
      messagesByHour[hour] = (messagesByHour[hour] || 0) + 1;
    }

    return {
      date: dateStr,
      signals: (signals || []).slice(0, 100), // limit to 100 for context window
      messages: messages.slice(0, 50), // limit to 50 for context window
      signalCount: signals?.length || 0,
      messageCount: messages.length,
      signalsByType,
      messagesByHour,
      productSources: Array.from(productSources),
    };
  }

  // ============================================================
  // STORAGE
  // ============================================================

  private async storeReflection(
    personId: string,
    dateStr: string,
    reflection: ReflectionOutput,
    dayData: DayData,
    claudeResult: { totalTokens: number; costUsd: number }
  ): Promise<void> {
    const { error } = await this.supabase
      .from('brain.reflections')
      .upsert({
        person_id: personId,
        reflection_date: dateStr,
        daily_summary: reflection.dailySummary,
        key_insights: reflection.keyInsights,
        patterns_observed: reflection.patternsObserved,
        decisions_made: reflection.decisionsAnalyzed,
        emotions_detected: reflection.emotionsDetected,
        time_allocation: reflection.timeAllocation,
        goals_progress: reflection.goalsProgress,
        signals_processed: dayData.signalCount,
        signals_relevant: dayData.signalCount, // all signals are relevant for now
        claude_tokens_used: claudeResult.totalTokens,
        claude_cost_usd: claudeResult.costUsd,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'person_id,reflection_date',
      });

    if (error) {
      console.error('[ReflectionEngine] Failed to store reflection:', error);
      throw error;
    }
  }

  private async updatePatterns(
    personId: string,
    newPatterns: Array<{ pattern: string; strength: number; category: string }>
  ): Promise<void> {
    if (!newPatterns || newPatterns.length === 0) return;

    for (const pattern of newPatterns) {
      // Check if pattern already exists
      const { data: existing } = await this.supabase
        .from('neuro.patterns')
        .select('id, strength, observation_count')
        .eq('person_id', personId)
        .eq('pattern', pattern.pattern)
        .single();

      if (existing) {
        // Strengthen existing pattern (moving average)
        const newStrength = (existing.strength * 0.7) + (pattern.strength * 0.3);
        await this.supabase
          .from('neuro.patterns')
          .update({
            strength: newStrength,
            observation_count: (existing.observation_count || 1) + 1,
            last_observed: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        // Insert new pattern
        await this.supabase
          .from('neuro.patterns')
          .insert({
            person_id: personId,
            pattern: pattern.pattern,
            strength: pattern.strength,
            category: pattern.category || 'behavioral',
            observation_count: 1,
            last_observed: new Date().toISOString(),
          });
      }
    }
  }

  private async updateGoalProgress(
    personId: string,
    goalsProgress: Record<string, number>
  ): Promise<void> {
    if (!goalsProgress) return;

    for (const [goalId, progress] of Object.entries(goalsProgress)) {
      if (typeof progress === 'number' && progress >= 0 && progress <= 100) {
        await this.supabase
          .from('brain.goals')
          .update({
            progress,
            updated_at: new Date().toISOString(),
          })
          .eq('id', goalId)
          .eq('person_id', personId);
      }
    }
  }

  // ============================================================
  // BRAIN SESSION TRACKING
  // ============================================================

  private async startBrainSession(personId: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('brain.brain_sessions')
      .insert({
        person_id: personId,
        session_type: 'reflection',
        started_at: new Date().toISOString(),
        status: 'running',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[ReflectionEngine] Failed to start brain session:', error);
      return 'unknown';
    }

    return data.id;
  }

  private async endBrainSession(
    sessionId: string,
    status: 'completed' | 'failed',
    summary: string,
    stats?: {
      signalsProcessed?: number;
      insightsGenerated?: number;
      tokensUsed?: number;
      cost?: number;
    }
  ): Promise<void> {
    await this.supabase
      .from('brain.brain_sessions')
      .update({
        ended_at: new Date().toISOString(),
        status,
        summary,
        signals_processed: stats?.signalsProcessed || 0,
        insights_generated: stats?.insightsGenerated || 0,
        total_tokens: stats?.tokensUsed || 0,
        total_cost: stats?.cost || 0,
      })
      .eq('id', sessionId);
  }

  // ============================================================
  // GET RECENT REFLECTIONS (used by synthesis engine)
  // ============================================================

  async getRecentReflections(personId: string, days: number = 7): Promise<Record<string, unknown>[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await this.supabase
      .from('brain.reflections')
      .select('reflection_date, daily_summary, key_insights, patterns_observed, emotions_detected, time_allocation, goals_progress')
      .eq('person_id', personId)
      .gte('reflection_date', since.toISOString().split('T')[0])
      .order('reflection_date', { ascending: false });

    if (error) throw error;
    return data || [];
  }
}

// ============================================================
// SINGLETON EXPORT
// ============================================================

let _reflectionEngine: BrainReflectionEngine | null = null;

export function getReflectionEngine(): BrainReflectionEngine {
  if (!_reflectionEngine) {
    _reflectionEngine = new BrainReflectionEngine();
  }
  return _reflectionEngine;
}

export default BrainReflectionEngine;
