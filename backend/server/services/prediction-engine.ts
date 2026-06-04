/**
 * Prediction Engine
 * 
 * Forecasts what will happen BEFORE it happens
 * - Predict failures before they occur
 * - Forecast student needs
 * - Calculate intervention probability
 * - Identify intervention timing
 */

import { createClient } from '@supabase/supabase-js';
import CausalInferenceEngine from './causal-inference';

interface Prediction {
  studentId: string;
  courseId: string;
  prediction: string;
  probability: number;
  timeframe: string;
  interventionNeeded: boolean;
  recommendedIntervention: string;
  confidence: number;
  timestamp: Date;
}

interface StudentRiskProfile {
  studentId: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: RiskFactor[];
  predictedOutcome: string;
  timeUntilIntervention: number;
  urgency: number;
}

interface RiskFactor {
  factor: string;
  weight: number;
  evidence: string[];
}

export class PredictionEngine {
  private supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
  );
  private causalInference = new CausalInferenceEngine();

  /**
   * Predict what will happen for a student
   */
  async predictStudentOutcome(
    studentId: string,
    courseId: string
  ): Promise<Prediction[]> {
    try {
      const predictions: Prediction[] = [];

      // Get student's risk profile
      const riskProfile = await this.calculateRiskProfile(studentId, courseId);

      // Predict failure
      if (riskProfile.riskLevel !== 'low') {
        predictions.push({
          studentId,
          courseId,
          prediction: 'Student at risk of failing',
          probability: this.calculateFailureProbability(riskProfile),
          timeframe: `${riskProfile.timeUntilIntervention} days`,
          interventionNeeded: true,
          recommendedIntervention: 'Proactive support and motivation',
          confidence: riskProfile.riskFactors.reduce((sum, f) => sum + f.weight, 0) / riskProfile.riskFactors.length,
          timestamp: new Date(),
        });
      }

      // Predict procrastination
      const procrastinationProbability = await this.predictProcrastination(studentId, courseId);
      if (procrastinationProbability > 0.6) {
        predictions.push({
          studentId,
          courseId,
          prediction: 'Student likely to procrastinate',
          probability: procrastinationProbability,
          timeframe: 'Next 3 days',
          interventionNeeded: true,
          recommendedIntervention: 'Motivation boost and time management support',
          confidence: 0.8,
          timestamp: new Date(),
        });
      }

      // Predict knowledge gaps
      const knowledgeGaps = await this.predictKnowledgeGaps(studentId, courseId);
      if (knowledgeGaps.length > 0) {
        predictions.push({
          studentId,
          courseId,
          prediction: `Student has knowledge gaps in: ${knowledgeGaps.join(', ')}`,
          probability: 0.85,
          timeframe: 'Before next exam',
          interventionNeeded: true,
          recommendedIntervention: 'Targeted learning support for identified gaps',
          confidence: 0.85,
          timestamp: new Date(),
        });
      }

      // Predict motivation drop
      const motivationDropProbability = await this.predictMotivationDrop(studentId, courseId);
      if (motivationDropProbability > 0.5) {
        predictions.push({
          studentId,
          courseId,
          prediction: 'Student motivation likely to drop',
          probability: motivationDropProbability,
          timeframe: 'Next 1-2 weeks',
          interventionNeeded: true,
          recommendedIntervention: 'Celebrate wins, build confidence, provide encouragement',
          confidence: 0.75,
          timestamp: new Date(),
        });
      }

      return predictions;
    } catch (error) {
      console.error('Error predicting student outcome:', error);
      throw error;
    }
  }

  /**
   * Calculate student's risk profile
   */
  private async calculateRiskProfile(
    studentId: string,
    courseId: string
  ): Promise<StudentRiskProfile> {
    const riskFactors: RiskFactor[] = [];

    // Get student data
    const { data: student } = await this.supabase
      .from('students')
      .select('*')
      .eq('id', studentId)
      .single();

    if (!student) {
      return {
        studentId,
        riskLevel: 'low',
        riskFactors: [],
        predictedOutcome: 'Unknown',
        timeUntilIntervention: 0,
        urgency: 0,
      };
    }

    // Check recent grades
    const { data: recentGrades } = await this.supabase
      .from('grades')
      .select('*')
      .eq('student_id', studentId)
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentGrades && recentGrades.length > 0) {
      const avgGrade = recentGrades.reduce((sum, g) => sum + g.score, 0) / recentGrades.length;
      if (avgGrade < 60) {
        riskFactors.push({
          factor: 'Low grades',
          weight: 0.8,
          evidence: [`Average grade: ${avgGrade}%`, 'Below passing threshold'],
        });
      } else if (avgGrade < 70) {
        riskFactors.push({
          factor: 'Declining grades',
          weight: 0.6,
          evidence: [`Average grade: ${avgGrade}%`, 'Trending downward'],
        });
      }
    }

    // Check attendance
    const { data: attendance } = await this.supabase
      .from('attendance')
      .select('*')
      .eq('student_id', studentId)
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (attendance) {
      const attendanceRate = attendance.filter(a => a.present).length / attendance.length;
      if (attendanceRate < 0.7) {
        riskFactors.push({
          factor: 'Low attendance',
          weight: 0.7,
          evidence: [`Attendance rate: ${(attendanceRate * 100).toFixed(1)}%`, 'Missing classes'],
        });
      }
    }

    // Check assignment submission patterns
    const { data: submissions } = await this.supabase
      .from('submissions')
      .select('*')
      .eq('student_id', studentId)
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (submissions) {
      const lateSubmissions = submissions.filter(s => s.submitted_late).length;
      if (lateSubmissions > submissions.length * 0.5) {
        riskFactors.push({
          factor: 'Procrastination',
          weight: 0.6,
          evidence: [`${lateSubmissions} late submissions out of ${submissions.length}`, 'Pattern of procrastination'],
        });
      }
    }

    // Calculate risk level
    const totalWeight = riskFactors.reduce((sum, f) => sum + f.weight, 0);
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (totalWeight > 2.0) riskLevel = 'critical';
    else if (totalWeight > 1.5) riskLevel = 'high';
    else if (totalWeight > 1.0) riskLevel = 'medium';

    // Calculate time until intervention needed
    const timeUntilIntervention = this.calculateTimeUntilIntervention(riskFactors);

    return {
      studentId,
      riskLevel,
      riskFactors,
      predictedOutcome: `Student at ${riskLevel} risk`,
      timeUntilIntervention,
      urgency: totalWeight,
    };
  }

  /**
   * Predict procrastination probability
   */
  private async predictProcrastination(
    studentId: string,
    courseId: string
  ): Promise<number> {
    // Get historical procrastination patterns
    const { data: submissions } = await this.supabase
      .from('submissions')
      .select('*')
      .eq('student_id', studentId)
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!submissions || submissions.length === 0) return 0.3;

    // Calculate procrastination rate
    const procrastinationRate = submissions.filter(s => s.submitted_late).length / submissions.length;

    // Get current assignment status
    const { data: currentAssignments } = await this.supabase
      .from('assignments')
      .select('*')
      .eq('course_id', courseId)
      .gt('due_date', new Date().toISOString())
      .limit(5);

    if (!currentAssignments || currentAssignments.length === 0) return procrastinationRate;

    // Check if student has started any current assignments
    const { data: currentSubmissions } = await this.supabase
      .from('submissions')
      .select('*')
      .eq('student_id', studentId)
      .in('assignment_id', currentAssignments.map(a => a.id));

    if (!currentSubmissions || currentSubmissions.length === 0) {
      // Student hasn't started any assignments
      return Math.min(procrastinationRate + 0.3, 1.0);
    }

    return procrastinationRate;
  }

  /**
   * Predict knowledge gaps
   */
  private async predictKnowledgeGaps(
    studentId: string,
    courseId: string
  ): Promise<string[]> {
    const gaps: string[] = [];

    // Get student's performance by topic
    const { data: topicPerformance } = await this.supabase
      .from('topic_performance')
      .select('*')
      .eq('student_id', studentId)
      .eq('course_id', courseId);

    if (topicPerformance) {
      topicPerformance.forEach(tp => {
        if (tp.mastery_level < 0.6) {
          gaps.push(tp.topic_name);
        }
      });
    }

    return gaps;
  }

  /**
   * Predict motivation drop
   */
  private async predictMotivationDrop(
    studentId: string,
    courseId: string
  ): Promise<number> {
    // Get emotional signals
    const { data: emotionalSignals } = await this.supabase
      .from('emotional_signals')
      .select('*')
      .eq('user_id', studentId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!emotionalSignals || emotionalSignals.length === 0) return 0.3;

    // Calculate motivation trend
    const recentMotivation = emotionalSignals.slice(0, 5).reduce((sum, s) => sum + s.motivation, 0) / 5;
    const olderMotivation = emotionalSignals.slice(5, 10).reduce((sum, s) => sum + s.motivation, 0) / 5;

    // If motivation is declining
    if (recentMotivation < olderMotivation) {
      return Math.min((olderMotivation - recentMotivation) * 2, 1.0);
    }

    return 0.2;
  }

  /**
   * Calculate time until intervention needed
   */
  private calculateTimeUntilIntervention(riskFactors: RiskFactor[]): number {
    // Higher risk = sooner intervention needed
    const totalWeight = riskFactors.reduce((sum, f) => sum + f.weight, 0);
    
    if (totalWeight > 2.0) return 1; // Critical: intervene within 1 day
    if (totalWeight > 1.5) return 3; // High: intervene within 3 days
    if (totalWeight > 1.0) return 7; // Medium: intervene within 7 days
    
    return 14; // Low: intervene within 2 weeks
  }

  /**
   * Calculate failure probability
   */
  private calculateFailureProbability(riskProfile: StudentRiskProfile): number {
    const baseFailureRate = 0.3; // 30% base failure rate
    const riskMultiplier = riskProfile.urgency * 0.2;
    
    return Math.min(baseFailureRate + riskMultiplier, 1.0);
  }
}

export default PredictionEngine;
