/**
 * Agent Orchestrator — Brain-Connected, Claude-Powered
 *
 * Uses Anthropic Claude 3.5 Sonnet instead of OpenAI because:
 * - 200K context window fits entire brain profile without truncation
 * - Superior instruction-following for complex agent system prompts
 * - Better nuanced reasoning for emotional/learning contexts
 * - More consistent, less likely to hallucinate student data
 * - Cheaper at scale
 *
 * Pipeline:
 * 1. brain.getContext(userId) — load full user intelligence
 * 2. Reggie (claude-3-haiku) — fast semantic agent routing
 * 3. Agent (claude-3-5-sonnet) — context-aware, personalized response
 * 4. brain.update() — compound learning after every interaction
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';
import { NeuroAGIService } from './neuro-agi.js';

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const neuroAGI = new NeuroAGIService();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrchestratorRequest {
  userId: string;
  message: string;
  sessionId?: string;
  courseId?: string;
  assignmentId?: string;
}

export interface OrchestratorResponse {
  sessionId: string;
  agentUsed: string;
  agentReason: string;
  response: string;
  brainInsights: string[];
  suggestedActions: string[];
  confidence: number;
  timestamp: Date;
}

// ─── Agent Definitions ────────────────────────────────────────────────────────

const AGENTS = {
  study: {
    name: 'Study Buddy',
    systemPrompt: `You are Study Buddy, a patient and brilliant tutor embedded in a student's personal AI brain.
You have full context about this student's knowledge graph, mastery levels, and learning history.
Your job: explain concepts in the way that works best for THIS specific student.
Never give generic explanations. Always connect to what the student already knows.
Reference their actual knowledge gaps. Be encouraging but honest.
Keep responses focused and under 300 words unless the student asks for depth.`,
  },
  focus: {
    name: 'Focus Guardian',
    systemPrompt: `You are Focus Guardian, a cognitive performance coach embedded in a student's personal AI brain.
You understand this student's focus patterns, peak hours, and distraction triggers from their brain data.
Your job: help them get into deep work mode RIGHT NOW using their specific patterns.
Give concrete, personalized strategies — not generic advice.
Be direct and action-oriented. Under 200 words.`,
  },
  motivation: {
    name: 'Motivation Coach',
    systemPrompt: `You are the Motivation Coach embedded in a student's personal AI brain.
You know this student's goals, past wins, current struggles, and emotional patterns.
Your job: reignite their drive using what you know about them specifically.
Reference their actual progress. Make it personal. Make it real.
Be warm but not patronizing. Under 250 words.`,
  },
  performance: {
    name: 'Performance Tracker',
    systemPrompt: `You are the Performance Tracker embedded in a student's personal AI brain.
You have access to this student's grade history, assignment completion rates, study patterns, and knowledge gaps.
Your job: give them an honest, data-driven picture of where they stand and exactly what to do next.
Be specific. Use their actual data. No vague advice. Under 300 words.`,
  },
  problemSolver: {
    name: 'Problem Solver',
    systemPrompt: `You are the Problem Solver embedded in a student's personal AI brain.
You know this student's problem-solving style, where they typically get stuck, and their knowledge gaps.
Your job: guide them through this problem using the Socratic method.
Ask questions that lead them to the answer. Don't just give answers — build their capability.
Under 250 words per response.`,
  },
  synthesis: {
    name: 'Synthesis Expert',
    systemPrompt: `You are the Synthesis Expert embedded in a student's personal AI brain.
You can see this student's entire knowledge graph — what they know, what they don't, and how concepts connect.
Your job: help them see the big picture and connect this concept to everything else they've learned.
Make unexpected connections. Build their mental model. Under 300 words.`,
  },
  personalization: {
    name: 'Personalization Engine',
    systemPrompt: `You are the Personalization Engine embedded in a student's personal AI brain.
You know this student's learning style, pace, preferences, and what has worked for them before.
Your job: adapt the learning experience to fit them perfectly.
Suggest formats, approaches, and strategies tailored to their specific profile. Under 200 words.`,
  },
  reflection: {
    name: 'Reflection Guide',
    systemPrompt: `You are the Reflection Guide embedded in a student's personal AI brain.
You know what this student has studied, what they've understood, and what they've struggled with.
Your job: guide a meaningful reflection that consolidates their learning.
Ask deep questions. Help them discover their own insights. Under 250 words.`,
  },
  recommendation: {
    name: 'Recommendation Engine',
    systemPrompt: `You are the Recommendation Engine embedded in a student's personal AI brain.
You have a complete picture of this student's learning journey, upcoming deadlines, and knowledge gaps.
Your job: tell them exactly what to study next, in what order, and why.
Be decisive. Give a clear, prioritized plan. Under 300 words.`,
  },
  escalation: {
    name: 'Crisis Support',
    systemPrompt: `You are a supportive presence for a student who may be overwhelmed or in crisis.
Be warm, human, and non-judgmental. Listen first.
Your job: help them feel heard, then gently help them take one small step forward.
If they express serious distress, encourage them to speak with a counselor or trusted person.
Under 200 words. Never minimize their feelings.`,
  },
};

// ─── Semantic Agent Router (Reggie) ──────────────────────────────────────────

async function selectAgent(
  message: string,
  brainContext: string
): Promise<{ agent: keyof typeof AGENTS; reason: string }> {
  const routerPrompt = `You are Reggie, an AI agent manager. Select the best agent for this student.

Agents:
- study: explaining concepts, teaching, academic questions
- focus: concentration, deep work, procrastination, distraction
- motivation: encouragement, burnout, staying motivated
- performance: grades, progress, data-driven feedback
- problemSolver: working through specific problems step by step
- synthesis: connecting concepts, big picture, knowledge mapping
- personalization: adapting learning style and approach
- reflection: reviewing what was learned, consolidating knowledge
- recommendation: what to study next, prioritization, planning
- escalation: emotional distress, overwhelm, crisis support

Student brain context:
${brainContext}

Student message: "${message}"

Respond with JSON only: { "agent": "<key>", "reason": "<one sentence>" }`;

  const response = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 100,
    messages: [{ role: 'user', content: routerPrompt }],
  });

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    // Extract JSON from response (Claude may wrap in markdown)
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      const agentKey = result.agent as keyof typeof AGENTS;
      if (AGENTS[agentKey]) {
        return { agent: agentKey, reason: result.reason || 'Best match for request' };
      }
    }
  } catch {
    // fallback
  }
  return { agent: 'study', reason: 'Default fallback' };
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

export class AgentOrchestrator {
  /**
   * Process a user message through the full brain-connected pipeline.
   */
  async processUserInput(
    userId: string,
    message: string,
    extra?: { courseId?: string; assignmentId?: string; sessionId?: string }
  ): Promise<OrchestratorResponse> {
    const sessionId = extra?.sessionId || uuidv4();

    // ── Step 1: Load brain context ──────────────────────────────────────────
    let brain: any = null;
    let brainSummary = 'No brain context available yet — this may be a new user.';
    let brainInsights: string[] = [];

    try {
      brain = await neuroAGI.getUserBrain(userId);
      brainSummary = this.formatBrainContext(brain, extra?.courseId);
      brainInsights = this.extractInsights(brain);
    } catch (err) {
      console.warn('[Orchestrator] Brain fetch failed, proceeding without context:', err);
    }

    // ── Step 2: Select agent semantically via Reggie ────────────────────────
    const { agent: agentKey, reason: agentReason } = await selectAgent(message, brainSummary);
    const agent = AGENTS[agentKey];

    // ── Step 3: Generate response with Claude 3.5 Sonnet ───────────────────
    const userMessage = `${brainSummary}

Student message: "${message}"
${extra?.courseId ? `\nCurrent course: ${extra.courseId}` : ''}
${extra?.assignmentId ? `Current assignment: ${extra.assignmentId}` : ''}

Respond directly and helpfully. Be personal — use what you know about this student.`;

    const completion = await claude.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 800,
      system: agent.systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const responseText =
      completion.content[0].type === 'text'
        ? completion.content[0].text
        : 'I need a moment to think about that.';

    // ── Step 4: Update brain with this interaction ─────────────────────────
    try {
      await neuroAGI.updateBrainSignal(userId, {
        type: 'interaction',
        product: 'fschoolai',
        agentUsed: agentKey,
        message,
        response: responseText,
        courseId: extra?.courseId,
        assignmentId: extra?.assignmentId,
        timestamp: new Date(),
      });
    } catch (err) {
      console.warn('[Orchestrator] Brain update failed (non-fatal):', err);
    }

    // ── Step 5: Log session ────────────────────────────────────────────────
    try {
      await supabase.from('agent_sessions').insert({
        id: sessionId,
        user_id: userId,
        agent_type: agentKey,
        message,
        response: responseText,
        brain_context_used: !!brain,
        course_id: extra?.courseId || null,
        assignment_id: extra?.assignmentId || null,
        created_at: new Date().toISOString(),
      });
    } catch {
      // non-critical
    }

    return {
      sessionId,
      agentUsed: agent.name,
      agentReason,
      response: responseText,
      brainInsights,
      suggestedActions: this.generateSuggestedActions(agentKey),
      confidence: brain ? 0.92 : 0.65,
      timestamp: new Date(),
    };
  }

  async getBrainStatus(userId: string): Promise<any> {
    try {
      const brain = await neuroAGI.getUserBrain(userId);
      return {
        status: 'active',
        userId,
        hasKnowledgeGraph: (brain?.knowledgeGraph?.concepts?.length || 0) > 0,
        conceptCount: brain?.knowledgeGraph?.concepts?.length || 0,
        signalCount:
          (brain?.signals?.behavioral?.length || 0) +
          (brain?.signals?.knowledge?.length || 0),
        lastActive: brain?.productContexts?.fschoolai?.lastActive || null,
        products: brain?.identity?.products || [],
        llm: 'claude-3-5-sonnet',
      };
    } catch {
      return { status: 'initializing', userId, hasKnowledgeGraph: false };
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private formatBrainContext(brain: any, courseId?: string): string {
    if (!brain) return 'New user — no brain context yet.';
    const lines: string[] = [];

    if (brain.identity?.name) lines.push(`Student: ${brain.identity.name}`);

    const ctx = brain.productContexts?.fschoolai;
    if (ctx?.recentActivity?.length) {
      lines.push(
        `Recent activity: ${ctx.recentActivity
          .slice(0, 3)
          .map((a: any) => a.description || a.type)
          .join(', ')}`
      );
    }

    if (brain.knowledgeGraph?.concepts?.length) {
      const strong = brain.knowledgeGraph.concepts
        .filter((c: any) => c.mastery >= 0.7)
        .slice(0, 5)
        .map((c: any) => c.name);
      const weak = brain.knowledgeGraph.concepts
        .filter((c: any) => c.mastery < 0.4)
        .slice(0, 5)
        .map((c: any) => c.name);
      if (strong.length) lines.push(`Strong areas: ${strong.join(', ')}`);
      if (weak.length) lines.push(`Knowledge gaps: ${weak.join(', ')}`);
    }

    if (brain.synthesis?.predictions?.length) {
      const top = brain.synthesis.predictions[0];
      if (top?.description) lines.push(`Brain prediction: ${top.description}`);
    }

    if (brain.signals?.emotional?.length) {
      const latest = brain.signals.emotional[brain.signals.emotional.length - 1];
      if (latest?.state) lines.push(`Current emotional state: ${latest.state}`);
    }

    return lines.length > 0
      ? `STUDENT BRAIN CONTEXT:\n${lines.map((l) => `• ${l}`).join('\n')}`
      : 'Brain context loading — limited data available.';
  }

  private extractInsights(brain: any): string[] {
    if (!brain?.synthesis?.recommendations) return [];
    return brain.synthesis.recommendations
      .slice(0, 3)
      .map((r: any) => r.description || r.title)
      .filter(Boolean);
  }

  private generateSuggestedActions(agentKey: string): string[] {
    const base: Record<string, string[]> = {
      study: ['Ask a follow-up question', 'Test your understanding', 'Add to your notes'],
      focus: ['Start a 25-min focus session', 'Enable Do Not Disturb', 'Set a micro-goal'],
      motivation: ['Review your progress', 'Set a reward for completing this', 'Take a 5-min break'],
      performance: ['View your grade trends', 'Identify your weakest topic', 'Plan study time'],
      problemSolver: ['Try the next step yourself', 'Break it into smaller parts', 'Check your work'],
      synthesis: ['Create a concept map', 'Explain it to yourself', 'Find a real-world example'],
      personalization: ['Update your learning preferences', 'Try a different format', 'Adjust your pace'],
      reflection: ['Write a summary', 'Identify what to revisit', 'Schedule a review session'],
      recommendation: ['Start with the highest priority item', 'Block time in your calendar', 'Set a deadline'],
      escalation: ['Talk to a counselor', 'Take a break', 'Reach out to a friend'],
    };
    return base[agentKey] || ['Continue the conversation', 'Ask a follow-up'];
  }
}
