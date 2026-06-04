/**
 * Brain Scheduler Initialization
 * Import this in server/index.ts to start the autonomous brain on server startup.
 * 
 * Add to server/index.ts:
 *   import './services/brain-scheduler-init';
 */

import { brainScheduler } from './brain-scheduler';

// Start the autonomous brain scheduler when the server starts
brainScheduler.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[BrainScheduler] SIGTERM received — stopping scheduler...');
  brainScheduler.stop();
});

process.on('SIGINT', () => {
  console.log('[BrainScheduler] SIGINT received — stopping scheduler...');
  brainScheduler.stop();
});

export { brainScheduler };
