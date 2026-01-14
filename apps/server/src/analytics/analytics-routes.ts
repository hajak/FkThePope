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
  router.get('/dashboard', (_req, res) => {
    const manager = AnalyticsManager.getInstance();
    const data = manager.getDashboardData();
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

  return router;
}
