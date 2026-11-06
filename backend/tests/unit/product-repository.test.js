import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProductRepository } from '../../src/repositories/product.repository.js';

test('upsertImportedMany: chia batch, gán placeholder đúng và đếm inserted/updated', async () => {
  const calls = [];
  const db = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: calls.length === 1 ? [{ inserted: true }, { inserted: false }] : [{ inserted: false }] };
    },
  };
  const repo = new ProductRepository(db);
  const products = [1, 2, 3].map((id) => ({
    title: `Sản phẩm ${id}`,
    category: 'Khác',
    tag: '',
    imageUrl: `https://img.example/${id}.jpg`,
    description: '',
    price: id * 1000,
    rating: 4.5,
    sourceUrl: `https://shop.example/${id}`,
  }));

  const counts = await repo.upsertImportedMany(products, { batchSize: 2 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].values.length, 16);
  assert.equal(calls[1].values.length, 8);
  assert.match(calls[0].sql, /ON CONFLICT \(source_url\)/);
  assert.equal(counts.inserted, 1);
  assert.equal(counts.updated, 2);
});
