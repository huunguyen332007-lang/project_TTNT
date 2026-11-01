export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_IMAGE_MB = 5; // khớp MAX_UPLOAD_MB mặc định của backend

/** Trả về thông báo lỗi (tiếng Việt) hoặc chuỗi rỗng nếu ảnh hợp lệ. */
export function validateImage(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc GIF.';
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) return `Ảnh lớn hơn ${MAX_IMAGE_MB} MB. Hãy chọn ảnh nhỏ hơn.`;
  return '';
}
