/**
 * Canvas API Integration Service
 * 
 * Handles all Canvas API interactions including:
 * - OAuth authentication and token management
 * - Assignment fetching and syncing
 * - Grade retrieval
 * - Course information
 * - Real-time sync with Canvas
 */

import axios, { AxiosInstance } from 'axios';

interface CanvasConfig {
  instanceUrl: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

interface CanvasAssignment {
  id: number;
  name: string;
  description?: string;
  due_at?: string;
  points_possible?: number;
  submission_types?: string[];
  course_id: number;
}

interface CanvasGrade {
  id: number;
  assignment_id: number;
  score?: number;
  grade?: string;
  submitted_at?: string;
  graded_at?: string;
}

interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  term?: {
    id: number;
    name: string;
  };
}

interface CanvasSubmission {
  id: number;
  assignment_id: number;
  user_id: number;
  submitted_at?: string;
  grade?: string;
  score?: number;
  attempt: number;
}

export class CanvasAPIClient {
  private client: AxiosInstance;
  private config: CanvasConfig;

  constructor(config: CanvasConfig) {
    this.config = config;
    
    this.client = axios.create({
      baseURL: `${config.instanceUrl}/api/v1`,
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expired - would need refresh
          throw new Error('Canvas token expired. Please re-authenticate.');
        }
        throw error;
      }
    );
  }

  /**
   * Get all courses for the authenticated user
   */
  async getCourses(): Promise<CanvasCourse[]> {
    try {
      const response = await this.client.get('/courses', {
        params: {
          per_page: 100,
          enrollment_state: 'active',
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching Canvas courses:', error);
      throw error;
    }
  }

  /**
   * Get assignments for a specific course
   */
  async getAssignments(courseId: number): Promise<CanvasAssignment[]> {
    try {
      const response = await this.client.get(`/courses/${courseId}/assignments`, {
        params: {
          per_page: 100,
          include: ['submission'],
        },
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching assignments for course ${courseId}:`, error);
      throw error;
    }
  }

  /**
   * Get a specific assignment with details
   */
  async getAssignment(courseId: number, assignmentId: number): Promise<CanvasAssignment> {
    try {
      const response = await this.client.get(
        `/courses/${courseId}/assignments/${assignmentId}`
      );
      return response.data;
    } catch (error) {
      console.error(`Error fetching assignment ${assignmentId}:`, error);
      throw error;
    }
  }

  /**
   * Get submissions for an assignment
   */
  async getSubmissions(
    courseId: number,
    assignmentId: number
  ): Promise<CanvasSubmission[]> {
    try {
      const response = await this.client.get(
        `/courses/${courseId}/assignments/${assignmentId}/submissions`,
        {
          params: {
            per_page: 100,
            include: ['submission_history', 'submission_comments'],
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        `Error fetching submissions for assignment ${assignmentId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get user submission for an assignment
   */
  async getUserSubmission(
    courseId: number,
    assignmentId: number,
    userId: number
  ): Promise<CanvasSubmission> {
    try {
      const response = await this.client.get(
        `/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
        {
          params: {
            include: ['submission_history', 'submission_comments'],
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        `Error fetching submission for user ${userId} on assignment ${assignmentId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get grades for a course
   */
  async getGrades(courseId: number): Promise<CanvasGrade[]> {
    try {
      const response = await this.client.get(`/courses/${courseId}/assignments`, {
        params: {
          per_page: 100,
          include: ['submission'],
        },
      });
      
      // Extract grades from assignments
      const grades: CanvasGrade[] = [];
      for (const assignment of response.data) {
        if (assignment.submission) {
          grades.push({
            id: assignment.submission.id,
            assignment_id: assignment.id,
            score: assignment.submission.score,
            grade: assignment.submission.grade,
            submitted_at: assignment.submission.submitted_at,
            graded_at: assignment.submission.graded_at,
          });
        }
      }
      return grades;
    } catch (error) {
      console.error(`Error fetching grades for course ${courseId}:`, error);
      throw error;
    }
  }

  /**
   * Get course details
   */
  async getCourseDetails(courseId: number): Promise<CanvasCourse> {
    try {
      const response = await this.client.get(`/courses/${courseId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching course details for ${courseId}:`, error);
      throw error;
    }
  }

  /**
   * Sync all data for a user (courses, assignments, grades)
   */
  async syncAllData(): Promise<{
    courses: CanvasCourse[];
    assignments: Map<number, CanvasAssignment[]>;
    grades: Map<number, CanvasGrade[]>;
  }> {
    try {
      const courses = await this.getCourses();
      const assignments = new Map<number, CanvasAssignment[]>();
      const grades = new Map<number, CanvasGrade[]>();

      // Fetch assignments and grades for each course
      for (const course of courses) {
        const courseAssignments = await this.getAssignments(course.id);
        const courseGrades = await this.getGrades(course.id);
        
        assignments.set(course.id, courseAssignments);
        grades.set(course.id, courseGrades);
      }

      return { courses, assignments, grades };
    } catch (error) {
      console.error('Error syncing all Canvas data:', error);
      throw error;
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(): boolean {
    if (!this.config.expiresAt) return false;
    return new Date() > this.config.expiresAt;
  }

  /**
   * Update token (for refresh scenarios)
   */
  updateToken(newToken: string, expiresAt?: Date): void {
    this.config.accessToken = newToken;
    if (expiresAt) {
      this.config.expiresAt = expiresAt;
    }
    this.client.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
  }
}

export default CanvasAPIClient;
