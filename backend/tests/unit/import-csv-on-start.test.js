import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importCsvOnStartup } from '../../src/db/import-csv-on-start.js';

test('importCsvOnStartup: làm sạch CSV có sẵn rồi đồng bộ vào PostgreSQL theo lô', async () => {
  let imported = null;
  const logs = [];
  const result = await importCsvOnStartup({
    products: {
      upsertImportedMany: async (rows) => {
        imported = rows;
        return { inserted: rows.length, updated: 0 };
      },
    },
    logger: {
      info: (data, message) => logs.push({ data, message }),
      warn: (data, message) => logs.push({ data, message }),
    },
  });

  assert.equal(imported.length, 1745);
  assert.equal(result.input, 1784);
  assert.equal(result.kept, 1745);
  assert.equal(result.inserted, 1745);
  assert.ok(imported.every((row) => row.sourceUrl && row.imageUrl.startsWith('https://')));
  assert.ok(logs.some((entry) => entry.message.includes('PostgreSQL')));
});
