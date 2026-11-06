<<<<<<< HEAD
import { meanVector } from '../utils/vector.js';
import { notFound } from '../utils/http-error.js';

const RECENT_QUERIES_FOR_TASTE = 5;
=======
import { tasteFromHistory } from '../utils/history-taste.js';
import { rankByMatchAndRating } from '../utils/ranking.js';
import { notFound } from '../utils/http-error.js';

const RECENT_QUERIES_FOR_TASTE = 5;
const HISTORY_ROWS_TO_READ = 20; // đọc dư để còn khử trùng và bỏ truy vấn gõ dở
>>>>>>> d642a4f5436e776b2fbe4f031def991d04107e0b

export class RecommendationService {
  constructor({ products, history }) {
    this.products = products;
    this.history = history;
  }

  /**
   * Gợi ý cho một client:
   *  - Có lịch sử: lấy vector trung bình của các truy vấn gần đây rồi tìm sản phẩm gần nhất.
   *  - Chưa có: trả về sản phẩm mới nhất.
   * Kèm các từ khóa đang được nhiều người tìm để làm gợi ý nhanh.
   */
  async forClient({ clientId, limit = 8 }) {
    const [recent, trendingQueries] = await Promise.all([
<<<<<<< HEAD
      clientId ? this.history.recentTextQueries(clientId, { limit: RECENT_QUERIES_FOR_TASTE }) : [],
      this.history.popularQueries({ limit: 6 }),
    ]);

    if (recent.length) {
      const taste = meanVector(recent.map((r) => r.embedding));
      const items = await this.products.findNearestByText({ embedding: taste, limit });
      return { strategy: 'personalized', basedOn: [...new Set(recent.map((r) => r.query))], items, trendingQueries };
=======
      clientId ? this.history.recentTextQueries(clientId, { limit: HISTORY_ROWS_TO_READ }) : [],
      this.history.popularQueries({ limit: 6 }),
    ]);

    const taste = tasteFromHistory(recent, { max: RECENT_QUERIES_FOR_TASTE });
    if (taste) {
      // Lấy rộng gấp đôi rồi xếp lại để sản phẩm vừa hợp khẩu vị vừa nhiều sao lên đầu.
      const found = await this.products.findNearestByText({ embedding: taste.embedding, limit: limit * 2 });
      const items = rankByMatchAndRating(found).slice(0, limit);
      return { strategy: 'personalized', basedOn: taste.queries, items, trendingQueries };
>>>>>>> d642a4f5436e776b2fbe4f031def991d04107e0b
    }
    return { strategy: 'latest', basedOn: [], items: await this.products.findLatest({ limit }), trendingQueries };
  }

  async similarTo(productId, { limit = 6 }) {
    if (!(await this.products.findById(productId))) throw notFound('Không tìm thấy sản phẩm');
    return this.products.findSimilar(productId, { limit });
  }
}
