import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from '@fkthepope/shared';
import { setupSocketHandlers } from './socket/socket-handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT ?? 3001;
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>(httpServer, {
  cors: {
    origin: isProduction ? undefined : (process.env.CLIENT_URL ?? 'http://localhost:5173'),
    methods: ['GET', 'POST'],
  },
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
if (isProduction) {
  const clientDist = join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
}

// Setup socket handlers
setupSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`FkThePope server running on port ${PORT}`);
  console.log(`Environment: ${isProduction ? 'production' : 'development'}`);
});
