import pino from 'pino';

export function createLogger(config) {
  return pino({
    level: config.logLevel,
    base: undefined,
    redact: ['req.headers.authorization', 'req.headers["x-api-key"]', 'req.headers.cookie'],
    // Dev: một dòng dễ đọc. Production: JSON để docker/loki thu thập.
    ...(config.isProduction ? {} : { timestamp: pino.stdTimeFunctions.isoTime }),
  });
}
