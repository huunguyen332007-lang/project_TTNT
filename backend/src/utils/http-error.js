/** Lỗi có chủ đích, được errorHandler chuyển thành response JSON thống nhất. */
export class HttpError extends Error {
  constructor(status, message, { code = 'ERROR', details, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const ErrorCodes = Object.freeze({
  VALIDATION: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMITED: 'RATE_LIMITED',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  INVALID_IMAGE: 'INVALID_IMAGE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_MEDIA: 'UNSUPPORTED_MEDIA_TYPE',
  INTERNAL: 'INTERNAL_ERROR',
});

export const notFound = (message = 'Không tìm thấy dữ liệu') => new HttpError(404, message, { code: ErrorCodes.NOT_FOUND });
export const badRequest = (message, details) => new HttpError(400, message, { code: ErrorCodes.VALIDATION, details });
