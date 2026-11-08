import { ErrorCodes } from '../utils/http-error.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Lập chỉ mục: tạo embedding văn bản + ảnh cho sản phẩm và lưu vào PostgreSQL. */
export class IndexingService {
  constructor({ products, embeddings, logger }) {
    this.products = products;
    this.embeddings = embeddings;
    this.logger = logger;
  }

  /**
   * Lập chỉ mục một sản phẩm. Văn bản và ảnh độc lập nhau: ảnh lỗi (URL chết) không làm mất
   * embedding văn bản. Chỉ ném lỗi nếu cả hai đều thất bại.
   */
  async indexOne(product) {
    const wantText = product.needsText ?? true;
    const wantImage = product.needsImage ?? true;
    const [text, image] = await Promise.allSettled([
      wantText ? this.embeddings.embedProductText(product) : Promise.resolve(null),
      wantImage ? this.embeddings.embedProductImage(product) : Promise.resolve(null),
    ]);

    const failures = [text, image].filter((r) => r.status === 'rejected');
    if (failures.length === [wantText, wantImage].filter(Boolean).length) throw failures[0].reason;
    failures.forEach((f) => this.logger.warn({ err: f.reason, productId: product.id }, 'Lập chỉ mục một phần thất bại'));

    await this.products.updateEmbeddings(product.id, {
      text: text.status === 'fulfilled' ? text.value : null,
      image: image.status === 'fulfilled' ? image.value : null,
    });
  }

  /**
   * Lập chỉ mục mọi sản phẩm còn thiếu embedding. Trả về số lượng thành công/thất bại.
   * `concurrency` > 1 để chồng thời gian tải ảnh từ xa lên nhau (mặc định 1 = tuần tự).
   */
  async reindexMissing({ batchSize = 20, concurrency = 1 } = {}) {
    let indexed = 0;
    const failedIds = [];
    for (;;) {
      const batch = await this.products.findNeedingEmbeddings({ limit: batchSize, excludeIds: failedIds });
      if (!batch.length) break;
      for (let i = 0; i < batch.length; i += concurrency) {
        const chunk = batch.slice(i, i + concurrency);
        const results = await Promise.allSettled(chunk.map((product) => this.indexOne(product)));
        results.forEach((result, j) => {
          if (result.status === 'fulfilled') return void indexed++;
          if (result.reason?.code === ErrorCodes.AI_UNAVAILABLE) return;
          failedIds.push(chunk[j].id);
          this.logger.warn({ err: result.reason, productId: chunk[j].id }, 'Không lập được chỉ mục sản phẩm');
        });
        const aiDown = results.find((r) => r.status === 'rejected' && r.reason?.code === ErrorCodes.AI_UNAVAILABLE);
        if (aiDown) throw aiDown.reason; // AI chết thì dừng cả mẻ, thử lại sau
      }
      this.logger.info({ indexed, failed: failedIds.length }, 'Tiến độ lập chỉ mục');
    }
    return { indexed, failed: failedIds.length };
  }

  /**
   * Chạy nền sau khi server khởi động: dịch vụ AI cần vài chục giây để nạp model,
   * nên thử lại cho tới khi AI sẵn sàng.
   */
  async reindexInBackground({ attempts = 40, delayMs = 5000 } = {}) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const result = await this.reindexMissing();
        if (result.indexed || result.failed) this.logger.info(result, 'Hoàn tất lập chỉ mục nền');
        return result;
      } catch (err) {
        if (err.code !== ErrorCodes.AI_UNAVAILABLE) {
          this.logger.error({ err }, 'Lập chỉ mục nền thất bại');
          return null;
        }
        this.logger.info(`Dịch vụ AI chưa sẵn sàng, thử lại lập chỉ mục (${attempt}/${attempts})`);
        await sleep(delayMs);
      }
    }
    this.logger.warn('Bỏ qua lập chỉ mục nền: dịch vụ AI không sẵn sàng. Chạy `npm run reindex` sau.');
    return null;
  }
}
