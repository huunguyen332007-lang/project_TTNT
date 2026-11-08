const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Đọc định danh ẩn danh X-Client-Id (UUID do trình duyệt tạo) để cá nhân hóa gợi ý
 * mà không cần đăng nhập. Giá trị sai định dạng bị bỏ qua.
 */
export function clientId(req, _res, next) {
  const raw = req.get('x-client-id');
  req.clientId = raw && UUID_RE.test(raw) ? raw.toLowerCase() : null;
  next();
}
