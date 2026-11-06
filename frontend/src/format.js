const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

// Dữ liệu cào có sản phẩm không lấy được giá -> backend trả null; không hiển thị "0 ₫".
export const formatPrice = (n) => (n == null ? "Chưa có giá" : vnd.format(Number(n)));

// 1200 -> "1.2k", 100000 -> "100k"
export const compact = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".0", "")}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(".0", "")}k`;
  return `${n}`;
};

// Tên sàn từ đường dẫn gốc; null nếu không nhận ra (khi đó không hiện nút liên kết).
export function marketplaceName(url) {
  try {
    const host = new URL(url).hostname;
    if (host.endsWith("shopee.vn")) return "Shopee";
    if (host.endsWith("lazada.vn")) return "Lazada";
    return host.replace(/^www\./, "");
  } catch {
    return null;
  }
}
