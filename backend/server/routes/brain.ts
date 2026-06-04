import { Router, Request, Response } from 'express';
import { asyncHandler, createBrainError, createNotFoundError } from '../utils/error-handler';
import { AgentOrchestrator } from '../services/agent-orchestrator';
import { CausalInferenceEngine } from '../services/causal-inference';
import { PredictionEngine } from '../services/prediction-engine';
import { InterventionEngine } from '../services/intervention-engine';

const router = Router();
const orchestrator = new AgentOrchestrator();
const causalEngine = new CausalInferenceEngine();
const predictionEngine = new PredictionEngine();
const interventionEngine = new InterventionEngine();

/**
 * GET /api/brain/status
 * Get brain system status
 */
router.get('/status', asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.query;
  
  if (!userId) {
    throw createBrainError('userId is required');
  }

  const status = await orchestrator.getBrainStatus(userId as string);
  res.json(status);
}));

/**
 * POST /api/brain/process
 * Process user input through the brain
 */
router.post('/process', asyncHandler(async (req: Request, res: Response) => {
  const { userId, input, context } = req.body;

  if (!userId || !input) {
    throw createBrainError('userId and input are required');
  }

  const result = await orchestrator.processUserInput(userId, input, context);
  res.json(result);
}));

/**
 * GET /api/brain/signals/:userId
 * Get all signals for a user
 */
router.get('/signals/:userId', asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;

  const signals = await orchestrator.getUserSignals(userId);
  res.json({ signals });
}));

/**
 * POST /api/brain/causal-analysis
 * Run causal inference on user data
 */
router.post('/causal-analysis', asyncHandler(async (req: Request, res: Response) => {
  const { userId, variables } = req.body;

  if (!userId || !variables) {
    throw createBrainError('userId and variables are required');
  }

  const analysis = await causalEngine.analyzeRelationships(userId, variables);
  res.json(analysis);
}));

/**
 * POST /api/brain/predict
 * Get predictions from prediction engine
 */
router.post('/predict', asyncHandler(async (req: Request, res: Response) => {
  const { userId, context } = req.body;

  if (!userId) {
    throw createBrainError('userId is required');
  }

  const predictions = await predictionEngine.generatePredictions(userId, context);
  res.json(predictions);
}));

/**
 * POST /api/brain/intervene
 * Get intervention recommendations
 */
router.post('/intervene', asyncHandler(async (req: Request, res: Response) => {
  const { userId, situation, severity } = req.body;

  if (!userId || !situation) {
    throw createBrainError('userId and situation are required');
  }

  const interventions = await interventionEngine.getInterventions(userId, situation, severity);
  res.json(interventions);
}));

/**
 * GET /api/brain/insights/:userId
 * Get AI-generated insights about user
 */
router.get('/insights/:userId', asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;

  const insights = await orchestrator.generateInsights(userId);
  res.json(insights);
}));

/**
 * POST /api/brain/feedback
 * Submit feedback to improve brain
 */
router.post('/feedback', asyncHandler(async (req: Request, res: Response) => {
  const { userId, feedbackType, content, context } = req.body;

  if (!userId || !feedbackType || !content) {
    throw createBrainError('userId, feedbackType, and content are required');
  }

  await orchestrator.processFeedback(userId, feedbackType, content, context);
  res.json({ success: true, message: 'Feedback processed' });
}));

export default router;
