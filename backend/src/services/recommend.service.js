import { BUDGETS } from '../config/constants.js';
import { ratingScore, relevanceScores } from '../utils/ranking.js';
<<<<<<< HEAD

// Số ứng viên lấy từ tìm kiếm khi người dùng gõ từ khóa (hybrid chỉ trả tối đa ~100 kết quả liên quan).
const SEARCH_POOL = 200;

const WEIGHTS = { text: 0.4, taste: 0.2, interest: 0.15, viewedCategory: 0.1, popular: 0.15 };
// Khi có từ khóa: độ khớp với truy vấn và số sao quyết định thứ hạng, cá nhân hóa chỉ điều chỉnh nhẹ.
=======
import { tasteFromHistory } from '../utils/history-taste.js';

// Số ứng viên lấy từ tìm kiếm khi người dùng gõ từ khóa (hybrid chỉ trả tối đa ~100 kết quả liên quan).
const SEARCH_POOL = 200;
const HISTORY_ROWS_TO_READ = 20; // đọc dư để còn khử trùng và bỏ truy vấn gõ dở

const WEIGHTS = { text: 0.4, taste: 0.2, interest: 0.15, viewedCategory: 0.1, popular: 0.15 };
// Khi có từ khóa: độ khớp với truy vấn và số sao quyết định thứ hạng, cá nhân hóa chỉ điều chỉnh nhẹ.
// Khi chưa gõ gì nhưng đã có lịch sử tìm kiếm: khẩu vị từ lịch sử là tín hiệu chính.
const HISTORY_WEIGHTS = { text: 0, taste: 0.4, interest: 0.15, viewedCategory: 0.1, popular: 0.2 };
>>>>>>> d642a4f5436e776b2fbe4f031def991d04107e0b
const SEARCH_WEIGHTS = { text: 0.6, taste: 0.07, interest: 0.05, viewedCategory: 0.03, popular: 0.25 };

const minMax = (values) => {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return (v) => (hi > lo ? (v - lo) / (hi - lo) : 1);
};

/**
 * Chấm điểm và sắp xếp (hàm thuần, không đụng database/mạng).
 *  text           độ liên quan với từ khóa (0..1): cosine similarity thật trộn với thứ hạng của tìm kiếm AI, xem utils/ranking.js
 *  taste          giống "khẩu vị" = vector trung bình các sản phẩm đã xem (chuẩn hóa min-max trong tập ứng viên)
 *  interest       danh mục người dùng chọn là yêu thích
 *  viewedCategory tỉ lệ sản phẩm đã xem thuộc danh mục này
 *  popular        điểm đánh giá; chưa có đánh giá thì lấy mức trung tính 0.5 (không phạt, không thưởng).
 *                 Khi có từ khóa, 3 sao trở xuống = 0 và 5 sao = 1 để phân biệt 4.0/4.5/5.0 (trọng số 0.25 thay vì 0.15)
 * Khi hai sản phẩm bằng điểm thì id nhỏ hơn đứng trước để thứ tự ổn định giữa các lần gọi.
 */
<<<<<<< HEAD
export function rankProducts({ pool, query = '', textRank = null, taste = new Map(), interests = [], viewedCategories = new Map(), viewedCount = 0, budgetActive = false }) {
  const tasteValues = pool.map((p) => taste.get(p.id)).filter((v) => v !== undefined);
  const tasteNorm = tasteValues.length ? minMax(tasteValues) : null;

  const ranked = pool.map((p) => {
    const text = textRank?.get(p.id) ?? 0;
    const tasteScore = tasteNorm && taste.has(p.id) ? tasteNorm(taste.get(p.id)) : 0;
=======
export function rankProducts({
  pool, query = '', textRank = null, taste = new Map(), interests = [], viewedCategories = new Map(), viewedCount = 0, budgetActive = false,
  historyTaste = null, historyQuery = '',
}) {
  const normOf = (map) => {
    const values = map ? pool.map((p) => map.get(p.id)).filter((v) => v !== undefined) : [];
    return values.length ? minMax(values) : null;
  };
  const tasteNorm = normOf(taste);
  const historyNorm = normOf(historyTaste);

  const ranked = pool.map((p) => {
    const text = textRank?.get(p.id) ?? 0;
    // Khẩu vị = trung bình các tín hiệu có: giống sản phẩm đã xem, giống các truy vấn đã tìm.
    const signals = [];
    if (tasteNorm && taste.has(p.id)) signals.push(tasteNorm(taste.get(p.id)));
    const historyScore = historyNorm && historyTaste.has(p.id) ? historyNorm(historyTaste.get(p.id)) : null;
    if (historyScore !== null) signals.push(historyScore);
    const tasteScore = signals.length ? signals.reduce((a, b) => a + b, 0) / signals.length : 0;
>>>>>>> d642a4f5436e776b2fbe4f031def991d04107e0b
    const interest = interests.includes(p.category) ? 1 : 0;
    const viewedCat = viewedCount ? (viewedCategories.get(p.category) ?? 0) / viewedCount : 0;
    const popular = textRank ? ratingScore(p.rating) : p.rating ? p.rating / 5 : 0.5;

<<<<<<< HEAD
    const W = textRank ? SEARCH_WEIGHTS : WEIGHTS;
=======
    const W = textRank ? SEARCH_WEIGHTS : historyNorm ? HISTORY_WEIGHTS : WEIGHTS;
>>>>>>> d642a4f5436e776b2fbe4f031def991d04107e0b
    const score = W.text * text + W.taste * tasteScore + W.interest * interest + W.viewedCategory * viewedCat + W.popular * popular;

    let reason = 'Gợi ý cho bạn';
    if (p.rating >= 4.7) reason = 'Được đánh giá cao';
    if (budgetActive) reason = 'Hợp ngân sách của bạn';
    if (interest) reason = `Vì bạn quan tâm ${p.category}`;
    if (tasteScore >= 0.75) reason = 'Giống sản phẩm bạn đã xem';
<<<<<<< HEAD
=======
    if (historyScore !== null && historyScore >= 0.75 && !textRank) reason = `Dựa trên tìm kiếm “${historyQuery}”`;
>>>>>>> d642a4f5436e776b2fbe4f031def991d04107e0b
    if (textRank) reason = `Khớp từ khóa “${query}”`;
    return { ...p, score: Math.round(score * 1e4) / 1e4, reason };
  });
  return ranked.sort((a, b) => b.score - a.score || a.id - b.id);
}

// Sản phẩm chưa có giá/đánh giá luôn xếp cuối khi sắp xếp theo giá/đánh giá.
const SORTERS = {
  priceAsc: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
  priceDesc: (a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity),
  rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
};

/**
 * Gợi ý cho giao diện PickForYou: POST /api/recommend.
 *  - Có từ khóa: tìm kiếm AI (hybrid) lấy ứng viên rồi xếp lại theo sở thích và lịch sử xem.
 *  - Không có từ khóa: chấm điểm cả danh mục theo khẩu vị (sản phẩm đã xem), danh mục yêu thích và đánh giá.
 *  - Ngân sách là bộ lọc cứng; danh mục yêu thích chỉ là điểm cộng.
 *  - Phân trang bằng limit/offset: thứ hạng xác định (cùng đầu vào -> cùng thứ tự) nên các trang nối tiếp nhau không trùng/sót.
 * Lịch sử xem do trình duyệt gửi lên, server không lưu.
 */
export class RecommendService {
<<<<<<< HEAD
  constructor({ products, search, textImageWeight = 0 }) {
    this.products = products;
    this.search = search;
=======
  constructor({ products, search, history = null, textImageWeight = 0 }) {
    this.products = products;
    this.search = search;
    this.history = history;
>>>>>>> d642a4f5436e776b2fbe4f031def991d04107e0b
    this.textImageWeight = textImageWeight;
  }

  async recommend({ query = '', category, interests = [], budget = 'any', viewedIds = [], sort = 'relevance', limit, offset = 0, clientId }) {
    const text = query.trim();
    const viewed = new Set(viewedIds);

    let pool;
    let mode;
    let textRank = null;
<<<<<<< HEAD
=======
    let historyTaste = null;
    let basedOn = [];
>>>>>>> d642a4f5436e776b2fbe4f031def991d04107e0b
    if (text) {
      // rerank: false vì ở đây rankProducts sẽ trộn độ khớp + số sao + cá nhân hóa trong một lần xếp hạng.
      const found = await this.search.searchText({ query: text, category, limit: SEARCH_POOL, clientId, rerank: false });
      pool = found.items;
      mode = found.mode; // 'hybrid' (AI) hoặc 'keyword' (AI không khả dụng)
      textRank = relevanceScores(pool, { textImageWeight: this.textImageWeight });
    } else {
      pool = (await this.products.listForRanking({ category })).filter((p) => !viewed.has(p.id)); // đã xem rồi thì đừng gợi ý lại
<<<<<<< HEAD
      mode = viewedIds.length || interests.length ? 'personalized' : 'browse';
=======
      // Lịch sử tìm kiếm (PostgreSQL, theo X-Client-Id) -> khẩu vị: truy vấn càng mới càng nặng.
      const past = clientId && this.history ? await this.history.recentTextQueries(clientId, { limit: HISTORY_ROWS_TO_READ }) : [];
      const fromHistory = tasteFromHistory(past);
      if (fromHistory) {
        historyTaste = await this.products.similarityToVector(fromHistory.embedding, { category });
        basedOn = fromHistory.queries;
      }
      mode = viewedIds.length || interests.length || fromHistory ? 'personalized' : 'browse';
>>>>>>> d642a4f5436e776b2fbe4f031def991d04107e0b
    }

    const range = BUDGETS[budget];
    if (range) pool = pool.filter((p) => p.price != null && p.price >= range[0] && p.price < range[1]);

    const [taste, viewedProducts] = viewedIds.length
      ? await Promise.all([this.products.similarityToTaste(viewedIds, { category }), this.products.findByIds(viewedIds)])
      : [new Map(), []];
    const viewedCategories = new Map();
    for (const p of viewedProducts) viewedCategories.set(p.category, (viewedCategories.get(p.category) ?? 0) + 1);

    const ranked = rankProducts({
      pool,
      query: text,
      textRank,
      taste,
      interests,
      viewedCategories,
      viewedCount: viewedProducts.length,
      budgetActive: Boolean(range),
<<<<<<< HEAD
    });
    // Sắp xếp trên TOÀN BỘ ứng viên rồi mới cắt trang. Sort ổn định nên hòa nhau thì giữ thứ tự theo điểm gợi ý.
    if (SORTERS[sort]) ranked.sort(SORTERS[sort]);
    return { items: ranked.slice(offset, offset + limit), total: ranked.length, mode };
=======
      historyTaste,
      historyQuery: basedOn[0] ?? '',
    });
    // Sắp xếp trên TOÀN BỘ ứng viên rồi mới cắt trang. Sort ổn định nên hòa nhau thì giữ thứ tự theo điểm gợi ý.
    if (SORTERS[sort]) ranked.sort(SORTERS[sort]);
    return { items: ranked.slice(offset, offset + limit), total: ranked.length, mode, basedOn };
>>>>>>> d642a4f5436e776b2fbe4f031def991d04107e0b
  }
}
