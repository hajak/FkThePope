import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from '@fkthepope/shared';
import { setupSocketHandlers } from './socket/socket-handlers.js';
import { AnalyticsManager, createAnalyticsRouter } from './analytics/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT ?? 3001;
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>(httpServer, {
  cors: {
    origin: isProduction ? true : (process.env.CLIENT_URL ?? 'http://localhost:5173'),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  // Heartbeat settings for detecting stale connections
  pingTimeout: 20000,    // How long to wait for pong response
  pingInterval: 10000,   // How often to send ping
});

// Parse JSON bodies for API routes
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Analytics API routes
app.use('/api/analytics', createAnalyticsRouter());

// Serve static files in production
if (isProduction) {
  const clientDist = join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));

  // SPA fallback - serve index.html for all non-API/socket routes
  app.get('*', (req, res, next) => {
    // Don't intercept socket.io requests
    if (req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(join(clientDist, 'index.html'));
  });
}

// Initialize analytics and start server
async function start() {
  // Initialize analytics
  await AnalyticsManager.getInstance().initialize();

  // Setup socket handlers
  setupSocketHandlers(io);

  httpServer.listen(PORT, () => {
    console.log(`Online Whist server running on port ${PORT}`);
    console.log(`Environment: ${isProduction ? 'production' : 'development'}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, saving analytics...');
    const analytics = AnalyticsManager.getInstance();
    analytics.forceSave();
    analytics.close();
    process.exit(0);
  });
}

start().catch(console.error);
