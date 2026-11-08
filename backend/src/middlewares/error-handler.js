import multer from 'multer';
import { HttpError, ErrorCodes } from '../utils/http-error.js';

export function notFoundHandler(_req, _res, next) {
  next(new HttpError(404, 'Đường dẫn không tồn tại', { code: ErrorCodes.NOT_FOUND }));
}

/** Chuẩn hóa mọi lỗi về dạng { error: { code, message, details? } }. */
export function errorHandler(logger) {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);

    let status = 500;
    let code = ErrorCodes.INTERNAL;
    let message = 'Đã có lỗi ở máy chủ, vui lòng thử lại sau';
    let details;

    if (err instanceof HttpError) {
      ({ status, code, message, details } = err);
    } else if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        status = 413;
        code = ErrorCodes.FILE_TOO_LARGE;
        message = 'Ảnh quá lớn, vui lòng chọn ảnh nhỏ hơn';
      } else {
        status = 400;
        code = ErrorCodes.VALIDATION;
        message = 'Dữ liệu tải lên không hợp lệ';
      }
    } else if (err?.type === 'entity.parse.failed') {
      status = 400;
      code = ErrorCodes.VALIDATION;
      message = 'Nội dung JSON không hợp lệ';
    } else if (err?.type === 'entity.too.large') {
      status = 413;
      code = ErrorCodes.FILE_TOO_LARGE;
      message = 'Dữ liệu gửi lên quá lớn';
    }

    if (status >= 500) (req.log ?? logger).error({ err }, 'Lỗi không mong đợi');
    res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
  };
}
