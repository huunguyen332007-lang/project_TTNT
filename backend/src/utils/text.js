/**
 * Chuyển câu truy vấn thành biểu thức tsquery kiểu OR ('ghế | gỗ | tối').
 * Chỉ giữ chữ và số (mọi ngôn ngữ) nên an toàn khi truyền vào to_tsquery().
 * Trả về null nếu không còn từ nào.
 */
export function toTsQuery(query, { maxTerms = 12 } = {}) {
  const terms = (String(query).normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, maxTerms);
  return terms.length ? [...new Set(terms)].join(' | ') : null;
}

/** Văn bản dùng để tạo embedding cho một sản phẩm. */
export function buildProductText({ title, category, tag, description }) {
  return [title, category, tag, description]
    .map((part) => (part ?? '').toString().trim())
    .filter(Boolean)
    .join('. ');
}
