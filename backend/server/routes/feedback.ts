// ============================================================
// Feedback Route
// POST /api/feedback/agent
//
// Called by the FschoolAI frontend after every agent response.
// The UI shows a simple thumbs up / thumbs down after Reggie responds.
// This endpoint records the feedback and feeds it into the brain.
// ============================================================

import { Router, Request, Response } from 'express';
import { agentFeedback, FeedbackRating } from '../services/agent-feedback';

const router = Router();

// POST /api/feedback/agent
router.post('/agent', async (req: Request, res: Response) => {
  const { userId, sessionId, agentType, rating, comment, courseId, assignmentId } = req.body;

  if (!userId || !sessionId || !agentType || !rating) {
    return res.status(400).json({
      error: 'userId, sessionId, agentType, and rating are required',
    });
  }

  const validRatings: FeedbackRating[] = ['helpful', 'not_helpful', 'partially_helpful'];
  if (!validRatings.includes(rating as FeedbackRating)) {
    return res.status(400).json({
      error: `rating must be one of: ${validRatings.join(', ')}`,
    });
  }

  const result = await agentFeedback.submitFeedback({
    userId,
    sessionId,
    agentType,
    rating: rating as FeedbackRating,
    comment,
    courseId,
    assignmentId,
  });

  if (!result.success) {
    return res.status(500).json({ error: 'Failed to record feedback' });
  }

  return res.json({ success: true, message: 'Feedback recorded — brain updated' });
});

// GET /api/feedback/agent/performance/:userId
// Returns per-agent performance scores for a user (used by Reggie for routing)
router.get('/agent/performance/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const performance = await agentFeedback.getAgentPerformance(userId);
  return res.json({ userId, agentPerformance: performance });
});

export default router;
