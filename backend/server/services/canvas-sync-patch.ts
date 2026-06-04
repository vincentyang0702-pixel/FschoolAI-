// ============================================================
// Canvas → Brain Passive Learning Trigger
// Patch for canvas-sync.ts
//
// PROBLEM: Canvas sync stores data in grades/assignments tables
// but never writes to brain_signals. The brain only learns from
// explicit Reggie chat interactions, not from Canvas data.
//
// FIX: After every Canvas sync event (grade received, assignment
// added, course enrolled), write a brain_signal so the webhook
// fires and the brain updates in real-time.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Helper: Write a brain signal after any Canvas event ────────────────────
export async function emitCanvasBrainSignal(params: {
  userId: string;
  signalType: 'canvas_grade_received' | 'canvas_assignment_added' | 'canvas_course_enrolled' | 'canvas_sync_complete';
  courseId?: string;
  assignmentId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabase.from('brain_signals').insert({
      user_id: params.userId,
      signal_type: params.signalType,
      product: 'fschoolai',
      agent_used: 'canvas_sync',
      course_id: params.courseId || null,
      assignment_id: params.assignmentId || null,
      metadata: params.metadata || {},
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    // Non-fatal — brain signal emission should never block Canvas sync
    console.warn('[Canvas→Brain] Failed to emit brain signal:', err);
  }
}

// ── Usage: Add these calls inside canvas-sync.ts ───────────────────────────
//
// 1. After a grade is received (inside syncAssignmentsAndGrades):
//
//    await emitCanvasBrainSignal({
//      userId,
//      signalType: 'canvas_grade_received',
//      courseId: `canvas-${course.id}`,
//      assignmentId: assignmentRecord.id,
//      metadata: {
//        score: submission.score,
//        maxScore: assignment.points_possible || 100,
//        percentage: (submission.score / (assignment.points_possible || 100)) * 100,
//        subject: course.name,
//        topic: assignment.name,
//        // Derive mastery delta from score percentage
//        mastery_delta: (submission.score / (assignment.points_possible || 100)) * 0.1,
//      },
//    });
//
// 2. After a new assignment is detected (inside syncAssignmentsAndGrades):
//
//    await emitCanvasBrainSignal({
//      userId,
//      signalType: 'canvas_assignment_added',
//      courseId: `canvas-${course.id}`,
//      assignmentId: assignmentRecord.id,
//      metadata: {
//        dueDate: assignment.due_at,
//        pointsPossible: assignment.points_possible,
//        subject: course.name,
//        topic: assignment.name,
//      },
//    });
//
// 3. After full sync completes (at the end of syncCanvasData):
//
//    await emitCanvasBrainSignal({
//      userId,
//      signalType: 'canvas_sync_complete',
//      metadata: {
//        coursesCount: courses.length,
//        syncedAt: new Date().toISOString(),
//      },
//    });
