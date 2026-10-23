import pg from 'pg';
import { config } from './config.js';
const { Pool } = pg;

export const productsPool = new Pool({ connectionString: config.productsDbUrl });
export const searchPool = new Pool({ connectionString: config.searchDbUrl });

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function waitForDb() {
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      await Promise.all([productsPool.query('SELECT 1'), searchPool.query('SELECT 1')]);
      console.log('[api] đã kết nối cả hai PostgreSQL database');
      return;
    } catch (err) {
      console.log(`[api] đợi PostgreSQL (${attempt}/30): ${err.message}`);
      await sleep(2000);
    }
  }
  throw new Error('Không thể kết nối PostgreSQL sau 60 giây');
}

export async function migrate() {
  await productsPool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Khác',
      tag TEXT NOT NULL DEFAULT 'PRODUCT',
      image TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS products_search_idx ON products USING GIN (
      to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(category,'') || ' ' || coalesce(description,'') || ' ' || coalesce(tag,''))
    );
  `);
  await searchPool.query(`
    CREATE TABLE IF NOT EXISTS search_history (
      id BIGSERIAL PRIMARY KEY,
      query TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Tất cả',
      result_count INTEGER NOT NULL DEFAULT 0,
      searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS search_history_query_idx ON search_history (query);
    CREATE INDEX IF NOT EXISTS search_history_date_idx ON search_history (searched_at DESC);
  `);
}
