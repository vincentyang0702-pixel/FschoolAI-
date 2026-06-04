/**
 * FschoolAI Backend Type Definitions
 * Complete type system for the proactive brain
 */

// User & Authentication
export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

// Signals
export interface BehavioralSignal {
  id: string;
  user_id: string;
  action: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface EmotionalSignal {
  id: string;
  user_id: string;
  emotion: string;
  intensity: number;
  context?: string;
  timestamp: string;
}

export interface KnowledgeSignal {
  id: string;
  user_id: string;
  concept: string;
  mastery_level: number;
  confidence: number;
  timestamp: string;
}

export interface ContextSignal {
  id: string;
  user_id: string;
  location?: string;
  device?: string;
  environment?: string;
  timestamp: string;
}

export interface OutcomeSignal {
  id: string;
  user_id: string;
  result: boolean;
  score: number;
  feedback?: string;
  timestamp: string;
}

export type Signal = 
  | BehavioralSignal 
  | EmotionalSignal 
  | KnowledgeSignal 
  | ContextSignal 
  | OutcomeSignal;

// Knowledge Graph
export interface Concept {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: number;
  created_at: string;
}

export interface ConceptRelationship {
  id: string;
  source_concept_id: string;
  target_concept_id: string;
  relationship_type: 'prerequisite' | 'related' | 'builds_on' | 'contradicts';
  strength: number;
}

export interface MasteryTracking {
  id: string;
  user_id: string;
  concept_id: string;
  mastery_level: number;
  last_updated: string;
}

// Brain State
export interface BrainState {
  id: string;
  user_id: string;
  current_focus: string;
  emotional_state: string;
  learning_velocity: number;
  engagement_level: number;
  updated_at: string;
}

export interface Insight {
  id: string;
  user_id: string;
  type: string;
  content: string;
  confidence: number;
  actionable: boolean;
  created_at: string;
}

export interface Prediction {
  id: string;
  user_id: string;
  prediction_type: string;
  value: number;
  confidence: number;
  timeframe: string;
  created_at: string;
}

export interface Intervention {
  id: string;
  user_id: string;
  situation: string;
  recommendation: string;
  severity: 'low' | 'medium' | 'high';
  suggested_action: string;
  created_at: string;
}

// Canvas Integration
export interface CanvasCourse {
  id: string;
  user_id: string;
  canvas_course_id: number;
  name: string;
  code: string;
  term: string;
  synced_at: string;
}

export interface CanvasAssignment {
  id: string;
  course_id: string;
  canvas_assignment_id: number;
  name: string;
  description: string;
  due_at: string;
  points_possible: number;
}

export interface CanvasSubmission {
  id: string;
  assignment_id: string;
  user_id: string;
  canvas_submission_id: number;
  submitted_at: string;
  grade?: number;
  feedback?: string;
}

// Agents
export interface AgentResponse {
  id: string;
  user_id: string;
  agent_type: string;
  input: Record<string, any>;
  output: Record<string, any>;
  confidence: number;
  created_at: string;
}

export interface AgentLog {
  id: string;
  agent_type: string;
  user_id: string;
  action: string;
  status: 'success' | 'error' | 'pending';
  error_message?: string;
  duration_ms: number;
  created_at: string;
}

// API Request/Response
export interface ApiRequest {
  userId: string;
  action: string;
  data?: Record<string, any>;
  context?: Record<string, any>;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  requestId: string;
  timestamp: string;
}

// Agent Types
export type AgentType = 
  | 'study'
  | 'focus'
  | 'motivation'
  | 'performance'
  | 'problem_solver'
  | 'synthesis'
  | 'personalization'
  | 'reflection'
  | 'recommendation'
  | 'escalation';

// Causal Analysis
export interface CausalRelationship {
  cause: string;
  effect: string;
  strength: number;
  confidence: number;
  evidence_count: number;
}

export interface CausalAnalysis {
  user_id: string;
  variables: string[];
  relationships: CausalRelationship[];
  root_causes: string[];
  generated_at: string;
}

// Brain Compounding
export interface BrainCompoundingInput {
  user_id: string;
  signals: Signal[];
  previous_state?: BrainState;
}

export interface BrainCompoundingOutput {
  insights: Insight[];
  state_update: Partial<BrainState>;
  recommendations: string[];
  confidence: number;
}

// Blockchain Events
export interface BlockchainEvent {
  id: string;
  user_id: string;
  event_type: string;
  data: Record<string, any>;
  hash: string;
  created_at: string;
}

export interface DataProof {
  id: string;
  user_id: string;
  data_hash: string;
  proof_type: string;
  verified: boolean;
  created_at: string;
}

// Canvas OAuth
export interface CanvasOAuthToken {
  user_id: string;
  access_token: string;
  refresh_token?: string;
  expires_at: string;
  scope: string;
  created_at: string;
}

// Error Handling
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Pagination
export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}
