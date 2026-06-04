/**
 * NeuroAGI Brain-Aware Chat Session
 *
 * This is the core integration point between FschoolAI and the Brain.
 * Every conversation goes through this service — it reads the brain's
 * context window and injects it into Claude's system prompt.
 *
 * The result: Claude already knows what matters before the user types a word.
 * Zero latency. Zero API calls to the brain. The brain pre-loaded everything.
 *
 * Flow:
 *   1. User sends message
 *   2. This service reads brain.context_window (single DB read, <5ms)
 *   3. Builds enriched system prompt: base prompt + brain context
 *   4. Calls Claude with full context
 *   5. Writes message to agents.messages (triggers Realtime → Brain reacts)
 *   6. Returns response
 *   7. Brain processes async — updates signals, momentum, context window
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { contextWindowWriter, BrainContextWindow } from './brain-context-window';
import { signalIngestion } from './signal-ingestion';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
});

// ─────────────────────────────────────────────────────────────────────────────
// Brain Chat Session
// ─────────────────────────────────────────────────────────────────────────────

export class BrainChatSession {

  /**
   * Process a user message through the brain-aware chat pipeline.
   * This is the main entry point for all conversations.
   */
  async chat(params: ChatParams): Promise<ChatResponse> {
    const { personId, message, sessionId, stream = false } = params;

    const startTime = Date.now();

    // ── Step 1: Read brain context window (pre-loaded, ~5ms) ──────────────
    const brainContext = await contextWindowWriter.read(personId);

    // ── Step 2: Get conversation history ─────────────────────────────────
    const history = await this.getConversationHistory(personId, sessionId, 20);

    // ── Step 3: Get person info ───────────────────────────────────────────
    const { data: person } = await supabase
      .schema('neuro')
      .from('persons')
      .select('name, timezone, university, programme')
      .eq('id', personId)
      .single();

    // ── Step 4: Build enriched system prompt ─────────────────────────────
    const systemPrompt = this.buildSystemPrompt(person, brainContext);

    // ── Step 5: Build messages array ─────────────────────────────────────
    const messages: Anthropic.MessageParam[] = [
      ...history.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: message },
    ];

    // ── Step 6: Call Claude ───────────────────────────────────────────────
    let responseText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 1500,
        system: systemPrompt,
        messages,
      });

      responseText = response.content[0].type === 'text' ? response.content[0].text : '';
      inputTokens = response.usage.input_tokens;
      outputTokens = response.usage.output_tokens;
    } catch (claudeErr: any) {
      // Fallback to Claude Sonnet if Opus fails
      console.error('[BrainChat] Claude Opus error, falling back to Sonnet:', claudeErr.message);
      const fallback = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        system: systemPrompt,
        messages,
      });
      responseText = fallback.content[0].type === 'text' ? fallback.content[0].text : '';
      inputTokens = fallback.usage.input_tokens;
      outputTokens = fallback.usage.output_tokens;
    }

    const latencyMs = Date.now() - startTime;

    // ── Step 7: Write both messages to DB (triggers Realtime → Brain) ────
    await this.persistMessages(personId, sessionId, message, responseText);

    // ── Step 8: Emit session signal (async — don't block response) ────────
    this.emitSessionSignals(personId, sessionId, message, latencyMs).catch(console.error);

    // ── Step 9: Log cost ──────────────────────────────────────────────────
    this.logCost(personId, inputTokens, outputTokens).catch(console.error);

    return {
      response: responseText,
      session_id: sessionId,
      latency_ms: latencyMs,
      brain_context_loaded: !!brainContext,
      pending_intervention_delivered: !!(brainContext?.pending_intervention),
      tokens: { input: inputTokens, output: outputTokens },
    };
  }

  /**
   * Start a new session — creates session record, refreshes context window.
   */
  async startSession(personId: string): Promise<{ session_id: string; brain_context: BrainContextWindow | null }> {
    // Create session record
    const { data: session } = await supabase
      .schema('agents')
      .from('sessions')
      .insert({
        person_id: personId,
        started_at: new Date().toISOString(),
        status: 'active',
      })
      .select('id')
      .single();

    const sessionId = session?.id || crypto.randomUUID();

    // Read brain context (pre-loaded by scheduler)
    const brainContext = await contextWindowWriter.read(personId);

    // Update last_seen
    await supabase
      .schema('neuro')
      .from('persons')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', personId);

    // Emit session start signal
    await signalIngestion.ingest({
      person_id: personId,
      signal_type: 'behavioral',
      subtype: 'session_started',
      value: 1,
      value_json: { session_id: sessionId, hour_of_day: new Date().getHours() },
      occurred_at: new Date().toISOString(),
      source: 'chat_session',
    });

    return { session_id: sessionId, brain_context: brainContext };
  }

  /**
   * End a session — updates session record, emits end signal.
   */
  async endSession(personId: string, sessionId: string, messageCount: number): Promise<void> {
    await supabase
      .schema('agents')
      .from('sessions')
      .update({
        ended_at: new Date().toISOString(),
        status: 'completed',
        message_count: messageCount,
      })
      .eq('id', sessionId);

    await signalIngestion.ingest({
      person_id: personId,
      signal_type: 'behavioral',
      subtype: 'session_ended',
      value: messageCount,
      value_json: { session_id: sessionId, message_count: messageCount },
      occurred_at: new Date().toISOString(),
      source: 'chat_session',
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // System Prompt Builder
  // ─────────────────────────────────────────────────────────────────────────

  private buildSystemPrompt(person: any, brainContext: BrainContextWindow | null): string {
    const name = person?.name || 'the student';
    const university = person?.university || 'university';
    const programme = person?.programme || 'their programme';

    const basePrompt = `You are the academic brain for ${name}, a ${programme} student at ${university}.

You are not a generic AI assistant. You are a personalized intelligence that has been learning about ${name} for months. You know their patterns, their tendencies, their goals, and what they respond to.

Core principles:
- Respond like someone who genuinely knows this person — not like a customer service bot
- Be direct and specific, not generic and hedging
- When you notice something important, say it — don't wait to be asked
- Adapt your tone to what this person needs right now, not what's generically "helpful"
- Never start responses with "Great question!" or similar filler
- If the brain has flagged something to address, weave it in naturally — don't announce it`;

    if (!brainContext) return basePrompt;

    const brainSection = contextWindowWriter.formatAsSystemPrompt(brainContext);

    return `${basePrompt}\n\n${brainSection}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async getConversationHistory(personId: string, sessionId: string | undefined, limit: number): Promise<any[]> {
    try {
      let query = supabase
        .schema('agents')
        .from('messages')
        .select('role, content, created_at')
        .eq('person_id', personId)
        .in('role', ['user', 'assistant'])
        .order('created_at', { ascending: false })
        .limit(limit);

      if (sessionId) {
        query = query.eq('session_id', sessionId);
      }

      const { data } = await query;
      return (data || []).reverse(); // Chronological order
    } catch {
      return [];
    }
  }

  private async persistMessages(personId: string, sessionId: string | undefined, userMessage: string, assistantMessage: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      await supabase.schema('agents').from('messages').insert([
        {
          person_id: personId,
          session_id: sessionId,
          role: 'user',
          content: userMessage,
          created_at: now,
        },
        {
          person_id: personId,
          session_id: sessionId,
          role: 'assistant',
          content: assistantMessage,
          created_at: new Date(Date.now() + 1).toISOString(), // 1ms later
        },
      ]);
    } catch (err) {
      console.error('[BrainChat] Persist messages error:', err);
    }
  }

  private async emitSessionSignals(personId: string, sessionId: string | undefined, message: string, latencyMs: number): Promise<void> {
    // Infer stress from message characteristics
    const messageLength = message.length;
    const hasUrgencyWords = /urgent|asap|help|stuck|confused|don't understand|deadline/i.test(message);
    const isVeryShort = messageLength < 15;

    if (hasUrgencyWords || isVeryShort) {
      await signalIngestion.ingest({
        person_id: personId,
        signal_type: 'behavioral',
        subtype: 'message_urgency_detected',
        value: hasUrgencyWords ? 0.7 : 0.4,
        value_json: { message_length: messageLength, has_urgency_words: hasUrgencyWords, session_id: sessionId },
        occurred_at: new Date().toISOString(),
        source: 'chat_inference',
      });
    }
  }

  private async logCost(personId: string, inputTokens: number, outputTokens: number): Promise<void> {
    try {
      // Claude Opus pricing: $15/1M input, $75/1M output
      const costUsd = (inputTokens * 0.000015) + (outputTokens * 0.000075);
      await supabase.schema('brain').from('cost_tracking').insert({
        person_id: personId,
        service: 'claude',
        operation: 'chat',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd,
        occurred_at: new Date().toISOString(),
      });
    } catch {
      // Non-critical — don't fail the request
    }
  }
}

export const brainChatSession = new BrainChatSession();

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ChatParams {
  personId: string;
  message: string;
  sessionId?: string;
  stream?: boolean;
}

interface ChatResponse {
  response: string;
  session_id: string | undefined;
  latency_ms: number;
  brain_context_loaded: boolean;
  pending_intervention_delivered: boolean;
  tokens: { input: number; output: number };
}
