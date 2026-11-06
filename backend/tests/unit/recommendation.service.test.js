import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RecommendationService } from '../../src/services/recommendation.service.js';

function build({ recent = [], popular = [], exists = true } = {}) {
  const seen = {};
  const products = {
    findNearestByText: async (a) => ((seen.nearest = a), [{ id: 1 }]),
    findLatest: async (a) => ((seen.latest = a), [{ id: 9 }]),
    findById: async () => (exists ? { id: 1 } : null),
    findSimilar: async (id, o) => ((seen.similar = { id, ...o }), [{ id: 2 }]),
  };
  const history = {
    recentTextQueries: async () => recent,
    popularQueries: async () => popular,
  };
  return { svc: new RecommendationService({ products, history }), seen };
}

test('forClient: chưa có lịch sử -> trả sản phẩm mới nhất', async () => {
  const { svc, seen } = build({ popular: ['ghế'] });
  const out = await svc.forClient({ clientId: 'c1', limit: 4 });
  assert.equal(out.strategy, 'latest');
  assert.deepEqual(out.items, [{ id: 9 }]);
  assert.deepEqual(out.trendingQueries, ['ghế']);
  assert.equal(seen.latest.limit, 4);
});

test('forClient: có lịch sử -> cá nhân hóa bằng vector trung bình đã chuẩn hóa', async () => {
  const { svc, seen } = build({
    recent: [{ query: 'ghế', embedding: [1, 0] }, { query: 'đèn', embedding: [0, 1] }, { query: 'ghế', embedding: [1, 0] }],
  });
  const out = await svc.forClient({ clientId: 'c1', limit: 8 });
  assert.equal(out.strategy, 'personalized');
  assert.deepEqual(out.basedOn, ['ghế', 'đèn']); // khử trùng, giữ thứ tự
  assert.ok(Math.abs(Math.hypot(...seen.nearest.embedding) - 1) < 1e-9);
});

test('forClient: khách ẩn danh không truy vấn lịch sử', async () => {
  const { svc } = build({ recent: [{ query: 'x', embedding: [1, 0] }] });
  const out = await svc.forClient({ clientId: null });
  assert.equal(out.strategy, 'latest');
});

test('similarTo: 404 nếu sản phẩm không tồn tại', async () => {
  const { svc } = build({ exists: false });
  await assert.rejects(() => svc.similarTo(99, { limit: 3 }), (e) => e.status === 404);
});

test('similarTo: trả danh sách tương tự', async () => {
  const { svc, seen } = build();
  assert.deepEqual(await svc.similarTo(1, { limit: 3 }), [{ id: 2 }]);
  assert.deepEqual(seen.similar, { id: 1, limit: 3 });
});
