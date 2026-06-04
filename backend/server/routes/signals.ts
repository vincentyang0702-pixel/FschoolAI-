/**
 * NeuroAGI Signal Ingestion API Routes
 * 
 * The brain's sensory layer — every signal about a person flows through here.
 * All signals write to brain.signals (4-schema architecture).
 * 
 * Endpoints:
 *   POST /api/signals/ingest          — single signal
 *   POST /api/signals/batch           — batch signals
 *   POST /api/signals/canvas          — Canvas LMS event
 *   POST /api/signals/session         — signals extracted from a conversation
 *   GET  /api/signals/types           — list all valid signal types
 *   GET  /api/signals/:personId/summary — signal summary for brain context
 *   GET  /api/signals/:personId       — get recent signals
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/error-handler';
import { signalIngestion } from '../services/signal-ingestion';
import { createClient } from '@supabase/supabase-js';

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

// POST /api/signals/ingest — single signal
router.post('/ingest', asyncHandler(async (req: Request, res: Response) => {
  const { person_id, signal_type, subtype, value, value_text, value_json,
          source, session_id, confidence, metadata, occurred_at } = req.body;

  if (!person_id || !signal_type) {
    return res.status(400).json({ error: 'person_id and signal_type are required' });
  }

  const result = await signalIngestion.ingest({
    person_id, signal_type, subtype, value, value_text, value_json,
    source: source || 'api', session_id, confidence, metadata, occurred_at,
  });

  if (!result.success) return res.status(500).json({ error: result.error });

  res.json({
    success: true,
    signal_id: result.signal_id,
    triggered_reflection: result.triggered_reflection,
  });
}));

// POST /api/signals/batch — batch signals from phone app / background service
router.post('/batch', asyncHandler(async (req: Request, res: Response) => {
  const { person_id, signals, source } = req.body;

  if (!person_id || !Array.isArray(signals) || signals.length === 0) {
    return res.status(400).json({ error: 'person_id and signals[] are required' });
  }
  if (signals.length > 500) {
    return res.status(400).json({ error: 'Maximum 500 signals per batch' });
  }

  const result = await signalIngestion.ingestBatch({
    person_id, signals, source: source || 'batch_api',
  });

  if (!result.success) return res.status(500).json({ error: result.error });

  res.json({ success: true, inserted: result.signal_ids?.length, signal_ids: result.signal_ids });
}));

// POST /api/signals/canvas — Canvas LMS event
router.post('/canvas', asyncHandler(async (req: Request, res: Response) => {
  const { person_id, event } = req.body;

  if (!person_id || !event?.type) {
    return res.status(400).json({ error: 'person_id and event.type are required' });
  }

  const result = await signalIngestion.ingestCanvasEvent(person_id, event);
  if (!result.success) return res.status(500).json({ error: result.error });

  res.json({ success: true, signal_id: result.signal_id });
}));

// POST /api/signals/session — signals extracted from a conversation
router.post('/session', asyncHandler(async (req: Request, res: Response) => {
  const { person_id, session_id, signals } = req.body;

  if (!person_id || !session_id || !Array.isArray(signals)) {
    return res.status(400).json({ error: 'person_id, session_id, and signals[] are required' });
  }

  const result = await signalIngestion.ingestFromSession(person_id, session_id, signals);
  if (!result.success) return res.status(500).json({ error: result.error });

  res.json({ success: true, inserted: result.signal_ids?.length });
}));

// GET /api/signals/types — list all valid signal types
router.get('/types', asyncHandler(async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .schema('brain')
    .from('signal_types')
    .select('*')
    .order('type_key');

  if (error) throw error;
  res.json({ types: data });
}));

// GET /api/signals/:personId/summary — signal summary for brain context
router.get('/:personId/summary', asyncHandler(async (req: Request, res: Response) => {
  const { personId } = req.params;
  const summary = await signalIngestion.getSummary(personId);
  res.json(summary);
}));

// GET /api/signals/:personId — get recent signals
router.get('/:personId', asyncHandler(async (req: Request, res: Response) => {
  const { personId } = req.params;
  const { hours = '24', types } = req.query;
  const typeFilter = types ? String(types).split(',') : undefined;
  const signals = await signalIngestion.getRecent(personId, Number(hours), typeFilter);

  res.json({ person_id: personId, signals, count: signals.length, window_hours: Number(hours) });
}));

export default router;
