import { recommend } from "./recommender.js";

const USE_API = import.meta.env.VITE_USE_API === "true";
const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

// Chuẩn hóa 1 sản phẩm: nhận cả tên trường của frontend và tên cột gốc trong Recomend_for_cli.xlsx
export function normalizeProduct(r) {
  const tags = r.tags ?? [];
  const price = Number(r.price ?? r.discounted_price ?? 0);
  return {
    id: r.id ?? r.product_id,
    name: r.name ?? r.product_title ?? "Sản phẩm",
    category: r.category ?? r.product_category ?? "Khác",
    brand: r.brand ?? "",
    price,
    originalPrice: Number(r.originalPrice ?? r.original_price ?? price),
    discount: Number(r.discount ?? r.discount_percentage ?? 0),
    rating: Number(r.rating ?? r.product_rating ?? 0),
    reviews: Number(r.reviews ?? r.total_reviews ?? 0),
    sold: Number(r.sold ?? r.purchased_last_month ?? 0),
    badge: r.badge ?? "",
    coupon: Boolean(r.coupon),
    image: r.image ?? r.product_image_url ?? null,
    tags: Array.isArray(tags) ? tags : String(tags).split(",").map((t) => t.trim()).filter(Boolean),
    score: r.score ?? 0,
    reason: r.reason ?? "Gợi ý cho bạn",
  };
}

// Danh mục sản phẩm cho chế độ dữ liệu mẫu: public/products.json (tạo bằng scripts/build_products.py)
let catalogPromise;
export function loadCatalog() {
  catalogPromise ??= fetch(`${import.meta.env.BASE_URL}products.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`Không tải được products.json (HTTP ${r.status})`);
      return r.json();
    })
    .then((rows) => rows.map(normalizeProduct));
  return catalogPromise;
}

/**
 * params: { query, category, interests, budget, viewed }
 * Hợp đồng với backend: POST {API_URL}/api/recommend
 *   body  : { query, category, interests, budget, viewedIds }
 *   return: { items: [{ id, name, category, price, rating, reviews, tags, image, score, reason, ... }] }
 */
export async function getRecommendations(params, signal) {
  if (USE_API) {
    try {
      const { viewed, ...rest } = params;
      const res = await fetch(`${API_URL}/api/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, viewedIds: viewed.map((v) => v.id) }),
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { items: data.items.map(normalizeProduct), source: "api" };
    } catch (err) {
      if (err.name === "AbortError") throw err;
      console.warn("API lỗi, chuyển sang dữ liệu mẫu:", err.message);
    }
  }
  const catalog = await loadCatalog();
  return { items: recommend(catalog, params), source: "local" };
}
