import { toTsQuery } from '../utils/text.js';
import { ErrorCodes } from '../utils/http-error.js';
import { DEFAULT_SEARCH_LIMIT } from '../config/constants.js';
import { rankByMatchAndRating } from '../utils/ranking.js';

// Lấy rộng hơn số cần trả để xếp lại theo độ khớp + số sao không bỏ sót sản phẩm nhiều sao nằm ngay sau top.
const RERANK_FACTOR = 2;
const MAX_POOL = 100;

export class SearchService {
  constructor({ products, history, embeddings, logger, textMinSimilarity = 0, imageMinSimilarity = 0, textImageWeight = 0 }) {
    this.products = products;
    this.history = history;
    this.embeddings = embeddings;
    this.logger = logger;
    this.textMinSimilarity = textMinSimilarity;
    this.imageMinSimilarity = imageMinSimilarity;
    this.textImageWeight = textImageWeight;
  }

  /**
   * Tìm theo văn bản: embedding ngữ nghĩa + từ khóa (hybrid).
   * Nếu dịch vụ AI không khả dụng thì tự động hạ cấp xuống tìm theo từ khóa.
   * rerank (mặc định bật): đưa sản phẩm vừa khớp cao vừa nhiều sao lên đầu. RecommendService tự xếp hạng nên tắt.
   */
  async searchText({ query, category, limit = DEFAULT_SEARCH_LIMIT, clientId, rerank = true }) {
    const text = query.trim();
    const tsquery = toTsQuery(text);

    let embedding = null;
    try {
      embedding = await this.embeddings.embedQuery(text);
    } catch (err) {
      if (err.code !== ErrorCodes.AI_UNAVAILABLE) throw err;
      this.logger.warn({ err }, 'AI không khả dụng, chuyển sang tìm theo từ khóa');
    }

    const pool = rerank ? Math.min(MAX_POOL, limit * RERANK_FACTOR) : limit;
    let items = embedding
      ? await this.products.searchHybrid({ embedding, tsquery, category, limit: pool, minSimilarity: this.textMinSimilarity })
      : await this.products.searchKeyword({ tsquery, category, limit: pool });
    if (rerank) items = rankByMatchAndRating(items, { textImageWeight: this.textImageWeight }).slice(0, limit);

    this.#record({ clientId, kind: 'text', query: text, category, resultCount: items.length, embedding });
    return { items, count: items.length, mode: embedding ? 'hybrid' : 'keyword', query: text };
  }

  /** Tìm theo ảnh: so khớp embedding ảnh người dùng tải lên với embedding ảnh sản phẩm. */
  async searchImage({ file, category, limit = DEFAULT_SEARCH_LIMIT, clientId }) {
    const embedding = await this.embeddings.embedUploadedImage(file.buffer, file.mimetype);
    const pool = Math.min(MAX_POOL, limit * RERANK_FACTOR);
    const found = await this.products.searchByImage({ embedding, category, limit: pool, minSimilarity: this.imageMinSimilarity });
    const items = rankByMatchAndRating(found).slice(0, limit);
    this.#record({ clientId, kind: 'image', query: '', category, resultCount: items.length, embedding: null });
    return { items, count: items.length };
  }

  /** Ghi lịch sử ở chế độ "bắn và quên": lỗi ghi lịch sử không được làm hỏng kết quả tìm kiếm. */
  #record({ clientId, ...entry }) {
    if (!clientId) return;
    this.history.record({ clientId, ...entry }).catch((err) => this.logger.warn({ err }, 'Không ghi được lịch sử tìm kiếm'));
  }
}
