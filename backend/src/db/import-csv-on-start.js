import { readFile } from 'node:fs/promises';
import { cleanRows, parseRows } from '../import/marketplace-csv.js';

const CSV_FILE = new URL('./seed-data/marketplace-products.csv', import.meta.url);
const CATEGORY_MAP_FILE = new URL('./seed-data/category-map.json', import.meta.url);

/** Đồng bộ CSV có sẵn trong project vào PostgreSQL trước khi API nhận request. */
export async function importCsvOnStartup({ products, logger }) {
  const [csvText, categoryMapText] = await Promise.all([
    readFile(CSV_FILE, 'utf8'),
    readFile(CATEGORY_MAP_FILE, 'utf8'),
  ]);
  const categoryMap = JSON.parse(categoryMapText);
  const { rows: parsed, invalid } = parseRows(csvText, categoryMap);
  const { rows, stats } = cleanRows(parsed);

  if (rows.length === 0) {
    logger.warn({ ...stats, invalid: invalid.length }, 'CSV không có sản phẩm hợp lệ; bỏ qua import');
    return { ...stats, invalid: invalid.length, inserted: 0, updated: 0 };
  }

  const counts = await products.upsertImportedMany(rows);
  // Dữ liệu CSV của bạn thay thế hoàn toàn dữ liệu mẫu ban đầu.
  const removedSamples = (await products.removeSampleProducts?.()) ?? 0;
  const result = { ...stats, invalid: invalid.length, ...counts, removedSamples };
  logger.info(result, 'Đã đồng bộ dữ liệu CSV vào PostgreSQL');
  return result;
}
