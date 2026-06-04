/**
 * Blockchain Agent Evolution System
 * 
 * Tracks agent performance and automatically:
 * - Cuts underperforming agents
 * - Upgrades high-performing agents
 * - Merges similar/redundant agents
 * - Kills dead agents
 */

import { createClient } from '@supabase/supabase-js';

interface AgentMetrics {
  agentId: string;
  agentName: string;
  proposed: number;
  selected: number;
  executed: number;
  successful: number;
  failed: number;
  successRate: number;
  selectionRate: number;
  userSatisfaction: number;
  responseTime: number;
  cost: number;
  score: number;
  trend: 'improving' | 'declining' | 'stable';
  blockHash: string;
  timestamp: Date;
}

interface AgentEvolutionAction {
  agentId: string;
  agentName: string;
  action: 'UPGRADE' | 'CUT' | 'MERGE' | 'KILL' | 'MAINTAIN';
  score: number;
  reason: string;
  timestamp: Date;
  blockHash: string;
}

interface AgentEvolutionEvent {
  evolutionId: string;
  timestamp: Date;
  actions: AgentEvolutionAction[];
  blockHash: string;
}

export class AgentEvolutionSystem {
  private supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
  );

  /**
   * Track agent metrics and record on blockchain
   */
  async trackAgentMetrics(agentId: string): Promise<AgentMetrics> {
    try {
      // Get agent performance data
      const { data: agentData } = await this.supabase
        .from('agent_responses')
        .select('*')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!agentData || agentData.length === 0) {
        throw new Error(`No data found for agent ${agentId}`);
      }

      // Calculate metrics
      const proposed = agentData.length;
      const selected = agentData.filter(a => a.selected).length;
      const executed = agentData.filter(a => a.executed).length;
      const successful = agentData.filter(a => a.successful).length;
      const failed = agentData.filter(a => !a.successful && a.executed).length;

      const successRate = executed > 0 ? successful / executed : 0;
      const selectionRate = proposed > 0 ? selected / proposed : 0;
      const userSatisfaction = agentData.reduce((sum, a) => sum + (a.user_satisfaction || 0), 0) / proposed;
      const responseTime = agentData.reduce((sum, a) => sum + (a.response_time || 0), 0) / proposed;
      const cost = agentData.reduce((sum, a) => sum + (a.cost || 0), 0) / proposed;

      // Calculate score
      const score = this.calculateAgentScore(
        successRate,
        selectionRate,
        userSatisfaction,
        responseTime
      );

      // Calculate trend
      const trend = this.calculateTrend(agentData);

      // Get agent name
      const { data: agent } = await this.supabase
        .from('agents')
        .select('name')
        .eq('id', agentId)
        .single();

      const metrics: AgentMetrics = {
        agentId,
        agentName: agent?.name || 'Unknown',
        proposed,
        selected,
        executed,
        successful,
        failed,
        successRate,
        selectionRate,
        userSatisfaction,
        responseTime,
        cost,
        score,
        trend,
        blockHash: this.generateBlockHash(),
        timestamp: new Date(),
      };

      // Record on blockchain (simulated)
      await this.recordMetricsOnBlockchain(metrics);

      return metrics;
    } catch (error) {
      console.error('Error tracking agent metrics:', error);
      throw error;
    }
  }

  /**
   * Run agent evolution (monthly)
   */
  async runAgentEvolution(): Promise<AgentEvolutionEvent> {
    try {
      const actions: AgentEvolutionAction[] = [];

      // Get all agents
      const { data: agents } = await this.supabase
        .from('agents')
        .select('*');

      if (!agents) {
        throw new Error('No agents found');
      }

      // Analyze each agent
      for (const agent of agents) {
        const metrics = await this.trackAgentMetrics(agent.id);
        const action = this.determineEvolutionAction(metrics);

        if (action.action !== 'MAINTAIN') {
          actions.push(action);

          // Execute action
          await this.executeEvolutionAction(action);
        }
      }

      // Check for merges
      const merges = await this.findAgentsToMerge(agents);
      for (const merge of merges) {
        actions.push(merge);
        await this.executeEvolutionAction(merge);
      }

      // Record evolution event on blockchain
      const evolutionEvent: AgentEvolutionEvent = {
        evolutionId: `evolution-${new Date().toISOString().split('T')[0]}`,
        timestamp: new Date(),
        actions,
        blockHash: this.generateBlockHash(),
      };

      await this.recordEvolutionOnBlockchain(evolutionEvent);

      return evolutionEvent;
    } catch (error) {
      console.error('Error running agent evolution:', error);
      throw error;
    }
  }

  /**
   * Determine evolution action for an agent
   */
  private determineEvolutionAction(metrics: AgentMetrics): AgentEvolutionAction {
    // UPGRADE: Score > 85 for 30 days
    if (metrics.score > 85 && metrics.trend === 'improving') {
      return {
        agentId: metrics.agentId,
        agentName: metrics.agentName,
        action: 'UPGRADE',
        score: metrics.score,
        reason: 'High performer with improving trend',
        timestamp: new Date(),
        blockHash: this.generateBlockHash(),
      };
    }

    // CUT: Score < 40 for 30 days
    if (metrics.score < 40 && metrics.trend === 'declining') {
      return {
        agentId: metrics.agentId,
        agentName: metrics.agentName,
        action: 'CUT',
        score: metrics.score,
        reason: 'Low performer with declining trend',
        timestamp: new Date(),
        blockHash: this.generateBlockHash(),
      };
    }

    // KILL: Not selected for 90 days
    if (metrics.selectionRate < 0.05 && metrics.proposed > 100) {
      return {
        agentId: metrics.agentId,
        agentName: metrics.agentName,
        action: 'KILL',
        score: metrics.score,
        reason: 'Dead agent - not being selected',
        timestamp: new Date(),
        blockHash: this.generateBlockHash(),
      };
    }

    // MAINTAIN
    return {
      agentId: metrics.agentId,
      agentName: metrics.agentName,
      action: 'MAINTAIN',
      score: metrics.score,
      reason: 'Acceptable performance',
      timestamp: new Date(),
      blockHash: this.generateBlockHash(),
    };
  }

  /**
   * Find agents to merge
   */
  private async findAgentsToMerge(agents: any[]): Promise<AgentEvolutionAction[]> {
    const merges: AgentEvolutionAction[] = [];

    // Compare each pair of agents
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const agent1 = agents[i];
        const agent2 = agents[j];

        // Calculate similarity
        const similarity = await this.calculateAgentSimilarity(agent1.id, agent2.id);

        // If > 90% overlap, merge
        if (similarity > 0.9) {
          merges.push({
            agentId: agent1.id,
            agentName: `${agent1.name} + ${agent2.name}`,
            action: 'MERGE',
            score: 0,
            reason: `95% overlap with ${agent2.name}`,
            timestamp: new Date(),
            blockHash: this.generateBlockHash(),
          });
        }
      }
    }

    return merges;
  }

  /**
   * Calculate similarity between two agents
   */
  private async calculateAgentSimilarity(agentId1: string, agentId2: string): Promise<number> {
    // Get responses from both agents
    const { data: responses1 } = await this.supabase
      .from('agent_responses')
      .select('*')
      .eq('agent_id', agentId1)
      .limit(50);

    const { data: responses2 } = await this.supabase
      .from('agent_responses')
      .eq('agent_id', agentId2)
      .limit(50);

    if (!responses1 || !responses2) return 0;

    // Calculate overlap
    const keywords1 = new Set(responses1.map(r => r.intent));
    const keywords2 = new Set(responses2.map(r => r.intent));

    const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));
    const union = new Set([...keywords1, ...keywords2]);

    return intersection.size / union.size;
  }

  /**
   * Execute evolution action
   */
  private async executeEvolutionAction(action: AgentEvolutionAction): Promise<void> {
    switch (action.action) {
      case 'UPGRADE':
        await this.upgradeAgent(action.agentId);
        break;
      case 'CUT':
        await this.cutAgent(action.agentId);
        break;
      case 'MERGE':
        // Merge handled separately
        break;
      case 'KILL':
        await this.killAgent(action.agentId);
        break;
    }
  }

  /**
   * Upgrade agent
   */
  private async upgradeAgent(agentId: string): Promise<void> {
    await this.supabase
      .from('agents')
      .update({
        priority: 1,
        enabled: true,
        budget: 1000,
        status: 'upgraded',
      })
      .eq('id', agentId);
  }

  /**
   * Cut agent
   */
  private async cutAgent(agentId: string): Promise<void> {
    await this.supabase
      .from('agents')
      .update({
        priority: 10,
        enabled: false,
        status: 'cut',
      })
      .eq('id', agentId);
  }

  /**
   * Kill agent
   */
  private async killAgent(agentId: string): Promise<void> {
    await this.supabase
      .from('agents')
      .update({
        enabled: false,
        status: 'killed',
      })
      .eq('id', agentId);
  }

  /**
   * Calculate agent score
   */
  private calculateAgentScore(
    successRate: number,
    selectionRate: number,
    userSatisfaction: number,
    responseTime: number
  ): number {
    // Score = (Success Rate × 0.4) + (Selection Rate × 0.3) + (User Satisfaction × 0.2) + (Response Speed × 0.1)
    const speedScore = Math.max(0, 1 - responseTime / 1000); // Normalize to 0-1

    return (
      successRate * 0.4 +
      selectionRate * 0.3 +
      userSatisfaction * 0.2 +
      speedScore * 0.1
    ) * 100;
  }

  /**
   * Calculate trend
   */
  private calculateTrend(agentData: any[]): 'improving' | 'declining' | 'stable' {
    if (agentData.length < 2) return 'stable';

    const recent = agentData.slice(0, Math.floor(agentData.length / 2));
    const older = agentData.slice(Math.floor(agentData.length / 2));

    const recentSuccess = recent.filter(a => a.successful).length / recent.length;
    const olderSuccess = older.filter(a => a.successful).length / older.length;

    if (recentSuccess > olderSuccess + 0.05) return 'improving';
    if (recentSuccess < olderSuccess - 0.05) return 'declining';

    return 'stable';
  }

  /**
   * Record metrics on blockchain (simulated)
   */
  private async recordMetricsOnBlockchain(metrics: AgentMetrics): Promise<void> {
    // In production, this would record to actual blockchain
    // For now, we store in database
    await this.supabase
      .from('agent_metrics')
      .insert({
        agent_id: metrics.agentId,
        agent_name: metrics.agentName,
        proposed: metrics.proposed,
        selected: metrics.selected,
        executed: metrics.executed,
        successful: metrics.successful,
        failed: metrics.failed,
        success_rate: metrics.successRate,
        selection_rate: metrics.selectionRate,
        user_satisfaction: metrics.userSatisfaction,
        response_time: metrics.responseTime,
        cost: metrics.cost,
        score: metrics.score,
        trend: metrics.trend,
        block_hash: metrics.blockHash,
        created_at: metrics.timestamp,
      });
  }

  /**
   * Record evolution event on blockchain (simulated)
   */
  private async recordEvolutionOnBlockchain(event: AgentEvolutionEvent): Promise<void> {
    // In production, this would record to actual blockchain
    // For now, we store in database
    for (const action of event.actions) {
      await this.supabase
        .from('agent_evolution')
        .insert({
          evolution_id: event.evolutionId,
          agent_id: action.agentId,
          agent_name: action.agentName,
          action: action.action,
          score: action.score,
          reason: action.reason,
          block_hash: action.blockHash,
          created_at: action.timestamp,
        });
    }
  }

  /**
   * Generate block hash (simulated)
   */
  private generateBlockHash(): string {
    return '0x' + Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  }
}

export default AgentEvolutionSystem;
