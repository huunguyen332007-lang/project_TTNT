import { createHash, timingSafeEqual } from 'node:crypto';
import { HttpError, ErrorCodes } from '../utils/http-error.js';

const digest = (value) => createHash('sha256').update(String(value)).digest();

/** Bảo vệ endpoint quản trị bằng khóa X-Api-Key (so sánh thời gian hằng số). */
export const requireAdmin = (config) => (req, _res, next) => {
  if (!config.adminApiKey) {
    return next(new HttpError(503, 'Chức năng quản trị chưa được bật (thiếu ADMIN_API_KEY)', { code: 'ADMIN_DISABLED' }));
  }
  if (!timingSafeEqual(digest(req.get('x-api-key') ?? ''), digest(config.adminApiKey))) {
    return next(new HttpError(401, 'Khóa API không hợp lệ', { code: ErrorCodes.UNAUTHORIZED }));
  }
  next();
};
