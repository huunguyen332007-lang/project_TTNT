import express from 'express';
import cors from 'cors';
import { productsPool, searchPool } from './db.js';
import { config } from './config.js';

export function createApp() {
  const app = express();
  app.use(cors({ origin: config.frontendOrigin === '*' ? true : config.frontendOrigin }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      await Promise.all([productsPool.query('SELECT 1'), searchPool.query('SELECT 1')]);
      res.json({ status: 'ok', databases: ['products_db', 'search_db'] });
    } catch {
      res.status(503).json({ status: 'error', message: 'Database chưa sẵn sàng' });
    }
  });

  app.get('/api/products', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const category = String(req.query.category || 'Tất cả').trim();
      const params = [];
      let where = [];
      if (q) {
        params.push(`%${q}%`);
        where.push(`(title ILIKE $${params.length} OR category ILIKE $${params.length} OR description ILIKE $${params.length} OR tag ILIKE $${params.length})`);
      }
      if (category && category !== 'Tất cả') {
        params.push(category);
        where.push(`category = $${params.length}`);
      }
      const sql = `SELECT id, title, category, tag, image, description FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id`;
      const { rows } = await productsPool.query(sql, params);
      res.json({ items: rows, count: rows.length });
    } catch (err) {
      console.error('[api] tìm sản phẩm lỗi:', err);
      res.status(500).json({ message: 'Không thể tìm sản phẩm lúc này' });
    }
  });

  // Ghi lịch sử tìm kiếm vào database RIÊNG, không ghi vào database sản phẩm.
  app.post('/api/search', async (req, res) => {
    try {
      const query = String(req.body?.query || '').trim().slice(0, 250);
      const category = String(req.body?.category || 'Tất cả').trim().slice(0, 100);
      if (!query) return res.status(400).json({ message: 'Vui lòng nhập từ khóa tìm kiếm' });
      const found = await productsPool.query(
        `SELECT id, title, category, tag, image, description FROM products
         WHERE (title ILIKE $1 OR category ILIKE $1 OR description ILIKE $1 OR tag ILIKE $1)
         AND ($2 = 'Tất cả' OR category = $2) ORDER BY id`,
        [`%${query}%`, category]
      );
      await searchPool.query(
        'INSERT INTO search_history (query, category, result_count) VALUES ($1,$2,$3)',
        [query, category, found.rows.length]
      );
      res.json({ items: found.rows, count: found.rows.length });
    } catch (err) {
      console.error('[api] tìm kiếm/ghi lịch sử lỗi:', err);
      res.status(500).json({ message: 'Không thể thực hiện tìm kiếm lúc này' });
    }
  });

  // Gợi ý dựa trên các từ khóa được tìm gần đây và phổ biến; có thể thay bằng ML sau.
  app.get('/api/recommendations', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim().slice(0, 250);
      const { rows } = await searchPool.query(
        `SELECT query, COUNT(*)::int AS searches, MAX(searched_at) AS last_searched
         FROM search_history
         WHERE ($1 = '' OR query ILIKE $2 OR category ILIKE $2)
         GROUP BY query ORDER BY COUNT(*) DESC, MAX(searched_at) DESC LIMIT 5`,
        [q, `%${q}%`]
      );
      let items = [];
      if (rows.length) {
        const terms = rows.map(r => r.query);
        const found = await productsPool.query(
          `SELECT p.id, p.title, p.category, p.tag, p.image, p.description
           FROM products p
           WHERE ${terms.map((_, i) => `(p.title ILIKE $${i + 1} OR p.category ILIKE $${i + 1} OR p.description ILIKE $${i + 1})`).join(' OR ')}
           ORDER BY p.id LIMIT 6`,
          terms.map(term => `%${term}%`)
        );
        items = found.rows;
      }
      // Nếu chưa có lịch sử phù hợp, trả về sản phẩm mới nhất làm gợi ý mặc định.
      if (!items.length) {
        const fallback = await productsPool.query('SELECT id, title, category, tag, image, description FROM products ORDER BY id DESC LIMIT 3');
        items = fallback.rows;
      }
      res.json({ items, popularQueries: rows });
    } catch (err) {
      console.error('[api] gợi ý lỗi:', err);
      res.status(500).json({ message: 'Không thể tải gợi ý lúc này' });
    }
  });

  app.get('/api/search-history', async (_req, res) => {
    try {
      const { rows } = await searchPool.query('SELECT id, query, category, result_count, searched_at FROM search_history ORDER BY searched_at DESC LIMIT 20');
      res.json({ items: rows });
    } catch (err) {
      res.status(500).json({ message: 'Không thể tải lịch sử tìm kiếm' });
    }
  });

  return app;
}
