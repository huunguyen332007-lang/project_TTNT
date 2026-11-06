import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IndexingService } from '../../src/services/indexing.service.js';
import { HttpError, ErrorCodes } from '../../src/utils/http-error.js';

const silent = { warn() {}, info() {}, error() {} };
const aiDown = () => new HttpError(503, 'down', { code: ErrorCodes.AI_UNAVAILABLE });

function build({ queue, embedText, embedImage }) {
  const updates = [];
  const products = {
    findNeedingEmbeddings: async ({ excludeIds }) => {
      const next = queue.filter((p) => !excludeIds.includes(p.id) && !updates.some((u) => u.id === p.id)).slice(0, 2);
      return next;
    },
    updateEmbeddings: async (id, v) => void updates.push({ id, ...v }),
  };
  const embeddings = {
    embedProductText: embedText ?? (async () => [1]),
    embedProductImage: embedImage ?? (async () => [2]),
  };
  return { svc: new IndexingService({ products, embeddings, logger: silent }), updates };
}

test('indexOne: ảnh lỗi vẫn lưu embedding văn bản', async () => {
  const { svc, updates } = build({ queue: [], embedImage: async () => { throw new Error('ảnh chết'); } });
  await svc.indexOne({ id: 1 });
  assert.deepEqual(updates, [{ id: 1, text: [1], image: null }]);
});

test('indexOne: ném lỗi khi cả hai đều thất bại', async () => {
  const { svc } = build({ queue: [], embedText: async () => { throw aiDown(); }, embedImage: async () => { throw aiDown(); } });
  await assert.rejects(() => svc.indexOne({ id: 1 }), (e) => e.code === ErrorCodes.AI_UNAVAILABLE);
});

test('indexOne: chỉ nhúng phần còn thiếu', async () => {
  let textCalls = 0;
  const { svc, updates } = build({ queue: [], embedText: async () => (textCalls++, [1]) });
  await svc.indexOne({ id: 5, needsText: false, needsImage: true });
  assert.equal(textCalls, 0);
  assert.deepEqual(updates, [{ id: 5, text: null, image: [2] }]);
});

test('reindexMissing: xử lý hết hàng đợi và không lặp vô hạn với sản phẩm lỗi vĩnh viễn', async () => {
  const queue = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const { svc, updates } = build({
    queue,
    embedText: async (p) => { if (p.id === 2) throw new Error('hỏng'); return [1]; },
    embedImage: async (p) => { if (p.id === 2) throw new Error('hỏng'); return [2]; },
  });
  const result = await svc.reindexMissing({ batchSize: 2 });
  assert.deepEqual(result, { indexed: 2, failed: 1 });
  assert.deepEqual(updates.map((u) => u.id).sort(), [1, 3]);
});

test('reindexMissing: dừng và ném lỗi khi AI không khả dụng', async () => {
  const { svc } = build({ queue: [{ id: 1 }], embedText: async () => { throw aiDown(); }, embedImage: async () => { throw aiDown(); } });
  await assert.rejects(() => svc.reindexMissing(), (e) => e.code === ErrorCodes.AI_UNAVAILABLE);
});
