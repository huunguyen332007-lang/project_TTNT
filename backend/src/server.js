import { loadConfig } from './config/index.js';
import { createLogger } from './utils/logger.js';
import { createPool, waitForDatabase } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { importCsvOnStartup } from './db/import-csv-on-start.js';
import { createContainer } from './container.js';
import { createApp } from './app.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config);
  const pool = createPool(config, logger);

  await waitForDatabase(pool, logger);
  if (config.runMigrations) await runMigrations(pool, logger);

  const container = createContainer({ config, logger, pool });

  // Nạp CSV vào PostgreSQL trước khi mở API để frontend luôn đọc được dữ liệu thật.
  if (config.importCsvOnStart) {
    await importCsvOnStartup({ products: container.repositories.products, logger });
  }

  const app = createApp({ config, logger, services: container.services });
  const server = app.listen(config.port, '0.0.0.0', () => logger.info(`API đang chạy ở cổng ${config.port}`));

  // Dịch vụ AI cần thời gian nạp model; lập chỉ mục chạy nền để API lên ngay.
  container.services.indexing.reindexInBackground().catch((err) => logger.error({ err }, 'Lập chỉ mục nền lỗi'));

  const shutdown = (signal) => {
    logger.info(`Nhận ${signal}, đang tắt...`);
    server.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Khởi động thất bại:', err);
  process.exit(1);
});
