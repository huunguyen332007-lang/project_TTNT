import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SearchService } from '../../src/services/search.service.js';
import { HttpError, ErrorCodes } from '../../src/utils/http-error.js';

const silent = { warn() {}, info() {}, error() {} };
const aiDown = () => new HttpError(503, 'AI down', { code: ErrorCodes.AI_UNAVAILABLE });

function build({ embedQuery, embedUploadedImage } = {}) {
  const calls = { hybrid: [], keyword: [], image: [], history: [] };
  const products = {
    searchHybrid: async (a) => (calls.hybrid.push(a), [{ id: 1, title: 'Ghế' }]),
    searchKeyword: async (a) => (calls.keyword.push(a), [{ id: 2, title: 'Bàn' }]),
    searchByImage: async (a) => (calls.image.push(a), [{ id: 3, title: 'Đèn' }, { id: 4, title: 'Tủ' }]),
  };
  const history = { record: async (e) => void calls.history.push(e) };
  const embeddings = {
    embedQuery: embedQuery ?? (async () => [0.1, 0.2]),
    embedUploadedImage: embedUploadedImage ?? (async () => [0.3, 0.4]),
  };
  const svc = new SearchService({ products, history, embeddings, logger: silent, textMinSimilarity: 0.2, imageMinSimilarity: 0.5 });
  return { svc, calls };
}

test('searchText: dùng hybrid khi AI sẵn sàng và truyền ngưỡng similarity', async () => {
  const { svc, calls } = build();
  const out = await svc.searchText({ query: '  ghế gỗ ', category: 'Nội thất', limit: 5, clientId: 'c1' });
  assert.equal(out.mode, 'hybrid');
  assert.equal(out.query, 'ghế gỗ');
  assert.equal(calls.hybrid[0].tsquery, 'ghế | gỗ');
  assert.equal(calls.hybrid[0].minSimilarity, 0.2);
  assert.equal(calls.hybrid[0].category, 'Nội thất');
  assert.equal(calls.keyword.length, 0);
});

test('searchText: tự hạ cấp xuống tìm từ khóa khi AI không khả dụng', async () => {
  const { svc, calls } = build({ embedQuery: async () => { throw aiDown(); } });
  const out = await svc.searchText({ query: 'ghế', limit: 5 });
  assert.equal(out.mode, 'keyword');
  assert.equal(calls.keyword.length, 1);
  assert.equal(calls.hybrid.length, 0);
});

test('searchText: lỗi khác (không phải AI_UNAVAILABLE) vẫn được ném ra', async () => {
  const { svc } = build({ embedQuery: async () => { throw new Error('bug'); } });
  await assert.rejects(() => svc.searchText({ query: 'ghế', limit: 5 }), /bug/);
});

test('searchText: ghi lịch sử kèm embedding khi có clientId, bỏ qua khi ẩn danh', async () => {
  const a = build();
  await a.svc.searchText({ query: 'ghế', limit: 5, clientId: 'c1' });
  assert.equal(a.calls.history.length, 1);
  assert.deepEqual(a.calls.history[0].embedding, [0.1, 0.2]);
  assert.equal(a.calls.history[0].kind, 'text');

  const b = build();
  await b.svc.searchText({ query: 'ghế', limit: 5 });
  assert.equal(b.calls.history.length, 0);
});

test('searchText: lỗi ghi lịch sử không làm hỏng kết quả tìm kiếm', async () => {
  const { svc } = build();
  svc.history.record = async () => { throw new Error('db lỗi'); };
  const out = await svc.searchText({ query: 'ghế', limit: 5, clientId: 'c1' });
  assert.equal(out.count, 1);
  await new Promise((r) => setImmediate(r)); // không được có unhandled rejection
});

test('searchImage: nhúng ảnh, tìm theo ảnh, ghi lịch sử kiểu image', async () => {
  const { svc, calls } = build();
  const out = await svc.searchImage({ file: { buffer: Buffer.from('x'), mimetype: 'image/png' }, limit: 6, clientId: 'c1' });
  assert.equal(out.count, 2);
  assert.equal(calls.image[0].minSimilarity, 0.5);
  assert.equal(calls.history[0].kind, 'image');
  assert.equal(calls.history[0].embedding, null);
});

test('searchImage: ảnh không hợp lệ -> lỗi từ AI được giữ nguyên', async () => {
  const bad = new HttpError(400, 'Ảnh hỏng', { code: ErrorCodes.INVALID_IMAGE });
  const { svc } = build({ embedUploadedImage: async () => { throw bad; } });
  await assert.rejects(() => svc.searchImage({ file: { buffer: Buffer.alloc(1), mimetype: 'image/png' }, limit: 5 }), (e) => e === bad);
});

test('searchText: xếp lại để sản phẩm khớp cao và nhiều sao lên đầu, lấy rộng hơn limit rồi mới cắt', async () => {
  const { svc, calls } = build();
  svc.products.searchHybrid = async (a) => (calls.hybrid.push(a), [
    { id: 1, similarity: 0.7, rating: 4.0 },
    { id: 2, similarity: 0.7, rating: 5.0 },
    { id: 3, similarity: 0.2, rating: 5.0 },
  ]);
  const out = await svc.searchText({ query: 'ghế', limit: 2 });
  assert.equal(calls.hybrid[0].limit, 4);
  assert.deepEqual(out.items.map((p) => p.id), [2, 1]);
  assert.equal(out.count, 2);
});

test('searchText: rerank=false giữ nguyên thứ tự hybrid và limit gốc (dành cho RecommendService)', async () => {
  const { svc, calls } = build();
  svc.products.searchHybrid = async (a) => (calls.hybrid.push(a), [{ id: 1, similarity: 0.2, rating: 3 }, { id: 2, similarity: 0.9, rating: 5 }]);
  const out = await svc.searchText({ query: 'ghế', limit: 7, rerank: false });
  assert.equal(calls.hybrid[0].limit, 7);
  assert.deepEqual(out.items.map((p) => p.id), [1, 2]);
});

test('searchImage: xếp lại theo độ giống ảnh và số sao', async () => {
  const { svc, calls } = build();
  svc.products.searchByImage = async (a) => (calls.image.push(a), [
    { id: 1, similarity: 0.90, rating: 3.5 },
    { id: 2, similarity: 0.89, rating: 5.0 },
    { id: 3, similarity: 0.50, rating: 5.0 },
  ]);
  const out = await svc.searchImage({ file: { buffer: Buffer.from('x'), mimetype: 'image/png' }, limit: 3 });
  assert.equal(calls.image[0].limit, 6);
  assert.deepEqual(out.items.map((p) => p.id), [2, 1, 3]);
});
