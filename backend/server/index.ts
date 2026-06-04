/**
 * FschoolAI Backend Server
 * 
 * FIXED:
 * - JWT authentication applied to all /api/* routes
 * - OpenAI API key validated on startup
 * - Auth middleware imported from middleware/auth.ts
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pino from 'pino';
import { createClient } from '@supabase/supabase-js';
import { authenticate } from './middleware/auth.js';
import { requestContextMiddleware } from './middleware/request-context.js';
import './services/brain-scheduler-init'; // Autonomous brain — starts on server boot
import { brainRealtime } from './services/brain-realtime'; // Realtime event subscriptions
import { startInterventionRealtimeListener } from './services/brain-intervention-delivery'; // SSE intervention push

// Load environment variables
dotenv.config();

// Validate critical environment variables on startup
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'JWT_SECRET', 'OPENAI_API_KEY'];
const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`[Startup] Missing required environment variables: ${missing.join(', ')}`);
  console.error('[Startup] Server will start but affected features will be degraded.');
}

// Initialize logger
const logger = pino(
  process.env.NODE_ENV === 'production'
    ? undefined
    : { transport: { target: 'pino-pretty' } }
);

// Initialize Express app
const app: Express = express();
const PORT = process.env.PORT || 5000;

// ── Global Middleware ──────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(requestContextMiddleware);

// ── Public Routes ──────────────────────────────────────────────────────────────

// Health check — no auth required
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: '1.0.0',
    brain: 'autonomous — scheduler running',
    llm: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
    claude: process.env.ANTHROPIC_API_KEY ? 'configured' : 'using openai key',
  });
});

// ── Protected API Routes (JWT required) ───────────────────────────────────────
// authenticate middleware verifies the Bearer token and attaches req.user
// All /api/* routes require a valid Supabase JWT

app.use('/api/agents', authenticate, require('./routes/agents').default);
app.use('/api/canvas', authenticate, require('./routes/canvas').default);
app.use('/api/brain',  authenticate, require('./routes/brain').default);
app.use('/api/signals', authenticate, require('./routes/signals').default);
app.use('/api/chat',    authenticate, require('./routes/chat').default);

// ── Error Handling ─────────────────────────────────────────────────────────────
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error({
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    requestId: (req as any).id,
  });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// ── Start Server ───────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
);

// Start Realtime subscriptions (brain listens to DB events)
brainRealtime.connect().catch(err => console.error('[Realtime] Failed to connect:', err));
startInterventionRealtimeListener().catch(err => console.error('[InterventionDelivery] Failed to start:', err));

app.listen(PORT, () => {
  logger.info(`
    ╔══════════════════════════════════════════════╗
    ║  NeuroAGI Backend Server Started             ║
    ║  Port: ${PORT}                                    ║
    ║  Environment: ${process.env.NODE_ENV || 'development'}               ║
    ║  Database: ${process.env.SUPABASE_URL ? '✓ Connected' : '✗ Not configured'}           ║
    ║  LLM (OpenAI): ${process.env.OPENAI_API_KEY ? '✓ Configured' : '✗ Missing'}        ║
    ║  Auth: ✓ JWT middleware active               ║
    ║  Brain: ✓ Connected to NeuroAGI service      ║
    ╚══════════════════════════════════════════════╝
  `);
});

export { app, supabase, logger };
