/**
 * Multi-Agent Coordinator
 * 
 * Routes messages to specialized agents and manages:
 * - Intent detection
 * - Agent routing
 * - Response verification
 * - Human escalation
 * - Agent orchestration
 */

import { createClient } from '@supabase/supabase-js';

interface Message {
  userId: string;
  text: string;
  timestamp?: Date;
  context?: Record<string, any>;
}

interface AgentResponse {
  agentName: string;
  type: 'study' | 'canvas' | 'tutor' | 'payment' | 'escalate';
  data: Record<string, any>;
  confidence: number;
  requiresVerification: boolean;
}

interface CoordinatorResult {
  response: AgentResponse;
  verified: boolean;
  escalated: boolean;
  reason?: string;
}

export class AgentCoordinator {
  private supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
  );

  /**
   * Main coordination function
   */
  async coordinate(message: Message): Promise<CoordinatorResult> {
    try {
      // 1. Detect intent
      const intent = await this.detectIntent(message.text);

      // 2. Route to appropriate agent
      let agentResponse: AgentResponse;

      switch (intent) {
        case 'study':
          agentResponse = await this.routeToStudyAgent(message);
          break;
        case 'canvas':
          agentResponse = await this.routeToCanvasAgent(message);
          break;
        case 'tutor':
          agentResponse = await this.routeToTutorAgent(message);
          break;
        case 'payment':
          agentResponse = await this.routeToPaymentAgent(message);
          break;
        default:
          agentResponse = await this.routeToEscalation(message);
      }

      // 3. Verify response
      const verified = await this.verifyResponse(agentResponse);

      // 4. Escalate if needed
      let escalated = false;
      if (!verified && agentResponse.confidence < 0.7) {
        escalated = true;
        agentResponse = await this.routeToEscalation(message);
      }

      // 5. Log agent output
      await this.logAgentOutput(message.userId, agentResponse);

      return {
        response: agentResponse,
        verified,
        escalated,
        reason: escalated ? 'Low confidence response' : undefined,
      };
    } catch (error) {
      console.error('Error in agent coordination:', error);
      throw error;
    }
  }

  /**
   * Detect intent from message
   */
  private async detectIntent(text: string): Promise<string> {
    const lowerText = text.toLowerCase();

    // Simple intent detection (in production, use NLP)
    if (
      lowerText.includes('study') ||
      lowerText.includes('learn') ||
      lowerText.includes('help me understand')
    ) {
      return 'study';
    }

    if (
      lowerText.includes('assignment') ||
      lowerText.includes('grade') ||
      lowerText.includes('canvas')
    ) {
      return 'canvas';
    }

    if (
      lowerText.includes('tutor') ||
      lowerText.includes('session') ||
      lowerText.includes('book')
    ) {
      return 'tutor';
    }

    if (
      lowerText.includes('pay') ||
      lowerText.includes('price') ||
      lowerText.includes('cost')
    ) {
      return 'payment';
    }

    return 'escalate';
  }

  /**
   * Route to Study Agent
   */
  private async routeToStudyAgent(message: Message): Promise<AgentResponse> {
    try {
      // Get student profile
      const { data: profile } = await this.supabase
        .from('student_profiles')
        .select('*')
        .eq('user_id', message.userId)
        .single();

      // Get knowledge gaps
      const { data: gaps } = await this.supabase
        .from('concept_progress')
        .select('*')
        .eq('user_id', message.userId)
        .lt('mastery_level', 0.7)
        .limit(5);

      return {
        agentName: 'study_agent',
        type: 'study',
        data: {
          message: message.text,
          profile,
          gaps,
          recommendation: 'Generate personalized study plan',
        },
        confidence: 0.85,
        requiresVerification: false,
      };
    } catch (error) {
      console.error('Error routing to study agent:', error);
      return {
        agentName: 'study_agent',
        type: 'study',
        data: { error: 'Failed to route to study agent' },
        confidence: 0,
        requiresVerification: true,
      };
    }
  }

  /**
   * Route to Canvas Agent
   */
  private async routeToCanvasAgent(message: Message): Promise<AgentResponse> {
    try {
      // Get Canvas token
      const { data: token } = await this.supabase
        .from('canvas_oauth_tokens')
        .select('*')
        .eq('user_id', message.userId)
        .single();

      if (!token) {
        return {
          agentName: 'canvas_agent',
          type: 'canvas',
          data: {
            message: 'Canvas not connected. Please authenticate.',
            action: 'redirect_to_canvas_auth',
          },
          confidence: 0.9,
          requiresVerification: false,
        };
      }

      // Get recent assignments
      const { data: assignments } = await this.supabase
        .from('assignments')
        .select('*')
        .eq('user_id', message.userId)
        .order('due_date', { ascending: true })
        .limit(5);

      return {
        agentName: 'canvas_agent',
        type: 'canvas',
        data: {
          message: message.text,
          assignments,
          action: 'fetch_canvas_data',
        },
        confidence: 0.9,
        requiresVerification: false,
      };
    } catch (error) {
      console.error('Error routing to canvas agent:', error);
      return {
        agentName: 'canvas_agent',
        type: 'canvas',
        data: { error: 'Failed to route to canvas agent' },
        confidence: 0,
        requiresVerification: true,
      };
    }
  }

  /**
   * Route to Tutor Agent
   */
  private async routeToTutorAgent(message: Message): Promise<AgentResponse> {
    try {
      return {
        agentName: 'tutor_agent',
        type: 'tutor',
        data: {
          message: message.text,
          action: 'search_tutors',
          recommendation: 'Find available tutors matching your needs',
        },
        confidence: 0.8,
        requiresVerification: false,
      };
    } catch (error) {
      console.error('Error routing to tutor agent:', error);
      return {
        agentName: 'tutor_agent',
        type: 'tutor',
        data: { error: 'Failed to route to tutor agent' },
        confidence: 0,
        requiresVerification: true,
      };
    }
  }

  /**
   * Route to Payment Agent
   */
  private async routeToPaymentAgent(message: Message): Promise<AgentResponse> {
    try {
      return {
        agentName: 'payment_agent',
        type: 'payment',
        data: {
          message: message.text,
          action: 'process_payment',
          recommendation: 'Handle payment processing securely',
        },
        confidence: 0.75,
        requiresVerification: true, // Always verify payment
      };
    } catch (error) {
      console.error('Error routing to payment agent:', error);
      return {
        agentName: 'payment_agent',
        type: 'payment',
        data: { error: 'Failed to route to payment agent' },
        confidence: 0,
        requiresVerification: true,
      };
    }
  }

  /**
   * Route to Escalation (human review)
   */
  private async routeToEscalation(message: Message): Promise<AgentResponse> {
    return {
      agentName: 'escalation_agent',
      type: 'escalate',
      data: {
        message: message.text,
        action: 'escalate_to_human',
        reason: 'Could not determine appropriate agent or low confidence',
      },
      confidence: 0,
      requiresVerification: true,
    };
  }

  /**
   * Verify agent response
   */
  private async verifyResponse(response: AgentResponse): Promise<boolean> {
    try {
      // Basic verification checks
      if (!response.data) return false;
      if (response.confidence < 0.5) return false;
      if (response.type === 'escalate') return false; // Escalations need human review

      return true;
    } catch (error) {
      console.error('Error verifying response:', error);
      return false;
    }
  }

  /**
   * Log agent output for transparency
   */
  private async logAgentOutput(userId: string, response: AgentResponse): Promise<void> {
    try {
      await this.supabase.from('agent_outputs').insert({
        agent_name: response.agentName,
        user_id: userId,
        output_type: response.type,
        output_data: response.data,
        status: response.confidence > 0.7 ? 'success' : 'pending',
      });
    } catch (error) {
      console.error('Error logging agent output:', error);
    }
  }

  /**
   * Get agent status
   */
  async getAgentStatus(userId: string): Promise<Record<string, any>> {
    try {
      const { data: outputs } = await this.supabase
        .from('agent_outputs')
        .select('agent_name, status, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      return {
        recentOutputs: outputs,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Error getting agent status:', error);
      return {};
    }
  }
}

export default AgentCoordinator;
