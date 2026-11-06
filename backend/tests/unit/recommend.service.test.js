import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RecommendService, rankProducts } from '../../src/services/recommend.service.js';

const P = (id, o = {}) => ({ id, title: `SP ${id}`, category: 'Thời trang', tag: '', imageUrl: 'x', description: '', price: 100_000, rating: 4, sourceUrl: null, indexed: true, ...o });

test('rankProducts: không có tín hiệu cá nhân thì xếp theo đánh giá, hòa điểm thì id nhỏ trước', () => {
  const out = rankProducts({ pool: [P(3, { rating: 4 }), P(2, { rating: 5 }), P(1, { rating: 4 })] });
  assert.deepEqual(out.map((p) => p.id), [2, 1, 3]);
  assert.equal(out[0].reason, 'Được đánh giá cao');
});

test('rankProducts: chưa có đánh giá được mức trung tính, không bị đẩy xuống dưới sản phẩm 1 sao', () => {
  const out = rankProducts({ pool: [P(1, { rating: null }), P(2, { rating: 1 })] });
  assert.deepEqual(out.map((p) => p.id), [1, 2]);
});

test('rankProducts: danh mục yêu thích được cộng điểm và có lý do riêng', () => {
  const out = rankProducts({ pool: [P(1, { category: 'Giày dép', rating: 4 }), P(2, { category: 'Làm đẹp', rating: 4.2 })], interests: ['Giày dép'] });
  assert.equal(out[0].id, 1);
  assert.equal(out[0].reason, 'Vì bạn quan tâm Giày dép');
});

test('rankProducts: khẩu vị (giống sản phẩm đã xem) thắng đánh giá cao hơn một chút', () => {
  const taste = new Map([[1, 0.9], [2, 0.5], [3, 0.7]]);
  const out = rankProducts({ pool: [P(1, { rating: 3.5 }), P(2, { rating: 4.6 }), P(3, { rating: 4 })], taste });
  assert.equal(out[0].id, 1);
  assert.equal(out[0].reason, 'Giống sản phẩm bạn đã xem');
});

test('rankProducts: có từ khóa thì thứ hạng tìm kiếm là tín hiệu mạnh nhất và lý do nêu từ khóa', () => {
  const textRank = new Map([[1, 1], [2, 0.5], [3, 0]]);
  const out = rankProducts({ pool: [P(3, { rating: 5 }), P(2, { rating: 4 }), P(1, { rating: 3 })], query: 'giày', textRank });
  assert.deepEqual(out.map((p) => p.id), [1, 2, 3]);
  assert.equal(out[0].reason, 'Khớp từ khóa “giày”');
});

function makeService({ pool = [], found = { items: [], mode: 'hybrid' }, taste = new Map(), viewed = [] } = {}) {
  const calls = {};
  const products = {
    listForRanking: async (a) => ((calls.list = a), pool),
    similarityToTaste: async (ids, a) => ((calls.taste = { ids, ...a }), taste),
    findByIds: async (ids) => ((calls.byIds = ids), viewed),
  };
  const search = { searchText: async (a) => ((calls.search = a), found) };
  return { svc: new RecommendService({ products, search }), calls };
}

test('recommend: không từ khóa -> duyệt cả danh mục, bỏ sản phẩm đã xem, mode browse', async () => {
  const { svc, calls } = makeService({ pool: [P(1), P(2), P(3)] });
  const r = await svc.recommend({ viewedIds: [], category: 'Giày dép', limit: 10 });
  assert.equal(r.mode, 'browse');
  assert.equal(calls.list.category, 'Giày dép');
  assert.equal(calls.search, undefined, 'không gọi tìm kiếm khi không có từ khóa');

  const r2 = await makeService({ pool: [P(1), P(2), P(3)] }).svc.recommend({ viewedIds: [2], limit: 10 });
  assert.deepEqual(r2.items.map((p) => p.id), [1, 3]);
  assert.equal(r2.mode, 'personalized');
});

test('recommend: có từ khóa -> dùng tìm kiếm AI, giữ nguyên mode (hybrid/keyword) kể cả khi AI tắt', async () => {
  const { svc, calls } = makeService({ found: { items: [P(5), P(6)], mode: 'keyword' } });
  const r = await svc.recommend({ query: '  tai nghe ', limit: 10 });
  assert.equal(calls.search.query, 'tai nghe');
  assert.equal(r.mode, 'keyword');
  assert.deepEqual(r.items.map((p) => p.id), [5, 6]);
  assert.ok(r.items.every((p) => p.reason === 'Khớp từ khóa “tai nghe”'));
});

test('recommend: ngân sách là bộ lọc cứng, loại cả sản phẩm chưa có giá', async () => {
  const pool = [P(1, { price: 50_000 }), P(2, { price: 150_000 }), P(3, { price: 299_999 }), P(4, { price: 300_000 }), P(5, { price: null })];
  const r = await makeService({ pool }).svc.recommend({ budget: 'mid', limit: 10 });
  assert.deepEqual(r.items.map((p) => p.id).sort(), [2, 3]);
  assert.equal(r.total, 2);
  assert.ok(r.items.every((p) => p.reason === 'Hợp ngân sách của bạn' || p.reason.startsWith('Vì bạn')));
});

test('recommend: lịch sử xem tạo khẩu vị và ưu tiên danh mục đã xem; limit cắt kết quả nhưng total vẫn đủ', async () => {
  const pool = [P(1, { category: 'Làm đẹp', rating: 4 }), P(2, { category: 'Giày dép', rating: 4 }), P(3, { category: 'Giày dép', rating: 4 })];
  const { svc, calls } = makeService({ pool, taste: new Map([[1, 0.2], [2, 0.8], [3, 0.6]]), viewed: [P(9, { category: 'Giày dép' })] });
  const r = await svc.recommend({ viewedIds: [9], limit: 2 });
  assert.deepEqual(calls.taste.ids, [9]);
  assert.deepEqual(r.items.map((p) => p.id), [2, 3]);
  assert.equal(r.total, 3);
});

test('recommend: sắp xếp theo giá trên toàn bộ ứng viên trước khi cắt trang, sản phẩm chưa có giá xuống cuối', async () => {
  const pool = [P(1, { price: 300 }), P(2, { price: null }), P(3, { price: 100 }), P(4, { price: 200 })];
  const { svc } = makeService({ pool });
  const asc = await svc.recommend({ sort: 'priceAsc', limit: 2 });
  assert.deepEqual(asc.items.map((p) => p.id), [3, 4]);
  const desc = await svc.recommend({ sort: 'priceDesc', limit: 10 });
  assert.deepEqual(desc.items.map((p) => p.id), [1, 4, 3, 2]);
  const rated = await makeService({ pool: [P(1, { rating: 4 }), P(2, { rating: null }), P(3, { rating: 5 })] }).svc.recommend({ sort: 'rating', limit: 10 });
  assert.deepEqual(rated.items.map((p) => p.id), [3, 1, 2]);
});

test('recommend: các trang limit/offset nối tiếp nhau không trùng và không sót', async () => {
  const pool = Array.from({ length: 25 }, (_, i) => P(i + 1, { rating: 3 + ((i * 7) % 20) / 10 }));
  const { svc } = makeService({ pool });
  const all = (await svc.recommend({ limit: 300 })).items.map((p) => p.id);
  const paged = [];
  for (let offset = 0; offset < 25; offset += 10) paged.push(...(await svc.recommend({ limit: 10, offset })).items.map((p) => p.id));
  assert.deepEqual(paged, all);
  assert.equal(new Set(paged).size, 25);
});

test('recommend: từ khóa -> khớp cao và nhiều sao lên đầu, tắt rerank ở SearchService để không xếp hạng hai lần', async () => {
  const found = { items: [P(1, { similarity: 0.60, rating: 4.0 }), P(2, { similarity: 0.60, rating: 5.0 }), P(3, { similarity: 0.20, rating: 5.0 })], mode: 'hybrid' };
  const { svc, calls } = makeService({ found });
  const r = await svc.recommend({ query: 'áo', limit: 10 });
  assert.equal(calls.search.rerank, false);
  assert.deepEqual(r.items.map((p) => p.id), [2, 1, 3]);
  assert.equal(r.items[0].similarity, 0.6, 'độ khớp được giữ lại để giao diện hiển thị');
});
