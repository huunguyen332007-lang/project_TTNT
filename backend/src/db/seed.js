import { readFile } from 'node:fs/promises';

const SEED_FILE = new URL('./seed-data/products.json', import.meta.url);

/** Nạp sản phẩm mẫu nếu bảng products đang trống. Embedding được tạo sau bởi IndexingService. */
export async function seedIfEmpty({ products, logger }) {
  if ((await products.count()) > 0) return 0;
  const seed = JSON.parse(await readFile(SEED_FILE, 'utf8'));
  for (const item of seed) await products.insert(item);
  logger.info(`Đã thêm ${seed.length} sản phẩm mẫu`);
  return seed.length;
}
