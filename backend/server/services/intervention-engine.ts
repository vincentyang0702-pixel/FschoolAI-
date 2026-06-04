/**
 * Intervention Engine
 * 
 * Decides WHEN and HOW to intervene
 * - Agent Race: Multiple agents compete to solve problem
 * - Best agent selected based on student profile
 * - Intervention executed proactively
 * - Outcome tracked for learning
 */

import { createClient } from '@supabase/supabase-js';
import { AgentOrchestrator } from './agent-orchestrator';

interface InterventionDecision {
  studentId: string;
  problem: string;
  urgency: number;
  interventionNeeded: boolean;
  selectedAgent: string;
  interventionMessage: string;
  timing: 'immediate' | 'soon' | 'later';
  confidence: number;
  timestamp: Date;
}

interface AgentProposal {
  agentId: string;
  agentName: string;
  proposal: string;
  confidence: number;
  expectedOutcome: string;
  score: number;
}

interface InterventionOutcome {
  interventionId: string;
  studentId: string;
  agentId: string;
  problem: string;
  intervention: string;
  studentResponse: string;
  successful: boolean;
  outcome: string;
  learnings: string[];
  timestamp: Date;
}

export class InterventionEngine {
  private supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
  );
  private orchestrator = new AgentOrchestrator();

  /**
   * Decide if intervention is needed and which agent to use
   */
  async decideIntervention(
    studentId: string,
    problem: string,
    urgency: number
  ): Promise<InterventionDecision> {
    try {
      // Check if intervention is needed
      const interventionNeeded = this.shouldIntervene(urgency);

      if (!interventionNeeded) {
        return {
          studentId,
          problem,
          urgency,
          interventionNeeded: false,
          selectedAgent: '',
          interventionMessage: '',
          timing: 'later',
          confidence: 0,
          timestamp: new Date(),
        };
      }

      // Run agent race
      const proposals = await this.runAgentRace(studentId, problem);

      // Select best agent
      const selectedProposal = this.selectBestAgent(proposals, studentId);

      // Determine timing
      const timing = this.determineTiming(urgency);

      // Generate intervention message
      const interventionMessage = selectedProposal.proposal;

      return {
        studentId,
        problem,
        urgency,
        interventionNeeded: true,
        selectedAgent: selectedProposal.agentId,
        interventionMessage,
        timing,
        confidence: selectedProposal.confidence,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Error deciding intervention:', error);
      throw error;
    }
  }

  /**
   * Run agent race: multiple agents propose solutions
   */
  private async runAgentRace(
    studentId: string,
    problem: string
  ): Promise<AgentProposal[]> {
    const proposals: AgentProposal[] = [];

    // Get all enabled agents
    const { data: agents } = await this.supabase
      .from('agents')
      .select('*')
      .eq('enabled', true)
      .order('priority', { ascending: true });

    if (!agents) {
      throw new Error('No agents found');
    }

    // Get student profile for personalization
    const { data: student } = await this.supabase
      .from('students')
      .select('*')
      .eq('id', studentId)
      .single();

    // Each agent proposes a solution
    for (const agent of agents) {
      const proposal = await this.getAgentProposal(agent, problem, student);
      if (proposal) {
        proposals.push(proposal);
      }
    }

    // Sort by score (best first)
    return proposals.sort((a, b) => b.score - a.score);
  }

  /**
   * Get proposal from a specific agent
   */
  private async getAgentProposal(
    agent: any,
    problem: string,
    student: any
  ): Promise<AgentProposal | null> {
    try {
      // Simulate agent proposal based on type
      let proposal = '';
      let expectedOutcome = '';
      let confidence = 0;

      switch (agent.type) {
        case 'study':
          proposal = `Let's break down this concept step by step. First, let's understand the fundamentals...`;
          expectedOutcome = 'Student understands the concept';
          confidence = 0.8;
          break;

        case 'focus':
          proposal = `I notice you might be distracted. Let's activate focus mode: close other tabs, silence notifications, and let's work for 25 minutes.`;
          expectedOutcome = 'Student maintains focus';
          confidence = 0.75;
          break;

        case 'motivation':
          proposal = `You're doing great! You've already completed 70% of the course. Let's celebrate this progress and tackle the next assignment!`;
          expectedOutcome = 'Student feels motivated';
          confidence = 0.7;
          break;

        case 'performance':
          proposal = `Based on your recent performance, I see you're struggling with calculus. Let's focus on derivatives first, then move to integrals.`;
          expectedOutcome = 'Student improves performance';
          confidence = 0.85;
          break;

        case 'personalization':
          proposal = `I know you prefer visual learning. Here's a video explanation of this concept instead of text.`;
          expectedOutcome = 'Student learns better';
          confidence = 0.8;
          break;

        default:
          return null;
      }

      // Calculate score based on student profile
      const score = this.calculateProposalScore(agent, student, confidence);

      return {
        agentId: agent.id,
        agentName: agent.name,
        proposal,
        confidence,
        expectedOutcome,
        score,
      };
    } catch (error) {
      console.error(`Error getting proposal from agent ${agent.id}:`, error);
      return null;
    }
  }

  /**
   * Select best agent from proposals
   */
  private selectBestAgent(proposals: AgentProposal[], studentId: string): AgentProposal {
    if (proposals.length === 0) {
      throw new Error('No agent proposals available');
    }

    // Best agent is first (already sorted by score)
    return proposals[0];
  }

  /**
   * Determine intervention timing
   */
  private determineTiming(urgency: number): 'immediate' | 'soon' | 'later' {
    if (urgency > 0.8) return 'immediate';
    if (urgency > 0.5) return 'soon';
    return 'later';
  }

  /**
   * Calculate proposal score
   */
  private calculateProposalScore(
    agent: any,
    student: any,
    baseConfidence: number
  ): number {
    let score = baseConfidence * 100;

    // Boost score if agent matches student's learning style
    if (agent.type === 'personalization' && student.learning_style) {
      score += 10;
    }

    // Boost score if agent has high success rate
    if (agent.success_rate) {
      score += agent.success_rate * 20;
    }

    // Reduce score if agent has been used recently
    if (agent.last_used_hours && agent.last_used_hours < 24) {
      score -= 5;
    }

    return Math.min(score, 100);
  }

  /**
   * Check if intervention should happen
   */
  private shouldIntervene(urgency: number): boolean {
    // Intervene if urgency > 0.3
    return urgency > 0.3;
  }

  /**
   * Send intervention to student
   */
  async sendIntervention(decision: InterventionDecision): Promise<void> {
    try {
      // Store intervention in database
      const { data: intervention } = await this.supabase
        .from('interventions')
        .insert({
          student_id: decision.studentId,
          agent_id: decision.selectedAgent,
          problem: decision.problem,
          message: decision.interventionMessage,
          timing: decision.timing,
          confidence: decision.confidence,
          status: 'sent',
          created_at: new Date(),
        })
        .select()
        .single();

      // In production, send notification to student
      // For now, just log
      console.log(`Intervention sent to student ${decision.studentId}: ${decision.interventionMessage}`);
    } catch (error) {
      console.error('Error sending intervention:', error);
      throw error;
    }
  }

  /**
   * Track intervention outcome
   */
  async trackOutcome(
    interventionId: string,
    studentResponse: string,
    successful: boolean,
    outcome: string
  ): Promise<InterventionOutcome> {
    try {
      // Get intervention details
      const { data: intervention } = await this.supabase
        .from('interventions')
        .select('*')
        .eq('id', interventionId)
        .single();

      if (!intervention) {
        throw new Error(`Intervention ${interventionId} not found`);
      }

      // Extract learnings
      const learnings = this.extractLearnings(intervention, successful, outcome);

      // Update intervention status
      await this.supabase
        .from('interventions')
        .update({
          status: successful ? 'successful' : 'failed',
          student_response: studentResponse,
          outcome: outcome,
          learnings: learnings,
          updated_at: new Date(),
        })
        .eq('id', interventionId);

      // Record outcome
      const interventionOutcome: InterventionOutcome = {
        interventionId,
        studentId: intervention.student_id,
        agentId: intervention.agent_id,
        problem: intervention.problem,
        intervention: intervention.message,
        studentResponse,
        successful,
        outcome,
        learnings,
        timestamp: new Date(),
      };

      // Record on blockchain (simulated)
      await this.recordOutcomeOnBlockchain(interventionOutcome);

      return interventionOutcome;
    } catch (error) {
      console.error('Error tracking outcome:', error);
      throw error;
    }
  }

  /**
   * Extract learnings from intervention outcome
   */
  private extractLearnings(
    intervention: any,
    successful: boolean,
    outcome: string
  ): string[] {
    const learnings: string[] = [];

    if (successful) {
      learnings.push(`Agent ${intervention.agent_id} successfully helped with ${intervention.problem}`);
      learnings.push(`This intervention timing (${intervention.timing}) was effective`);
    } else {
      learnings.push(`Agent ${intervention.agent_id} did not help with ${intervention.problem}`);
      learnings.push(`Need to try different approach next time`);
    }

    learnings.push(`Outcome: ${outcome}`);

    return learnings;
  }

  /**
   * Record outcome on blockchain (simulated)
   */
  private async recordOutcomeOnBlockchain(outcome: InterventionOutcome): Promise<void> {
    // In production, this would record to actual blockchain
    // For now, we store in database
    await this.supabase
      .from('intervention_outcomes')
      .insert({
        intervention_id: outcome.interventionId,
        student_id: outcome.studentId,
        agent_id: outcome.agentId,
        problem: outcome.problem,
        intervention: outcome.intervention,
        student_response: outcome.studentResponse,
        successful: outcome.successful,
        outcome: outcome.outcome,
        learnings: outcome.learnings,
        created_at: outcome.timestamp,
      });
  }
}

export default InterventionEngine;
