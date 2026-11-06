import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { createImageUpload } from '../middlewares/upload.js';
import { requireAdmin } from '../middlewares/require-admin.js';
import { createLimiter } from '../middlewares/rate-limit.js';
import * as schemas from '../validators/schemas.js';
import { createProductController } from '../controllers/product.controller.js';
import { createSearchController } from '../controllers/search.controller.js';
import { createRecommendationController } from '../controllers/recommendation.controller.js';
import { createHistoryController } from '../controllers/history.controller.js';
import { createAdminController } from '../controllers/admin.controller.js';
import { createHealthController } from '../controllers/health.controller.js';

/** Gắn toàn bộ route của API. Mỗi nhóm route nằm trong một Router riêng cho dễ đọc. */
export function createApiRouter({ services, config }) {
  const api = Router();
  const admin = requireAdmin(config);
  const searchLimiter = createLimiter({ limit: config.searchRateLimitPerMin });

  const health = createHealthController(services);
  const products = createProductController(services);
  const search = createSearchController(services);
  const recommendations = createRecommendationController(services);
  const history = createHistoryController(services);
  const adminCtl = createAdminController(services);

  api.get('/health', health.check);

  // Sản phẩm
  const productRoutes = Router();
  productRoutes.get('/', validate({ query: schemas.listProductsQuery }), products.list);
  productRoutes.post('/', admin, validate({ body: schemas.createProductBody }), products.create);
  productRoutes.get('/:id', validate({ params: schemas.idParams }), products.get);
  productRoutes.get('/:id/similar', validate({ params: schemas.idParams, query: schemas.limitQuery(6) }), products.similar);
  productRoutes.delete('/:id', admin, validate({ params: schemas.idParams }), products.remove);
  api.use('/products', productRoutes);
  api.get('/categories', products.categories);

  // Tìm kiếm (giới hạn tần suất chặt hơn vì mỗi lượt tốn tài nguyên AI)
  const searchRoutes = Router();
  searchRoutes.use(searchLimiter);
  searchRoutes.post('/text', validate({ body: schemas.searchTextBody }), search.text);
  searchRoutes.post('/image', createImageUpload(config), validate({ body: schemas.searchImageBody }), search.image);
  api.use('/search', searchRoutes);

  // Gợi ý & lịch sử
  api.get('/recommendations', validate({ query: schemas.limitQuery(8) }), recommendations.forMe);
  // Gợi ý cá nhân hóa (từ khóa + sở thích + ngân sách + lịch sử xem). Giao diện gọi endpoint này cho mọi thao tác duyệt
  // (đổi tab, "Xem thêm"...), nên chỉ lượt CÓ từ khóa (thực sự gọi dịch vụ AI) mới chịu giới hạn chặt như tìm kiếm;
  // các lượt còn lại chỉ đọc database và nằm dưới giới hạn chung của /api.
  const aiOnlyWhenQuery = (req, res, next) => (req.body?.query?.trim?.() ? searchLimiter(req, res, next) : next());
  api.post('/recommend', aiOnlyWhenQuery, validate({ body: schemas.recommendBody }), recommendations.personalized);
  api.get('/history', validate({ query: schemas.limitQuery(10) }), history.recent);
  api.delete('/history', history.clear);

  // Quản trị
  api.post('/admin/reindex', admin, adminCtl.reindex);

  return api;
}
