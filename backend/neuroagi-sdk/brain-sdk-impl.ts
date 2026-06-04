/**
 * NeuroAGI Brain SDK — Implementation
 * 
 * This is the concrete implementation of the Brain SDK interface.
 * It wraps the internal NeuroAGI services and exposes a clean, stable API.
 * 
 * FschoolAI and other products import from brain-sdk.ts (the interface),
 * not this file. This keeps the internals private.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  INeuroAGIBrainSDK,
  UserContext,
  BrainUpdateEvent,
  AgentSuggestion,
  SkillVerification,
  BrainHealthMetrics,
  BrainSDKError,
} from './brain-sdk';

export class NeuroAGIBrainSDK implements INeuroAGIBrainSDK {
  private supabase: SupabaseClient;
  private productId: string;

  constructor(config: {
    supabaseUrl: string;
    supabaseKey: string;
    productId: string; // e.g. 'fschoolai', 'reggie'
  }) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.productId = config.productId;
  }

  /**
   * Get user context — the brain's full understanding of a user
   */
  async getContext(userId: string, productId?: string): Promise<UserContext> {
    try {
      // 1. Get knowledge signals (what they know)
      const { data: knowledgeSignals } = await this.supabase
        .from('knowledge_signals')
        .select('*')
        .eq('student_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      // 2. Get emotional signals (how they feel)
      const { data: emotionalSignals } = await this.supabase
        .from('emotional_signals')
        .select('*')
        .eq('student_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      // 3. Get behavioral signals (how they work)
      const { data: behavioralSignals } = await this.supabase
        .from('behavioral_signals')
        .select('*')
        .eq('student_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      // 4. Get concept progress (knowledge graph)
      const { data: concepts } = await this.supabase
        .from('concept_progress')
        .select('*')
        .eq('student_id', userId);

      // 5. Build knowledge level map
      const knowledgeLevel: Record<string, number> = {};
      (knowledgeSignals || []).forEach((s: any) => {
        if (s.subject) {
          knowledgeLevel[s.subject] = Math.max(
            knowledgeLevel[s.subject] || 0,
            s.mastery_level || 0
          );
        }
      });

      // 6. Determine learning style from behavioral patterns
      const learningStyle = this.inferLearningStyle(behavioralSignals || []);

      // 7. Determine focus pattern
      const focusPattern = this.inferFocusPattern(behavioralSignals || []);

      // 8. Determine emotional state
      const latestEmotion = emotionalSignals?.[0];
      const emotionalState = this.mapEmotionalState(latestEmotion);

      // 9. Find knowledge gaps (concepts with low mastery)
      const knowledgeGaps = (concepts || [])
        .filter((c: any) => c.mastery_level < 0.5)
        .map((c: any) => c.concept_name)
        .slice(0, 10);

      // 10. Find strengths (concepts with high mastery)
      const strengths = (concepts || [])
        .filter((c: any) => c.mastery_level > 0.75)
        .map((c: any) => c.concept_name)
        .slice(0, 10);

      // 11. Get recent activity
      const recentActivity = (behavioralSignals || []).slice(0, 20).map((s: any) => ({
        type: s.signal_type || 'unknown',
        subject: s.subject,
        duration: s.duration_minutes,
        outcome: s.outcome,
        timestamp: s.created_at,
        metadata: s.metadata,
      }));

      return {
        userId,
        knowledgeLevel,
        learningStyle,
        focusPattern,
        emotionalState,
        goals: [], // TODO: pull from goals table
        recentActivity,
        knowledgeGaps,
        strengths,
        productContexts: {
          [productId || this.productId]: {
            productId: productId || this.productId,
            lastActive: new Date().toISOString(),
            sessionCount: behavioralSignals?.length || 0,
            recentActivity,
            preferences: {},
          },
        },
      };
    } catch (error: any) {
      throw new BrainSDKError(
        `Failed to get context for user ${userId}: ${error.message}`,
        'INTERNAL',
        userId
      );
    }
  }

  /**
   * Update the brain with a new event
   */
  async update(event: BrainUpdateEvent): Promise<void> {
    try {
      const timestamp = event.timestamp || new Date().toISOString();

      // Route event to the correct signal table
      switch (event.eventType) {
        case 'study_session':
        case 'assignment_completed':
        case 'focus_session':
          await this.supabase.from('behavioral_signals').insert({
            student_id: event.userId,
            signal_type: event.eventType,
            subject: event.data.subject,
            duration_minutes: event.data.duration,
            outcome: event.data.outcome,
            metadata: { productId: event.productId, ...event.data },
            created_at: timestamp,
          });
          break;

        case 'concept_learned':
        case 'grade_received':
          await this.supabase.from('knowledge_signals').insert({
            student_id: event.userId,
            subject: event.data.subject,
            concept: event.data.concept,
            mastery_level: event.data.masteryLevel || event.data.grade,
            signal_source: event.productId,
            metadata: event.data,
            created_at: timestamp,
          });
          // Also update concept_progress
          await this.supabase.from('concept_progress').upsert({
            student_id: event.userId,
            concept_name: event.data.concept || event.data.subject,
            mastery_level: event.data.masteryLevel || event.data.grade,
            last_updated: timestamp,
          }, { onConflict: 'student_id,concept_name' });
          break;

        case 'signal_captured':
          await this.supabase.from('context_signals').insert({
            student_id: event.userId,
            signal_type: event.data.signalType,
            value: event.data.value,
            source: event.productId,
            metadata: event.data,
            created_at: timestamp,
          });
          break;

        case 'content_consumed':
          await this.supabase.from('behavioral_signals').insert({
            student_id: event.userId,
            signal_type: 'content_consumed',
            subject: event.data.topic,
            duration_minutes: event.data.duration,
            metadata: { productId: event.productId, contentType: event.data.contentType, ...event.data },
            created_at: timestamp,
          });
          break;

        default:
          // Generic event — store in context_signals
          await this.supabase.from('context_signals').insert({
            student_id: event.userId,
            signal_type: event.eventType,
            source: event.productId,
            metadata: event.data,
            created_at: timestamp,
          });
      }

      // Log to changelog for audit trail
      await this.supabase.from('changelog').insert({
        user_id: event.userId,
        change_type: 'brain_update',
        change_description: `Brain updated via ${event.productId}: ${event.eventType}`,
        changed_by: event.productId,
        metadata: { eventType: event.eventType },
      });
    } catch (error: any) {
      throw new BrainSDKError(
        `Failed to update brain for user ${event.userId}: ${error.message}`,
        'INTERNAL',
        event.userId
      );
    }
  }

  /**
   * Suggest the next best action for a user
   */
  async suggestNext(userId: string, context?: Partial<UserContext>): Promise<AgentSuggestion> {
    try {
      const userContext = context?.emotionalState
        ? (context as UserContext)
        : await this.getContext(userId);

      // Decision logic: what does this user need right now?

      // Rule 1: If stressed + has upcoming deadline → motivation agent
      if (userContext.emotionalState === 'stressed') {
        return {
          agentId: 'motivation-agent',
          agentName: 'Motivation Coach',
          reason: 'User shows stress signals. Needs encouragement before study.',
          confidence: 0.85,
          action: 'Send a personalized motivational message based on past wins',
          urgency: 'high',
        };
      }

      // Rule 2: If knowledge gaps exist → study agent
      if (userContext.knowledgeGaps.length > 0) {
        return {
          agentId: 'study-agent',
          agentName: 'Study Buddy',
          reason: `User has ${userContext.knowledgeGaps.length} knowledge gaps. Top gap: ${userContext.knowledgeGaps[0]}`,
          confidence: 0.9,
          action: `Create a targeted study plan for: ${userContext.knowledgeGaps[0]}`,
          urgency: 'medium',
        };
      }

      // Rule 3: If long session detected → focus agent
      const recentFocusSession = userContext.recentActivity.find(
        (a) => a.type === 'focus_session' && a.duration && a.duration > 90
      );
      if (recentFocusSession) {
        return {
          agentId: 'focus-agent',
          agentName: 'Focus Guardian',
          reason: 'User has been in a long focus session. May need a break.',
          confidence: 0.75,
          action: 'Suggest a 10-minute break and log the session',
          urgency: 'medium',
        };
      }

      // Default: recommendation agent
      return {
        agentId: 'recommendation-agent',
        agentName: 'Recommendation Engine',
        reason: 'No urgent signals. Suggest next learning step.',
        confidence: 0.7,
        action: `Review progress on ${userContext.strengths[0] || 'current subjects'} and suggest next topic`,
        urgency: 'low',
      };
    } catch (error: any) {
      throw new BrainSDKError(
        `Failed to suggest next action for user ${userId}: ${error.message}`,
        'INTERNAL',
        userId
      );
    }
  }

  /**
   * Verify a user's skill based on observed evidence
   */
  async verifySkill(userId: string, skill: string): Promise<SkillVerification> {
    try {
      const { data: signals } = await this.supabase
        .from('knowledge_signals')
        .select('*')
        .eq('student_id', userId)
        .ilike('subject', `%${skill}%`)
        .order('created_at', { ascending: false });

      const evidenceCount = signals?.length || 0;
      const avgMastery =
        evidenceCount > 0
          ? (signals || []).reduce((sum: number, s: any) => sum + (s.mastery_level || 0), 0) / evidenceCount
          : 0;

      return {
        skill,
        verified: evidenceCount >= 3 && avgMastery >= 0.7,
        masteryLevel: avgMastery,
        evidenceCount,
        lastVerified: signals?.[0]?.created_at || new Date().toISOString(),
      };
    } catch (error: any) {
      throw new BrainSDKError(
        `Failed to verify skill ${skill} for user ${userId}: ${error.message}`,
        'INTERNAL',
        userId
      );
    }
  }

  /**
   * Get brain health metrics
   */
  async getHealthMetrics(userId: string): Promise<BrainHealthMetrics> {
    try {
      const [behavioral, emotional, knowledge, concepts] = await Promise.all([
        this.supabase.from('behavioral_signals').select('count', { count: 'exact' }).eq('student_id', userId),
        this.supabase.from('emotional_signals').select('*').eq('student_id', userId).order('created_at', { ascending: false }).limit(1),
        this.supabase.from('knowledge_signals').select('mastery_level, created_at').eq('student_id', userId).order('created_at', { ascending: true }).limit(1),
        this.supabase.from('concept_progress').select('mastery_level').eq('student_id', userId),
      ]);

      const totalSignals = (behavioral.count || 0);
      const conceptsTracked = concepts.data?.length || 0;
      const avgMastery =
        conceptsTracked > 0
          ? (concepts.data || []).reduce((sum: number, c: any) => sum + c.mastery_level, 0) / conceptsTracked
          : 0;

      const firstSignalDate = knowledge.data?.[0]?.created_at;
      const brainAge = firstSignalDate
        ? Math.floor((Date.now() - new Date(firstSignalDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        totalSignals,
        conceptsTracked,
        avgMastery,
        emotionalState: emotional.data?.[0]?.emotion_type || null,
        lastActivity: Date.now(),
        products: [this.productId],
        brainAge,
      };
    } catch (error: any) {
      throw new BrainSDKError(
        `Failed to get health metrics for user ${userId}: ${error.message}`,
        'INTERNAL',
        userId
      );
    }
  }

  /**
   * Export all brain data
   */
  async exportData(userId: string): Promise<UserContext> {
    return this.getContext(userId);
  }

  /**
   * Delete all brain data (GDPR / right to be forgotten)
   */
  async deleteData(userId: string): Promise<void> {
    try {
      await Promise.all([
        this.supabase.from('behavioral_signals').delete().eq('student_id', userId),
        this.supabase.from('emotional_signals').delete().eq('student_id', userId),
        this.supabase.from('knowledge_signals').delete().eq('student_id', userId),
        this.supabase.from('context_signals').delete().eq('student_id', userId),
        this.supabase.from('concept_progress').delete().eq('student_id', userId),
        this.supabase.from('concept_connections').delete().eq('student_id', userId),
        this.supabase.from('insights').delete().eq('student_id', userId),
      ]);

      await this.supabase.from('changelog').insert({
        user_id: userId,
        change_type: 'brain_deleted',
        change_description: 'User deleted all brain data via SDK',
        changed_by: this.productId,
      });
    } catch (error: any) {
      throw new BrainSDKError(
        `Failed to delete brain data for user ${userId}: ${error.message}`,
        'INTERNAL',
        userId
      );
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private inferLearningStyle(signals: any[]): UserContext['learningStyle'] {
    const videoCount = signals.filter((s) => s.signal_type === 'video_watched').length;
    const readCount = signals.filter((s) => s.signal_type === 'reading').length;
    const practiceCount = signals.filter((s) => s.signal_type === 'practice').length;
    const max = Math.max(videoCount, readCount, practiceCount);
    if (max === videoCount) return 'visual';
    if (max === readCount) return 'reading';
    if (max === practiceCount) return 'kinesthetic';
    return 'reading';
  }

  private inferFocusPattern(signals: any[]): UserContext['focusPattern'] {
    const focusSessions = signals.filter((s) => s.signal_type === 'focus_session');
    const avgDuration =
      focusSessions.length > 0
        ? focusSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / focusSessions.length
        : 45;

    // Extract peak hours from timestamps
    const hours = focusSessions.map((s) => new Date(s.created_at).getHours());
    const hourCounts: Record<number, number> = {};
    hours.forEach((h) => { hourCounts[h] = (hourCounts[h] || 0) + 1; });
    const peakHours = Object.entries(hourCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([h]) => parseInt(h));

    return { peakHours: peakHours.length > 0 ? peakHours : [20, 21, 22], avgSessionMinutes: avgDuration };
  }

  private mapEmotionalState(signal: any): UserContext['emotionalState'] {
    if (!signal) return 'neutral';
    const emotion = signal.emotion_type?.toLowerCase() || '';
    if (emotion.includes('stress') || emotion.includes('anxious')) return 'stressed';
    if (emotion.includes('motivat') || emotion.includes('excit')) return 'motivated';
    if (emotion.includes('tired') || emotion.includes('fatigue')) return 'fatigued';
    return 'neutral';
  }
}

/**
 * Factory function — create a Brain SDK instance for a product
 * 
 * @example
 * // In FschoolAI:
 * import { createBrainSDK } from '@neuroagi/brain-sdk';
 * const brain = createBrainSDK({ productId: 'fschoolai' });
 * 
 * // In Reggie:
 * const brain = createBrainSDK({ productId: 'reggie' });
 */
export function createBrainSDK(config?: { productId?: string }): NeuroAGIBrainSDK {
  return new NeuroAGIBrainSDK({
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    supabaseKey: process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
    productId: config?.productId || 'fschoolai',
  });
}

export default NeuroAGIBrainSDK;
