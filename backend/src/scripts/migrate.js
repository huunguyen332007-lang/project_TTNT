import { runScript } from './_bootstrap.js';

// _bootstrap đã chạy migration trước khi gọi hàm này.
await runScript(async ({ logger }) => logger.info('Database đã ở phiên bản mới nhất'));
