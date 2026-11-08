import multer from 'multer';
import { ALLOWED_IMAGE_TYPES } from '../config/constants.js';
import { HttpError, ErrorCodes } from '../utils/http-error.js';

/** Nhận đúng một ảnh ở trường "image", giữ trong bộ nhớ (không ghi đĩa) và giới hạn dung lượng. */
export function createImageUpload(config) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 5 },
    fileFilter(_req, file, cb) {
      if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
      cb(new HttpError(415, 'Chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc GIF', { code: ErrorCodes.UNSUPPORTED_MEDIA }));
    },
  }).single('image');
}
