import { runScript } from './_bootstrap.js';

// Tạo lại embedding còn thiếu (ví dụ sau khi thêm sản phẩm lúc AI service đang tắt).
await runScript(async ({ container, logger }) => {
  const result = await container.services.indexing.reindexMissing();
  logger.info(result, 'Hoàn tất lập chỉ mục');
});
