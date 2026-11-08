import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { createApiRouter } from './routes/index.js';
import { clientId } from './middlewares/client-id.js';
import { createLimiter } from './middlewares/rate-limit.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';

/**
 * Tạo ứng dụng Express. Mọi phụ thuộc (config, logger, services) được truyền vào
 * nên có thể thay bằng bản giả khi viết test.
 */
export function createApp({ config, logger, services }) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigins.includes('*') ? true : config.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));
  app.use(clientId);

  app.use('/api', createLimiter({ limit: config.rateLimitPerMin }), createApiRouter({ services, config }));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
