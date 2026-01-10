import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer } from 'http';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin.js';
import { telegramRouter } from './routes/telegram.js';
import { chatRouter } from './routes/chat.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { createSocketServer } from './socketServer.js';

export const buildServer = () => {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'jani-backend' });
  });

  app.use('/api', publicRouter);
  app.use('/api/chats', chatRouter);
  app.use('/api/admin', adminRouter);
  app.use('/telegram/webhook', telegramRouter);

  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Request error', {
      path: req.path,
      method: req.method,
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ message: 'Internal error', error: err.message });
  });

  return app;
};

export const startServer = async () => {
  const app = buildServer();
  const httpServer = createServer(app);

  // Attach Socket.IO to HTTP server
  const io = createSocketServer(httpServer);
  logger.info('Socket.IO attached to HTTP server');

  return new Promise<void>((resolve) => {
    httpServer.listen(config.port, () => {
      logger.info(`API + WebSocket listening on port ${config.port}`);
      resolve();
    });
  });
};

