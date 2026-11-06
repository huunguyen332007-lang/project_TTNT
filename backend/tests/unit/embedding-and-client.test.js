import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EmbeddingService } from '../../src/services/embedding.service.js';
import { AiClient } from '../../src/clients/ai.client.js';
import { fetchImageBuffer } from '../../src/utils/fetch-image.js';
import { ErrorCodes } from '../../src/utils/http-error.js';

test('EmbeddingService.embedQuery: cache truy vấn lặp lại (không phân biệt hoa thường)', async () => {
  let calls = 0;
  const ai = { embedTexts: async (t) => (calls++, t.map(() => [calls])) };
  const svc = new EmbeddingService({ ai });
  const a = await svc.embedQuery('Ghế Gỗ');
  const b = await svc.embedQuery('ghế gỗ');
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
});

test('EmbeddingService: loại bỏ mục cũ nhất khi cache đầy', async () => {
  let calls = 0;
  const ai = { embedTexts: async (t) => (calls++, t.map(() => [calls])) };
  const svc = new EmbeddingService({ ai, cacheSize: 2 });
  await svc.embedQuery('a');
  await svc.embedQuery('b');
  await svc.embedQuery('c'); // đẩy 'a' ra
  await svc.embedQuery('a');
  assert.equal(calls, 4);
});

const jsonRes = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('AiClient: lỗi mạng -> AI_UNAVAILABLE (503)', async () => {
  const ai = new AiClient({ baseUrl: 'http://x', fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(() => ai.embedTexts(['a']), (e) => e.status === 503 && e.code === ErrorCodes.AI_UNAVAILABLE);
});

test('AiClient: AI trả 5xx -> AI_UNAVAILABLE', async () => {
  const ai = new AiClient({ baseUrl: 'http://x', fetchImpl: async () => jsonRes(500, {}) });
  await assert.rejects(() => ai.embedTexts(['a']), (e) => e.code === ErrorCodes.AI_UNAVAILABLE);
});

test('AiClient: AI từ chối ảnh (415) -> INVALID_IMAGE kèm thông điệp gốc', async () => {
  const ai = new AiClient({ baseUrl: 'http://x', fetchImpl: async () => jsonRes(415, { detail: { message: 'Không đọc được ảnh' } }) });
  await assert.rejects(
    () => ai.embedImage(Buffer.from('x'), 'image/png'),
    (e) => e.status === 415 && e.code === ErrorCodes.INVALID_IMAGE && e.message === 'Không đọc được ảnh',
  );
});

test('AiClient: gửi đúng JSON và trả về embeddings', async () => {
  let seen;
  const ai = new AiClient({
    baseUrl: 'http://ai:8000',
    fetchImpl: async (url, init) => ((seen = { url, body: JSON.parse(init.body) }), jsonRes(200, { embeddings: [[1, 2]] })),
  });
  assert.deepEqual(await ai.embedTexts(['xin chào']), [[1, 2]]);
  assert.equal(seen.url, 'http://ai:8000/embed/text');
  assert.deepEqual(seen.body, { texts: ['xin chào'] });
});

test('AiClient.embedImage: gửi multipart với trường "file"', async () => {
  let form;
  const ai = new AiClient({ baseUrl: 'http://x', fetchImpl: async (_u, init) => ((form = init.body), jsonRes(200, { embedding: [3] })) });
  assert.deepEqual(await ai.embedImage(Buffer.from('abc'), 'image/png'), [3]);
  assert.ok(form instanceof FormData);
  assert.equal(form.get('file').type, 'image/png');
});

test('fetchImageBuffer: từ chối giao thức không phải http(s)', async () => {
  await assert.rejects(() => fetchImageBuffer('file:///etc/passwd'), (e) => e.code === ErrorCodes.INVALID_IMAGE);
  await assert.rejects(() => fetchImageBuffer('khong-phai-url'), (e) => e.code === ErrorCodes.INVALID_IMAGE);
});

test('fetchImageBuffer: từ chối nội dung không phải ảnh và ảnh quá lớn', async () => {
  const html = async () => new Response('<html>', { headers: { 'content-type': 'text/html' } });
  await assert.rejects(() => fetchImageBuffer('https://a.com/x', { fetchImpl: html }), (e) => e.code === ErrorCodes.INVALID_IMAGE);

  const big = async () => new Response(Buffer.alloc(100), { headers: { 'content-type': 'image/png' } });
  await assert.rejects(() => fetchImageBuffer('https://a.com/x', { fetchImpl: big, maxBytes: 10 }), /quá lớn/);
});

test('fetchImageBuffer: trả buffer và mime type', async () => {
  const ok = async () => new Response(Buffer.from('PNGDATA'), { headers: { 'content-type': 'image/png; charset=binary' } });
  const out = await fetchImageBuffer('https://a.com/x.png', { fetchImpl: ok });
  assert.equal(out.mimeType, 'image/png');
  assert.equal(out.buffer.toString(), 'PNGDATA');
});
