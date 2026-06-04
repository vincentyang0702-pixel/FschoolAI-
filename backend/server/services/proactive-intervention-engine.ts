/**
 * NeuroAGI Proactive Intervention Engine
 * 
 * The brain that acts without being asked.
 * 
 * This is the product. This is what makes NeuroAGI different.
 * 
 * The engine:
 * 1. Continuously monitors signals, goals, and deadlines
 * 2. Detects patterns that require intervention
 * 3. Decides WHAT to say, WHEN to say it, and HOW to say it
 * 4. Uses confirmed hypotheses to personalize the approach
 * 5. Tracks whether interventions worked (outcome loop)
 * 6. Learns from failures — never makes the same mistake twice
 * 
 * Intervention types:
 * - check_in: "Hey, how are you doing with X?"
 * - breakdown: Breaks a task into smaller steps
 * - reminder: Deadline or goal reminder
 * - encouragement: Positive reinforcement when momentum is building
 * - challenge: Pushes when the person is coasting
 * - reframe: Changes perspective on a stuck situation
 * - connection: Links current work to a larger goal or interest
 * - warning: Flags a pattern the person might not see
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { hypothesisEngine } from './hypothesis-engine';
import { signalIngestion } from './signal-ingestion';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface InterventionDecision {
  should_intervene: boolean;
  reason?: string;
  type?: string;
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  message?: string;
  timing?: string;
  approach_rationale?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Proactive Intervention Engine
// ─────────────────────────────────────────────────────────────────────────────

export class ProactiveInterventionEngine {

  /**
   * Main evaluation loop — called every hour by the scheduler
   * Checks if any person needs an intervention right now
   */
  async evaluateAll(): Promise<{ evaluated: number; intervened: number }> {
    // Get all active persons
    const { data: persons } = await supabase
      .schema('neuro')
      .from('persons')
      .select('id, name')
      .eq('is_active', true);

    if (!persons || persons.length === 0) return { evaluated: 0, intervened: 0 };

    let intervened = 0;
    for (const person of persons) {
      const result = await this.evaluate(person.id);
      if (result.intervened) intervened++;
    }

    return { evaluated: persons.length, intervened };
  }

  /**
   * Evaluate whether a specific person needs an intervention right now
   */
  async evaluate(personId: string): Promise<{ intervened: boolean; intervention_id?: string }> {
    try {
      // Check if we already intervened recently (avoid spam)
      const recentIntervention = await this.getRecentIntervention(personId, 2); // 2 hours
      if (recentIntervention) return { intervened: false };

      // Gather context for decision
      const context = await this.gatherInterventionContext(personId);
      if (!context.person) return { intervened: false };

      // Make the intervention decision
      const decision = await this.decide(context);
      if (!decision.should_intervene || !decision.message) return { intervened: false };

      // Write the intervention
      const interventionId = await this.writeIntervention(personId, decision, context);

      // Log the signal
      await signalIngestion.ingest({
        person_id: personId,
        signal_type: 'behavioral',
        subtype: 'intervention_triggered',
        value_text: decision.type,
        value_json: { urgency: decision.urgency, timing: decision.timing },
        source: 'intervention_engine',
        confidence: 0.9,
      });

      console.log(`[InterventionEngine] Queued ${decision.type} intervention for ${context.person.name}: "${decision.message?.substring(0, 80)}..."`);

      return { intervened: true, intervention_id: interventionId };

    } catch (err: any) {
      console.error('[InterventionEngine] Error evaluating:', err);
      return { intervened: false };
    }
  }

  /**
   * Execute a queued intervention — deliver it to the person
   * Returns the message to be sent
   */
  async execute(interventionId: string): Promise<{
    success: boolean;
    message?: string;
    person_id?: string;
  }> {
    try {
      const { data: intervention, error } = await supabase
        .schema('brain')
        .from('interventions')
        .select('*')
        .eq('id', interventionId)
        .eq('status', 'queued')
        .single();

      if (error || !intervention) return { success: false };

      // Mark as delivered
      await supabase
        .schema('brain')
        .from('interventions')
        .update({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
        })
        .eq('id', interventionId);

      // Log delivery signal
      await signalIngestion.ingest({
        person_id: intervention.person_id,
        signal_type: 'behavioral',
        subtype: 'intervention_delivered',
        value_text: intervention.intervention_type,
        source: 'intervention_engine',
        confidence: 1.0,
      });

      return {
        success: true,
        message: intervention.message,
        person_id: intervention.person_id,
      };

    } catch (err: any) {
      return { success: false };
    }
  }

  /**
   * Record the outcome of an intervention
   * Was it effective? Did the person respond?
   */
  async recordOutcome(interventionId: string, outcome: {
    responded: boolean;
    response_text?: string;
    effective: boolean;
    effectiveness_score?: number; // 0.0–1.0
    notes?: string;
  }): Promise<void> {
    await supabase
      .schema('brain')
      .from('interventions')
      .update({
        status: outcome.responded ? 'responded' : 'ignored',
        outcome_score: outcome.effectiveness_score || (outcome.effective ? 0.8 : 0.2),
        outcome_note: outcome.notes || (outcome.effective ? 'Effective' : 'Not effective'),
        responded_at: outcome.responded ? new Date().toISOString() : null,
      })
      .eq('id', interventionId);

    // Feed outcome back into hypothesis engine
    if (outcome.responded) {
      const { data: intervention } = await supabase
        .schema('brain')
        .from('interventions')
        .select('person_id, intervention_type, source_hypothesis_id')
        .eq('id', interventionId)
        .single();

      if (intervention?.source_hypothesis_id) {
        await hypothesisEngine.addEvidence({
          hypothesis_id: intervention.source_hypothesis_id,
          evidence_text: `Intervention of type '${intervention.intervention_type}' was ${outcome.effective ? 'effective' : 'ineffective'}`,
          supports: outcome.effective,
          weight: 0.6,
        });
      }
    }
  }

  /**
   * Get the next queued intervention for a person (to deliver in chat)
   */
  async getNextQueued(personId: string): Promise<any | null> {
    const { data } = await supabase
      .schema('brain')
      .from('interventions')
      .select('*')
      .eq('person_id', personId)
      .eq('status', 'queued')
      .order('urgency', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    return data || null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Decision Engine
  // ─────────────────────────────────────────────────────────────────────────

  private async decide(context: any): Promise<InterventionDecision> {
    const person = context.person;
    const confirmedHypotheses = context.confirmedHypotheses;
    const upcomingDeadlines = context.upcomingDeadlines;
    const momentum = context.momentum;
    const recentSignals = context.recentSignals;
    const voice = context.voice;

    const prompt = `You are the intervention decision engine for NeuroAGI.

You must decide: should the brain reach out to ${person.name} RIGHT NOW?

## PERSON
Name: ${person.name}
Background: ${person.world_context || 'unknown'}
Current time in their timezone: ${this.getLocalTime(person.timezone)}

## CURRENT STATE
Momentum: ${momentum?.state || 'unknown'} (score: ${momentum?.score || 'unknown'})
Recent signal count (24h): ${recentSignals.length}
${recentSignals.slice(0, 10).map((s: any) => `- ${s.signal_type}${s.subtype ? '/' + s.subtype : ''}: ${s.value_text || s.value || ''}`).join('\n')}

## UPCOMING DEADLINES
${upcomingDeadlines.length > 0 
  ? upcomingDeadlines.map((d: any) => `- "${d.title}" due in ${d.hours_until}h`).join('\n')
  : 'No upcoming deadlines detected'}

## CONFIRMED HYPOTHESES ABOUT THIS PERSON
${confirmedHypotheses.length > 0
  ? confirmedHypotheses.map((h: any) => `- "${h.hypothesis}" (confidence: ${(h.confidence * 100).toFixed(0)}%)`).join('\n')
  : 'No confirmed hypotheses yet'}

## THEIR COMMUNICATION STYLE
${voice ? `Tone: ${voice.tone || 'unknown'}, Register: ${voice.register || 'unknown'}` : 'Unknown'}

## RECENT INTERVENTION HISTORY
${context.recentInterventions.length > 0
  ? context.recentInterventions.map((i: any) => `- [${i.intervention_type}] "${i.message?.substring(0, 80)}" → ${i.status}`).join('\n')
  : 'No recent interventions'}

---

Decide whether to intervene. Consider:
1. Is there a genuine need right now? (deadline, stuck state, high stress)
2. Is this the right time? (not too late at night, not too soon after last intervention)
3. What approach would actually help THIS person based on their hypotheses?
4. What would be the exact message — in their voice, not generic AI speak?

Respond with JSON:
{
  "should_intervene": true/false,
  "reason": "Why or why not",
  "type": "check_in|breakdown|reminder|encouragement|challenge|reframe|connection|warning",
  "urgency": "low|medium|high|critical",
  "message": "The exact message to send — specific, personal, non-generic. Use their name. Reference something specific.",
  "timing": "now|in_1h|in_2h|tonight|tomorrow_morning",
  "approach_rationale": "Why this approach for this person"
}

If should_intervene is false, only include reason. Keep messages SHORT (1-3 sentences max). No AI-speak. Sound like a smart friend who knows them well.`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
      system: 'You decide whether and how to intervene in a person\'s day. Respond with valid JSON only. Be conservative — only intervene when genuinely needed.',
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{"should_intervene": false}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { should_intervene: false };

    return JSON.parse(jsonMatch[0]) as InterventionDecision;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Context Gathering
  // ─────────────────────────────────────────────────────────────────────────

  private async gatherInterventionContext(personId: string): Promise<any> {
    const [
      personResult,
      momentumResult,
      signalsResult,
      hypothesesResult,
      assignmentsResult,
      recentInterventionsResult,
      voiceResult,
    ] = await Promise.all([
      supabase.schema('neuro').from('persons').select('*').eq('id', personId).single(),
      supabase.schema('brain').from('momentum').select('*').eq('person_id', personId).single(),
      supabase.schema('brain').from('signals').select('*').eq('person_id', personId)
        .gte('occurred_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('occurred_at', { ascending: false }).limit(30),
      hypothesisEngine.getConfirmed(personId),
      supabase.schema('fschool').from('assignments').select('*')
        .eq('person_id', personId)
        .gte('due_at', new Date().toISOString())
        .lte('due_at', new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString())
        .order('due_at', { ascending: true }).limit(5),
      supabase.schema('brain').from('interventions').select('*')
        .eq('person_id', personId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false }).limit(5),
      supabase.schema('neuro').from('voice').select('*').eq('person_id', personId).single(),
    ]);

    // Calculate hours until deadline for each assignment
    const upcomingDeadlines = (assignmentsResult.data || []).map((a: any) => ({
      ...a,
      hours_until: Math.round((new Date(a.due_at).getTime() - Date.now()) / (1000 * 60 * 60)),
    }));

    return {
      person: personResult.data,
      momentum: momentumResult.data,
      recentSignals: signalsResult.data || [],
      confirmedHypotheses: hypothesesResult,
      upcomingDeadlines,
      recentInterventions: recentInterventionsResult.data || [],
      voice: voiceResult.data,
    };
  }

  private async getRecentIntervention(personId: string, withinHours: number): Promise<any | null> {
    const since = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .schema('brain')
      .from('interventions')
      .select('id')
      .eq('person_id', personId)
      .gte('created_at', since)
      .limit(1)
      .single();
    return data || null;
  }

  private async writeIntervention(personId: string, decision: InterventionDecision, context: any): Promise<string> {
    const { data, error } = await supabase
      .schema('brain')
      .from('interventions')
      .insert({
        person_id: personId,
        intervention_type: decision.type,
        urgency: decision.urgency,
        message: decision.message,
        timing: decision.timing,
        approach_rationale: decision.approach_rationale,
        status: 'queued',
        source: 'proactive_engine',
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  private getLocalTime(timezone?: string): string {
    try {
      return new Date().toLocaleTimeString('en-US', {
        timeZone: timezone || 'America/Toronto',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return new Date().toLocaleTimeString();
    }
  }
}

export const interventionEngine = new ProactiveInterventionEngine();
