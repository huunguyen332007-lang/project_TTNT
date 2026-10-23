import { createApp } from './app.js';
import { config } from './config.js';
import { migrate, productsPool, searchPool, waitForDb } from './db.js';
import { seedIfEmpty } from './seed.js';

async function main() {
  await waitForDb();
  await migrate();
  if (config.seedOnStart) await seedIfEmpty();

  const server = createApp().listen(config.port, '0.0.0.0', () => {
    console.log(`[api] đang chạy ở cổng ${config.port}`);
  });
  const shutdown = async (signal) => {
    console.log(`[api] nhận ${signal}, đang tắt...`);
    server.close(async () => {
      await Promise.all([productsPool.end(), searchPool.end()]);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
main().catch(err => {
  console.error('[api] khởi động thất bại:', err);
  process.exit(1);
});
