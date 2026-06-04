/**
 * NeuroAGI Signal Ingestion Service
 * 
 * The brain's sensory layer. Every signal about a person flows through here.
 * Signals are the raw input that drives reflections, hypotheses, and interventions.
 * 
 * Signal types (from brain.signal_types):
 *   behavioral, emotional, academic, sleep, stress, momentum, context,
 *   knowledge, outcome, voice, biometric, expression, app_usage, social,
 *   location, temporal, intervention_response, canvas_event, manual
 * 
 * Architecture: All signals write to brain.signals (new schema).
 * The old public.* signal tables are dropped.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SignalPayload {
  person_id: string;
  signal_type: string;          // must match brain.signal_types.type_key
  subtype?: string;             // e.g. 'sleep_duration', 'stress_spike', 'assignment_opened'
  value?: number;               // 0.0–1.0 normalized, or raw numeric
  value_text?: string;          // for non-numeric signals
  value_json?: Record<string, any>; // for rich structured signals
  source?: string;              // 'phone_app', 'canvas', 'chat', 'manual', 'neural_card'
  session_id?: string;          // link to agents.sessions if from a conversation
  confidence?: number;          // 0.0–1.0 how confident is the source
  metadata?: Record<string, any>;
  occurred_at?: string;         // ISO timestamp, defaults to now
}

export interface BatchSignalPayload {
  person_id: string;
  signals: Omit<SignalPayload, 'person_id'>[];
  source: string;
}

export interface SignalIngestionResult {
  success: boolean;
  signal_id?: string;
  signal_ids?: string[];
  error?: string;
  triggered_reflection?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal Ingestion Service
// ─────────────────────────────────────────────────────────────────────────────

export class SignalIngestionService {
  
  /**
   * Ingest a single signal into brain.signals
   */
  async ingest(payload: SignalPayload): Promise<SignalIngestionResult> {
    try {
      // Validate signal type exists
      const { data: typeRow } = await supabase
        .schema('brain')
        .from('signal_types')
        .select('type_key, label')
        .eq('type_key', payload.signal_type)
        .single();

      if (!typeRow) {
        // Unknown type — still accept it but log as 'manual'
        console.warn(`[SignalIngestion] Unknown signal type: ${payload.signal_type}, accepting as manual`);
      }

      // Write to brain.signals
      const { data, error } = await supabase
        .schema('brain')
        .from('signals')
        .insert({
          person_id: payload.person_id,
          signal_type: payload.signal_type,
          subtype: payload.subtype || null,
          value: payload.value ?? null,
          value_text: payload.value_text || null,
          value_json: payload.value_json || null,
          source: payload.source || 'unknown',
          session_id: payload.session_id || null,
          confidence: payload.confidence ?? 1.0,
          metadata: payload.metadata || {},
          occurred_at: payload.occurred_at || new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) throw error;

      // Check if this signal should trigger an immediate reflection
      const shouldTrigger = await this.shouldTriggerReflection(payload);

      // Update the person's last_seen in neuro.persons
      await supabase
        .schema('neuro')
        .from('persons')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', payload.person_id);

      return {
        success: true,
        signal_id: data.id,
        triggered_reflection: shouldTrigger,
      };

    } catch (err: any) {
      console.error('[SignalIngestion] Error ingesting signal:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Ingest a batch of signals atomically
   */
  async ingestBatch(payload: BatchSignalPayload): Promise<SignalIngestionResult> {
    try {
      const rows = payload.signals.map(s => ({
        person_id: payload.person_id,
        signal_type: s.signal_type,
        subtype: s.subtype || null,
        value: s.value ?? null,
        value_text: s.value_text || null,
        value_json: s.value_json || null,
        source: payload.source,
        session_id: s.session_id || null,
        confidence: s.confidence ?? 1.0,
        metadata: s.metadata || {},
        occurred_at: s.occurred_at || new Date().toISOString(),
      }));

      const { data, error } = await supabase
        .schema('brain')
        .from('signals')
        .insert(rows)
        .select('id');

      if (error) throw error;

      return {
        success: true,
        signal_ids: data.map((r: any) => r.id),
      };

    } catch (err: any) {
      console.error('[SignalIngestion] Batch error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Ingest signals from a Canvas event (assignment opened, grade received, etc.)
   */
  async ingestCanvasEvent(personId: string, event: {
    type: 'assignment_opened' | 'assignment_submitted' | 'grade_received' | 'course_accessed' | 'deadline_approaching';
    course?: string;
    assignment?: string;
    score?: number;
    due_at?: string;
    metadata?: Record<string, any>;
  }): Promise<SignalIngestionResult> {
    return this.ingest({
      person_id: personId,
      signal_type: 'canvas_event',
      subtype: event.type,
      value_text: event.assignment || event.course,
      value: event.score !== undefined ? event.score / 100 : undefined,
      value_json: {
        course: event.course,
        assignment: event.assignment,
        due_at: event.due_at,
        ...event.metadata,
      },
      source: 'canvas',
      confidence: 1.0,
    });
  }

  /**
   * Ingest a signal from a conversation session
   * Used by the reflection engine after processing a chat
   */
  async ingestFromSession(personId: string, sessionId: string, signals: {
    type: string;
    subtype?: string;
    value?: number;
    value_text?: string;
    value_json?: Record<string, any>;
    confidence?: number;
  }[]): Promise<SignalIngestionResult> {
    return this.ingestBatch({
      person_id: personId,
      source: 'chat',
      signals: signals.map(s => ({
        signal_type: s.type,
        subtype: s.subtype,
        value: s.value,
        value_text: s.value_text,
        value_json: s.value_json,
        session_id: sessionId,
        confidence: s.confidence ?? 0.8,
      })),
    });
  }

  /**
   * Get recent signals for a person (last N hours)
   */
  async getRecent(personId: string, hours: number = 24, types?: string[]): Promise<any[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    let query = supabase
      .schema('brain')
      .from('signals')
      .select('*')
      .eq('person_id', personId)
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false });

    if (types && types.length > 0) {
      query = query.in('signal_type', types);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Get signal summary for a person — used by the brain before thinking
   */
  async getSummary(personId: string): Promise<{
    last_24h: number;
    last_7d: number;
    dominant_types: string[];
    stress_trend: 'rising' | 'falling' | 'stable';
    last_signal_at: string | null;
    momentum_signals: any[];
  }> {
    const [recent24h, recent7d] = await Promise.all([
      this.getRecent(personId, 24),
      this.getRecent(personId, 168),
    ]);

    // Count signal types
    const typeCounts: Record<string, number> = {};
    for (const s of recent7d) {
      typeCounts[s.signal_type] = (typeCounts[s.signal_type] || 0) + 1;
    }
    const dominantTypes = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type]) => type);

    // Stress trend
    const stressSignals = recent7d
      .filter(s => s.signal_type === 'stress')
      .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
    
    let stressTrend: 'rising' | 'falling' | 'stable' = 'stable';
    if (stressSignals.length >= 2) {
      const first = stressSignals[0].value || 0;
      const last = stressSignals[stressSignals.length - 1].value || 0;
      if (last - first > 0.15) stressTrend = 'rising';
      else if (first - last > 0.15) stressTrend = 'falling';
    }

    return {
      last_24h: recent24h.length,
      last_7d: recent7d.length,
      dominant_types: dominantTypes,
      stress_trend: stressTrend,
      last_signal_at: recent24h[0]?.occurred_at || null,
      momentum_signals: recent24h.filter(s => s.signal_type === 'momentum'),
    };
  }

  /**
   * Determine if a new signal should trigger an immediate reflection
   * (rather than waiting for the nightly scheduled run)
   */
  private async shouldTriggerReflection(signal: SignalPayload): Promise<boolean> {
    // High-urgency signal types trigger immediate reflection
    const urgentTypes = ['stress', 'emotional', 'intervention_response'];
    if (!urgentTypes.includes(signal.signal_type)) return false;

    // Only trigger if value is high (stress > 0.8, negative emotion)
    if (signal.value !== undefined && signal.value < 0.75) return false;

    // Check if we already reflected in the last 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .schema('brain')
      .from('reflections')
      .select('id')
      .eq('person_id', signal.person_id)
      .gte('created_at', twoHoursAgo)
      .limit(1);

    return !data || data.length === 0;
  }
}

export const signalIngestion = new SignalIngestionService();
