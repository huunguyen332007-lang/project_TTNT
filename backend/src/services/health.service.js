export class HealthService {
  constructor({ pool, ai }) {
    this.pool = pool;
    this.ai = ai;
  }

  /** Database là thành phần bắt buộc; AI chỉ làm hệ thống "degraded" vì vẫn còn tìm theo từ khóa. */
  async check() {
    const [database, ai] = await Promise.all([
      this.pool.query('SELECT 1').then(() => 'up', () => 'down'),
      this.ai.health().then(() => 'up', () => 'down'),
    ]);
    const status = database === 'down' ? 'error' : ai === 'down' ? 'degraded' : 'ok';
    return { status, services: { database, ai } };
  }
}
