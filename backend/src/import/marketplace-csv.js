import { parse } from 'csv-parse/sync';

/**
 * Chuyển file CSV cào từ Shopee/Lazada thành danh sách sản phẩm sạch để nạp vào database.
 * Toàn bộ là hàm thuần (không đụng database/mạng) nên test được trực tiếp.
 *
 * Cột bắt buộc: "Tên sản phẩm", "Giá", "Đánh giá", "URL", "Hình ảnh", "Nhãn sản phẩm".
 */
const COLUMNS = { title: 'Tên sản phẩm', price: 'Giá', rating: 'Đánh giá', url: 'URL', image: 'Hình ảnh', label: 'Nhãn sản phẩm' };

export const normalizeSpaces = (s) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();

/**
 * "40.900₫ - 52.900₫" -> 40900 (lấy giá thấp nhất của khoảng); "210.000 ₫" -> 210000.
 * Rỗng, lỗi hoặc 0 -> null: "0₫" trong dữ liệu cào nghĩa là cào hụt giá chứ không phải hàng miễn phí.
 */
export function parsePrice(raw) {
  const first = String(raw ?? '').split(/[-–]/)[0];
  const n = Number(first.replace(/[^\d]/g, ''));
  return n > 0 ? n : null;
}

/** Điểm 1..5, một chữ số thập phân. Rỗng, 0 (chưa có đánh giá) hoặc ngoài khoảng -> null. */
export function parseRating(raw) {
  const text = String(raw ?? '').trim().replace(',', '.');
  const n = text === '' ? NaN : Number(text);
  return Number.isFinite(n) && n > 0 && n <= 5 ? Math.round(n * 10) / 10 : null;
}

/** Bỏ query string và fragment (extraParams, image_ids... thay đổi theo lần cào) để làm khóa ổn định. */
export function canonicalUrl(raw) {
  try {
    const u = new URL(String(raw).trim());
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

/** Nhãn gốc -> danh mục gom nhóm. Nhãn lạ giữ nguyên để không mất dữ liệu. */
export const categoryFor = (label, categoryMap) => categoryMap[label] ?? (label || 'Khác');

export function parseRows(csvText, categoryMap) {
  const records = parse(csvText.replace(/^\uFEFF/, ''), { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });
  if (!records.length) return { rows: [], invalid: [] };
  const missing = Object.values(COLUMNS).filter((c) => !(c in records[0]));
  if (missing.length) throw new Error(`File CSV thiếu cột: ${missing.join(', ')}`);

  const rows = [];
  const invalid = [];
  records.forEach((r, i) => {
    const title = normalizeSpaces(r[COLUMNS.title]).slice(0, 200);
    const sourceUrl = canonicalUrl(r[COLUMNS.url]);
    const imageUrl = String(r[COLUMNS.image] ?? '').trim();
    if (!title || !sourceUrl || !/^https?:\/\//i.test(imageUrl)) {
      invalid.push({ line: i + 2, reason: 'thiếu tên, URL hoặc ảnh hợp lệ' });
      return;
    }
    const label = normalizeSpaces(r[COLUMNS.label]);
    const category = categoryFor(label, categoryMap);
    rows.push({
      title,
      category,
      tag: label === category ? '' : label, // nhãn gốc, dùng làm nhãn huấn luyện và vào văn bản embedding
      imageUrl,
      description: '',
      price: parsePrice(r[COLUMNS.price]),
      rating: parseRating(r[COLUMNS.rating]),
      sourceUrl,
    });
  });
  return { rows, invalid };
}

/**
 * Làm sạch:
 *  1. trùng sourceUrl -> giữ dòng đầu;
 *  2. cùng một ảnh nhưng thuộc >= 2 danh mục khác nhau -> ảnh bị gán nhầm khi cào (ví dụ một ảnh cho cả ốp lưng,
 *     áo khoác và khăn tắm) -> loại, vì hiển thị sai ảnh và làm hỏng tìm kiếm bằng ảnh;
 *  3. cùng ảnh + cùng tiêu đề (không phân biệt hoa thường) -> cùng một tin đăng bị cào lặp -> giữ dòng đầu.
 * `keepConflicts` giữ lại nhóm (2).
 */
export function cleanRows(rows, { keepConflicts = false } = {}) {
  const stats = { input: rows.length, duplicateUrl: 0, conflictingImage: 0, duplicateListing: 0 };

  const seenUrl = new Set();
  const step1 = rows.filter((r) => {
    if (seenUrl.has(r.sourceUrl)) return stats.duplicateUrl++, false;
    seenUrl.add(r.sourceUrl);
    return true;
  });

  const categoriesByImage = new Map();
  for (const r of step1) {
    if (!categoriesByImage.has(r.imageUrl)) categoriesByImage.set(r.imageUrl, new Set());
    categoriesByImage.get(r.imageUrl).add(r.category);
  }
  const step2 = keepConflicts
    ? step1
    : step1.filter((r) => {
        if (categoriesByImage.get(r.imageUrl).size > 1) return stats.conflictingImage++, false;
        return true;
      });

  const seenListing = new Set();
  const kept = step2.filter((r) => {
    const key = `${r.imageUrl}\u0000${r.title.toLowerCase()}`;
    if (seenListing.has(key)) return stats.duplicateListing++, false;
    seenListing.add(key);
    return true;
  });

  return { rows: kept, stats: { ...stats, kept: kept.length } };
}
