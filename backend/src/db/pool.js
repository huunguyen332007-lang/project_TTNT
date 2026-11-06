import pg from 'pg';

export function createPool(config, logger) {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: config.dbPoolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  // Lỗi trên kết nối rảnh (DB restart...) không được làm sập tiến trình.
  pool.on('error', (err) => logger.error({ err }, 'Lỗi kết nối PostgreSQL ở pool'));
  return pool;
}

/** Chờ PostgreSQL sẵn sàng (hữu ích khi DB và API khởi động cùng lúc). */
export async function waitForDatabase(pool, logger, { attempts = 30, delayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      logger.warn(`Đợi PostgreSQL (${attempt}/${attempts}): ${err.message}`);
      if (attempt === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
