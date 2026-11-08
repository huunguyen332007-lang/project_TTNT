import { saveSearchRequest } from "./searchCache.js";

// Gọi backend của dự án (cùng domain qua Vite proxy khi dev, qua nginx khi deploy).
const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function getClientId() {
  const key = "ttnt.clientId";
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
      });
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "00000000-0000-4000-8000-000000000000";
  }
}

async function request(path, { method = "GET", body, signal } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      signal,
      headers: { "X-Client-Id": getClientId(), ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}) },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new Error("Không kết nối được máy chủ. Hãy kiểm tra backend đã chạy chưa.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || `Lỗi máy chủ (HTTP ${res.status})`);
  return data;
}

// Backend trả sản phẩm dạng { title, imageUrl, tag, rating, price, sourceUrl, ... }; giao diện dùng tên trường dưới đây.
export function normalizeProduct(r) {
  return {
    id: r.id,
    name: r.title ?? "Sản phẩm",
    category: r.category ?? "Khác",
    brand: "",
    price: r.price ?? null,
    rating: Number(r.rating) || 0, // 0 = chưa có đánh giá
    reviews: 0,
    tags: r.tag ? [r.tag] : [], // nhãn gốc của sản phẩm
    image: r.imageUrl ?? null,
    sourceUrl: r.sourceUrl ?? null,
    score: r.score ?? r.similarity ?? 0,
    match: typeof r.similarity === "number" ? Math.min(1, Math.max(0, r.similarity)) : null, // độ khớp 0..1 (cosine similarity, không phải xác suất)
    reason: r.reason ?? "Gợi ý cho bạn",
  };
}

/** Xóa lịch sử tìm kiếm lưu trong PostgreSQL của trình duyệt này (để nó thôi ảnh hưởng tới gợi ý). */
/**
 * Ghi lại việc bấm vào một sản phẩm (kèm từ khóa và vị trí) để backend lưu vào PostgreSQL phục vụ đánh giá/huấn luyện.
 * Không bao giờ làm hỏng giao diện: lỗi mạng bị bỏ qua.
 */
export const logClick = ({ productId, kind = "browse", query = "", position }) =>
  request("/events", { method: "POST", body: { productId, kind, query, ...(Number.isInteger(position) ? { position } : {}) } }).catch(() => {});

export const clearHistory = () => request("/history", { method: "DELETE" });

export const getCategories = (signal) => request("/categories", { signal }).then((d) => d.items.map((c) => c.name));

export const getSimilar = (id, signal) =>
  request(`/products/${id}/similar?limit=3`, { signal }).then((d) => d.items.map(normalizeProduct));

/**
 * POST /api/recommend  ->  { items, total, mode }
 *   mode: 'hybrid' (tìm kiếm AI) | 'keyword' (AI tạm không khả dụng) | 'personalized' | 'browse'
 */
export async function getRecommendations({ query, category, interests, budget, viewedIds, sort, limit, offset }, signal) {
  const data = await request("/recommend", {
    method: "POST",
    signal,
    body: { query, interests, budget, viewedIds, sort, limit, offset, ...(category && category !== "Tất cả" ? { category } : {}) },
  });
  const result = { items: data.items.map(normalizeProduct), total: data.total, mode: data.mode, basedOn: data.basedOn ?? [] };
  if (query?.trim() && Number(offset || 0) === 0) {
    await saveSearchRequest({ kind: "text", query: query.trim(), category: category || "Tất cả", result });
  }
  return result;
}

/** Tìm bằng ảnh: POST /api/search/image (multipart). Kết quả đã xếp theo độ giống, không phân trang. */
export async function searchByImage(file, category, signal) {
  const form = new FormData();
  form.append("image", file);
  form.append("limit", "48");
  if (category && category !== "Tất cả") form.append("category", category);
  const data = await request("/search/image", { method: "POST", body: form, signal });
  const items = data.items.map((r) =>
    normalizeProduct({ ...r, reason: `Giống ảnh của bạn · ${Math.round((r.similarity ?? 0) * 100)}%` })
  );
  const result = { items, total: items.length, mode: "image" };
  await saveSearchRequest({ kind: "image", query: "", category: category || "Tất cả", imageBlob: file, imageName: file.name, result });
  return result;
}
