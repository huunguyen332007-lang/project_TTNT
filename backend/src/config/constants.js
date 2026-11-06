/** Số chiều embedding của CLIP ViT-B/32 (phải khớp với cột vector(512) trong migration). */
export const EMBEDDING_DIM = 512;

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_SEARCH_LIMIT = 12;
export const MAX_SEARCH_LIMIT = 50;
export const DEFAULT_RECOMMEND_LIMIT = 96;
export const MAX_RECOMMEND_LIMIT = 300;
export const RECOMMEND_SORTS = ['relevance', 'priceAsc', 'priceDesc', 'rating'];

/**
 * Mốc ngân sách (VND, nửa khoảng [min, max)) cho bộ lọc "Ngân sách" của giao diện.
 * Chọn theo phân phối giá của dữ liệu hiện có: p25 ~ 69k, trung vị ~ 149k, p75 ~ 299k, p90 ~ 799k.
 * Nếu đổi mốc ở đây thì đổi nhãn tương ứng trong frontend/src/recommender.js.
 */
export const BUDGETS = {
  low: [0, 100_000],
  mid: [100_000, 300_000],
  high: [300_000, 1_000_000],
  premium: [1_000_000, Infinity],
};
