import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toVectorLiteral, parseVector, meanVector } from '../../src/utils/vector.js';
import { toTsQuery, buildProductText } from '../../src/utils/text.js';

const vec = (n, v = 0.1) => Array.from({ length: n }, () => v);

test('toVectorLiteral: tạo literal pgvector đúng định dạng', () => {
  assert.equal(toVectorLiteral([1, 2, 3], 3), '[1,2,3]');
});

test('toVectorLiteral: từ chối sai số chiều và giá trị không hợp lệ', () => {
  assert.throws(() => toVectorLiteral([1, 2], 3), TypeError);
  assert.throws(() => toVectorLiteral([1, NaN, 3], 3), TypeError);
  assert.throws(() => toVectorLiteral('abc', 3), TypeError);
  assert.equal(toVectorLiteral(vec(512)).split(',').length, 512);
});

test('parseVector đảo ngược toVectorLiteral', () => {
  assert.deepEqual(parseVector(toVectorLiteral([0.5, -1, 2], 3)), [0.5, -1, 2]);
});

test('meanVector: trung bình rồi chuẩn hóa về độ dài 1', () => {
  const m = meanVector([[1, 0], [0, 1]]);
  assert.ok(Math.abs(Math.hypot(...m) - 1) < 1e-9);
  assert.ok(Math.abs(m[0] - m[1]) < 1e-9);
});

test('meanVector: lỗi với đầu vào rỗng hoặc lệch chiều', () => {
  assert.throws(() => meanVector([]), RangeError);
  assert.throws(() => meanVector([[1, 2], [1]]), RangeError);
});

test('toTsQuery: tách từ tiếng Việt, bỏ ký tự đặc biệt, khử trùng', () => {
  assert.equal(toTsQuery('Ghế gỗ, tối giản!'), 'ghế | gỗ | tối | giản');
  assert.equal(toTsQuery('đèn đèn ĐÈN'), 'đèn');
});

test('toTsQuery: vô hiệu hóa ký tự có thể phá cú pháp tsquery', () => {
  assert.equal(toTsQuery("a' | b & !c:*"), 'a | b | c');
  assert.equal(toTsQuery('   !!! '), null);
});

test('buildProductText: bỏ trường trống và nối bằng dấu chấm', () => {
  assert.equal(
    buildProductText({ title: 'Ghế', category: 'Nội thất', tag: '', description: ' Gỗ sồi ' }),
    'Ghế. Nội thất. Gỗ sồi',
  );
});
