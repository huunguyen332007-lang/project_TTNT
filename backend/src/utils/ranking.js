/**
 * Xếp hạng theo "độ khớp" và "số sao" (hàm thuần, không đụng database/mạng).
 *
 * Độ khớp là cosine similarity (0..1) giữa truy vấn và sản phẩm, KHÔNG phải xác suất đã hiệu chỉnh.
 * Cosine của CLIP nằm trong khoảng hẹp nên được co giãn min-max trong tập ứng viên trước khi trộn với số sao.
 */

/** Trọng số trộn khi chỉ có độ khớp và số sao (tìm bằng ảnh, /api/search/text). */
export const MATCH_WEIGHT = 0.7;
export const RATING_WEIGHT = 0.3;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * Đổi số sao thành điểm 0..1. Dữ liệu sàn hầu hết từ 4 sao trở lên, nên 3 sao trở xuống = 0 và 5 sao = 1
 * để các mức 4.0, 4.5, 5.0 thực sự phân biệt được. Chưa có đánh giá (0/null) lấy mức trung tính 0.5.
 */
export const ratingScore = (rating) => (rating ? clamp01((rating - 3) / 2) : 0.5);

const minMax = (values) => {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return (v) => (hi > lo ? (v - lo) / (hi - lo) : 1);
};

/**
 * Điểm liên quan 0..1 cho từng sản phẩm của một danh sách ĐÃ xếp theo hybrid/vector (vị trí 0 = tốt nhất).
 *  - similarity: cosine văn bản-văn bản (hoặc ảnh-ảnh khi tìm bằng ảnh).
 *  - imageSimilarity: cosine chữ->ảnh (chỉ khi tìm bằng chữ). Đây là chiều mà fine-tune CLIP huấn luyện trực tiếp,
 *    nên trộn vào đây là cách để lợi ích của việc fine-tune tới được người dùng.
 *  - vị trí trong danh sách giữ lại công của nhánh từ khóa (RRF) cho sản phẩm không có vector.
 * @returns {Map<number, number>}
 */
export function relevanceScores(items, { textImageWeight = 0 } = {}) {
  const n = items.length;
  const sims = items.map((p) => p.similarity).filter((v) => typeof v === 'number');
  const imgs = items.map((p) => p.imageSimilarity).filter((v) => typeof v === 'number');
  const simNorm = sims.length ? minMax(sims) : null;
  const imgNorm = imgs.length ? minMax(imgs) : null;
  const w = clamp01(textImageWeight);

  return new Map(
    items.map((p, i) => {
      const rank = n > 1 ? 1 - i / n : 1;
      let rel = typeof p.similarity === 'number' && simNorm ? 0.7 * simNorm(p.similarity) + 0.3 * rank : rank;
      if (w > 0 && imgNorm && typeof p.imageSimilarity === 'number') rel = (1 - w) * rel + w * imgNorm(p.imageSimilarity);
      return [p.id, rel];
    }),
  );
}

/** Sắp xếp để sản phẩm vừa khớp cao vừa nhiều sao lên đầu. Hòa điểm thì giữ thứ tự cũ (sort ổn định). */
export function rankByMatchAndRating(items, options = {}) {
  const rel = relevanceScores(items, options);
  return items
    .map((p, i) => ({ p, i, score: MATCH_WEIGHT * rel.get(p.id) + RATING_WEIGHT * ratingScore(p.rating) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ p }) => p);
}
