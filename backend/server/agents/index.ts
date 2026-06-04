/**
 * FschoolAI Agent Registry
 *
 * ARCHITECTURE:
 * - Reggie is the ONLY agent the student ever interacts with
 * - Reggie reads the student's brain context before every response
 * - Reggie routes internally to sub-agent capabilities — this is INVISIBLE to the student
 * - Sub-agents provide specialized prompts and logic; Reggie delivers in his own voice
 *
 * AGENT HIERARCHY:
 *
 * Reggie (Agent Manager — the face of FschoolAI)
 * ├── Tutor Mode
 * │   ├── assignment-agent   — essay help, drafts, rubric review
 * │   ├── citation-agent     — sources, formatting, fact-checking
 * │   ├── study-agent        — concept explanation, Socratic method
 * │   └── focus-agent        — deep work, distraction management
 * └── Core Modes (motivation, performance, synthesis, reflection, recommendation, crisis)
 *
 * NOTE: The student never sees agent names. They only ever talk to Reggie.
 * Agent selection is SEMANTIC — Reggie's LLM router reads brain context + message
 * and picks the right capability. No keyword matching.
 */

// Tutor sub-agents (new — FschoolAI specific)
export { default as AssignmentAgent } from './assignment-agent';
export { default as CitationAgent } from './citation-agent';

// Core academic agents
export { default as StudyAgent } from './study-agent';
export { default as FocusAgent } from './focus-agent';

// Core agents (motivation, performance, synthesis, reflection, recommendation, crisis)
export { CoreAgents } from './core-agents';

// Agent type for type safety
export type AgentCapability =
  | 'assignment'
  | 'citation'
  | 'study'
  | 'focus'
  | 'motivation'
  | 'performance'
  | 'problemSolver'
  | 'synthesis'
  | 'personalization'
  | 'reflection'
  | 'recommendation'
  | 'crisis';

/**
 * AGENT_REGISTRY — used by the orchestrator to understand each capability.
 *
 * The `description` field is what Reggie reads to decide which capability to use.
 * There are NO trigger keyword arrays — selection is fully semantic via LLM routing.
 */
export const AGENT_REGISTRY: Record<AgentCapability, { description: string; capabilities: string[] }> = {
  assignment: {
    description: 'Helps students structure, draft, and review assignments. Uses the rubric, past instructor feedback, and Canvas data to give targeted, actionable guidance. Scaffolds thinking — never writes for the student.',
    capabilities: ['outline building', 'draft review against rubric', 'thesis development', 'past feedback integration', 'submission checklist'],
  },
  citation: {
    description: 'Finds credible sources, formats citations in APA/MLA/Chicago/Harvard, reviews bibliographies, and fact-checks claims. Never fabricates citations — flags anything unverifiable.',
    capabilities: ['citation formatting', 'source finding', 'bibliography review', 'claim fact-checking', 'hallucination detection'],
  },
  study: {
    description: 'Explains concepts, answers academic questions, teaches topics in a personalized way based on the student\'s knowledge graph and learning style.',
    capabilities: ['concept explanation', 'personalized teaching', 'knowledge gap filling', 'Socratic dialogue'],
  },
  focus: {
    description: 'Helps students get into deep work mode, manage distractions, overcome procrastination, and maintain concentration using their specific focus patterns.',
    capabilities: ['focus sessions', 'distraction management', 'procrastination intervention', 'flow state coaching'],
  },
  motivation: {
    description: 'Provides personalized encouragement, helps students overcome burnout and demotivation, reconnects them to their goals using their actual progress data.',
    capabilities: ['motivational coaching', 'burnout recovery', 'goal reconnection', 'emotional support'],
  },
  performance: {
    description: 'Analyzes grades, study patterns, and progress data to give honest, data-driven feedback on where the student stands and what to improve.',
    capabilities: ['grade analysis', 'progress tracking', 'performance forecasting', 'improvement planning'],
  },
  problemSolver: {
    description: 'Guides students through specific problems step by step using the Socratic method, building capability rather than just giving answers.',
    capabilities: ['step-by-step guidance', 'Socratic method', 'problem decomposition', 'solution verification'],
  },
  synthesis: {
    description: 'Connects concepts across the student\'s knowledge graph, reveals relationships between topics, and builds comprehensive mental models.',
    capabilities: ['concept mapping', 'cross-topic connections', 'mental model building', 'knowledge synthesis'],
  },
  personalization: {
    description: 'Adapts all learning experiences to the student\'s unique style, pace, and preferences based on their brain profile.',
    capabilities: ['learning style adaptation', 'pace adjustment', 'preference learning', 'experience customization'],
  },
  reflection: {
    description: 'Guides meaningful reflection sessions to consolidate learning, identify what to revisit, and deepen understanding through self-discovery.',
    capabilities: ['guided reflection', 'learning consolidation', 'insight discovery', 'review planning'],
  },
  recommendation: {
    description: 'Tells students exactly what to study next, in what order, and why — based on deadlines, knowledge gaps, and learning patterns.',
    capabilities: ['study prioritization', 'next-step planning', 'deadline management', 'gap-based recommendations'],
  },
  crisis: {
    description: 'Provides warm, non-judgmental support for students experiencing serious distress, overwhelm, or emotional crisis. Encourages professional help when needed.',
    capabilities: ['emotional support', 'crisis de-escalation', 'counseling referral', 'immediate comfort'],
  },
};
