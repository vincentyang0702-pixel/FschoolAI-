/**
 * Agent API Endpoints
 * 
 * Exposes all agent functionality through REST API
 */

import express, { Router, Request, Response } from 'express';
import { 
  StudyAgent,
  FocusAgent,
  MotivationAgent,
  PerformanceAgent,
  ProblemSolverAgent,
  SynthesisAgent,
  PersonalizationAgent,
  ReflectionAgent,
  RecommendationAgent,
  EscalationAgent,
  AGENT_REGISTRY,
  AgentType,
} from '../agents';

const router = Router();

// Initialize agents
const agents = {
  study: new StudyAgent(),
  focus: new FocusAgent(),
  motivation: new MotivationAgent(),
  performance: new PerformanceAgent(),
  problemSolver: new ProblemSolverAgent(),
  synthesis: new SynthesisAgent(),
  personalization: new PersonalizationAgent(),
  reflection: new ReflectionAgent(),
  recommendation: new RecommendationAgent(),
  escalation: new EscalationAgent(),
};

/**
 * GET /api/agents
 * List all available agents
 */
router.get('/', (req: Request, res: Response) => {
  res.json({
    agents: Object.entries(AGENT_REGISTRY).map(([key, value]) => ({
      id: key,
      ...value,
    })),
  });
});

/**
 * POST /api/agents/study
 * Request study explanation
 */
router.post('/study', async (req: Request, res: Response) => {
  try {
    const { userId, topic, currentUnderstanding, learningStyle, difficulty } = req.body;
    
    const response = await agents.study.process({
      userId,
      topic,
      currentUnderstanding,
      learningStyle,
      difficulty,
    });
    
    res.json(response);
  } catch (error) {
    console.error('Error in study agent:', error);
    res.status(500).json({ error: 'Failed to process study request' });
  }
});

/**
 * POST /api/agents/focus
 * Get focus assistance
 */
router.post('/focus', async (req: Request, res: Response) => {
  try {
    const { userId, action } = req.body;
    
    if (action === 'detect') {
      const focusLevel = await agents.focus.detectFocusLevel(userId);
      res.json(focusLevel);
    } else if (action === 'enable') {
      const { duration } = req.body;
      await agents.focus.enableFocusMode(userId, duration);
      res.json({ success: true, message: 'Focus mode enabled' });
    }
  } catch (error) {
    console.error('Error in focus agent:', error);
    res.status(500).json({ error: 'Failed to process focus request' });
  }
});

/**
 * POST /api/agents/motivation
 * Get motivation boost
 */
router.post('/motivation', async (req: Request, res: Response) => {
  try {
    const { userId, context } = req.body;
    
    const response = await agents.motivation.process(userId, context);
    res.json({ message: response });
  } catch (error) {
    console.error('Error in motivation agent:', error);
    res.status(500).json({ error: 'Failed to process motivation request' });
  }
});

/**
 * GET /api/agents/performance
 * Get performance analysis
 */
router.get('/performance', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    
    const response = await agents.performance.process(userId as string);
    res.json(response);
  } catch (error) {
    console.error('Error in performance agent:', error);
    res.status(500).json({ error: 'Failed to get performance data' });
  }
});

/**
 * POST /api/agents/problem-solver
 * Get help solving a problem
 */
router.post('/problem-solver', async (req: Request, res: Response) => {
  try {
    const { userId, problem } = req.body;
    
    const response = await agents.problemSolver.process(userId, problem);
    res.json(response);
  } catch (error) {
    console.error('Error in problem solver agent:', error);
    res.status(500).json({ error: 'Failed to process problem' });
  }
});

/**
 * POST /api/agents/synthesis
 * Connect concepts
 */
router.post('/synthesis', async (req: Request, res: Response) => {
  try {
    const { userId, concepts } = req.body;
    
    const response = await agents.synthesis.process(userId, concepts);
    res.json(response);
  } catch (error) {
    console.error('Error in synthesis agent:', error);
    res.status(500).json({ error: 'Failed to synthesize concepts' });
  }
});

/**
 * POST /api/agents/personalization
 * Get personalized learning path
 */
router.post('/personalization', async (req: Request, res: Response) => {
  try {
    const { userId, topic } = req.body;
    
    const response = await agents.personalization.process(userId, topic);
    res.json(response);
  } catch (error) {
    console.error('Error in personalization agent:', error);
    res.status(500).json({ error: 'Failed to personalize learning' });
  }
});

/**
 * POST /api/agents/reflection
 * Consolidate learning
 */
router.post('/reflection', async (req: Request, res: Response) => {
  try {
    const { userId, sessionData } = req.body;
    
    const response = await agents.reflection.process(userId, sessionData);
    res.json(response);
  } catch (error) {
    console.error('Error in reflection agent:', error);
    res.status(500).json({ error: 'Failed to reflect on learning' });
  }
});

/**
 * GET /api/agents/recommendation
 * Get next learning recommendation
 */
router.get('/recommendation', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    
    const response = await agents.recommendation.process(userId as string);
    res.json(response);
  } catch (error) {
    console.error('Error in recommendation agent:', error);
    res.status(500).json({ error: 'Failed to get recommendation' });
  }
});

/**
 * POST /api/agents/escalation
 * Check if escalation needed
 */
router.post('/escalation', async (req: Request, res: Response) => {
  try {
    const { userId, context } = req.body;
    
    const response = await agents.escalation.process(userId, context);
    res.json(response);
  } catch (error) {
    console.error('Error in escalation agent:', error);
    res.status(500).json({ error: 'Failed to process escalation' });
  }
});

/**
 * POST /api/agents/request
 * Generic agent request (orchestrator decides which agent to use)
 */
router.post('/request', async (req: Request, res: Response) => {
  try {
    const { userId, message, context } = req.body;
    
    // Orchestrator would analyze message and select appropriate agent
    // For now, return a generic response
    
    res.json({
      agentUsed: 'study',
      response: 'Processing your request...',
      confidence: 0.8,
    });
  } catch (error) {
    console.error('Error in agent request:', error);
    res.status(500).json({ error: 'Failed to process agent request' });
  }
});

export default router;
