import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distinctQueries, tasteFromHistory } from '../../src/utils/history-taste.js';

const R = (query, embedding = [1, 0]) => ({ query, embedding });

test('distinctQueries: khử trùng không phân biệt hoa thường và giữ bản mới nhất', () => {
  assert.deepEqual(distinctQueries([R('Áo thun'), R('son'), R('áo thun')]).map((r) => r.query), ['Áo thun', 'son']);
});

test('distinctQueries: bỏ truy vấn gõ dở là phần đầu của truy vấn mới hơn', () => {
  // mới nhất trước: "áo thun" gõ sau "áo th" và "áo"
  assert.deepEqual(distinctQueries([R('áo thun'), R('áo th'), R('áo'), R('son')]).map((r) => r.query), ['áo thun', 'son']);
});

test('distinctQueries: bỏ dòng thiếu embedding/trống và giới hạn số lượng', () => {
  const rows = [R('a1'), { query: 'b', embedding: null }, R(''), R('c2'), R('d3'), R('e4')];
  assert.deepEqual(distinctQueries(rows, 3).map((r) => r.query), ['a1', 'c2', 'd3']);
});

test('tasteFromHistory: truy vấn mới nặng hơn, kết quả đã chuẩn hóa', () => {
  const t = tasteFromHistory([R('mới', [1, 0]), R('cũ', [0, 1])]);
  assert.deepEqual(t.queries, ['mới', 'cũ']);
  assert.ok(t.embedding[0] > t.embedding[1], 'truy vấn mới phải lấn át');
  assert.ok(Math.abs(Math.hypot(...t.embedding) - 1) < 1e-9);
});

test('tasteFromHistory: chưa có lịch sử dùng được thì trả null', () => {
  assert.equal(tasteFromHistory([]), null);
  assert.equal(tasteFromHistory([{ query: 'x', embedding: null }]), null);
});
