// ============================================================
// NeuroAGI Brain: Real-Time brain_signals Webhook Handler
// Deploy as a Supabase Edge Function: supabase/functions/brain-signal-processor/index.ts
//
// This Edge Function is triggered by a Database Webhook whenever
// a new row is inserted into brain_signals. It immediately:
// 1. Updates the student's emotional_signals table
// 2. Updates the student's behavioral_signals table
// 3. Triggers a knowledge graph update if the signal has subject/topic data
// 4. Updates the student_profiles with the latest brain state
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface BrainSignal {
  id: string;
  user_id: string;
  signal_type: string;
  product: string;
  agent_used: string | null;
  message_content: string | null;
  response_content: string | null;
  course_id: string | null;
  assignment_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

Deno.serve(async (req: Request) => {
  try {
    const payload = await req.json();
    const signal: BrainSignal = payload.record;

    console.log(`Processing brain signal: ${signal.signal_type} for user ${signal.user_id}`);

    const updates: Promise<unknown>[] = [];

    // --------------------------------------------------------
    // 1. Update behavioral_signals based on signal type
    // --------------------------------------------------------
    if (["study_session", "focus_session", "agent_chat"].includes(signal.signal_type)) {
      updates.push(
        supabase.from("behavioral_signals").upsert({
          user_id: signal.user_id,
          signal_type: signal.signal_type,
          frequency: 1, // Will be aggregated by cron
          last_occurrence: signal.created_at,
          metadata: signal.metadata,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,signal_type" })
      );
    }

    // --------------------------------------------------------
    // 2. Update emotional_signals if stress/mood indicators present
    // --------------------------------------------------------
    const metadata = signal.metadata as Record<string, unknown>;
    if (metadata?.stress_level || metadata?.mood || metadata?.emotional_state) {
      updates.push(
        supabase.from("emotional_signals").upsert({
          user_id: signal.user_id,
          stress_level: metadata.stress_level ?? null,
          mood: metadata.mood ?? null,
          emotional_state: metadata.emotional_state ?? null,
          trigger_event: signal.signal_type,
          recorded_at: signal.created_at,
        })
      );
    }

    // --------------------------------------------------------
    // 3. Update knowledge_signals if subject/topic data present
    // --------------------------------------------------------
    if (metadata?.subject && metadata?.topic) {
      updates.push(
        supabase.from("knowledge_signals").upsert({
          user_id: signal.user_id,
          subject: metadata.subject as string,
          topic: metadata.topic as string,
          mastery_level: (metadata.mastery_delta as number) ?? 0.05,
          confidence_score: 0.8,
          last_reinforced_at: signal.created_at,
          signal_count: 1,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,subject,topic" })
      );
    }

    // --------------------------------------------------------
    // 4. Update student_profiles last_active timestamp
    // --------------------------------------------------------
    updates.push(
      supabase.from("student_profiles")
        .update({
          last_active: signal.created_at,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", signal.user_id)
    );

    // --------------------------------------------------------
    // 5. Run all updates in parallel
    // --------------------------------------------------------
    await Promise.all(updates);

    console.log(`Brain signal processed successfully for user ${signal.user_id}`);

    return new Response(
      JSON.stringify({ success: true, signal_id: signal.id }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("Brain signal processing error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});
