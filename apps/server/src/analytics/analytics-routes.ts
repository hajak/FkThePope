import { Router } from 'express';
import { AnalyticsManager } from './analytics-manager.js';
import {
  analyticsAuthMiddleware,
  analyticsLoginHandler,
  analyticsLogoutHandler,
} from './analytics-middleware.js';

export function createAnalyticsRouter(): Router {
  const router = Router();

  // Public: Login endpoint
  router.post('/login', analyticsLoginHandler);

  // Protected routes - require authentication
  router.use(analyticsAuthMiddleware);

  // Logout
  router.post('/logout', analyticsLogoutHandler);

  // GET /api/analytics/dashboard - Main dashboard data
  // Query params: ?period=7d|30d|all (default: 7d)
  router.get('/dashboard', (req, res) => {
    const manager = AnalyticsManager.getInstance();
    const period = (req.query.period as string) || '7d';
    // Validate period
    const validPeriods = ['7d', '30d', 'all'];
    const validatedPeriod = validPeriods.includes(period) ? period as '7d' | '30d' | 'all' : '7d';
    const data = manager.getDashboardData(validatedPeriod);
    res.json(data);
  });

  // GET /api/analytics/health - Check if analytics is working
  router.get('/health', (_req, res) => {
    const manager = AnalyticsManager.getInstance();
    res.json({
      status: 'ok',
      activeGames: manager.getActiveGameCount(),
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/analytics/errors - Get recent error logs
  router.get('/errors', (req, res) => {
    const manager = AnalyticsManager.getInstance();
    const limit = parseInt(req.query.limit as string) || 100;
    const errors = manager.getErrorLogs(Math.min(limit, 500));
    res.json({ errors });
  });

  // GET /api/analytics/events - Get recent session events
  router.get('/events', (req, res) => {
    const manager = AnalyticsManager.getInstance();
    const limit = parseInt(req.query.limit as string) || 200;
    const events = manager.getRecentSessionEvents(Math.min(limit, 1000));
    res.json({ events });
  });

  // GET /api/analytics/session/:sessionId/events - Get events for a specific session
  router.get('/session/:sessionId/events', (req, res) => {
    const manager = AnalyticsManager.getInstance();
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit as string) || 500;
    const events = manager.getSessionEvents(sessionId, Math.min(limit, 1000));
    res.json({ events });
  });

  return router;
}
