/**
 * NeuroAGI Brain Scheduler
 * 
 * The heartbeat of the autonomous brain.
 * Runs scheduled thinking tasks without being asked.
 * 
 * Schedule:
 * - Every 15 minutes: Check for urgent interventions needed
 * - Every 30 minutes: Refresh context windows (pre-compute brain snapshot for fast chat)
 * - Every hour: Evaluate all persons for proactive interventions
 * - Every night at 11pm: Run daily reflections for all persons
 * - Every Sunday at 9am: Run weekly synthesis for all persons
 * - Every 6 hours: Evaluate hypotheses against recent signals
 */

import { reflectionEngine } from './autonomous-reflection-engine';
import { interventionEngine } from './proactive-intervention-engine';
import { hypothesisEngine } from './hypothesis-engine';
import { ContextWindowWriter } from './brain-context-window';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

const contextWindowWriter = new ContextWindowWriter();

// ─────────────────────────────────────────────────────────────────────────────
// Brain Scheduler
// ─────────────────────────────────────────────────────────────────────────────

export class BrainScheduler {
  private intervals: NodeJS.Timeout[] = [];
  private isRunning = false;

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('[BrainScheduler] Starting autonomous brain scheduler...');

    // Every 15 minutes: check for urgent interventions
    this.intervals.push(
      setInterval(() => this.runUrgentInterventionCheck(), 15 * 60 * 1000)
    );

    // Every 30 minutes: refresh context windows for all active persons
    // Pre-computes the brain intelligence snapshot so chat starts instantly (<50ms).
    // FschoolAI reads this at session start — brain already knows what matters
    // before the student types their first message.
    this.intervals.push(
      setInterval(() => this.runContextWindowRefresh(), 30 * 60 * 1000)
    );

    // Every hour: evaluate all persons for proactive interventions
    this.intervals.push(
      setInterval(() => this.runHourlyEvaluation(), 60 * 60 * 1000)
    );

    // Every 6 hours: evaluate hypotheses against recent signals
    this.intervals.push(
      setInterval(() => this.runHypothesisEvaluation(), 6 * 60 * 60 * 1000)
    );

    // Every 5 minutes: check if any scheduled reflections are due
    this.intervals.push(
      setInterval(() => this.runScheduledReflections(), 5 * 60 * 1000)
    );

    // Run immediately on startup (after 30s delay to let server warm up)
    setTimeout(() => this.runStartupTasks(), 30 * 1000);

    console.log('[BrainScheduler] Autonomous brain is now running.');
  }

  stop(): void {
    this.intervals.forEach(clearInterval);
    this.intervals = [];
    this.isRunning = false;
    console.log('[BrainScheduler] Stopped.');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scheduled Tasks
  // ─────────────────────────────────────────────────────────────────────────

  private async runStartupTasks(): Promise<void> {
    console.log('[BrainScheduler] Running startup tasks...');
    
    try {
      // Seed hypotheses for any person who doesn't have them yet
      const { data: persons } = await supabase
        .schema('neuro')
        .from('persons')
        .select('id, name')
        .eq('is_active', true);

      if (persons) {
        for (const person of persons) {
          const { data: existingHypotheses } = await supabase
            .schema('brain')
            .from('hypotheses')
            .select('id')
            .eq('person_id', person.id)
            .limit(1);

          if (!existingHypotheses || existingHypotheses.length === 0) {
            console.log(`[BrainScheduler] Seeding hypotheses for ${person.name}...`);
            const result = await hypothesisEngine.seedFromPatterns(person.id);
            console.log(`[BrainScheduler] Seeded ${result.seeded} hypotheses for ${person.name}`);
          }
        }

        // Pre-compute context windows for all active persons on startup
        // so the first chat session is already fast
        await this.runContextWindowRefresh();
      }

      // Check if any reflections are due
      await this.runScheduledReflections();

    } catch (err) {
      console.error('[BrainScheduler] Startup tasks error:', err);
    }
  }

  private async runUrgentInterventionCheck(): Promise<void> {
    try {
      // Only check for critical/high urgency interventions
      const { data: persons } = await supabase
        .schema('neuro')
        .from('persons')
        .select('id')
        .eq('is_active', true);

      if (!persons) return;

      for (const person of persons) {
        // Check for critical signals in last 15 minutes
        const { data: criticalSignals } = await supabase
          .schema('brain')
          .from('signals')
          .select('*')
          .eq('person_id', person.id)
          .gte('occurred_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
          .gte('value', 0.8) // High value signals
          .in('signal_type', ['stress', 'wellbeing', 'academic']);

        if (criticalSignals && criticalSignals.length > 0) {
          // High-urgency signal detected — evaluate for immediate intervention
          await interventionEngine.evaluate(person.id);
          // Also refresh context window so next chat reflects the urgent state
          await contextWindowWriter.refresh(person.id);
        }
      }
    } catch (err) {
      console.error('[BrainScheduler] Urgent check error:', err);
    }
  }

  private async runHourlyEvaluation(): Promise<void> {
    try {
      console.log('[BrainScheduler] Running hourly intervention evaluation...');
      const result = await interventionEngine.evaluateAll();
      console.log(`[BrainScheduler] Hourly eval: ${result.evaluated} persons, ${result.intervened} interventions queued`);
    } catch (err) {
      console.error('[BrainScheduler] Hourly evaluation error:', err);
    }
  }

  private async runScheduledReflections(): Promise<void> {
    try {
      const result = await reflectionEngine.runScheduledReflections();
      if (result.processed > 0) {
        console.log(`[BrainScheduler] Reflections: ${result.processed} processed, ${result.errors} errors`);
        // After reflections complete, refresh context windows — reflections change what matters
        await this.runContextWindowRefresh();
      }
    } catch (err) {
      console.error('[BrainScheduler] Scheduled reflections error:', err);
    }
  }

  private async runHypothesisEvaluation(): Promise<void> {
    try {
      const { data: persons } = await supabase
        .schema('neuro')
        .from('persons')
        .select('id, name')
        .eq('is_active', true);

      if (!persons) return;

      for (const person of persons) {
        const result = await hypothesisEngine.evaluateAgainstSignals(person.id);
        if (result.evaluated > 0) {
          console.log(`[BrainScheduler] Hypothesis eval for ${person.name}: ${result.evaluated} evaluated, ${result.confirmed} confirmed, ${result.rejected} rejected`);
        }
      }
    } catch (err) {
      console.error('[BrainScheduler] Hypothesis evaluation error:', err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Context Window Refresh
  // Pre-computes the brain intelligence snapshot for each active person.
  // FschoolAI reads this at session start — zero latency, brain already
  // knows what matters before the student types their first message.
  //
  // What goes in the context window:
  //   - Current stress level and momentum state
  //   - Active deadlines and academic pressure
  //   - Confirmed hypotheses about how this person responds
  //   - Pending intervention (if any) — what the brain wants to say
  //   - What the brain is watching for right now
  //   - What NOT to mention (defensive topics, recent sensitivities)
  //   - Voice and communication preferences
  //   - Recent patterns (last 48h signals summary)
  // ─────────────────────────────────────────────────────────────────────────

  private async runContextWindowRefresh(): Promise<void> {
    try {
      const { data: persons } = await supabase
        .schema('neuro')
        .from('persons')
        .select('id, name')
        .eq('is_active', true);

      if (!persons || persons.length === 0) return;

      let refreshed = 0;
      let skipped = 0;
      let errors = 0;

      for (const person of persons) {
        const result = await contextWindowWriter.refresh(person.id);
        if (result.success && !result.skipped) refreshed++;
        else if (result.skipped) skipped++;
        else errors++;
      }

      if (refreshed > 0 || errors > 0) {
        console.log(`[BrainScheduler] Context windows: ${refreshed} refreshed, ${skipped} unchanged, ${errors} errors`);
      }
    } catch (err) {
      console.error('[BrainScheduler] Context window refresh error:', err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Manual Triggers (for API endpoints)
  // ─────────────────────────────────────────────────────────────────────────

  async triggerReflection(personId: string): Promise<any> {
    return reflectionEngine.reflect(personId, 'manual');
  }

  async triggerInterventionEval(personId: string): Promise<any> {
    return interventionEngine.evaluate(personId);
  }

  async triggerHypothesisEval(personId: string): Promise<any> {
    return hypothesisEngine.evaluateAgainstSignals(personId);
  }

  async triggerContextWindowRefresh(personId: string): Promise<any> {
    return contextWindowWriter.refresh(personId);
  }
}

export const brainScheduler = new BrainScheduler();
