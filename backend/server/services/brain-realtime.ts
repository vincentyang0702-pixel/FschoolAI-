/**
 * NeuroAGI Brain Realtime Layer
 *
 * Subscribes to Supabase Realtime events so the brain reacts instantly
 * to changes in the database — no polling, no API calls between services.
 *
 * Subscriptions:
 *   agents.messages    → new message → emit behavioral signal, update context window
 *   fschool.grades     → new/updated grade → emit academic signal, check goal impact
 *   brain.signals      → new signal → evaluate urgency, maybe trigger intervention
 *   fschool.assignments → new/updated assignment → check deadline proximity
 *
 * This is the nervous system of the brain — it fires before the scheduler
 * even wakes up, ensuring sub-second reaction to anything that matters.
 */

import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { signalIngestion } from './signal-ingestion';
import { contextWindowWriter } from './brain-context-window';
import { interventionEngine } from './proactive-intervention-engine';

// Use service role key for Realtime — needs full access
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!,
  {
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Brain Realtime Manager
// ─────────────────────────────────────────────────────────────────────────────

export class BrainRealtime {
  private channels: RealtimeChannel[] = [];
  private isConnected = false;

  // Debounce context window updates — don't rewrite on every keystroke
  private contextWindowDebounce: Map<string, NodeJS.Timeout> = new Map();
  private interventionDebounce: Map<string, NodeJS.Timeout> = new Map();

  async connect(): Promise<void> {
    if (this.isConnected) return;

    console.log('[BrainRealtime] Connecting to Supabase Realtime...');

    await Promise.all([
      this.subscribeToMessages(),
      this.subscribeToGrades(),
      this.subscribeToSignals(),
      this.subscribeToAssignments(),
    ]);

    this.isConnected = true;
    console.log('[BrainRealtime] Connected. Brain is listening in real time.');
  }

  disconnect(): void {
    this.channels.forEach(ch => supabase.removeChannel(ch));
    this.channels = [];
    this.isConnected = false;
    console.log('[BrainRealtime] Disconnected.');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Subscription: agents.messages
  // React to every new message — update context window, emit signal
  // ─────────────────────────────────────────────────────────────────────────

  private async subscribeToMessages(): Promise<void> {
    const channel = supabase
      .channel('brain-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'agents', table: 'messages' },
        async (payload) => {
          const message = payload.new as any;
          if (!message.person_id && !message.user_id) return;

          const personId = message.person_id || message.user_id;
          const role = message.role || 'user';

          // Only react to user messages (not AI responses)
          if (role !== 'user') return;

          console.log(`[BrainRealtime] New message from person ${personId.slice(0, 8)}...`);

          // 1. Emit a behavioral signal for message activity
          await signalIngestion.ingest({
            person_id: personId,
            signal_type: 'behavioral',
            subtype: 'message_sent',
            value: 1,
            value_json: {
              message_length: (message.content || '').length,
              hour_of_day: new Date().getHours(),
              session_id: message.session_id,
            },
            occurred_at: new Date().toISOString(),
            source: 'realtime_messages',
          });

          // 2. Debounce context window update — update 3s after last message
          // (don't rewrite on every word if user is typing rapidly)
          const existing = this.contextWindowDebounce.get(personId);
          if (existing) clearTimeout(existing);

          this.contextWindowDebounce.set(
            personId,
            setTimeout(async () => {
              await contextWindowWriter.refresh(personId);
              this.contextWindowDebounce.delete(personId);
            }, 3000)
          );
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[BrainRealtime] ✓ Subscribed to agents.messages');
        }
      });

    this.channels.push(channel);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Subscription: fschool.grades
  // React to new/updated grades — emit academic signal, check goal impact
  // ─────────────────────────────────────────────────────────────────────────

  private async subscribeToGrades(): Promise<void> {
    const channel = supabase
      .channel('brain-grades')
      .on(
        'postgres_changes',
        { event: '*', schema: 'fschool', table: 'grades' },
        async (payload) => {
          const grade = payload.new as any;
          if (!grade) return;

          // Get person_id from student record
          const { data: student } = await supabase
            .schema('fschool')
            .from('students')
            .select('person_id')
            .eq('id', grade.student_id)
            .single();

          if (!student?.person_id) return;

          const personId = student.person_id;
          const score = grade.score || grade.grade || 0;
          const maxScore = grade.max_score || grade.max_points || 100;
          const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;

          console.log(`[BrainRealtime] Grade event for person ${personId.slice(0, 8)}... — ${percentage.toFixed(1)}%`);

          // Emit academic signal
          await signalIngestion.ingest({
            person_id: personId,
            signal_type: 'academic',
            subtype: payload.eventType === 'INSERT' ? 'grade_received' : 'grade_updated',
            value: percentage / 100, // normalize to 0-1
            value_json: {
              score,
              max_score: maxScore,
              percentage,
              assignment_id: grade.assignment_id,
              course_id: grade.course_id,
              is_passing: percentage >= 60,
              is_strong: percentage >= 85,
            },
            occurred_at: new Date().toISOString(),
            source: 'realtime_grades',
          });

          // Check if this grade affects an active goal
          await this.checkGoalImpact(personId, 'academic', percentage);

          // Trigger context window refresh — brain needs to know about this grade
          await contextWindowWriter.refresh(personId);

          // If grade is notably low, evaluate for intervention
          if (percentage < 60) {
            this.scheduleInterventionEval(personId, 'low_grade', 5000);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[BrainRealtime] ✓ Subscribed to fschool.grades');
        }
      });

    this.channels.push(channel);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Subscription: brain.signals
  // React to high-value signals — evaluate for immediate intervention
  // ─────────────────────────────────────────────────────────────────────────

  private async subscribeToSignals(): Promise<void> {
    const channel = supabase
      .channel('brain-signals-watch')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'brain', table: 'signals' },
        async (payload) => {
          const signal = payload.new as any;
          if (!signal?.person_id) return;

          // Only react to high-value or stress/wellbeing signals
          const isHighValue = (signal.value || 0) >= 0.75;
          const isCriticalType = ['stress', 'wellbeing', 'sleep'].includes(signal.signal_type);

          if (!isHighValue && !isCriticalType) return;

          console.log(`[BrainRealtime] High-value signal: ${signal.signal_type}/${signal.subtype} = ${signal.value} for ${signal.person_id.slice(0, 8)}...`);

          // Debounce — don't fire intervention eval on every signal in a burst
          this.scheduleInterventionEval(signal.person_id, signal.signal_type, 10000);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[BrainRealtime] ✓ Subscribed to brain.signals');
        }
      });

    this.channels.push(channel);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Subscription: fschool.assignments
  // React to new assignments — check deadline proximity, update context
  // ─────────────────────────────────────────────────────────────────────────

  private async subscribeToAssignments(): Promise<void> {
    const channel = supabase
      .channel('brain-assignments')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'fschool', table: 'assignments' },
        async (payload) => {
          const assignment = payload.new as any;
          if (!assignment?.due_date) return;

          // Get all students in this course
          const { data: enrollments } = await supabase
            .schema('fschool')
            .from('students')
            .select('person_id')
            .eq('course_id', assignment.course_id);

          if (!enrollments) return;

          const dueDate = new Date(assignment.due_date);
          const hoursUntilDue = (dueDate.getTime() - Date.now()) / (1000 * 60 * 60);

          for (const enrollment of enrollments) {
            if (!enrollment.person_id) continue;

            // Emit academic signal for new assignment
            await signalIngestion.ingest({
              person_id: enrollment.person_id,
              signal_type: 'academic',
              subtype: 'assignment_posted',
              value: hoursUntilDue < 48 ? 0.8 : 0.3, // urgent if < 48h
              value_json: {
                assignment_id: assignment.id,
                assignment_name: assignment.name || assignment.title,
                due_date: assignment.due_date,
                hours_until_due: Math.round(hoursUntilDue),
                is_urgent: hoursUntilDue < 48,
                course_id: assignment.course_id,
              },
              occurred_at: new Date().toISOString(),
              source: 'realtime_assignments',
            });

            // Refresh context window — brain needs to know about this deadline
            await contextWindowWriter.refresh(enrollment.person_id);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[BrainRealtime] ✓ Subscribed to fschool.assignments');
        }
      });

    this.channels.push(channel);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private scheduleInterventionEval(personId: string, reason: string, delayMs: number): void {
    const existing = this.interventionDebounce.get(personId);
    if (existing) clearTimeout(existing);

    this.interventionDebounce.set(
      personId,
      setTimeout(async () => {
        console.log(`[BrainRealtime] Evaluating intervention for ${personId.slice(0, 8)}... (reason: ${reason})`);
        await interventionEngine.evaluate(personId);
        this.interventionDebounce.delete(personId);
      }, delayMs)
    );
  }

  private async checkGoalImpact(personId: string, domain: string, value: number): Promise<void> {
    try {
      const { data: goals } = await supabase
        .schema('brain')
        .from('goals')
        .select('id, title, progress, target_value')
        .eq('person_id', personId)
        .eq('status', 'active')
        .eq('domain', domain);

      if (!goals || goals.length === 0) return;

      // Update progress on relevant goals
      for (const goal of goals) {
        if (goal.target_value && value > 0) {
          const newProgress = Math.min(100, Math.round((value / goal.target_value) * 100));
          if (Math.abs(newProgress - (goal.progress || 0)) > 5) {
            await supabase
              .schema('brain')
              .from('goals')
              .update({ progress: newProgress, updated_at: new Date().toISOString() })
              .eq('id', goal.id);
          }
        }
      }
    } catch (err) {
      console.error('[BrainRealtime] Goal impact check error:', err);
    }
  }
}

export const brainRealtime = new BrainRealtime();
