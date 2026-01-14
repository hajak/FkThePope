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

  return router;
}
