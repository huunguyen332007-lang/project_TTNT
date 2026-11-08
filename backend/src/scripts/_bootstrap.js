import { loadConfig } from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import { createPool, waitForDatabase } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';
import { createContainer } from '../container.js';

/** Dựng nhanh config/pool/container cho các script dòng lệnh, và luôn đóng pool khi xong. */
export async function runScript(fn, { migrate = true } = {}) {
  const config = loadConfig();
  const logger = createLogger(config);
  const pool = createPool(config, logger);
  try {
    await waitForDatabase(pool, logger, { attempts: 5 });
    if (migrate) await runMigrations(pool, logger);
    await fn({ config, logger, pool, container: createContainer({ config, logger, pool }) });
  } catch (err) {
    logger.error({ err }, 'Script thất bại');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
