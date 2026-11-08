import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config/index.js';

test('loadConfig: giá trị mặc định cho môi trường phát triển', () => {
  const c = loadConfig({});
  assert.equal(c.port, 3000);
  assert.equal(c.adminApiKey, null);
  assert.equal(c.importCsvOnStart, true);
  assert.equal(c.maxUploadBytes, 5 * 1024 * 1024);
  assert.deepEqual(c.corsOrigins, ['http://localhost:5173', 'http://localhost:8080']);
});

test('loadConfig: CORS_ORIGINS rỗng nghĩa là chỉ same-origin', () => {
  assert.deepEqual(loadConfig({ CORS_ORIGINS: '' }).corsOrigins, []);
  assert.deepEqual(loadConfig({ CORS_ORIGINS: 'https://a.com, https://b.com' }).corsOrigins, ['https://a.com', 'https://b.com']);
});

test('loadConfig: chuỗi rỗng trong .env được coi là chưa khai báo', () => {
  assert.equal(loadConfig({ ADMIN_API_KEY: '' }).adminApiKey, null);
});

test('loadConfig: parse boolean và số', () => {
  const c = loadConfig({ RUN_MIGRATIONS: 'false', TRUST_PROXY: '2', PORT: '8080' });
  assert.equal(c.importCsvOnStart, true);
  assert.equal(c.runMigrations, false);
  assert.equal(c.trustProxy, 2);
  assert.equal(c.port, 8080);
  assert.equal(loadConfig({ IMPORT_CSV_ON_START: 'false' }).importCsvOnStart, false);
});

test('loadConfig: báo lỗi rõ ràng khi cấu hình sai', () => {
  assert.throws(() => loadConfig({ PORT: 'abc' }), /không hợp lệ/);
  assert.throws(() => loadConfig({ ADMIN_API_KEY: 'ngan' }), /ADMIN_API_KEY/);
  assert.throws(() => loadConfig({ AI_SERVICE_URL: 'khong-phai-url' }), /AI_SERVICE_URL/);
});

test('loadConfig: production bắt buộc có DATABASE_URL', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /DATABASE_URL/);
  assert.doesNotThrow(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@db:5432/x' }));
});
