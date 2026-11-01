import { rateLimit } from 'express-rate-limit';
import { HttpError, ErrorCodes } from '../utils/http-error.js';

export function createLimiter({ limit, windowMs = 60_000 }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new HttpError(429, 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút', { code: ErrorCodes.RATE_LIMITED })),
  });
}
