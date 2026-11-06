import { meanVector } from './vector.js';

/**
 * Chọn các truy vấn đáng dùng làm "khẩu vị" từ lịch sử tìm kiếm (rows: MỚI NHẤT TRƯỚC, có query và embedding).
 *  - Khử trùng theo chữ thường, giữ bản mới nhất.
 *  - Bỏ truy vấn gõ dở: nếu một truy vấn mới hơn bắt đầu bằng nó (ví dụ "áo" rồi "áo thun") thì chỉ giữ truy vấn dài.
 */
export function distinctQueries(rows, max = 5) {
  const kept = [];
  for (const row of rows) {
    const q = (row.query ?? '').trim().toLowerCase();
    if (!q || !row.embedding) continue;
    if (kept.some((k) => k.key === q || (k.key.length > q.length && k.key.startsWith(q)))) continue;
    kept.push({ key: q, row });
    if (kept.length === max) break;
  }
  return kept.map((k) => k.row);
}

/** Vector trung bình có trọng số rồi chuẩn hóa độ dài về 1. weights[i] ứng với vectors[i]. */
export function weightedMeanVector(vectors, weights) {
  if (!vectors.length) throw new RangeError('Cần ít nhất một vector');
  return meanVector(vectors.map((v, i) => v.map((x) => x * weights[i])));
}

/**
 * Khẩu vị từ lịch sử tìm kiếm: vector trung bình của vài truy vấn gần nhất, truy vấn càng mới trọng số càng lớn
 * (mỗi bước lùi về trước nhân với `decay`). Trả null nếu chưa có lịch sử dùng được.
 * @returns {{ embedding: number[], queries: string[] } | null}
 */
export function tasteFromHistory(rows, { max = 5, decay = 0.7 } = {}) {
  const picked = distinctQueries(rows, max);
  if (!picked.length) return null;
  const weights = picked.map((_, i) => decay ** i);
  return { embedding: weightedMeanVector(picked.map((r) => r.embedding), weights), queries: picked.map((r) => r.query.trim()) };
}
