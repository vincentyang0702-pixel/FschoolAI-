/**
 * NeuroAGI Chat Route
 *
 * The main conversation endpoint. Every message goes through the brain-aware
 * chat session — context window pre-loaded, zero latency brain injection.
 *
 * POST /api/chat/session/start   — start a new session
 * POST /api/chat/message         — send a message
 * POST /api/chat/session/end     — end a session
 * GET  /api/chat/history/:personId — get conversation history
 * GET  /api/chat/context/:personId — get current brain context window (debug)
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/error-handler';
import { brainChatSession } from '../services/brain-chat-session';
import { contextWindowWriter } from '../services/brain-context-window';
import { handleSSEConnection, startInterventionRealtimeListener } from '../services/brain-intervention-delivery';
import { createClient } from '@supabase/supabase-js';

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

// POST /api/chat/session/start
router.post('/session/start', asyncHandler(async (req: Request, res: Response) => {
  const { person_id } = req.body;
  if (!person_id) return res.status(400).json({ error: 'person_id required' });

  const result = await brainChatSession.startSession(person_id);

  // Format brain context for the frontend
  const brainSummary = result.brain_context ? {
    stress_level: result.brain_context.stress_level,
    momentum: result.brain_context.momentum_state,
    has_pending_intervention: !!result.brain_context.pending_intervention,
    most_urgent_deadline: result.brain_context.most_urgent_deadline,
    sleep_hours: result.brain_context.sleep_hours_last_night,
  } : null;

  res.json({
    session_id: result.session_id,
    brain_ready: !!result.brain_context,
    brain_summary: brainSummary,
  });
}));

// POST /api/chat/message
router.post('/message', asyncHandler(async (req: Request, res: Response) => {
  const { person_id, message, session_id } = req.body;

  if (!person_id || !message) {
    return res.status(400).json({ error: 'person_id and message required' });
  }

  if (!message.trim()) {
    return res.status(400).json({ error: 'message cannot be empty' });
  }

  const result = await brainChatSession.chat({
    personId: person_id,
    message: message.trim(),
    sessionId: session_id,
  });

  res.json({
    response: result.response,
    session_id: result.session_id,
    meta: {
      latency_ms: result.latency_ms,
      brain_context_loaded: result.brain_context_loaded,
      intervention_delivered: result.pending_intervention_delivered,
    },
  });
}));

// POST /api/chat/session/end
router.post('/session/end', asyncHandler(async (req: Request, res: Response) => {
  const { person_id, session_id, message_count } = req.body;
  if (!person_id || !session_id) return res.status(400).json({ error: 'person_id and session_id required' });

  await brainChatSession.endSession(person_id, session_id, message_count || 0);
  res.json({ success: true });
}));

// GET /api/chat/history/:personId
router.get('/history/:personId', asyncHandler(async (req: Request, res: Response) => {
  const { personId } = req.params;
  const { session_id, limit = '50' } = req.query;

  let query = supabase
    .schema('agents')
    .from('messages')
    .select('id, role, content, created_at, session_id')
    .eq('person_id', personId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(Number(limit));

  if (session_id) query = query.eq('session_id', session_id as string);

  const { data, error } = await query;
  if (error) throw error;

  res.json({ messages: (data || []).reverse(), count: data?.length });
}));

// GET /api/chat/context/:personId — debug endpoint to see what brain knows
router.get('/context/:personId', asyncHandler(async (req: Request, res: Response) => {
  const { personId } = req.params;
  const ctx = await contextWindowWriter.read(personId);

  if (!ctx) return res.status(404).json({ error: 'No context window found' });

  // Return full context + formatted system prompt preview
  res.json({
    context: ctx,
    system_prompt_preview: contextWindowWriter.formatAsSystemPrompt(ctx),
  });
}));

// GET /api/chat/stream/:personId — SSE stream for real-time brain interventions
router.get('/stream/:personId', (req: Request, res: Response) => {
  handleSSEConnection(req, res);
});

// POST /api/chat/context/:personId/refresh — force refresh context window
router.post('/context/:personId/refresh', asyncHandler(async (req: Request, res: Response) => {
  const { personId } = req.params;
  const result = await contextWindowWriter.refresh(personId);
  res.json(result);
}));

export default router;
