import express from 'express';
import cors from 'cors';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin.js';
import { telegramRouter } from './routes/telegram.js';
import { config } from './config.js';
import { logger } from './logger.js';

export const buildServer = () => {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'jani-backend' });
  });

  app.use('/api', publicRouter);
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
  return new Promise<void>((resolve) => {
    app.listen(config.port, () => {
      logger.info(`API listening on port ${config.port}`);
      resolve();
    });
  });
};
