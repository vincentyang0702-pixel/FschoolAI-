/**
 * NeuroAGI Autonomous Reflection Engine
 * 
 * The brain thinks about a person even when they're not talking to it.
 * 
 * This engine runs on a schedule (nightly by default) and:
 * 1. Reads all signals from the past 24h
 * 2. Reads recent messages and sessions
 * 3. Reads existing patterns, memory, and goals
 * 4. Asks Claude to reflect — what changed, what was noticed, what to watch for
 * 5. Writes a structured reflection to brain.reflections
 * 6. Updates brain.momentum and brain.stress if needed
 * 7. Queues any urgent interventions
 * 8. Updates brain.scheduled_thinking for the next run
 * 
 * This is what makes NeuroAGI different from every other AI:
 * it thinks about you even when you're not there.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

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

interface ReflectionContext {
  person: any;
  memory: any[];
  patterns: any[];
  goals: any[];
  recentSignals: any[];
  recentMessages: any[];
  lastReflection: any | null;
  momentum: any | null;
  hypotheses: any[];
  pendingInterventions: any[];
}

interface ReflectionOutput {
  summary: string;
  what_changed: string;
  what_was_noticed: string;
  what_to_watch: string;
  emotional_read: string;
  academic_read: string;
  momentum_assessment: 'building' | 'stuck' | 'declining' | 'recovering' | 'unknown';
  stress_level: number; // 0.0–1.0
  confidence: number;   // 0.0–1.0
  hypotheses_to_form: string[];
  interventions_to_queue: {
    type: string;
    urgency: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timing: string;
  }[];
  patterns_confirmed: string[];
  patterns_challenged: string[];
  memory_to_update: {
    key: string;
    value: string;
  }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Autonomous Reflection Engine
// ─────────────────────────────────────────────────────────────────────────────

export class AutonomousReflectionEngine {

  /**
   * Run a full reflection cycle for a person
   * Called by the scheduler or triggered by high-urgency signals
   */
  async reflect(personId: string, trigger: 'scheduled' | 'signal' | 'manual' = 'scheduled'): Promise<{
    success: boolean;
    reflection_id?: string;
    summary?: string;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      console.log(`[ReflectionEngine] Starting reflection for ${personId} (trigger: ${trigger})`);

      // 1. Gather all context
      const context = await this.gatherContext(personId);
      
      if (!context.person) {
        return { success: false, error: `Person ${personId} not found` };
      }

      // 2. Build the reflection prompt
      const prompt = this.buildReflectionPrompt(context);

      // 3. Ask Claude to reflect
      const output = await this.callClaude(prompt, context.person.name);

      // 4. Write the reflection
      const reflectionId = await this.writeReflection(personId, output, context, trigger, startTime);

      // 5. Update momentum and stress
      await this.updateMomentumAndStress(personId, output);

      // 6. Queue interventions if needed
      if (output.interventions_to_queue.length > 0) {
        await this.queueInterventions(personId, output.interventions_to_queue);
      }

      // 7. Update memory if needed
      if (output.memory_to_update.length > 0) {
        await this.updateMemory(personId, output.memory_to_update);
      }

      // 8. Schedule next reflection
      await this.scheduleNextReflection(personId, output);

      // 9. Log cost
      await this.logCost(personId, startTime, 'reflection');

      console.log(`[ReflectionEngine] Reflection complete for ${personId} in ${Date.now() - startTime}ms`);

      return {
        success: true,
        reflection_id: reflectionId,
        summary: output.summary,
      };

    } catch (err: any) {
      console.error(`[ReflectionEngine] Error reflecting for ${personId}:`, err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Run reflections for all persons with scheduled thinking due
   */
  async runScheduledReflections(): Promise<{
    processed: number;
    errors: number;
    results: any[];
  }> {
    const now = new Date().toISOString();

    // Get all scheduled thinking tasks that are due
    const { data: tasks, error } = await supabase
      .schema('brain')
      .from('scheduled_thinking')
      .select('*')
      .eq('task_type', 'daily_reflection')
      .eq('is_active', true)
      .lte('next_run_at', now);

    if (error) {
      console.error('[ReflectionEngine] Error fetching scheduled tasks:', error);
      return { processed: 0, errors: 1, results: [] };
    }

    if (!tasks || tasks.length === 0) {
      console.log('[ReflectionEngine] No scheduled reflections due');
      return { processed: 0, errors: 0, results: [] };
    }

    const results = [];
    let errors = 0;

    for (const task of tasks) {
      const result = await this.reflect(task.person_id, 'scheduled');
      results.push({ person_id: task.person_id, ...result });
      if (!result.success) errors++;
    }

    return { processed: tasks.length, errors, results };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Context Gathering
  // ─────────────────────────────────────────────────────────────────────────

  private async gatherContext(personId: string): Promise<ReflectionContext> {
    const [
      personResult,
      memoryResult,
      patternsResult,
      goalsResult,
      signalsResult,
      messagesResult,
      lastReflectionResult,
      momentumResult,
      hypothesesResult,
      interventionsResult,
    ] = await Promise.all([
      // Person profile
      supabase.schema('neuro').from('persons').select('*').eq('id', personId).single(),
      // Memory facts
      supabase.schema('neuro').from('memory').select('*').eq('person_id', personId).order('updated_at', { ascending: false }).limit(20),
      // Top patterns
      supabase.schema('neuro').from('patterns').select('*').eq('person_id', personId).order('confidence', { ascending: false }).limit(15),
      // Active goals
      supabase.schema('brain').from('goals').select('*').eq('person_id', personId).eq('status', 'active').limit(10),
      // Signals from last 48h
      supabase.schema('brain').from('signals').select('*').eq('person_id', personId)
        .gte('occurred_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
        .order('occurred_at', { ascending: false }).limit(100),
      // Recent messages (last 20)
      supabase.schema('agents').from('messages').select('*').eq('person_id', personId)
        .order('created_at', { ascending: false }).limit(20),
      // Last reflection
      supabase.schema('brain').from('reflections').select('*').eq('person_id', personId)
        .order('created_at', { ascending: false }).limit(1).single(),
      // Current momentum
      supabase.schema('brain').from('momentum').select('*').eq('person_id', personId).single(),
      // Active hypotheses
      supabase.schema('brain').from('hypotheses').select('*').eq('person_id', personId)
        .in('status', ['forming', 'testing']).limit(5),
      // Pending interventions
      supabase.schema('brain').from('interventions').select('*').eq('person_id', personId)
        .eq('status', 'queued').limit(5),
    ]);

    return {
      person: personResult.data,
      memory: memoryResult.data || [],
      patterns: patternsResult.data || [],
      goals: goalsResult.data || [],
      recentSignals: signalsResult.data || [],
      recentMessages: messagesResult.data || [],
      lastReflection: lastReflectionResult.data || null,
      momentum: momentumResult.data || null,
      hypotheses: hypothesesResult.data || [],
      pendingInterventions: interventionsResult.data || [],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Prompt Building
  // ─────────────────────────────────────────────────────────────────────────

  private buildReflectionPrompt(ctx: ReflectionContext): string {
    const person = ctx.person;
    const lastReflectionDate = ctx.lastReflection?.created_at
      ? new Date(ctx.lastReflection.created_at).toLocaleDateString()
      : 'never';

    return `You are the autonomous brain of NeuroAGI — a persistent intelligence that thinks about ${person.name} even when they're not talking to you.

You are not a chatbot. You are a thinking system that observes, reflects, and acts.

## WHO YOU ARE THINKING ABOUT

Name: ${person.name}
Timezone: ${person.timezone || 'unknown'}
University: ${person.university || 'unknown'} — ${person.programme || 'unknown'}
Background: ${person.world_context || 'no context available'}
Last seen: ${person.last_seen ? new Date(person.last_seen).toLocaleDateString() : 'unknown'}
Last reflection: ${lastReflectionDate}

## WHAT YOU KNOW ABOUT THEM (Memory)
${ctx.memory.map(m => `- ${m.key}: ${m.value}`).join('\n') || 'No memory facts yet'}

## BEHAVIORAL PATTERNS OBSERVED
${ctx.patterns.slice(0, 10).map(p => `- [${(p.confidence * 100).toFixed(0)}% confidence] ${p.pattern_text}`).join('\n') || 'No patterns yet'}

## ACTIVE GOALS
${ctx.goals.map(g => `- ${g.title} (${g.progress || 0}% progress, due: ${g.target_date || 'no deadline'})`).join('\n') || 'No active goals'}

## SIGNALS FROM LAST 48 HOURS (${ctx.recentSignals.length} signals)
${ctx.recentSignals.slice(0, 30).map(s => 
  `[${new Date(s.occurred_at).toLocaleTimeString()}] ${s.signal_type}${s.subtype ? '/' + s.subtype : ''}: ${s.value_text || s.value || JSON.stringify(s.value_json || {})}`
).join('\n') || 'No signals in last 48h'}

## RECENT CONVERSATION (last ${ctx.recentMessages.length} messages)
${ctx.recentMessages.slice(0, 10).map(m => 
  `[${m.role}] ${String(m.content).substring(0, 200)}`
).join('\n') || 'No recent messages'}

## ACTIVE HYPOTHESES YOU ARE TESTING
${ctx.hypotheses.map(h => `- "${h.hypothesis}" (${h.evidence_for || 0} for, ${h.evidence_against || 0} against)`).join('\n') || 'No active hypotheses'}

## CURRENT MOMENTUM STATE
${ctx.momentum ? `State: ${ctx.momentum.state}, Trend: ${ctx.momentum.trend}, Score: ${ctx.momentum.score}` : 'Unknown'}

## LAST REFLECTION SUMMARY
${ctx.lastReflection?.summary || 'No previous reflection'}

---

## YOUR TASK

Reflect on ${person.name} right now. Think deeply. Be honest. Be specific.

Respond with a JSON object with exactly these fields:

{
  "summary": "2-3 sentence summary of where they are right now",
  "what_changed": "What is different since the last reflection? Be specific.",
  "what_was_noticed": "What patterns, signals, or behaviors stand out? What is the brain noticing that the person might not see themselves?",
  "what_to_watch": "What should the brain pay attention to in the next 24-48 hours?",
  "emotional_read": "What is the emotional state? What is underneath the surface?",
  "academic_read": "What is the academic situation? Pressure, progress, avoidance?",
  "momentum_assessment": "building|stuck|declining|recovering|unknown",
  "stress_level": 0.0-1.0,
  "confidence": 0.0-1.0 (how confident are you in this reflection given available data),
  "hypotheses_to_form": ["New hypothesis to start testing", ...],
  "interventions_to_queue": [
    {
      "type": "check_in|breakdown|reminder|encouragement|challenge|reframe",
      "urgency": "low|medium|high|critical",
      "message": "The exact message to send",
      "timing": "now|in_2h|tonight|tomorrow_morning|next_session"
    }
  ],
  "patterns_confirmed": ["Pattern text that was confirmed by recent signals"],
  "patterns_challenged": ["Pattern text that was challenged by recent signals"],
  "memory_to_update": [
    {"key": "memory_key", "value": "updated value"}
  ]
}

Only include interventions if they are genuinely needed. Do not intervene just to intervene.
Only form hypotheses that are testable and specific.
Be honest about what you don't know — reflect that in the confidence score.`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Claude Call
  // ─────────────────────────────────────────────────────────────────────────

  private async callClaude(prompt: string, personName: string): Promise<ReflectionOutput> {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
      system: `You are the autonomous thinking core of NeuroAGI. You think about ${personName} with depth, honesty, and care. You always respond with valid JSON only — no markdown, no explanation, just the JSON object.`,
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    
    // Parse JSON — handle potential markdown wrapping
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Claude did not return valid JSON');
    
    return JSON.parse(jsonMatch[0]) as ReflectionOutput;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Write Results
  // ─────────────────────────────────────────────────────────────────────────

  private async writeReflection(
    personId: string,
    output: ReflectionOutput,
    ctx: ReflectionContext,
    trigger: string,
    startTime: number
  ): Promise<string> {
    const { data, error } = await supabase
      .schema('brain')
      .from('reflections')
      .insert({
        person_id: personId,
        summary: output.summary,
        what_changed: output.what_changed,
        what_was_noticed: output.what_was_noticed,
        what_to_watch: output.what_to_watch,
        emotional_read: output.emotional_read,
        academic_read: output.academic_read,
        momentum_assessment: output.momentum_assessment,
        stress_level: output.stress_level,
        confidence: output.confidence,
        signal_count: ctx.recentSignals.length,
        message_count: ctx.recentMessages.length,
        trigger_type: trigger,
        processing_ms: Date.now() - startTime,
        model_used: 'claude-opus-4-5',
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  private async updateMomentumAndStress(personId: string, output: ReflectionOutput): Promise<void> {
    // Update momentum
    await supabase
      .schema('brain')
      .from('momentum')
      .upsert({
        person_id: personId,
        state: output.momentum_assessment,
        score: output.momentum_assessment === 'building' ? 0.7
          : output.momentum_assessment === 'recovering' ? 0.5
          : output.momentum_assessment === 'stuck' ? 0.3
          : output.momentum_assessment === 'declining' ? 0.2
          : 0.5,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'person_id' });

    // Log stress signal
    if (output.stress_level > 0.3) {
      await supabase
        .schema('brain')
        .from('signals')
        .insert({
          person_id: personId,
          signal_type: 'stress',
          subtype: 'reflection_assessment',
          value: output.stress_level,
          source: 'brain_reflection',
          confidence: output.confidence,
          occurred_at: new Date().toISOString(),
        });
    }
  }

  private async queueInterventions(personId: string, interventions: ReflectionOutput['interventions_to_queue']): Promise<void> {
    const rows = interventions.map(iv => ({
      person_id: personId,
      intervention_type: iv.type,
      urgency: iv.urgency,
      message: iv.message,
      timing: iv.timing,
      status: 'queued',
      source: 'brain_reflection',
      created_at: new Date().toISOString(),
    }));

    await supabase.schema('brain').from('interventions').insert(rows);
  }

  private async updateMemory(personId: string, updates: ReflectionOutput['memory_to_update']): Promise<void> {
    for (const update of updates) {
      await supabase
        .schema('neuro')
        .from('memory')
        .upsert({
          person_id: personId,
          key: update.key,
          value: update.value,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'person_id,key' });
    }
  }

  private async scheduleNextReflection(personId: string, output: ReflectionOutput): Promise<void> {
    // If stress is high or momentum is declining, reflect again in 12h
    // Otherwise, schedule for tomorrow night
    const hoursUntilNext = (output.stress_level > 0.7 || output.momentum_assessment === 'declining') ? 12 : 24;
    const nextRun = new Date(Date.now() + hoursUntilNext * 60 * 60 * 1000).toISOString();

    await supabase
      .schema('brain')
      .from('scheduled_thinking')
      .upsert({
        person_id: personId,
        task_type: 'daily_reflection',
        next_run_at: nextRun,
        is_active: true,
        last_run_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'person_id,task_type' });
  }

  private async logCost(personId: string, startTime: number, operation: string): Promise<void> {
    await supabase
      .schema('brain')
      .from('cost_tracking')
      .insert({
        person_id: personId,
        operation,
        model: 'claude-opus-4-5',
        duration_ms: Date.now() - startTime,
        created_at: new Date().toISOString(),
      });
  }
}

export const reflectionEngine = new AutonomousReflectionEngine();
