/**
 * Canvas Sync Service
 * 
 * Synchronizes Canvas data with unified brain:
 * - Pulls assignments, grades, submissions from Canvas
 * - Records outcome signals with product context
 * - Updates knowledge graph based on grades
 * - Generates insights from Canvas data
 */

import { createClient } from '@supabase/supabase-js';
import CanvasAPIClient from './canvas-api';
import BrainCompoundingEngine from './brain-compounding';

export class CanvasSyncService {
  private supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
  );
  private brainEngine = new BrainCompoundingEngine();

  /**
   * Sync all Canvas data for a user (with product context)
   */
  async syncCanvasData(userId: string, product: string = 'reggie'): Promise<void> {
    try {
      // Get Canvas token
      const { data: token } = await this.supabase
        .from('canvas_oauth_tokens')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!token) {
        console.log(`No Canvas token found for user ${userId}`);
        return;
      }

      // Initialize Canvas client
      const canvasClient = new CanvasAPIClient({
        instanceUrl: token.canvas_instance_url,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: token.expires_at ? new Date(token.expires_at) : undefined,
      });

      // Sync courses
      await this.syncCourses(userId, canvasClient, product);

      // Sync assignments and grades
      await this.syncAssignmentsAndGrades(userId, canvasClient, product);

      // Log sync event
      await this.logSyncEvent(userId, product, 'success');
    } catch (error) {
      console.error(`Error syncing Canvas data for user ${userId}:`, error);
      await this.logSyncEvent(userId, product, 'error', String(error));
      throw error;
    }
  }

  /**
   * Sync courses from Canvas
   */
  private async syncCourses(
    userId: string,
    canvasClient: CanvasAPIClient,
    product: string
  ): Promise<void> {
    try {
      const courses = await canvasClient.getCourses();

      for (const course of courses) {
        // Upsert course
        const { error } = await this.supabase.from('courses').upsert(
          {
            id: `canvas-${course.id}`,
            name: course.name,
            code: course.course_code,
            canvas_id: course.id,
            product,
          },
          {
            onConflict: 'canvas_id',
          }
        );

        if (error) {
          console.error(`Error upserting course ${course.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error syncing courses:', error);
    }
  }

  /**
   * Sync assignments and grades from Canvas
   */
  private async syncAssignmentsAndGrades(
    userId: string,
    canvasClient: CanvasAPIClient,
    product: string
  ): Promise<void> {
    try {
      const courses = await canvasClient.getCourses();

      for (const course of courses) {
        // Get assignments
        const assignments = await canvasClient.getAssignments(course.id);

        for (const assignment of assignments) {
          // Upsert assignment
          const { data: assignmentRecord, error: assignmentError } = await this.supabase
            .from('assignments')
            .upsert(
              {
                id: `canvas-${assignment.id}`,
                name: assignment.name,
                description: assignment.description,
                due_date: assignment.due_at,
                points_possible: assignment.points_possible,
                canvas_id: assignment.id,
                course_id: `canvas-${course.id}`,
                product,
              },
              {
                onConflict: 'canvas_id',
              }
            )
            .select()
            .single();

          if (assignmentError) {
            console.error(`Error upserting assignment ${assignment.id}:`, assignmentError);
            continue;
          }

          // Get user submission
          try {
            const submission = await canvasClient.getUserSubmission(
              course.id,
              assignment.id,
              parseInt(userId)
            );

            if (submission && submission.score !== null) {
              // Record outcome signal
              await this.brainEngine.processSignal({
                type: 'outcome',
                userId,
                courseId: `canvas-${course.id}`,
                data: {
                  assignmentId: assignmentRecord.id,
                  score: submission.score,
                  maxScore: assignment.points_possible || 100,
                  timeSpent: 0, // Canvas doesn't provide this
                  submittedAt: submission.submitted_at,
                  gradedAt: submission.submitted_at, // Use submitted_at
                  product,
                },
              });

              // Upsert grade
              await this.supabase.from('grades').upsert(
                {
                  id: `canvas-${submission.id}`,
                  assignment_id: assignmentRecord.id,
                  score: submission.score,
                  grade: submission.grade,
                  submitted_at: submission.submitted_at,
                  graded_at: submission.submitted_at, // Use submitted_at as graded_at
                  canvas_id: submission.id,
                  product,
                },
                {
                  onConflict: 'canvas_id',
                }
              );
            }
          } catch (submissionError) {
            console.error(
              `Error getting submission for assignment ${assignment.id}:`,
              submissionError
            );
          }
        }
      }
    } catch (error) {
      console.error('Error syncing assignments and grades:', error);
    }
  }

  /**
   * Log sync event
   */
  private async logSyncEvent(
    userId: string,
    product: string,
    status: string,
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.supabase.from('canvas_sync_logs').insert({
        user_id: userId,
        product,
        status,
        error_message: errorMessage,
        synced_at: new Date(),
      });
    } catch (error) {
      console.error('Error logging sync event:', error);
    }
  }

  /**
   * Get last sync time for user
   */
  async getLastSyncTime(userId: string, product: string): Promise<Date | null> {
    try {
      const { data } = await this.supabase
        .from('canvas_sync_logs')
        .select('synced_at')
        .eq('user_id', userId)
        .eq('product', product)
        .eq('status', 'success')
        .order('synced_at', { ascending: false })
        .limit(1)
        .single();

      return data ? new Date(data.synced_at) : null;
    } catch (error) {
      console.error('Error getting last sync time:', error);
      return null;
    }
  }

  /**
   * Schedule periodic sync
   */
  async scheduleSyncJob(userId: string, product: string, intervalMinutes: number = 60): Promise<void> {
    try {
      // In production, use a job queue (Bull, Agenda, etc.)
      // For now, just log the schedule
      console.log(
        `Scheduled Canvas sync for user ${userId} (${product}) every ${intervalMinutes} minutes`
      );

      // Set up interval
      setInterval(async () => {
        await this.syncCanvasData(userId, product);
      }, intervalMinutes * 60 * 1000);
    } catch (error) {
      console.error('Error scheduling sync job:', error);
    }
  }
}

export default CanvasSyncService;
