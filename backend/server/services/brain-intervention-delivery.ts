/**
 * NeuroAGI Intervention Delivery Service
 *
 * Handles real-time delivery of brain interventions to the FschoolAI frontend.
 * Uses Server-Sent Events (SSE) so the frontend receives interventions instantly
 * without polling — the moment the brain queues an intervention, the user sees it.
 *
 * Architecture:
 *   Brain writes to brain.interventions (status='queued')
 *     → Supabase Realtime fires event
 *       → This service pushes to SSE stream
 *         → Frontend receives and displays intervention
 *
 * This is the "push notification" layer of the brain.
 * No polling. No latency. Brain speaks when it has something to say.
 */

import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

// ─────────────────────────────────────────────────────────────────────────────
// SSE Connection Manager
// ─────────────────────────────────────────────────────────────────────────────

interface SSEClient {
  personId: string;
  res: Response;
  connectedAt: number;
}

class InterventionDelivery {
  private clients: Map<string, SSEClient[]> = new Map(); // personId → clients

  /**
   * Register a new SSE client for a person.
   * Called when the frontend connects to /api/chat/stream/:personId
   */
  registerClient(personId: string, res: Response): () => void {
    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial connection confirmation
    this.send(res, 'connected', { person_id: personId, timestamp: new Date().toISOString() });

    // Send heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      this.send(res, 'heartbeat', { timestamp: new Date().toISOString() });
    }, 30000);

    // Register client
    const client: SSEClient = { personId, res, connectedAt: Date.now() };
    const existing = this.clients.get(personId) || [];
    existing.push(client);
    this.clients.set(personId, existing);

    console.log(`[InterventionDelivery] Client connected for person ${personId.slice(0, 8)}... (${existing.length} total)`);

    // Return cleanup function
    return () => {
      clearInterval(heartbeat);
      const remaining = (this.clients.get(personId) || []).filter(c => c !== client);
      if (remaining.length === 0) {
        this.clients.delete(personId);
      } else {
        this.clients.set(personId, remaining);
      }
      console.log(`[InterventionDelivery] Client disconnected for person ${personId.slice(0, 8)}...`);
    };
  }

  /**
   * Push an intervention to all connected clients for a person.
   * Called by the Realtime subscription when brain.interventions gets a new row.
   */
  pushIntervention(personId: string, intervention: any): void {
    const clients = this.clients.get(personId);
    if (!clients || clients.length === 0) return;

    const payload = {
      type: 'intervention',
      intervention: {
        id: intervention.id,
        message: intervention.message,
        approach: intervention.approach,
        urgency: intervention.urgency,
        intervention_type: intervention.intervention_type,
        created_at: intervention.created_at,
      },
    };

    clients.forEach(client => {
      this.send(client.res, 'intervention', payload);
    });

    console.log(`[InterventionDelivery] Pushed intervention to ${clients.length} client(s) for person ${personId.slice(0, 8)}...`);
  }

  /**
   * Push a brain state update to all connected clients.
   * Called after context window refresh.
   */
  pushBrainUpdate(personId: string, update: BrainUpdate): void {
    const clients = this.clients.get(personId);
    if (!clients || clients.length === 0) return;

    clients.forEach(client => {
      this.send(client.res, 'brain_update', update);
    });
  }

  /**
   * Push a momentum change notification.
   */
  pushMomentumChange(personId: string, oldState: string, newState: string): void {
    const clients = this.clients.get(personId);
    if (!clients || clients.length === 0) return;

    clients.forEach(client => {
      this.send(client.res, 'momentum_change', { old_state: oldState, new_state: newState, timestamp: new Date().toISOString() });
    });
  }

  /**
   * Get count of connected clients (for monitoring).
   */
  getConnectedCount(): number {
    let total = 0;
    this.clients.forEach(clients => { total += clients.length; });
    return total;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SSE Helper
  // ─────────────────────────────────────────────────────────────────────────

  private send(res: Response, event: string, data: any): void {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // Client disconnected — ignore
    }
  }
}

export const interventionDelivery = new InterventionDelivery();

// ─────────────────────────────────────────────────────────────────────────────
// Realtime Subscription for Interventions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start listening for new interventions in brain.interventions.
 * When brain queues a new intervention, push it to connected SSE clients.
 */
export async function startInterventionRealtimeListener(): Promise<void> {
  const channel = supabase
    .channel('intervention-delivery')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'brain', table: 'interventions' },
      (payload) => {
        const intervention = payload.new as any;
        if (!intervention?.person_id || intervention.status !== 'queued') return;

        console.log(`[InterventionDelivery] New intervention queued for ${intervention.person_id.slice(0, 8)}...`);
        interventionDelivery.pushIntervention(intervention.person_id, intervention);
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'brain', table: 'momentum' },
      (payload) => {
        const newMomentum = payload.new as any;
        const oldMomentum = payload.old as any;
        if (!newMomentum?.person_id) return;
        if (newMomentum.state !== oldMomentum?.state) {
          interventionDelivery.pushMomentumChange(newMomentum.person_id, oldMomentum?.state, newMomentum.state);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[InterventionDelivery] ✓ Realtime listener active for brain.interventions');
      }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE Route Handler (used in routes/chat.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/chat/stream/:personId
 * Server-Sent Events endpoint — frontend connects here to receive real-time brain updates.
 */
export function handleSSEConnection(req: Request, res: Response): void {
  const { personId } = req.params;

  if (!personId) {
    res.status(400).json({ error: 'personId required' });
    return;
  }

  const cleanup = interventionDelivery.registerClient(personId, res);

  // Clean up when client disconnects
  req.on('close', cleanup);
  req.on('aborted', cleanup);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface BrainUpdate {
  stress_level?: number;
  momentum_state?: string;
  pending_intervention?: string | null;
  most_urgent_deadline?: any;
  timestamp: string;
}
