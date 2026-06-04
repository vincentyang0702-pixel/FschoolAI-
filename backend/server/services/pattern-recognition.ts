/**
 * Pattern Recognition Engine
 * 
 * Analyzes historical events to identify recurring patterns
 * - Procrastination patterns
 * - Learning style patterns
 * - Struggle patterns
 * - Success patterns
 * - Distraction patterns
 */

import { createClient } from '@supabase/supabase-js';
import { Event } from './event-stream';

export interface Pattern {
  pattern_id: string;
  user_id: string;
  pattern_type: string;
  description: string;
  events: Event[];
  confidence: number;
  frequency: number;
  first_seen: Date;
  last_seen: Date;
  metadata: Record<string, any>;
}

export class PatternRecognitionEngine {
  private supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
  );

  /**
   * Analyze events to identify patterns
   */
  async analyzePatterns(userId: string, days: number = 30): Promise<Pattern[]> {
    try {
      // Get events from past N days
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data: events } = await this.supabase
        .from('events')
        .select('*')
        .eq('user_id', userId)
        .gte('timestamp', startDate.toISOString())
        .order('timestamp', { ascending: true });

      if (!events || events.length === 0) {
        return [];
      }

      const patterns: Pattern[] = [];

      // Analyze different pattern types
      patterns.push(...await this.analyzeProcrastinationPatterns(userId, events));
      patterns.push(...await this.analyzeLearningStylePatterns(userId, events));
      patterns.push(...await this.analyzeStrugglePatterns(userId, events));
      patterns.push(...await this.analyzeSuccessPatterns(userId, events));
      patterns.push(...await this.analyzeDistractionPatterns(userId, events));
      patterns.push(...await this.analyzeReviewPatterns(userId, events));

      // Store patterns
      await this.storePatterns(patterns);

      return patterns;
    } catch (error) {
      console.error('Error analyzing patterns:', error);
      return [];
    }
  }

  /**
   * Detect procrastination patterns
   * - Student waits until last day to start assignment
   * - Student submits just before deadline
   * - Student shows late-night activity spikes
   */
  private async analyzeProcrastinationPatterns(
    userId: string,
    events: Event[]
  ): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    // Group events by assignment
    const assignmentEvents: Record<string, Event[]> = {};
    events
      .filter(e => e.event_type.includes('assignment'))
      .forEach(e => {
        const assignmentId = e.data.assignment_id;
        if (!assignmentEvents[assignmentId]) {
          assignmentEvents[assignmentId] = [];
        }
        assignmentEvents[assignmentId].push(e);
      });

    // Analyze each assignment
    let procrastinationCount = 0;
    Object.values(assignmentEvents).forEach(assignmentEvents => {
      const posted = assignmentEvents.find(e => e.event_type === 'assignment_posted');
      const submitted = assignmentEvents.find(e => e.event_type === 'assignment_submitted');

      if (posted && submitted) {
        const daysUntilDeadline = Math.ceil(
          (new Date(posted.data.due_date).getTime() - submitted.timestamp.getTime()) /
          (1000 * 60 * 60 * 24)
        );

        // Procrastination if submitted within 1 day of deadline
        if (daysUntilDeadline <= 1) {
          procrastinationCount++;
        }
      }
    });

    // If procrastination pattern detected
    if (procrastinationCount >= 2) {
      patterns.push({
        pattern_id: `pat_procrastination_${Date.now()}`,
        user_id: userId,
        pattern_type: 'procrastination',
        description: `Student procrastinates on ${procrastinationCount} assignments`,
        events: events.filter(e => e.event_type.includes('assignment')),
        confidence: Math.min(procrastinationCount / 5, 1), // Max 100% confidence
        frequency: procrastinationCount,
        first_seen: new Date(Math.min(...Object.values(assignmentEvents).flat().map(e => e.timestamp.getTime()))),
        last_seen: new Date(Math.max(...Object.values(assignmentEvents).flat().map(e => e.timestamp.getTime()))),
        metadata: {
          type: 'procrastination',
          count: procrastinationCount,
        },
      });
    }

    return patterns;
  }

  /**
   * Detect learning style patterns
   * - Student learns better with video
   * - Student learns better with practice
   * - Student learns better with examples
   */
  private async analyzeLearningStylePatterns(
    userId: string,
    events: Event[]
  ): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    // Analyze performance with different content types
    const videoEvents = events.filter(e => e.data.content_type === 'video');
    const practiceEvents = events.filter(e => e.data.content_type === 'practice');
    const textEvents = events.filter(e => e.data.content_type === 'text');

    const videoPerformance = this.calculatePerformance(videoEvents);
    const practicePerformance = this.calculatePerformance(practiceEvents);
    const textPerformance = this.calculatePerformance(textEvents);

    // Identify preferred learning style
    const scores = [
      { style: 'video', score: videoPerformance },
      { style: 'practice', score: practicePerformance },
      { style: 'text', score: textPerformance },
    ].sort((a, b) => b.score - a.score);

    if (scores[0].score > 0.6) {
      patterns.push({
        pattern_id: `pat_learning_style_${Date.now()}`,
        user_id: userId,
        pattern_type: 'learning_style',
        description: `Student learns best with ${scores[0].style}`,
        events: events.filter(e => e.data.content_type === scores[0].style),
        confidence: scores[0].score,
        frequency: 1,
        first_seen: events[0].timestamp,
        last_seen: events[events.length - 1].timestamp,
        metadata: {
          preferred_style: scores[0].style,
          performance_scores: {
            video: videoPerformance,
            practice: practicePerformance,
            text: textPerformance,
          },
        },
      });
    }

    return patterns;
  }

  /**
   * Detect struggle patterns
   * - Student struggles with specific topics
   * - Student struggles after certain time
   * - Student struggles with certain difficulty levels
   */
  private async analyzeStrugglePatterns(
    userId: string,
    events: Event[]
  ): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    // Group by topic
    const topicEvents: Record<string, Event[]> = {};
    events
      .filter(e => e.data.topic)
      .forEach(e => {
        if (!topicEvents[e.data.topic]) {
          topicEvents[e.data.topic] = [];
        }
        topicEvents[e.data.topic].push(e);
      });

    // Analyze each topic
    Object.entries(topicEvents).forEach(([topic, topicEventList]) => {
      const performance = this.calculatePerformance(topicEventList);
      
      // Struggle if performance < 0.5
      if (performance < 0.5) {
        patterns.push({
          pattern_id: `pat_struggle_${topic}_${Date.now()}`,
          user_id: userId,
          pattern_type: 'struggle',
          description: `Student struggles with ${topic}`,
          events: topicEventList,
          confidence: 1 - performance, // Higher confidence if lower performance
          frequency: topicEventList.length,
          first_seen: topicEventList[0].timestamp,
          last_seen: topicEventList[topicEventList.length - 1].timestamp,
          metadata: {
            topic,
            performance,
          },
        });
      }
    });

    return patterns;
  }

  /**
   * Detect success patterns
   * - Student succeeds with certain approaches
   * - Student succeeds at certain times
   * - Student succeeds with certain resources
   */
  private async analyzeSuccessPatterns(
    userId: string,
    events: Event[]
  ): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    // Find high-performance events
    const successEvents = events.filter(e => e.data.performance >= 0.8);

    if (successEvents.length >= 2) {
      // Analyze common characteristics
      const commonResources = this.findCommonAttribute(successEvents, 'resource');
      const commonTimes = this.findCommonAttribute(successEvents, 'time_of_day');

      if (commonResources) {
        patterns.push({
          pattern_id: `pat_success_resource_${Date.now()}`,
          user_id: userId,
          pattern_type: 'success',
          description: `Student succeeds with ${commonResources}`,
          events: successEvents,
          confidence: 0.8,
          frequency: successEvents.length,
          first_seen: successEvents[0].timestamp,
          last_seen: successEvents[successEvents.length - 1].timestamp,
          metadata: {
            common_resource: commonResources,
          },
        });
      }

      if (commonTimes) {
        patterns.push({
          pattern_id: `pat_success_time_${Date.now()}`,
          user_id: userId,
          pattern_type: 'success',
          description: `Student succeeds at ${commonTimes}`,
          events: successEvents,
          confidence: 0.8,
          frequency: successEvents.length,
          first_seen: successEvents[0].timestamp,
          last_seen: successEvents[successEvents.length - 1].timestamp,
          metadata: {
            common_time: commonTimes,
          },
        });
      }
    }

    return patterns;
  }

  /**
   * Detect distraction patterns
   * - Student gets distracted by social media
   * - Student gets distracted after certain time
   * - Student gets distracted by notifications
   */
  private async analyzeDistractionPatterns(
    userId: string,
    events: Event[]
  ): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    // Find distraction events
    const distractionEvents = events.filter(
      e => e.event_type.includes('distraction') || e.data.distraction_type
    );

    if (distractionEvents.length >= 2) {
      const distractionTypes: Record<string, number> = {};
      distractionEvents.forEach(e => {
        const type = e.data.distraction_type || 'unknown';
        distractionTypes[type] = (distractionTypes[type] || 0) + 1;
      });

      const topDistraction = Object.entries(distractionTypes).sort(
        (a, b) => b[1] - a[1]
      )[0];

      if (topDistraction) {
        patterns.push({
          pattern_id: `pat_distraction_${Date.now()}`,
          user_id: userId,
          pattern_type: 'distraction',
          description: `Student gets distracted by ${topDistraction[0]}`,
          events: distractionEvents.filter(e => e.data.distraction_type === topDistraction[0]),
          confidence: topDistraction[1] / distractionEvents.length,
          frequency: topDistraction[1],
          first_seen: distractionEvents[0].timestamp,
          last_seen: distractionEvents[distractionEvents.length - 1].timestamp,
          metadata: {
            distraction_type: topDistraction[0],
            frequency: topDistraction[1],
          },
        });
      }
    }

    return patterns;
  }

  /**
   * Detect review patterns
   * - Student reviews after N days
   * - Student reviews before exams
   * - Student reviews specific topics
   */
  private async analyzeReviewPatterns(
    userId: string,
    events: Event[]
  ): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    // Find review events
    const reviewEvents = events.filter(e => e.event_type.includes('review'));

    if (reviewEvents.length >= 2) {
      // Calculate average days between reviews
      const daysBetweenReviews: number[] = [];
      for (let i = 1; i < reviewEvents.length; i++) {
        const daysDiff = Math.ceil(
          (reviewEvents[i].timestamp.getTime() - reviewEvents[i - 1].timestamp.getTime()) /
          (1000 * 60 * 60 * 24)
        );
        daysBetweenReviews.push(daysDiff);
      }

      const avgDaysBetweenReviews =
        daysBetweenReviews.reduce((a, b) => a + b, 0) / daysBetweenReviews.length;

      patterns.push({
        pattern_id: `pat_review_${Date.now()}`,
        user_id: userId,
        pattern_type: 'review',
        description: `Student reviews every ${Math.round(avgDaysBetweenReviews)} days`,
        events: reviewEvents,
        confidence: 0.7,
        frequency: reviewEvents.length,
        first_seen: reviewEvents[0].timestamp,
        last_seen: reviewEvents[reviewEvents.length - 1].timestamp,
        metadata: {
          avg_days_between_reviews: avgDaysBetweenReviews,
        },
      });
    }

    return patterns;
  }

  /**
   * Calculate performance score from events
   */
  private calculatePerformance(events: Event[]): number {
    if (events.length === 0) return 0;

    const performances = events
      .map(e => e.data.performance || 0)
      .filter(p => p > 0);

    if (performances.length === 0) return 0;

    return performances.reduce((a, b) => a + b, 0) / performances.length;
  }

  /**
   * Find common attribute in events
   */
  private findCommonAttribute(events: Event[], attribute: string): string | null {
    const attributes: Record<string, number> = {};

    events.forEach(e => {
      const value = e.data[attribute];
      if (value) {
        attributes[value] = (attributes[value] || 0) + 1;
      }
    });

    const sorted = Object.entries(attributes).sort((a, b) => b[1] - a[1]);
    
    if (sorted.length > 0 && sorted[0][1] >= events.length * 0.5) {
      return sorted[0][0];
    }

    return null;
  }

  /**
   * Store patterns in database
   */
  private async storePatterns(patterns: Pattern[]): Promise<void> {
    try {
      await this.supabase.from('patterns').insert(
        patterns.map(p => ({
          pattern_id: p.pattern_id,
          user_id: p.user_id,
          pattern_type: p.pattern_type,
          description: p.description,
          confidence: p.confidence,
          frequency: p.frequency,
          first_seen: p.first_seen,
          last_seen: p.last_seen,
          metadata: p.metadata,
        }))
      );
    } catch (error) {
      console.error('Error storing patterns:', error);
    }
  }

  /**
   * Get patterns for user
   */
  async getPatterns(userId: string, patternType?: string): Promise<Pattern[]> {
    try {
      let query = this.supabase
        .from('patterns')
        .select('*')
        .eq('user_id', userId);

      if (patternType) {
        query = query.eq('pattern_type', patternType);
      }

      const { data } = await query.order('confidence', { ascending: false });
      return data || [];
    } catch (error) {
      console.error('Error getting patterns:', error);
      return [];
    }
  }
}

export default PatternRecognitionEngine;
