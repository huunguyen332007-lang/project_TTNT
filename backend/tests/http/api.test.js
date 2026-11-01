import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import pino from 'pino';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';
import { notFound } from '../../src/utils/http-error.js';

const ADMIN_KEY = 'khoa-quan-tri-test-1234';
const CLIENT_ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';

const baseEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  RATE_LIMIT_PER_MIN: '1000',
  SEARCH_RATE_LIMIT_PER_MIN: '1000',
  CORS_ORIGINS: 'http://localhost:5173',
  MAX_UPLOAD_MB: '1',
};

const product = { id: 1, title: 'Ghế gỗ', category: 'Nội thất', tag: '', imageUrl: 'https://x.test/a.jpg', description: 'Ghế gỗ sồi', price: null, indexed: true };

let calls;
let healthStatus;
const services = {
  health: { check: async () => ({ status: healthStatus, services: { database: 'up', ai: 'up' } }) },
  products: {
    list: async (q) => ({ items: [product], total: 1, limit: q.limit, offset: q.offset }),
    get: async (id) => {
      if (id === 404) throw notFound('Không tìm thấy sản phẩm');
      return product;
    },
    categories: async () => [{ name: 'Nội thất', count: 1 }],
    create: async (body) => ({ item: { ...product, ...body, id: 2 }, indexed: true }),
    remove: async (id) => void (calls.removed = id),
  },
  search: {
    searchText: async (a) => ((calls.text = a), { items: [{ ...product, similarity: 0.9 }], count: 1, mode: 'hybrid', query: a.query }),
    searchImage: async (a) => ((calls.image = a), { items: [], count: 0 }),
  },
  recommendations: {
    forClient: async (a) => ((calls.recs = a), { strategy: 'latest', basedOn: [], items: [product], trendingQueries: [] }),
    similarTo: async () => [product],
  },
  history: {
    recent: async (id) => ((calls.historyFor = id), []),
    clear: async (id) => void (calls.cleared = id),
  },
  indexing: { reindexMissing: async () => ({ indexed: 3, failed: 0 }) },
};

let server;
let baseUrl;
let disabledAdmin;
let disabledUrl;

async function listen(config) {
  const app = createApp({ config, logger: pino({ level: 'silent' }), services });
  const srv = app.listen(0, '127.0.0.1');
  await once(srv, 'listening');
  return { srv, url: `http://127.0.0.1:${srv.address().port}` };
}

before(async () => {
  ({ srv: server, url: baseUrl } = await listen(loadConfig({ ...baseEnv, ADMIN_API_KEY: ADMIN_KEY })));
  ({ srv: disabledAdmin, url: disabledUrl } = await listen(loadConfig(baseEnv)));
});

after(() => {
  server.close();
  disabledAdmin.close();
});

const api = (path, init) => fetch(`${baseUrl}/api${path}`, init);
const json = (body, headers = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

const reset = () => {
  calls = {};
  healthStatus = 'ok';
};

test('GET /health: 200 khi ổn, 503 khi database lỗi', async () => {
  reset();
  assert.equal((await api('/health')).status, 200);
  healthStatus = 'error';
  assert.equal((await api('/health')).status, 503);
  healthStatus = 'degraded';
  assert.equal((await api('/health')).status, 200); // AI chết vẫn phục vụ được -> không làm container unhealthy
});

test('GET /products: trả danh sách và áp giá trị mặc định cho phân trang', async () => {
  reset();
  const res = await api('/products');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.items.length, 1);
  assert.equal(body.limit, 24);
  assert.equal(body.offset, 0);
});

test('GET /products: tham số sai -> 400 với mã VALIDATION_ERROR', async () => {
  reset();
  const res = await api('/products?limit=abc');
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'VALIDATION_ERROR');
  assert.equal((await api('/products?limit=1000')).status, 400);
});

test('GET /products/:id: 404 khi không có, 400 khi id không phải số', async () => {
  reset();
  const missing = await api('/products/404');
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'NOT_FOUND');
  assert.equal((await api('/products/abc')).status, 400);
  assert.equal((await api('/products/1')).status, 200);
});

test('GET /products/:id/similar và /categories', async () => {
  reset();
  assert.equal((await (await api('/products/1/similar')).json()).items.length, 1);
  assert.deepEqual((await (await api('/categories')).json()).items, [{ name: 'Nội thất', count: 1 }]);
});

test('POST /search/text: yêu cầu nội dung, chuyển clientId hợp lệ vào service', async () => {
  reset();
  assert.equal((await api('/search/text', json({ query: '   ' }))).status, 400);
  assert.equal((await api('/search/text', json({}))).status, 400);

  const res = await api('/search/text', json({ query: ' ghế gỗ ', limit: 5 }, { 'x-client-id': CLIENT_ID }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).mode, 'hybrid');
  assert.equal(calls.text.query, 'ghế gỗ');
  assert.equal(calls.text.limit, 5);
  assert.equal(calls.text.clientId, CLIENT_ID);
});

test('X-Client-Id sai định dạng bị bỏ qua', async () => {
  reset();
  await api('/search/text', json({ query: 'ghế' }, { 'x-client-id': "'; DROP TABLE products;--" }));
  assert.equal(calls.text.clientId, null);
});

test('POST /search/text: JSON hỏng -> 400', async () => {
  reset();
  const res = await api('/search/text', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
  assert.equal(res.status, 400);
});

function imageForm(bytes, type, name = 'a.png') {
  const form = new FormData();
  form.append('image', new Blob([bytes], { type }), name);
  form.append('limit', '4');
  return { method: 'POST', body: form };
}

test('POST /search/image: thiếu file -> 400', async () => {
  reset();
  const form = new FormData();
  form.append('limit', '4');
  assert.equal((await api('/search/image', { method: 'POST', body: form })).status, 400);
});

test('POST /search/image: nhận PNG và chuyển buffer cho service', async () => {
  reset();
  const res = await api('/search/image', imageForm(Buffer.from('fake-png'), 'image/png'));
  assert.equal(res.status, 200);
  assert.equal(calls.image.limit, 4);
  assert.equal(calls.image.file.mimetype, 'image/png');
  assert.equal(calls.image.file.buffer.toString(), 'fake-png');
});

test('POST /search/image: sai loại tệp -> 415, quá dung lượng -> 413', async () => {
  reset();
  const wrongType = await api('/search/image', imageForm(Buffer.from('hello'), 'text/plain', 'a.txt'));
  assert.equal(wrongType.status, 415);
  assert.equal((await wrongType.json()).error.code, 'UNSUPPORTED_MEDIA_TYPE');

  const tooBig = await api('/search/image', imageForm(Buffer.alloc(2 * 1024 * 1024), 'image/png'));
  assert.equal(tooBig.status, 413);
  assert.equal((await tooBig.json()).error.code, 'FILE_TOO_LARGE');
});

test('GET /recommendations và /history dùng clientId; DELETE /history xóa theo clientId', async () => {
  reset();
  await api('/recommendations', { headers: { 'x-client-id': CLIENT_ID } });
  assert.equal(calls.recs.clientId, CLIENT_ID);
  await api('/history', { headers: { 'x-client-id': CLIENT_ID } });
  assert.equal(calls.historyFor, CLIENT_ID);
  const del = await api('/history', { method: 'DELETE', headers: { 'x-client-id': CLIENT_ID } });
  assert.equal(del.status, 204);
  assert.equal(calls.cleared, CLIENT_ID);
});

test('Endpoint quản trị: thiếu/sai khóa -> 401, đúng khóa -> chạy', async () => {
  reset();
  const body = { title: 'Bàn', imageUrl: 'https://x.test/b.jpg' };
  assert.equal((await api('/products', json(body))).status, 401);
  assert.equal((await api('/products', json(body, { 'x-api-key': 'sai' }))).status, 401);
  assert.equal((await api('/admin/reindex', { method: 'POST' })).status, 401);

  const created = await api('/products', json(body, { 'x-api-key': ADMIN_KEY }));
  assert.equal(created.status, 201);
  assert.equal((await created.json()).indexed, true);

  const reindex = await api('/admin/reindex', { method: 'POST', headers: { 'x-api-key': ADMIN_KEY } });
  assert.deepEqual(await reindex.json(), { indexed: 3, failed: 0 });

  const del = await api('/products/7', { method: 'DELETE', headers: { 'x-api-key': ADMIN_KEY } });
  assert.equal(del.status, 204);
  assert.equal(calls.removed, 7);
});

test('POST /products: dữ liệu không hợp lệ -> 400', async () => {
  reset();
  const bad = await api('/products', json({ title: '', imageUrl: 'khong-phai-url' }, { 'x-api-key': ADMIN_KEY }));
  assert.equal(bad.status, 400);
});

test('Chưa cấu hình ADMIN_API_KEY -> endpoint quản trị bị tắt (503)', async () => {
  const res = await fetch(`${disabledUrl}/api/admin/reindex`, { method: 'POST', headers: { 'x-api-key': 'bat-ky' } });
  assert.equal(res.status, 503);
});

test('Đường dẫn lạ -> 404 dạng JSON thống nhất', async () => {
  const res = await fetch(`${baseUrl}/khong-ton-tai`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, 'NOT_FOUND');
});

test('CORS: origin được phép nhận header, origin lạ thì không', async () => {
  const ok = await api('/health', { headers: { origin: 'http://localhost:5173' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const bad = await api('/health', { headers: { origin: 'https://evil.example' } });
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
});
