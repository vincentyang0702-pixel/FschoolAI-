/**
 * NeuroAGI Brain SDK
 * 
 * The official API contract between NeuroAGI and any product built on the ecosystem.
 * FschoolAI, Reggie, and all future products MUST use this SDK — never call the brain directly.
 * 
 * Think of this as the iOS SDK. Developers get these methods. The brain internals stay private.
 */

export interface UserContext {
  userId: string;
  knowledgeLevel: Record<string, number>;   // subject -> mastery 0-1
  learningStyle: 'visual' | 'auditory' | 'kinesthetic' | 'reading';
  focusPattern: { peakHours: number[]; avgSessionMinutes: number };
  emotionalState: 'stressed' | 'motivated' | 'neutral' | 'fatigued';
  goals: string[];
  recentActivity: ActivityEvent[];
  knowledgeGaps: string[];
  strengths: string[];
  productContexts: Record<string, ProductContext>;
}

export interface ProductContext {
  productId: string;
  lastActive: string;
  sessionCount: number;
  recentActivity: ActivityEvent[];
  preferences: Record<string, any>;
}

export interface ActivityEvent {
  type: string;
  subject?: string;
  duration?: number;
  outcome?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface BrainUpdateEvent {
  userId: string;
  productId: string;
  eventType:
    | 'study_session'
    | 'assignment_completed'
    | 'concept_learned'
    | 'focus_session'
    | 'knowledge_transfer'
    | 'signal_captured'
    | 'grade_received'
    | 'content_consumed';
  data: Record<string, any>;
  timestamp?: string;
}

export interface AgentSuggestion {
  agentId: string;
  agentName: string;
  reason: string;
  confidence: number;
  action: string;
  urgency: 'low' | 'medium' | 'high';
}

export interface SkillVerification {
  skill: string;
  verified: boolean;
  masteryLevel: number;
  evidenceCount: number;
  lastVerified: string;
}

export interface BrainHealthMetrics {
  totalSignals: number;
  conceptsTracked: number;
  avgMastery: number;
  emotionalState: string | null;
  lastActivity: number;
  products: string[];
  brainAge: number; // days since first signal
}

/**
 * NeuroAGI Brain SDK Interface
 * 
 * Every product in the NeuroAGI ecosystem calls these methods.
 * The implementation lives in NeuroAGI Core — products never see it.
 */
export interface INeuroAGIBrainSDK {
  /**
   * Get the full context of a user's brain.
   * Use this to personalize any experience from day one.
   * 
   * @example
   * const context = await brain.getContext(userId);
   * // context.knowledgeGaps tells you what to teach next
   * // context.emotionalState tells you how to tone the response
   * // context.focusPattern tells you when to send notifications
   */
  getContext(userId: string, productId?: string): Promise<UserContext>;

  /**
   * Feed an event into the brain. Every user action should call this.
   * The brain learns from every event and gets smarter over time.
   * 
   * @example
   * await brain.update({
   *   userId, productId: 'fschoolai',
   *   eventType: 'assignment_completed',
   *   data: { subject: 'Calculus', grade: 0.87, timeSpent: 45 }
   * });
   */
  update(event: BrainUpdateEvent): Promise<void>;

  /**
   * Ask the brain what the user needs next.
   * Returns the most relevant agent and action for this moment.
   * 
   * @example
   * const suggestion = await brain.suggestNext(userId);
   * // suggestion.agentId = 'focus-agent'
   * // suggestion.reason = 'User has been studying for 2h without break'
   * // suggestion.action = 'Suggest a 10-minute break'
   */
  suggestNext(userId: string, context?: Partial<UserContext>): Promise<AgentSuggestion>;

  /**
   * Get AI-verified proof of a user's skill.
   * Not self-reported — evidence the brain observed.
   * 
   * @example
   * const proof = await brain.verifySkill(userId, 'Python');
   * // proof.verified = true
   * // proof.masteryLevel = 0.92
   * // proof.evidenceCount = 47 (sessions where Python was used)
   */
  verifySkill(userId: string, skill: string): Promise<SkillVerification>;

  /**
   * Get health metrics for the user's brain.
   * Use this to show users how their brain is growing.
   */
  getHealthMetrics(userId: string): Promise<BrainHealthMetrics>;

  /**
   * Export all brain data for a user (data portability).
   */
  exportData(userId: string): Promise<UserContext>;

  /**
   * Delete all brain data for a user (privacy / right to be forgotten).
   */
  deleteData(userId: string): Promise<void>;
}

/**
 * SDK Error types
 */
export class BrainSDKError extends Error {
  constructor(
    message: string,
    public code: 'NOT_FOUND' | 'UNAUTHORIZED' | 'RATE_LIMITED' | 'INTERNAL',
    public userId?: string
  ) {
    super(message);
    this.name = 'BrainSDKError';
  }
}
