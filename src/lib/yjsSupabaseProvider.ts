import * as Y from 'yjs';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../api/supabase';

// ── encoding helpers ──────────────────────────────────────────────────────────
// Avoids the call-stack overflow that spread (...arr) causes on large Uint8Arrays.

function toBase64(arr: Uint8Array): string {
  let s = '';
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Sentinel used as the `origin` arg to Y.applyUpdate so we never echo our own
// incoming changes back to the channel.
const REMOTE = 'supabase-broadcast';

// ── provider ─────────────────────────────────────────────────────────────────

export class SupabaseBroadcastProvider {
  private doc: Y.Doc;
  private channel: RealtimeChannel;
  private roomId: string;
  private updateHandler: (update: Uint8Array, origin: unknown) => void;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(doc: Y.Doc, channel: RealtimeChannel, roomId: string) {
    this.doc = doc;
    this.channel = channel;
    this.roomId = roomId;

    // 1. Forward local changes to peers and schedule a DB persist.
    this.updateHandler = (update, origin) => {
      if (origin === REMOTE) return;
      channel.send({
        type: 'broadcast',
        event: 'yjs_update',
        payload: { u: toBase64(update) },
      }).catch(() => {});

      if (this.persistTimer) clearTimeout(this.persistTimer);
      this.persistTimer = setTimeout(() => this.persistState(), 2000);
    };
    doc.on('update', this.updateHandler);

    // 2. Apply incremental updates from other peers.
    channel.on('broadcast', { event: 'yjs_update' }, ({ payload }) => {
      if (!payload?.u) return;
      Y.applyUpdate(doc, fromBase64(payload.u), REMOTE);
    });

    // 3. When a new peer joins and requests the full state, respond with it.
    channel.on('broadcast', { event: 'yjs_sync_req' }, () => {
      const state = Y.encodeStateAsUpdate(doc);
      channel.send({
        type: 'broadcast',
        event: 'yjs_sync_res',
        payload: { u: toBase64(state) },
      }).catch(() => {});
    });

    // 4. Apply a full-state snapshot sent by an existing peer on join.
    channel.on('broadcast', { event: 'yjs_sync_res' }, ({ payload }) => {
      if (!payload?.u) return;
      Y.applyUpdate(doc, fromBase64(payload.u), REMOTE);
    });
  }

  /**
   * Load any previously persisted board state from Supabase.
   * Call this before subscribing so the doc is seeded before peers connect.
   * Silently no-ops if the column doesn't exist yet (pre-migration).
   */
  async loadPersistedState(): Promise<void> {
    try {
      const { data } = await supabase
        .from('study_rooms')
        .select('yjs_doc')
        .eq('id', this.roomId)
        .maybeSingle();
      if (data?.yjs_doc) {
        Y.applyUpdate(this.doc, fromBase64(data.yjs_doc), REMOTE);
      }
    } catch {
      // Column not yet added — safe to ignore during PoC phase.
    }
  }

  /**
   * After the channel is subscribed, broadcast a sync request so any already-
   * connected peers send you their current full doc state.
   */
  requestSync(): void {
    this.channel.send({
      type: 'broadcast',
      event: 'yjs_sync_req',
      payload: {},
    }).catch(() => {});
  }

  /**
   * Encode the entire Yjs doc and save it to Supabase so late-joiners and
   * page reloads restore the full board.  Called automatically 2 s after any
   * local change; you can also call it manually (e.g. on room leave).
   */
  async persistState(): Promise<void> {
    try {
      const state = Y.encodeStateAsUpdate(this.doc);
      await supabase
        .from('study_rooms')
        .update({ yjs_doc: toBase64(state) })
        .eq('id', this.roomId);
    } catch {
      // Ignore — persistence is best-effort during PoC.
    }
  }

  /** Tear down listeners. Call when leaving the room. */
  destroy(): void {
    this.doc.off('update', this.updateHandler);
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
  }
}
