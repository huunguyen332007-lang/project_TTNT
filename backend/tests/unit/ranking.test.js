import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratingScore, relevanceScores, rankByMatchAndRating } from '../../src/utils/ranking.js';

const P = (id, o = {}) => ({ id, rating: 4.5, ...o });

test('ratingScore: 3 sao trở xuống = 0, 5 sao = 1, chưa có đánh giá = 0.5', () => {
  assert.equal(ratingScore(5), 1);
  assert.equal(ratingScore(4), 0.5);
  assert.equal(ratingScore(3), 0);
  assert.equal(ratingScore(1), 0);
  assert.equal(ratingScore(0), 0.5);
  assert.equal(ratingScore(null), 0.5);
});

test('relevanceScores: dùng cosine thật, co giãn min-max, không chỉ dựa vào vị trí', () => {
  // Vị trí 0 và 1 gần như bằng nhau về cosine, vị trí 2 thấp hẳn.
  const rel = relevanceScores([P(1, { similarity: 0.80 }), P(2, { similarity: 0.79 }), P(3, { similarity: 0.30 })]);
  assert.ok(rel.get(1) - rel.get(2) < 0.2, 'hai sản phẩm gần bằng nhau phải có điểm gần nhau');
  assert.ok(rel.get(2) - rel.get(3) > 0.5, 'sản phẩm kém hẳn phải bị kéo xa');
});

test('relevanceScores: thiếu similarity (kết quả từ khóa) thì rơi về thứ hạng, không NaN', () => {
  const rel = relevanceScores([P(1), P(2), P(3)]);
  [1, 2 / 3, 1 / 3].forEach((want, i) => assert.ok(Math.abs(rel.get(i + 1) - want) < 1e-9));
});

test('relevanceScores: trộn độ khớp chữ->ảnh theo trọng số, 0 = tắt', () => {
  const items = [P(1, { similarity: 0.9, imageSimilarity: 0.2 }), P(2, { similarity: 0.8, imageSimilarity: 0.4 })];
  assert.ok(relevanceScores(items).get(1) > relevanceScores(items).get(2));
  assert.ok(relevanceScores(items, { textImageWeight: 0.9 }).get(2) > relevanceScores(items, { textImageWeight: 0.9 }).get(1));
});

test('rankByMatchAndRating: khớp ngang nhau thì nhiều sao hơn lên trước', () => {
  const out = rankByMatchAndRating([P(1, { similarity: 0.7, rating: 4.0 }), P(2, { similarity: 0.7, rating: 5.0 })]);
  assert.deepEqual(out.map((p) => p.id), [2, 1]);
});

test('rankByMatchAndRating: khớp cao hơn rõ rệt thắng sao cao hơn, 5 sao nhưng lạc đề không lên đầu', () => {
  const out = rankByMatchAndRating([
    P(1, { similarity: 0.95, rating: 4.5 }),
    P(2, { similarity: 0.30, rating: 5.0 }),
    P(3, { similarity: 0.90, rating: 4.8 }),
  ]);
  assert.deepEqual(out.map((p) => p.id), [1, 3, 2]);
});

test('rankByMatchAndRating: ổn định khi hòa và không sửa mảng đầu vào', () => {
  const input = [P(1), P(2), P(3)];
  const out = rankByMatchAndRating(input);
  assert.deepEqual(out.map((p) => p.id), [1, 2, 3]);
  assert.notEqual(out, input);
  assert.deepEqual(rankByMatchAndRating([]), []);
});
