import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { runScript } from './_bootstrap.js';
import { parseRows, cleanRows } from '../import/marketplace-csv.js';
import { ErrorCodes } from '../utils/http-error.js';

const DEFAULT_CSV = new URL('../db/seed-data/marketplace-products.csv', import.meta.url);
const CATEGORY_MAP = new URL('../db/seed-data/category-map.json', import.meta.url);

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    replace: { type: 'boolean', default: false }, // xóa sạch bảng products trước khi nạp 
    'keep-conflicts': { type: 'boolean', default: false }, // giữ cả các dòng bị gán nhầm ảnh
    'dry-run': { type: 'boolean', default: false }, // chỉ phân tích, không ghi database
    'no-index': { type: 'boolean', default: false }, // không tạo embedding ngay (backend sẽ tự làm nền khi khởi động)
  },
});

// Dùng:  npm run import:csv -- [đường/dẫn/file.csv] [--replace] [--dry-run] [--keep-conflicts] [--no-index]
await runScript(
  async ({ container, logger }) => {
    const file = positionals[0] ?? DEFAULT_CSV;
    const categoryMap = JSON.parse(await readFile(CATEGORY_MAP, 'utf8'));
    const { rows: parsed, invalid } = parseRows(await readFile(file, 'utf8'), categoryMap);
    const { rows, stats } = cleanRows(parsed, { keepConflicts: opts['keep-conflicts'] });

    logger.info({ ...stats, invalid: invalid.length }, 'Kết quả làm sạch CSV');
    if (stats.conflictingImage) logger.warn(`Đã loại ${stats.conflictingImage} dòng có ảnh bị gán nhầm (dùng --keep-conflicts để giữ lại)`);
    if (opts['dry-run']) return void logger.info('Chạy thử (--dry-run): không ghi gì vào database');

    const products = container.repositories.products;
    if (opts.replace) logger.warn(`--replace: đã xóa ${await products.removeAll()} sản phẩm hiện có`);

    const counts = await products.upsertImportedMany(rows);
    logger.info({ ...counts, total: rows.length }, `Đã nạp ${rows.length} sản phẩm vào database`);

    if (opts['no-index']) return void logger.info('Bỏ qua lập chỉ mục. Chạy `npm run reindex` (hoặc khởi động backend) để tạo embedding.');
    try {
      logger.info('Đang tạo embedding bằng dịch vụ AI (vài phút đến vài chục phút tùy máy)...');
      logger.info(await container.services.indexing.reindexMissing({ concurrency: 4 }), 'Hoàn tất lập chỉ mục');
    } catch (err) {
      if (err.code !== ErrorCodes.AI_UNAVAILABLE) throw err;
      logger.warn('Dịch vụ AI chưa sẵn sàng. Dữ liệu đã nạp xong; chạy `npm run reindex` sau khi AI lên.');
    }
  },
);
