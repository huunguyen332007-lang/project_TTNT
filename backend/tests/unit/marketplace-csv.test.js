import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePrice, parseRating, canonicalUrl, parseRows, cleanRows } from '../../src/import/marketplace-csv.js';

const MAP = { 'Áo thời trang': 'Thời trang', 'Giày thể thao': 'Giày dép', 'Son môi': 'Làm đẹp' };
const HEADER = 'Tên sản phẩm,Giá,Đánh giá,URL,Hình ảnh,Nhãn sản phẩm\n';

test('parsePrice: giá đơn, có khoảng trắng, khoảng giá và dữ liệu rỗng', () => {
  assert.equal(parsePrice('43.020₫'), 43020);
  assert.equal(parsePrice('210.000\u00a0₫'), 210000);
  assert.equal(parsePrice('40.900₫ - 52.900₫'), 40900);
  assert.equal(parsePrice('5.760.000₫ - 8.910.000₫'), 5760000);
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice('Liên hệ'), null);
  assert.equal(parsePrice('0₫'), null); // cào hụt giá, không phải hàng miễn phí
});

test('parseRating: giữ trong 0..5', () => {
  assert.equal(parseRating('4.9'), 4.9);
  assert.equal(parseRating('4,5'), 4.5);
  assert.equal(parseRating('7'), null);
  assert.equal(parseRating(''), null);
  assert.equal(parseRating('0'), null); // chưa có đánh giá
});

test('canonicalUrl: bỏ query và fragment, URL hỏng -> null', () => {
  assert.equal(canonicalUrl('https://shopee.vn/a-i.1.2?extraParams=x&image_ids=y#z'), 'https://shopee.vn/a-i.1.2');
  assert.equal(canonicalUrl('không phải url'), null);
});

test('parseRows: ánh xạ danh mục, giữ nhãn gốc trong tag, xử lý dấu phẩy trong ô có ngoặc kép', () => {
  const csv = `${HEADER}"Áo ba lỗ, form body",43.020₫,4.9,https://shopee.vn/a-i.1.2?x=1,https://img/a.jpg,Áo thời trang\nSon A,90.000₫,5.0,https://shopee.vn/b-i.1.3,https://img/b.jpg,Son môi\n`;
  const { rows, invalid } = parseRows(csv, MAP);
  assert.equal(invalid.length, 0);
  assert.deepEqual(rows[0], {
    title: 'Áo ba lỗ, form body', category: 'Thời trang', tag: 'Áo thời trang', imageUrl: 'https://img/a.jpg',
    description: '', price: 43020, rating: 4.9, sourceUrl: 'https://shopee.vn/a-i.1.2',
  });
  assert.equal(rows[1].category, 'Làm đẹp');
  assert.equal(rows[1].tag, 'Son môi');
});

test('parseRows: nhãn lạ giữ nguyên, dòng thiếu dữ liệu bị báo là không hợp lệ, thiếu cột thì ném lỗi', () => {
  const csv = `${HEADER}X,1.000₫,4,https://shopee.vn/x,https://img/x.jpg,Nhãn mới\n,1.000₫,4,https://shopee.vn/y,https://img/y.jpg,Son môi\n`;
  const { rows, invalid } = parseRows(csv, MAP);
  assert.equal(rows[0].category, 'Nhãn mới');
  assert.equal(rows[0].tag, ''); // nhãn trùng tên danh mục thì không lặp lại
  assert.deepEqual(invalid, [{ line: 3, reason: 'thiếu tên, URL hoặc ảnh hợp lệ' }]);
  assert.throws(() => parseRows('a,b\n1,2\n', MAP), /thiếu cột/);
});

const row = (o) => ({ title: 't', category: 'c', tag: '', imageUrl: 'i', description: '', price: 1, rating: 5, sourceUrl: 'u', ...o });

test('cleanRows: loại trùng URL, ảnh dùng chung giữa nhiều danh mục, và tin đăng lặp', () => {
  const rows = [
    row({ sourceUrl: 'u1', title: 'Giày A', category: 'Giày dép', imageUrl: 'shoe' }),
    row({ sourceUrl: 'u1', title: 'Giày A', category: 'Giày dép', imageUrl: 'shoe' }), // trùng URL
    row({ sourceUrl: 'u2', title: 'giày a ', category: 'Giày dép', imageUrl: 'shoe' }), // cùng ảnh + tiêu đề (đã chuẩn hóa ở parseRows; ở đây giữ nguyên chữ)
    row({ sourceUrl: 'u3', title: 'Ốp lưng', category: 'Điện thoại', imageUrl: 'bad' }),
    row({ sourceUrl: 'u4', title: 'Khăn tắm', category: 'Nhà cửa', imageUrl: 'bad' }), // ảnh nhầm
    row({ sourceUrl: 'u5', title: 'Son', category: 'Làm đẹp', imageUrl: 'lip' }),
  ];
  const { rows: kept, stats } = cleanRows(rows);
  assert.deepEqual(kept.map((r) => r.sourceUrl), ['u1', 'u2', 'u5']);
  assert.deepEqual(stats, { input: 6, duplicateUrl: 1, conflictingImage: 2, duplicateListing: 0, kept: 3 });
  assert.equal(cleanRows(rows, { keepConflicts: true }).rows.length, 5);
});

test('dữ liệu thật: số liệu làm sạch khớp phân tích ban đầu', async () => {
  const file = new URL('../../src/db/seed-data/marketplace-products.csv', import.meta.url);
  const map = JSON.parse(await readFile(new URL('../../src/db/seed-data/category-map.json', import.meta.url), 'utf8'));
  const { rows, invalid } = parseRows(await readFile(file, 'utf8'), map);
  assert.equal(invalid.length, 0);
  assert.equal(rows.length, 1784);
  const { rows: kept, stats } = cleanRows(rows);
  assert.equal(stats.conflictingImage, 28);
  assert.equal(kept.length, 1745);
  assert.ok(kept.every((r) => r.price === null || r.price > 0));
  assert.equal(rows.filter((r) => r.price === null).length, 88); // dòng có giá 0₫ trong nguồn
  assert.ok(rows.every((r) => r.rating === null || (r.rating >= 1 && r.rating <= 5)));
  // mọi nhãn trong CSV đều có trong bảng gom nhóm -> không có danh mục "lạ"
  assert.equal(new Set(rows.map((r) => r.category)).size, 10);
});
