/**
 * Canvas LMS Integration Routes
 * 
 * Endpoints for Canvas OAuth, data sync, and real-time updates
 */

import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import CanvasOAuthService from '../services/canvas-oauth';
import CanvasSyncService from '../services/canvas-sync';
import CanvasAPIClient from '../services/canvas-api';

const router = Router();
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.VITE_SUPABASE_ANON_KEY || ''
);

const oauthService = new CanvasOAuthService({
  clientId: process.env.CANVAS_CLIENT_ID || '',
  clientSecret: process.env.CANVAS_CLIENT_SECRET || '',
  redirectUri: process.env.CANVAS_REDIRECT_URI || 'http://localhost:3000/api/canvas/callback',
  canvasInstanceUrl: process.env.CANVAS_INSTANCE_URL || 'https://canvas.instructure.com',
});

const syncService = new CanvasSyncService();

/**
 * GET /api/canvas/auth
 * Generate Canvas OAuth authorization URL
 */
router.get('/auth', (req: Request, res: Response) => {
  try {
    const state = Math.random().toString(36).substring(7);
    const authUrl = oauthService.getAuthorizationUrl(state);
    
    // Store state in session for verification
    req.session = req.session || {};
    req.session.oauthState = state;
    
    res.json({ authUrl });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

/**
 * GET /api/canvas/callback
 * Handle Canvas OAuth callback
 */
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;
    
    // Verify state
    if (state !== req.session?.oauthState) {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }
    
    if (!code) {
      return res.status(400).json({ error: 'No authorization code provided' });
    }
    
    // Exchange code for token
    const tokenResponse = await oauthService.exchangeCodeForToken(code as string);
    
    // Get user ID from session or JWT
    const userId = req.user?.id || req.body.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Store token in database
    await oauthService.storeToken(
      userId,
      tokenResponse.access_token,
      tokenResponse.refresh_token,
      tokenResponse.expires_in
    );
    
    // Trigger initial sync
    await syncService.syncCanvasData(userId, 'fschoolai');
    
    // Redirect to success page
    res.redirect('/canvas/connected');
  } catch (error) {
    console.error('Error in Canvas callback:', error);
    res.status(500).json({ error: 'Failed to complete Canvas authentication' });
  }
});

/**
 * POST /api/canvas/sync
 * Manually trigger Canvas data sync
 */
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.body.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    await syncService.syncCanvasData(userId, 'fschoolai');
    res.json({ message: 'Canvas sync completed' });
  } catch (error) {
    console.error('Error syncing Canvas data:', error);
    res.status(500).json({ error: 'Failed to sync Canvas data' });
  }
});

/**
 * GET /api/canvas/courses
 * Get all Canvas courses for user
 */
router.get('/courses', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.query.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Get Canvas token
    const token = await oauthService.getValidToken(userId as string);
    if (!token) {
      return res.status(401).json({ error: 'Canvas not connected' });
    }
    
    // Get Canvas instance URL
    const { data: tokenData } = await supabase
      .from('canvas_oauth_tokens')
      .select('canvas_instance_url')
      .eq('user_id', userId)
      .single();
    
    if (!tokenData) {
      return res.status(400).json({ error: 'Canvas instance URL not found' });
    }
    
    const canvasClient = new CanvasAPIClient({
      instanceUrl: tokenData.canvas_instance_url,
      accessToken: token,
    });
    
    const courses = await canvasClient.getCourses();
    res.json({ courses });
  } catch (error) {
    console.error('Error fetching Canvas courses:', error);
    res.status(500).json({ error: 'Failed to fetch Canvas courses' });
  }
});

/**
 * GET /api/canvas/assignments/:courseId
 * Get assignments for a Canvas course
 */
router.get('/assignments/:courseId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.query.userId;
    const { courseId } = req.params;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Get Canvas token
    const token = await oauthService.getValidToken(userId as string);
    if (!token) {
      return res.status(401).json({ error: 'Canvas not connected' });
    }
    
    // Get Canvas instance URL
    const { data: tokenData } = await supabase
      .from('canvas_oauth_tokens')
      .select('canvas_instance_url')
      .eq('user_id', userId)
      .single();
    
    if (!tokenData) {
      return res.status(400).json({ error: 'Canvas instance URL not found' });
    }
    
    const canvasClient = new CanvasAPIClient({
      instanceUrl: tokenData.canvas_instance_url,
      accessToken: token,
    });
    
    const assignments = await canvasClient.getAssignments(parseInt(courseId));
    res.json({ assignments });
  } catch (error) {
    console.error('Error fetching Canvas assignments:', error);
    res.status(500).json({ error: 'Failed to fetch Canvas assignments' });
  }
});

/**
 * GET /api/canvas/grades/:courseId
 * Get grades for a Canvas course
 */
router.get('/grades/:courseId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.query.userId;
    const { courseId } = req.params;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Get Canvas token
    const token = await oauthService.getValidToken(userId as string);
    if (!token) {
      return res.status(401).json({ error: 'Canvas not connected' });
    }
    
    // Get Canvas instance URL
    const { data: tokenData } = await supabase
      .from('canvas_oauth_tokens')
      .select('canvas_instance_url')
      .eq('user_id', userId)
      .single();
    
    if (!tokenData) {
      return res.status(400).json({ error: 'Canvas instance URL not found' });
    }
    
    const canvasClient = new CanvasAPIClient({
      instanceUrl: tokenData.canvas_instance_url,
      accessToken: token,
    });
    
    const grades = await canvasClient.getGrades(parseInt(courseId));
    res.json({ grades });
  } catch (error) {
    console.error('Error fetching Canvas grades:', error);
    res.status(500).json({ error: 'Failed to fetch Canvas grades' });
  }
});

/**
 * GET /api/canvas/status
 * Get Canvas connection status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.query.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const token = await oauthService.getToken(userId as string);
    const lastSync = await syncService.getLastSyncTime(userId as string, 'fschoolai');
    
    res.json({
      connected: !!token,
      lastSync,
      expiresAt: token?.expiresAt,
    });
  } catch (error) {
    console.error('Error checking Canvas status:', error);
    res.status(500).json({ error: 'Failed to check Canvas status' });
  }
});

/**
 * POST /api/canvas/disconnect
 * Disconnect Canvas account
 */
router.post('/disconnect', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.body.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    await oauthService.revokeToken(userId);
    res.json({ message: 'Canvas disconnected' });
  } catch (error) {
    console.error('Error disconnecting Canvas:', error);
    res.status(500).json({ error: 'Failed to disconnect Canvas' });
  }
});

export default router;
