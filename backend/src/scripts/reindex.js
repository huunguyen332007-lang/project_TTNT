import { runScript } from './_bootstrap.js';

// Tạo lại embedding còn thiếu (ví dụ sau khi thêm sản phẩm lúc AI service đang tắt).
//   npm run reindex            chỉ sản phẩm còn thiếu
//   npm run reindex -- --all   xóa hết embedding rồi tạo lại (dùng sau khi đổi sang model đã fine-tune)
await runScript(async ({ container, logger }) => {
  if (process.argv.includes('--all')) {
    const cleared = await container.repositories.products.clearEmbeddings();
    logger.info(`Đã xóa embedding của ${cleared} sản phẩm, bắt đầu tạo lại`);
  }
  const result = await container.services.indexing.reindexMissing({ concurrency: 4 });
  logger.info(result, 'Hoàn tất lập chỉ mục');
});
