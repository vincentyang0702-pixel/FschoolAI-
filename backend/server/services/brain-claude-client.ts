/**
 * NeuroAGI Brain — Claude Integration Layer
 * 
 * The central AI client for all brain operations.
 * Handles: rate limiting, token counting, cost tracking, prompt engineering,
 * error handling with exponential backoff, response caching.
 * 
 * All brain engines (reflection, synthesis, prediction, intervention, agent spawner)
 * go through this client — never call Anthropic directly.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// TYPES
// ============================================================

export interface BrainCallOptions {
  personId: string;
  processType: 'reflection' | 'synthesis' | 'prediction' | 'intervention' | 'agent_spawn' | 'signal_process' | 'knowledge_update' | 'reasoning';
  systemPrompt: string;
  userMessage: string;
  model?: ClaudeModel;
  maxTokens?: number;
  temperature?: number;
  cacheKey?: string; // if provided, response will be cached
  cacheTtlSeconds?: number;
}

export interface BrainCallResult {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  totalTokens: number;
  costUsd: number;
  model: string;
  cached: boolean;
  durationMs: number;
  logId?: string;
}

export type ClaudeModel =
  | 'claude-opus-4-5'
  | 'claude-sonnet-4-5'
  | 'claude-3-5-haiku-20241022'
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-opus-20240229';

// ============================================================
// COST TABLE (USD per 1M tokens)
// ============================================================

const MODEL_COSTS: Record<ClaudeModel, { input: number; output: number }> = {
  'claude-opus-4-5':            { input: 15.00,  output: 75.00  },
  'claude-sonnet-4-5':          { input: 3.00,   output: 15.00  },
  'claude-3-5-haiku-20241022':  { input: 0.80,   output: 4.00   },
  'claude-3-5-sonnet-20241022': { input: 3.00,   output: 15.00  },
  'claude-3-opus-20240229':     { input: 15.00,  output: 75.00  },
};

// Default model for each process type (cost-optimized)
const PROCESS_DEFAULT_MODEL: Record<BrainCallOptions['processType'], ClaudeModel> = {
  reflection:       'claude-3-5-haiku-20241022',   // cheap, runs nightly
  synthesis:        'claude-3-5-haiku-20241022',   // cheap, runs daily
  prediction:       'claude-3-5-haiku-20241022',   // cheap, runs hourly
  intervention:     'claude-3-5-haiku-20241022',   // cheap, runs every 5 min
  agent_spawn:      'claude-sonnet-4-5',           // medium, spawns agents
  signal_process:   'claude-3-5-haiku-20241022',   // cheap, real-time
  knowledge_update: 'claude-3-5-haiku-20241022',   // cheap, weekly
  reasoning:        'claude-3-5-haiku-20241022',   // cheap, continuous
};

// Max tokens per process type
const PROCESS_MAX_TOKENS: Record<BrainCallOptions['processType'], number> = {
  reflection:       4096,
  synthesis:        2048,
  prediction:       2048,
  intervention:     1024,
  agent_spawn:      8192,
  signal_process:   1024,
  knowledge_update: 2048,
  reasoning:        2048,
};

// ============================================================
// RATE LIMITER
// ============================================================

class RateLimiter {
  private requests: number[] = [];
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(maxRequests: number = 100, windowMs: number = 60_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldest = this.requests[0];
      const waitMs = this.windowMs - (now - oldest) + 100;
      console.log(`[BrainClaude] Rate limit reached. Waiting ${waitMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    this.requests.push(Date.now());
  }

  get currentLoad(): number {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < this.windowMs);
    return this.requests.length / this.maxRequests;
  }
}

// ============================================================
// SIMPLE IN-MEMORY CACHE
// ============================================================

interface CacheEntry {
  result: BrainCallResult;
  expiresAt: number;
}

class ResponseCache {
  private cache = new Map<string, CacheEntry>();

  get(key: string): BrainCallResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return { ...entry.result, cached: true };
  }

  set(key: string, result: BrainCallResult, ttlSeconds: number): void {
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ============================================================
// BRAIN CLAUDE CLIENT
// ============================================================

export class BrainClaudeClient {
  private client: Anthropic;
  private supabase: ReturnType<typeof createClient>;
  private rateLimiter: RateLimiter;
  private cache: ResponseCache;

  // Daily spend tracking
  private dailySpend = 0;
  private dailySpendDate = new Date().toDateString();
  private readonly dailySpendLimit: number;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('[BrainClaude] ANTHROPIC_API_KEY not set in environment');
    }

    this.client = new Anthropic({ apiKey });

    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    this.rateLimiter = new RateLimiter(
      parseInt(process.env.CLAUDE_RATE_LIMIT_PER_MIN || '80'),
      60_000
    );

    this.cache = new ResponseCache();

    this.dailySpendLimit = parseFloat(process.env.CLAUDE_DAILY_SPEND_LIMIT_USD || '50');

    console.log('[BrainClaude] Initialized. Daily spend limit: $' + this.dailySpendLimit);
  }

  // ============================================================
  // MAIN CALL METHOD
  // ============================================================

  async call(options: BrainCallOptions): Promise<BrainCallResult> {
    const {
      personId,
      processType,
      systemPrompt,
      userMessage,
      model = PROCESS_DEFAULT_MODEL[processType],
      maxTokens = PROCESS_MAX_TOKENS[processType],
      temperature = 0.7,
      cacheKey,
      cacheTtlSeconds = 300,
    } = options;

    // Check cache first
    if (cacheKey) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        console.log(`[BrainClaude] Cache hit for key: ${cacheKey}`);
        return cached;
      }
    }

    // Check daily spend limit
    this.resetDailySpendIfNewDay();
    if (this.dailySpend >= this.dailySpendLimit) {
      throw new Error(`[BrainClaude] Daily spend limit reached: $${this.dailySpend.toFixed(4)} >= $${this.dailySpendLimit}`);
    }

    // Wait for rate limit
    await this.rateLimiter.waitIfNeeded();

    const startTime = Date.now();
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        console.log(`[BrainClaude] ${processType} call (attempt ${attempt}/${maxAttempts}) model=${model} maxTokens=${maxTokens}`);

        const response = await this.client.messages.create({
          model,
          max_tokens: maxTokens,
          temperature,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        });

        const durationMs = Date.now() - startTime;
        const tokensInput = response.usage.input_tokens;
        const tokensOutput = response.usage.output_tokens;
        const totalTokens = tokensInput + tokensOutput;
        const costUsd = this.calculateCost(model, tokensInput, tokensOutput);

        // Track spend
        this.dailySpend += costUsd;

        const content = response.content
          .filter(b => b.type === 'text')
          .map(b => (b as Anthropic.TextBlock).text)
          .join('');

        const result: BrainCallResult = {
          content,
          tokensInput,
          tokensOutput,
          totalTokens,
          costUsd,
          model,
          cached: false,
          durationMs,
        };

        // Cache if requested
        if (cacheKey) {
          this.cache.set(cacheKey, result, cacheTtlSeconds);
        }

        // Log to database
        const logId = await this.logToDatabase(personId, processType, options, result);
        result.logId = logId;

        console.log(`[BrainClaude] ✓ ${processType} completed in ${durationMs}ms | tokens=${totalTokens} | cost=$${costUsd.toFixed(6)}`);

        return result;

      } catch (error: unknown) {
        const err = error as { status?: number; message?: string };
        const isRetryable = err.status === 429 || err.status === 529 || err.status === 500;

        if (isRetryable && attempt < maxAttempts) {
          const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          console.warn(`[BrainClaude] Retryable error (${err.status}). Backing off ${backoffMs.toFixed(0)}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }

        // Log error to database
        await this.logErrorToDatabase(personId, processType, options, err);

        throw new Error(`[BrainClaude] Failed after ${attempt} attempts: ${err.message}`);
      }
    }

    throw new Error(`[BrainClaude] Exhausted all ${maxAttempts} attempts`);
  }

  // ============================================================
  // SPECIALIZED CALL METHODS (Pre-engineered prompts)
  // ============================================================

  /**
   * Analyze a batch of signals and extract insights
   */
  async analyzeSignals(personId: string, signals: object[], personContext: object): Promise<BrainCallResult> {
    return this.call({
      personId,
      processType: 'signal_process',
      systemPrompt: SYSTEM_PROMPTS.signalAnalysis,
      userMessage: `
PERSON CONTEXT:
${JSON.stringify(personContext, null, 2)}

SIGNALS TO ANALYZE (${signals.length} signals):
${JSON.stringify(signals, null, 2)}

Analyze these signals. Extract insights, detect patterns, identify what's important.
Return JSON with: { insights: [], patterns: [], urgentActions: [], relevanceScores: {} }
      `.trim(),
      temperature: 0.3,
    });
  }

  /**
   * Generate nightly reflection from day's activity
   */
  async generateReflection(personId: string, dayData: object, personContext: object): Promise<BrainCallResult> {
    return this.call({
      personId,
      processType: 'reflection',
      systemPrompt: SYSTEM_PROMPTS.reflection,
      userMessage: `
PERSON CONTEXT:
${JSON.stringify(personContext, null, 2)}

TODAY'S DATA:
${JSON.stringify(dayData, null, 2)}

Generate a deep, honest reflection on today. What happened? What matters? What should change?
Return JSON with: { dailySummary, keyInsights, patternsObserved, decisionsAnalyzed, emotionsDetected, timeAllocation, goalsProgress, tomorrowFocus }
      `.trim(),
      temperature: 0.7,
    });
  }

  /**
   * Synthesize insights across multiple days
   */
  async synthesizeInsights(personId: string, reflections: object[], personContext: object): Promise<BrainCallResult> {
    return this.call({
      personId,
      processType: 'synthesis',
      systemPrompt: SYSTEM_PROMPTS.synthesis,
      userMessage: `
PERSON CONTEXT:
${JSON.stringify(personContext, null, 2)}

RECENT REFLECTIONS (${reflections.length} days):
${JSON.stringify(reflections, null, 2)}

Connect the dots. What are the deep patterns? What insights emerge when you look across multiple days?
Return JSON array of synthesis objects: [{ insight1, insight2, connection, reasoning, confidence, actionable, actionSuggestion, domain }]
      `.trim(),
      temperature: 0.6,
    });
  }

  /**
   * Generate predictions about what should happen next
   */
  async generatePredictions(personId: string, brainState: object): Promise<BrainCallResult> {
    return this.call({
      personId,
      processType: 'prediction',
      systemPrompt: SYSTEM_PROMPTS.prediction,
      userMessage: `
CURRENT BRAIN STATE:
${JSON.stringify(brainState, null, 2)}

What should happen next? What does this person need? What actions would move their goals forward?
Return JSON array: [{ prediction, predictionType, confidence, reasoning, actionNeeded, actionType, actionDescription, predictedFor, urgency }]
      `.trim(),
      temperature: 0.5,
    });
  }

  /**
   * Generate an intervention message
   */
  async generateIntervention(personId: string, prediction: object, personContext: object): Promise<BrainCallResult> {
    return this.call({
      personId,
      processType: 'intervention',
      systemPrompt: SYSTEM_PROMPTS.intervention,
      userMessage: `
PERSON CONTEXT:
${JSON.stringify(personContext, null, 2)}

PREDICTION THAT NEEDS INTERVENTION:
${JSON.stringify(prediction, null, 2)}

Write a brief, human, non-annoying intervention message. Be direct. Be helpful. Don't be preachy.
Return JSON: { interventionText, interventionType, deliveryMethod, urgency, scheduledFor }
      `.trim(),
      temperature: 0.8,
    });
  }

  /**
   * Spawn a building agent task
   */
  async spawnAgent(personId: string, goal: object, context: object): Promise<BrainCallResult> {
    return this.call({
      personId,
      processType: 'agent_spawn',
      systemPrompt: SYSTEM_PROMPTS.agentSpawn,
      userMessage: `
PERSON CONTEXT:
${JSON.stringify(context, null, 2)}

GOAL THAT NEEDS AN AGENT:
${JSON.stringify(goal, null, 2)}

Design a building agent task. What should the agent build? What are the constraints? What's the deliverable?
Return JSON: { agentType, agentName, taskDescription, taskContext, taskConstraints, deliverable, estimatedDurationHours }
      `.trim(),
      maxTokens: 4096,
      temperature: 0.6,
    });
  }

  /**
   * Update knowledge graph connections
   */
  async updateKnowledgeGraph(personId: string, recentActivity: object, existingGraph: object[]): Promise<BrainCallResult> {
    return this.call({
      personId,
      processType: 'knowledge_update',
      systemPrompt: SYSTEM_PROMPTS.knowledgeUpdate,
      userMessage: `
RECENT ACTIVITY:
${JSON.stringify(recentActivity, null, 2)}

EXISTING KNOWLEDGE GRAPH (top connections):
${JSON.stringify(existingGraph.slice(0, 20), null, 2)}

What new connections should be added? What existing connections should be strengthened or weakened?
Return JSON: { newConnections: [{ concept1, concept2, relationship, strength, confidence, domain }], strengthenConnections: [{ id, newStrength }], weakenConnections: [{ id, newStrength }] }
      `.trim(),
      temperature: 0.4,
    });
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  private calculateCost(model: ClaudeModel, inputTokens: number, outputTokens: number): number {
    const costs = MODEL_COSTS[model] || MODEL_COSTS['claude-3-5-haiku-20241022'];
    return (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output;
  }

  private resetDailySpendIfNewDay(): void {
    const today = new Date().toDateString();
    if (today !== this.dailySpendDate) {
      this.dailySpend = 0;
      this.dailySpendDate = today;
    }
  }

  private async logToDatabase(
    personId: string,
    processType: string,
    options: BrainCallOptions,
    result: BrainCallResult
  ): Promise<string | undefined> {
    try {
      const { data } = await this.supabase.rpc('log_processing', {
        p_person_id: personId,
        p_process_type: processType,
        p_inputs: { systemPromptLength: options.systemPrompt.length, messageLength: options.userMessage.length },
        p_outputs: { contentLength: result.content.length },
        p_tokens_used: result.totalTokens,
        p_cost: result.costUsd,
        p_duration_ms: result.durationMs,
        p_status: 'success',
        p_error_message: null,
        p_model: result.model,
      });
      return data;
    } catch (err) {
      console.error('[BrainClaude] Failed to log to database:', err);
      return undefined;
    }
  }

  private async logErrorToDatabase(
    personId: string,
    processType: string,
    options: BrainCallOptions,
    error: { status?: number; message?: string }
  ): Promise<void> {
    try {
      await this.supabase.rpc('log_processing', {
        p_person_id: personId,
        p_process_type: processType,
        p_inputs: { messageLength: options.userMessage.length },
        p_outputs: null,
        p_tokens_used: 0,
        p_cost: 0,
        p_duration_ms: 0,
        p_status: 'error',
        p_error_message: error.message || 'Unknown error',
        p_model: options.model || PROCESS_DEFAULT_MODEL[processType],
      });
    } catch (err) {
      console.error('[BrainClaude] Failed to log error to database:', err);
    }
  }

  /**
   * Parse JSON from Claude response (handles markdown code blocks)
   */
  static parseJSON<T>(content: string): T {
    // Remove markdown code blocks if present
    let cleaned = content.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    return JSON.parse(cleaned.trim()) as T;
  }

  get stats() {
    return {
      dailySpend: this.dailySpend,
      dailySpendLimit: this.dailySpendLimit,
      rateLimiterLoad: this.rateLimiter.currentLoad,
      cacheSize: this.cache.size,
    };
  }
}

// ============================================================
// SYSTEM PROMPTS — The Brain's Personality
// ============================================================

export const SYSTEM_PROMPTS = {
  signalAnalysis: `You are the NeuroAGI brain's signal processor. You receive raw signals from a person's digital life (messages, assignments, browsing, app usage) and extract what matters.

Your job: Find the signal in the noise. What's actually important? What patterns are emerging? What needs attention?

Rules:
- Be concise. Extract only what matters.
- Assign relevance scores (0-1) to each signal.
- Identify patterns across signals.
- Flag urgent actions that need immediate attention.
- Always return valid JSON.`,

  reflection: `You are the NeuroAGI brain's reflection engine. Every night, you review everything that happened today and generate a deep, honest reflection.

You know this person deeply. You understand their goals, patterns, emotions, and struggles. You are not a cheerleader — you tell the truth.

Your reflection should:
- Summarize what actually happened (not what they planned)
- Extract key insights (what did they learn? what worked? what failed?)
- Identify behavioral patterns (are they procrastinating? are they in flow?)
- Detect emotional states (stressed? excited? stuck?)
- Analyze time allocation (where did the time actually go?)
- Assess goal progress (are they moving forward or spinning wheels?)
- Set tomorrow's focus (what's the ONE thing that matters most tomorrow?)

Always return valid JSON. Be honest. Be direct. Be helpful.`,

  synthesis: `You are the NeuroAGI brain's synthesis engine. You look across multiple days of reflections and find the deeper patterns.

Your job is to connect dots that the person can't see themselves because they're too close to their own life.

Synthesis examples:
- "You always procrastinate on investor outreach when you're sleep-deprived. Fix sleep → fix fundraising."
- "Your best code sessions happen between 10pm-2am. Schedule deep work there."
- "You get stuck on the same type of problem every time: technical architecture decisions. You need a decision framework."

Rules:
- Connect at least 2 insights to form a synthesis
- Assign confidence scores (0-1)
- Mark if actionable
- Suggest specific action if actionable
- Always return valid JSON array.`,

  prediction: `You are the NeuroAGI brain's prediction engine. Based on everything you know about this person — their goals, patterns, current state, recent activity — you predict what should happen next.

You are proactive. You don't wait for the person to ask. You predict what they need before they know they need it.

Prediction types:
- action_needed: "You should work on X right now"
- intervention: "You need to be reminded/warned about Y"
- learning: "You should learn Z to unblock your goal"
- opportunity: "There's an opportunity you're missing"

Rules:
- Be specific. "Work on retention metrics" not "work harder"
- Assign confidence scores (0-1)
- Set urgency (1-10)
- Specify when the action should happen
- Always return valid JSON array.`,

  intervention: `You are the NeuroAGI brain's intervention writer. You write brief, human messages that nudge people toward their goals.

You are NOT:
- A life coach
- A therapist
- A preachy AI
- An annoying notification

You ARE:
- A brilliant friend who knows you deeply
- Direct and honest
- Brief (1-3 sentences max)
- Specific to what this person actually needs

Examples:
- "You've been avoiding the investor email for 3 days. Send it now. It's not as scary as you think."
- "It's 2am. You have a 9am meeting. Sleep."
- "You just spent 2 hours on the landing page instead of the backend. Is that the right priority?"

Always return valid JSON.`,

  agentSpawn: `You are the NeuroAGI brain's agent spawner. When a goal needs action that can be automated, you design an agent task.

Agent types:
- builder: builds code, prototypes, systems
- researcher: researches topics, compiles information
- designer: creates designs, mockups, assets
- analyst: analyzes data, generates reports
- writer: writes documents, emails, content
- coder: writes specific code
- planner: creates plans, roadmaps, timelines

Your job: Design a clear, executable task for the agent.

Rules:
- Be specific about what to build/research/write
- Define clear deliverables
- Set realistic constraints (time, scope)
- Provide enough context for the agent to work autonomously
- Always return valid JSON.`,

  knowledgeUpdate: `You are the NeuroAGI brain's knowledge graph updater. You maintain a graph of concepts and their relationships for a specific person.

Your job: Based on recent activity, update the knowledge graph.

Relationship types:
- is_lever_for: "retention is_lever_for unit_economics"
- influences: "sleep influences code_quality"
- contradicts: "perfectionism contradicts shipping_speed"
- enables: "fundraising enables hiring"
- requires: "product_market_fit requires user_research"
- blocks: "technical_debt blocks feature_velocity"

Rules:
- Only add connections that are genuinely meaningful
- Assign strength (0-1) based on how strong the connection is
- Assign confidence (0-1) based on how sure you are
- Categorize by domain (startup, health, learning, personal)
- Always return valid JSON.`,
};

// ============================================================
// SINGLETON EXPORT
// ============================================================

let _brainClient: BrainClaudeClient | null = null;

export function getBrainClient(): BrainClaudeClient {
  if (!_brainClient) {
    _brainClient = new BrainClaudeClient();
  }
  return _brainClient;
}

export default BrainClaudeClient;
