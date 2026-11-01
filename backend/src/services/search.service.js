import { toTsQuery } from '../utils/text.js';
import { ErrorCodes } from '../utils/http-error.js';
import { DEFAULT_SEARCH_LIMIT } from '../config/constants.js';

export class SearchService {
  constructor({ products, history, embeddings, logger, textMinSimilarity = 0, imageMinSimilarity = 0 }) {
    this.products = products;
    this.history = history;
    this.embeddings = embeddings;
    this.logger = logger;
    this.textMinSimilarity = textMinSimilarity;
    this.imageMinSimilarity = imageMinSimilarity;
  }

  /**
   * Tìm theo văn bản: embedding ngữ nghĩa + từ khóa (hybrid).
   * Nếu dịch vụ AI không khả dụng thì tự động hạ cấp xuống tìm theo từ khóa.
   */
  async searchText({ query, category, limit = DEFAULT_SEARCH_LIMIT, clientId }) {
    const text = query.trim();
    const tsquery = toTsQuery(text);

    let embedding = null;
    try {
      embedding = await this.embeddings.embedQuery(text);
    } catch (err) {
      if (err.code !== ErrorCodes.AI_UNAVAILABLE) throw err;
      this.logger.warn({ err }, 'AI không khả dụng, chuyển sang tìm theo từ khóa');
    }

    const items = embedding
      ? await this.products.searchHybrid({ embedding, tsquery, category, limit, minSimilarity: this.textMinSimilarity })
      : await this.products.searchKeyword({ tsquery, category, limit });

    this.#record({ clientId, kind: 'text', query: text, category, resultCount: items.length, embedding });
    return { items, count: items.length, mode: embedding ? 'hybrid' : 'keyword', query: text };
  }

  /** Tìm theo ảnh: so khớp embedding ảnh người dùng tải lên với embedding ảnh sản phẩm. */
  async searchImage({ file, category, limit = DEFAULT_SEARCH_LIMIT, clientId }) {
    const embedding = await this.embeddings.embedUploadedImage(file.buffer, file.mimetype);
    const items = await this.products.searchByImage({ embedding, category, limit, minSimilarity: this.imageMinSimilarity });
    this.#record({ clientId, kind: 'image', query: '', category, resultCount: items.length, embedding: null });
    return { items, count: items.length };
  }

  /** Ghi lịch sử ở chế độ "bắn và quên": lỗi ghi lịch sử không được làm hỏng kết quả tìm kiếm. */
  #record({ clientId, ...entry }) {
    if (!clientId) return;
    this.history.record({ clientId, ...entry }).catch((err) => this.logger.warn({ err }, 'Không ghi được lịch sử tìm kiếm'));
  }
}
