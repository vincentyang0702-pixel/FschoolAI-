/**
 * Brain Compounding Engine
 * 
 * Processes signals and updates the knowledge graph:
 * - Signal ingestion (behavioral, emotional, knowledge, context, outcome)
 * - Brain compounding (updating mastery, relationships, insights)
 * - Feedback loop processing
 * - Insight generation
 */

import { createClient } from '@supabase/supabase-js';
import KnowledgeGraphEngine from './knowledge-graph';

interface Signal {
  type: 'behavioral' | 'emotional' | 'knowledge' | 'context' | 'outcome';
  userId: string;
  courseId?: string;
  data: Record<string, any>;
  timestamp?: Date;
}

interface BrainCompoundingResult {
  conceptsUpdated: number;
  connectionsStrengthened: number;
  insightsGenerated: number;
  feedbackProcessed: number;
}

export class BrainCompoundingEngine {
  private supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
  );
  private knowledgeGraph = new KnowledgeGraphEngine();

  /**
   * Process a signal and update the brain
   */
  async processSignal(signal: Signal): Promise<BrainCompoundingResult> {
    const result: BrainCompoundingResult = {
      conceptsUpdated: 0,
      connectionsStrengthened: 0,
      insightsGenerated: 0,
      feedbackProcessed: 0,
    };

    try {
      switch (signal.type) {
        case 'outcome':
          result.conceptsUpdated += await this.processOutcomeSignal(signal);
          break;
        case 'knowledge':
          result.conceptsUpdated += await this.processKnowledgeSignal(signal);
          break;
        case 'emotional':
          result.insightsGenerated += await this.processEmotionalSignal(signal);
          break;
        case 'behavioral':
          result.feedbackProcessed += await this.processBehavioralSignal(signal);
          break;
        case 'context':
          result.feedbackProcessed += await this.processContextSignal(signal);
          break;
      }

      // Generate insights based on all signals
      result.insightsGenerated += await this.generateInsights(signal.userId, signal.courseId);

      // Log the compounding event
      await this.logCompoundingEvent(signal.userId, result);

      return result;
    } catch (error) {
      console.error('Error processing signal:', error);
      throw error;
    }
  }

  /**
   * Process outcome signal (grades, completion time, etc.)
   */
  private async processOutcomeSignal(signal: Signal): Promise<number> {
    try {
      const { data: assignment } = await this.supabase
        .from('assignments')
        .select('*')
        .eq('id', signal.data.assignmentId)
        .single();

      if (!assignment) return 0;

      // Extract grade/score
      const score = signal.data.score || 0;
      const maxScore = signal.data.maxScore || 100;
      const percentage = (score / maxScore) * 100;

      // Convert percentage to mastery level (0-1)
      const masteryLevel = Math.min(1, percentage / 100);

      // Record outcome signal
      await this.supabase.from('outcome_signals').insert({
        user_id: signal.userId,
        course_id: signal.courseId,
        assignment_id: signal.data.assignmentId,
        outcome_type: 'grade',
        outcome_value: score,
        metadata: {
          percentage,
          maxScore,
          timeSpent: signal.data.timeSpent,
        },
        timestamp: signal.timestamp || new Date(),
      });

      // Update concept mastery based on assignment
      // (In a real system, we'd map assignments to concepts)
      const conceptsUpdated = 1;

      return conceptsUpdated;
    } catch (error) {
      console.error('Error processing outcome signal:', error);
      return 0;
    }
  }

  /**
   * Process knowledge signal (mastery, learning style, confidence)
   */
  private async processKnowledgeSignal(signal: Signal): Promise<number> {
    try {
      const conceptName = signal.data.conceptName;
      const masteryLevel = signal.data.masteryLevel || 0;

      // Add or update concept
      await this.knowledgeGraph.addConcept(
        signal.userId,
        conceptName,
        signal.courseId,
        masteryLevel
      );

      // Record knowledge signal
      await this.supabase.from('knowledge_signals').insert({
        user_id: signal.userId,
        course_id: signal.courseId,
        mastery_level: masteryLevel,
        learning_style: signal.data.learningStyle,
        confidence_score: signal.data.confidence,
        timestamp: signal.timestamp || new Date(),
      });

      return 1;
    } catch (error) {
      console.error('Error processing knowledge signal:', error);
      return 0;
    }
  }

  /**
   * Process emotional signal (stress, confidence, motivation)
   */
  private async processEmotionalSignal(signal: Signal): Promise<number> {
    try {
      const emotionType = signal.data.emotionType;
      const intensity = signal.data.intensity || 0;

      // Record emotional signal
      await this.supabase.from('emotional_signals').insert({
        user_id: signal.userId,
        course_id: signal.courseId,
        emotion_type: emotionType,
        intensity: Math.min(1, Math.max(0, intensity)),
        context: signal.data.context || {},
        timestamp: signal.timestamp || new Date(),
      });

      // Update emotional state history
      await this.supabase.from('emotional_state_history').insert({
        user_id: signal.userId,
        emotional_state: emotionType,
        intensity: Math.min(1, Math.max(0, intensity)),
        triggers: signal.data.triggers || {},
        notes: signal.data.notes,
      });

      // If stress is high, generate coping strategy
      if (emotionType === 'stress' && intensity > 0.7) {
        await this.generateCopingStrategy(signal.userId);
      }

      return 1;
    } catch (error) {
      console.error('Error processing emotional signal:', error);
      return 0;
    }
  }

  /**
   * Process behavioral signal (typing speed, focus, etc.)
   */
  private async processBehavioralSignal(signal: Signal): Promise<number> {
    try {
      // Record behavioral signal
      await this.supabase.from('behavioral_signals').insert({
        user_id: signal.userId,
        course_id: signal.courseId,
        signal_type: signal.data.signalType,
        value: signal.data.value,
        metadata: signal.data.metadata || {},
        timestamp: signal.timestamp || new Date(),
      });

      return 1;
    } catch (error) {
      console.error('Error processing behavioral signal:', error);
      return 0;
    }
  }

  /**
   * Process context signal (location, time, device)
   */
  private async processContextSignal(signal: Signal): Promise<number> {
    try {
      // Record context signal
      await this.supabase.from('context_signals').insert({
        user_id: signal.userId,
        course_id: signal.courseId,
        context_type: signal.data.contextType,
        context_value: signal.data.contextValue,
        metadata: signal.data.metadata || {},
        timestamp: signal.timestamp || new Date(),
      });

      return 1;
    } catch (error) {
      console.error('Error processing context signal:', error);
      return 0;
    }
  }

  /**
   * Generate insights based on signals
   */
  private async generateInsights(userId: string, courseId?: string): Promise<number> {
    try {
      // Get recent signals
      const { data: recentSignals } = await this.supabase
        .from('knowledge_signals')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(10);

      if (!recentSignals || recentSignals.length === 0) return 0;

      // Analyze patterns
      const avgMastery =
        recentSignals.reduce((sum, s: any) => sum + s.mastery_level, 0) /
        recentSignals.length;

      let insightType = 'pattern';
      let title = 'Learning Progress';
      let description = `Your average mastery level is ${(avgMastery * 100).toFixed(0)}%`;

      if (avgMastery > 0.8) {
        insightType = 'achievement';
        title = 'Strong Performance';
        description = 'You are performing well! Consider tackling more challenging concepts.';
      } else if (avgMastery < 0.5) {
        insightType = 'warning';
        title = 'Struggling Areas Detected';
        description = 'You may need additional support in this area. Consider reaching out for help.';
      }

      // Create insight
      const { error } = await this.supabase.from('insights').insert({
        user_id: userId,
        course_id: courseId,
        insight_type: insightType,
        title,
        description,
        confidence: Math.min(1, avgMastery + 0.2),
        actionable: true,
      });

      if (error) throw error;

      return 1;
    } catch (error) {
      console.error('Error generating insights:', error);
      return 0;
    }
  }

  /**
   * Generate coping strategy for high stress
   */
  private async generateCopingStrategy(userId: string): Promise<void> {
    try {
      const strategies = [
        {
          name: 'Take a Break',
          description: 'Step away from your work for 5-10 minutes to clear your mind.',
          effectiveness: 0.7,
        },
        {
          name: 'Deep Breathing',
          description: 'Practice deep breathing exercises to calm your nervous system.',
          effectiveness: 0.8,
        },
        {
          name: 'Talk to Someone',
          description: 'Reach out to a friend, tutor, or counselor for support.',
          effectiveness: 0.9,
        },
        {
          name: 'Change Your Environment',
          description: 'Move to a different location to reduce stress triggers.',
          effectiveness: 0.6,
        },
      ];

      const randomStrategy = strategies[Math.floor(Math.random() * strategies.length)];

      await this.supabase.from('coping_strategies').insert({
        user_id: userId,
        strategy_name: randomStrategy.name,
        description: randomStrategy.description,
        effectiveness: randomStrategy.effectiveness,
        times_used: 0,
      });
    } catch (error) {
      console.error('Error generating coping strategy:', error);
    }
  }

  /**
   * Log compounding event for transparency
   */
  private async logCompoundingEvent(
    userId: string,
    result: BrainCompoundingResult
  ): Promise<void> {
    try {
      await this.supabase.from('changelog').insert({
        user_id: userId,
        change_type: 'brain_compounding',
        change_description: `Processed signal: ${result.conceptsUpdated} concepts updated, ${result.connectionsStrengthened} connections strengthened, ${result.insightsGenerated} insights generated`,
        changed_by: 'brain_compounding_engine',
        metadata: result,
      });
    } catch (error) {
      console.error('Error logging compounding event:', error);
    }
  }

  /**
   * Process feedback loop (track effectiveness of recommendations)
   */
  async processFeedback(
    userId: string,
    actionId: string,
    feedbackType: string,
    feedbackValue: number
  ): Promise<void> {
    try {
      // Record feedback
      await this.supabase.from('feedback_loops').insert({
        user_id: userId,
        action_id: actionId,
        feedback_type: feedbackType,
        feedback_value: Math.min(1, Math.max(-1, feedbackValue)),
      });

      // Update autonomous action status
      await this.supabase
        .from('autonomous_actions')
        .update({ status: 'completed' })
        .eq('id', actionId);

      // Log feedback
      await this.supabase.from('changelog').insert({
        user_id: userId,
        change_type: 'feedback_received',
        change_description: `Feedback received for action ${actionId}: ${feedbackType} = ${feedbackValue}`,
        changed_by: 'feedback_processor',
      });
    } catch (error) {
      console.error('Error processing feedback:', error);
      throw error;
    }
  }
}

export default BrainCompoundingEngine;
