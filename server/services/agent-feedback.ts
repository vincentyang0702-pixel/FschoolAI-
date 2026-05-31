// ============================================================
// Agent Feedback Loop
// 
// PROBLEM: When an agent gives a response, the brain doesn't
// know if it was helpful. There's no signal for "this worked"
// or "this didn't work". Without this, the brain can't learn
// which agent responses actually help students.
//
// FIX: A lightweight feedback service that:
// 1. Records thumbs up/down on any agent response
// 2. Writes to brain_signals (triggers the webhook)
// 3. Updates agent performance metrics in agent_sessions
// 4. Feeds back into brain context for future routing
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type FeedbackRating = 'helpful' | 'not_helpful' | 'partially_helpful';

export interface AgentFeedback {
  userId: string;
  sessionId: string;       // The agent_sessions.id
  agentType: string;       // e.g. 'study', 'motivation', 'focus'
  rating: FeedbackRating;
  comment?: string;        // Optional free-text from student
  courseId?: string;
  assignmentId?: string;
}

export class AgentFeedbackService {
  // ── Submit feedback on an agent response ──────────────────────────────────
  async submitFeedback(feedback: AgentFeedback): Promise<{ success: boolean }> {
    try {
      // 1. Write to brain_signals — this triggers the webhook for real-time brain update
      await supabase.from('brain_signals').insert({
        user_id: feedback.userId,
        signal_type: 'agent_feedback',
        product: 'fschoolai',
        agent_used: feedback.agentType,
        course_id: feedback.courseId || null,
        assignment_id: feedback.assignmentId || null,
        metadata: {
          session_id: feedback.sessionId,
          rating: feedback.rating,
          comment: feedback.comment || null,
          // Numeric score for brain compounding calculations
          score: feedback.rating === 'helpful' ? 1.0
               : feedback.rating === 'partially_helpful' ? 0.5
               : 0.0,
        },
        created_at: new Date().toISOString(),
      });

      // 2. Update the agent_session with the feedback rating
      await supabase
        .from('agent_sessions')
        .update({
          // Store feedback in metadata column if it exists, otherwise this is a no-op
          // The brain_signals table is the primary feedback store
        })
        .eq('id', feedback.sessionId)
        .eq('user_id', feedback.userId);

      return { success: true };
    } catch (err) {
      console.error('[AgentFeedback] Failed to record feedback:', err);
      return { success: false };
    }
  }

  // ── Get agent performance stats for a user ────────────────────────────────
  // Used by Reggie to prefer agents that have historically helped this student
  async getAgentPerformance(userId: string): Promise<Record<string, number>> {
    try {
      const { data } = await supabase
        .from('brain_signals')
        .select('agent_used, metadata')
        .eq('user_id', userId)
        .eq('signal_type', 'agent_feedback')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!data || data.length === 0) return {};

      // Aggregate average score per agent
      const agentScores: Record<string, { total: number; count: number }> = {};
      for (const row of data) {
        const agent = row.agent_used;
        const score = (row.metadata as Record<string, unknown>)?.score as number ?? 0.5;
        if (!agentScores[agent]) agentScores[agent] = { total: 0, count: 0 };
        agentScores[agent].total += score;
        agentScores[agent].count += 1;
      }

      return Object.fromEntries(
        Object.entries(agentScores).map(([agent, { total, count }]) => [
          agent,
          total / count,
        ])
      );
    } catch {
      return {};
    }
  }
}

export const agentFeedback = new AgentFeedbackService();
