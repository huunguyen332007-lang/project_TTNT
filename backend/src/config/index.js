import { z } from 'zod';

const bool = (fallback) =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((value) => value === 'true');

const similarity = z.coerce.number().min(0).max(1).default(0);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().url().default('postgres://ttnt:ttnt@localhost:5432/ttnt'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),

  AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  ADMIN_API_KEY: z.string().min(16, 'ADMIN_API_KEY phải có ít nhất 16 ký tự').optional(),

  RUN_MIGRATIONS: bool('true'),
  SEED_ON_START: bool('false'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  MAX_UPLOAD_MB: z.coerce.number().positive().default(5),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),
  SEARCH_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(30),

  TEXT_MIN_SIMILARITY: similarity,
  IMAGE_MIN_SIMILARITY: similarity,
});

const DEFAULT_DEV_ORIGINS = 'http://localhost:5173,http://localhost:8080';

/** Chưa khai báo -> origin dev mặc định. Khai báo rỗng -> chỉ cho phép same-origin. */
function parseOrigins(raw) {
  return (raw ?? DEFAULT_DEV_ORIGINS)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Đọc và kiểm tra biến môi trường. Sai cấu hình sẽ dừng ứng dụng ngay lúc khởi động
 * thay vì để lỗi xuất hiện muộn khi có request.
 */
export function loadConfig(env = process.env) {
  // Chuỗi rỗng trong .env (ví dụ ADMIN_API_KEY=) được coi như chưa khai báo.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Cấu hình môi trường không hợp lệ:\n${details}`);
  }
  const e = parsed.data;

  if (e.NODE_ENV === 'production' && !env.DATABASE_URL) {
    throw new Error('Cấu hình môi trường không hợp lệ: production bắt buộc phải có DATABASE_URL');
  }

  return Object.freeze({
    env: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    databaseUrl: e.DATABASE_URL,
    dbPoolMax: e.DB_POOL_MAX,
    aiServiceUrl: e.AI_SERVICE_URL.replace(/\/$/, ''),
    aiTimeoutMs: e.AI_TIMEOUT_MS,
    corsOrigins: parseOrigins(env.CORS_ORIGINS),
    adminApiKey: e.ADMIN_API_KEY ?? null,
    runMigrations: e.RUN_MIGRATIONS,
    seedOnStart: e.SEED_ON_START,
    trustProxy: e.TRUST_PROXY,
    maxUploadBytes: Math.round(e.MAX_UPLOAD_MB * 1024 * 1024),
    rateLimitPerMin: e.RATE_LIMIT_PER_MIN,
    searchRateLimitPerMin: e.SEARCH_RATE_LIMIT_PER_MIN,
    textMinSimilarity: e.TEXT_MIN_SIMILARITY,
    imageMinSimilarity: e.IMAGE_MIN_SIMILARITY,
  });
}
