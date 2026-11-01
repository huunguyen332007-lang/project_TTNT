import { EMBEDDING_DIM } from '../config/constants.js';

/** Chuyển mảng số thành literal của pgvector: '[0.1,0.2,...]'. */
export function toVectorLiteral(values, dim = EMBEDDING_DIM) {
  if (!Array.isArray(values) || values.length !== dim) {
    throw new TypeError(`Vector phải có đúng ${dim} chiều (nhận được ${Array.isArray(values) ? values.length : typeof values})`);
  }
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError('Vector chứa giá trị không hợp lệ');
  }
  return `[${values.join(',')}]`;
}

/** Ngược lại với toVectorLiteral: '[0.1,0.2]' -> [0.1, 0.2]. */
export function parseVector(literal) {
  return JSON.parse(literal);
}

/** Vector trung bình rồi chuẩn hóa độ dài về 1 (dùng làm "khẩu vị" từ nhiều truy vấn). */
export function meanVector(vectors) {
  if (!vectors.length) throw new RangeError('Cần ít nhất một vector');
  const dim = vectors[0].length;
  const sum = new Array(dim).fill(0);
  for (const vec of vectors) {
    if (vec.length !== dim) throw new RangeError('Các vector phải cùng số chiều');
    for (let i = 0; i < dim; i++) sum[i] += vec[i];
  }
  const norm = Math.sqrt(sum.reduce((acc, v) => acc + v * v, 0));
  if (norm === 0) return sum;
  return sum.map((v) => v / norm);
}
