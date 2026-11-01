import { HttpError, ErrorCodes } from '../utils/http-error.js';

/**
 * Kiểm tra params/query/body bằng zod. Kết quả đã ép kiểu nằm ở req.valid.
 * (Express 5 không cho gán lại req.query nên không ghi đè req.* như các phiên bản cũ.)
 */
export const validate = (schemas) => (req, _res, next) => {
  const valid = {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(new HttpError(400, details[0]?.message ?? 'Dữ liệu gửi lên không hợp lệ', { code: ErrorCodes.VALIDATION, details }));
    }
    valid[part] = result.data;
  }
  req.valid = valid;
  next();
};
