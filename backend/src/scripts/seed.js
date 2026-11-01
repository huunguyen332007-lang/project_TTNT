import { runScript } from './_bootstrap.js';
import { seedIfEmpty } from '../db/seed.js';

await runScript(async ({ container, logger }) => {
  await seedIfEmpty({ products: container.repositories.products, logger });
  const result = await container.services.indexing.reindexMissing();
  logger.info(result, 'Đã lập chỉ mục sản phẩm mẫu');
});
