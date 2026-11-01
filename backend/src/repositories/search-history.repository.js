import { toVectorLiteral, parseVector } from '../utils/vector.js';

export class SearchHistoryRepository {
  /** @param {import('pg').Pool} db */
  constructor(db) {
    this.db = db;
  }

  async record({ clientId, kind, query, category, resultCount, embedding }) {
    await this.db.query(
      `INSERT INTO search_history (client_id, kind, query, category, result_count, query_embedding)
       VALUES ($1, $2, $3, $4, $5, $6::vector)`,
      [clientId ?? null, kind, query ?? '', category ?? null, resultCount, embedding ? toVectorLiteral(embedding) : null],
    );
  }

  async recent(clientId, { limit }) {
    const { rows } = await this.db.query(
      `SELECT kind, query, category, searched_at FROM search_history
       WHERE client_id = $1 ORDER BY searched_at DESC LIMIT $2`,
      [clientId, limit],
    );
    return rows.map((r) => ({ kind: r.kind, query: r.query, category: r.category, searchedAt: r.searched_at }));
  }

  /** Các truy vấn văn bản gần nhất (kèm embedding) của một client. */
  async recentTextQueries(clientId, { limit }) {
    const { rows } = await this.db.query(
      `SELECT query, query_embedding::text AS embedding FROM search_history
       WHERE client_id = $1 AND kind = 'text' AND query_embedding IS NOT NULL
       ORDER BY searched_at DESC LIMIT $2`,
      [clientId, limit],
    );
    return rows.map((r) => ({ query: r.query, embedding: parseVector(r.embedding) }));
  }

  /**
   * Từ khóa phổ biến 30 ngày qua. Chỉ hiện từ khóa được ít nhất 2 người khác nhau tìm,
   * để không lộ nội dung riêng của một người dùng cho người khác.
   */
  async popularQueries({ limit }) {
    const { rows } = await this.db.query(
      `SELECT lower(query) AS query, COUNT(*)::int AS searches
       FROM search_history
       WHERE kind = 'text' AND query <> '' AND searched_at > NOW() - INTERVAL '30 days'
       GROUP BY lower(query)
       HAVING COUNT(DISTINCT COALESCE(client_id::text, id::text)) >= 2
       ORDER BY searches DESC, MAX(searched_at) DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map((r) => r.query);
  }

  async clear(clientId) {
    const { rowCount } = await this.db.query('DELETE FROM search_history WHERE client_id = $1', [clientId]);
    return rowCount;
  }
}
