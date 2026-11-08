// Chạy: node --test tests/   (không cần cài thêm gì; IndexedDB được giả lập trong bộ nhớ)
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

function fakeIndexedDB() {
  const rows = [];
  let nextId = 1;
  const later = (fn) => setTimeout(fn, 0);
  const store = {
    getAll() { const req = {}; later(() => { req.result = rows.map((r) => ({ ...r })); req.onsuccess?.(); }); return req; },
    add(v) { rows.push({ ...v, id: nextId++ }); },
    delete(id) { const i = rows.findIndex((r) => r.id === id); if (i >= 0) rows.splice(i, 1); },
    clear() { rows.length = 0; },
    createIndex() {},
  };
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => store,
    close() {},
    transaction() {
      const tx = { objectStore: () => store };
      setTimeout(() => tx.oncomplete?.(), 15);
      return tx;
    },
  };
  return { open() { const req = {}; later(() => { req.result = db; req.onsuccess?.(); }); return req; }, rows };
}

let idb;
let cache;
beforeEach(async () => {
  idb = fakeIndexedDB();
  globalThis.window = globalThis;
  globalThis.indexedDB = idb;
  cache = await import(`../src/searchCache.js?${Math.random()}`);
});

const item = (id) => ({ id, name: `SP ${id}`, rating: 4.5 });
const text = (query, category = "Tất cả", n = 2) => ({ kind: "text", query, category, result: { items: Array.from({ length: n }, (_, i) => item(i + 1)), total: n } });

test("lưu rồi đọc lại, mới nhất trước và chỉ lấy 3", async () => {
  for (const q of ["giày thể thao", "son môi", "tai nghe", "áo khoác"]) await cache.saveSearchRequest(text(q));
  const recent = await cache.getRecentSearches(3);
  assert.deepEqual(recent.map((r) => r.query), ["áo khoác", "tai nghe", "son môi"]);
});

test("tìm lại cùng từ khóa không tạo bản ghi trùng, đẩy lên đầu và tăng đếm", async () => {
  await cache.saveSearchRequest(text("giày"));
  await cache.saveSearchRequest(text("son"));
  await cache.saveSearchRequest(text("  GIÀY "));
  const recent = await cache.getRecentSearches(3);
  assert.deepEqual(recent.map((r) => r.query), ["  GIÀY ", "son"]);
  assert.equal(recent[0].count, 2);
});

test("gõ dở rồi gõ tiếp chỉ giữ từ khóa cuối", async () => {
  await cache.saveSearchRequest(text("áo"));
  await cache.saveSearchRequest(text("áo th"));
  await cache.saveSearchRequest(text("áo thun"));
  assert.deepEqual((await cache.getRecentSearches(3)).map((r) => r.query), ["áo thun"]);
});

test("không lưu tìm kiếm không có kết quả", async () => {
  await cache.saveSearchRequest(text("xyz", "Tất cả", 0));
  assert.deepEqual(await cache.getRecentSearches(3), []);
});

test("cùng từ khóa nhưng khác danh mục là hai tìm kiếm khác nhau", async () => {
  await cache.saveSearchRequest(text("áo", "Thời trang"));
  await cache.saveSearchRequest(text("áo", "Làm đẹp"));
  assert.equal((await cache.getRecentSearches(3)).length, 2);
});

test("tìm bằng ảnh: cùng tên và dung lượng thì gộp, khác ảnh thì tách", async () => {
  const img = (name, size) => ({ kind: "image", query: "", category: "Tất cả", imageName: name, imageBlob: { size }, result: { items: [item(1)], total: 1 } });
  await cache.saveSearchRequest(img("a.jpg", 100));
  await cache.saveSearchRequest(img("a.jpg", 100));
  await cache.saveSearchRequest(img("b.jpg", 200));
  assert.deepEqual((await cache.getRecentSearches(3)).map((r) => r.imageName), ["b.jpg", "a.jpg"]);
});

test("giới hạn số tìm kiếm lưu và xóa sạch", async () => {
  for (let i = 0; i < 40; i++) await cache.saveSearchRequest(text(`từ khóa ${i}`));
  assert.ok(idb.rows.length <= 30);
  assert.equal((await cache.getRecentSearches(3))[0].query, "từ khóa 39");
  await cache.clearSearchRequests();
  assert.deepEqual(await cache.getRecentSearches(3), []);
});
