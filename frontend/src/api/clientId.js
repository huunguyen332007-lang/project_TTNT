const KEY = 'ttnt.clientId';

/**
 * Định danh ẩn danh của trình duyệt, dùng để backend nhớ lịch sử tìm kiếm và cá nhân hóa gợi ý
 * mà không cần đăng nhập. Xóa dữ liệu trình duyệt là mất định danh này.
 */
export function getClientId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return null; // chế độ riêng tư có thể chặn localStorage; ứng dụng vẫn chạy, chỉ không cá nhân hóa
  }
}
