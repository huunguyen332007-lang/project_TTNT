import { toVectorLiteral } from '../utils/vector.js';

// Các cột trả về cho client (không bao giờ SELECT cột vector vì rất nặng).
const COLUMNS = `p.id, p.title, p.category, p.tag, p.image_url, p.description, p.price::float8 AS price,
                 (p.text_embedding IS NOT NULL AND p.image_embedding IS NOT NULL) AS indexed`;

function toProduct(row) {
  const product = {
    id: row.id,
    title: row.title,
    category: row.category,
    tag: row.tag,
    imageUrl: row.image_url,
    description: row.description,
    price: row.price ?? null,
    indexed: row.indexed,
  };
  if (row.similarity !== undefined && row.similarity !== null) product.similarity = Number(row.similarity);
  return product;
}

export class ProductRepository {
  /** @param {import('pg').Pool} db */
  constructor(db) {
    this.db = db;
  }

  async list({ category, limit, offset }) {
    const params = [category ?? null, limit, offset];
    const [{ rows }, { rows: totals }] = await Promise.all([
      this.db.query(
        `SELECT ${COLUMNS} FROM products p
         WHERE ($1::text IS NULL OR p.category = $1)
         ORDER BY p.id ASC LIMIT $2 OFFSET $3`,
        params,
      ),
      this.db.query('SELECT COUNT(*)::int AS total FROM products WHERE ($1::text IS NULL OR category = $1)', [category ?? null]),
    ]);
    return { items: rows.map(toProduct), total: totals[0].total };
  }

  async findById(id) {
    const { rows } = await this.db.query(`SELECT ${COLUMNS} FROM products p WHERE p.id = $1`, [id]);
    return rows[0] ? toProduct(rows[0]) : null;
  }

  async count() {
    const { rows } = await this.db.query('SELECT COUNT(*)::int AS count FROM products');
    return rows[0].count;
  }

  async listCategories() {
    const { rows } = await this.db.query(
      'SELECT category AS name, COUNT(*)::int AS count FROM products GROUP BY category ORDER BY count DESC, category',
    );
    return rows;
  }

  async insert({ title, category, tag, imageUrl, description, price }) {
    const { rows } = await this.db.query(
      `INSERT INTO products (title, category, tag, image_url, description, price)
       VALUES ($1, COALESCE($2, 'Khác'), COALESCE($3, ''), $4, COALESCE($5, ''), $6)
       RETURNING id`,
      [title, category ?? null, tag ?? null, imageUrl, description ?? null, price ?? null],
    );
    return this.findById(rows[0].id);
  }

  async remove(id) {
    const { rowCount } = await this.db.query('DELETE FROM products WHERE id = $1', [id]);
    return rowCount > 0;
  }

  /** Sản phẩm còn thiếu embedding (văn bản hoặc ảnh). */
  async findNeedingEmbeddings({ limit, excludeIds = [] }) {
    const { rows } = await this.db.query(
      `SELECT ${COLUMNS}, (p.text_embedding IS NULL) AS needs_text, (p.image_embedding IS NULL) AS needs_image
       FROM products p
       WHERE (p.text_embedding IS NULL OR p.image_embedding IS NULL) AND NOT (p.id = ANY($2::int[]))
       ORDER BY p.id LIMIT $1`,
      [limit, excludeIds],
    );
    return rows.map((row) => ({ ...toProduct(row), needsText: row.needs_text, needsImage: row.needs_image }));
  }

  /** Chỉ ghi đè embedding nào được truyền vào, giữ nguyên cái còn lại. */
  async updateEmbeddings(id, { text, image }) {
    await this.db.query(
      `UPDATE products SET
         text_embedding  = COALESCE($2::vector, text_embedding),
         image_embedding = COALESCE($3::vector, image_embedding),
         embedded_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [id, text ? toVectorLiteral(text) : null, image ? toVectorLiteral(image) : null],
    );
  }

  /**
   * Hybrid search: kết hợp xếp hạng ngữ nghĩa (vector) và từ khóa (full-text) bằng
   * Reciprocal Rank Fusion. RRF chỉ dùng thứ hạng nên không phụ thuộc thang điểm của hai nhánh.
   */
  async searchHybrid({ embedding, tsquery, category, limit, candidates = 50, minSimilarity = 0 }) {
    const { rows } = await this.db.query(
      `WITH semantic AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY dist) AS rnk
         FROM (
           SELECT id, text_embedding <=> $1::vector AS dist
           FROM products
           WHERE text_embedding IS NOT NULL AND ($2::text IS NULL OR category = $2)
           ORDER BY text_embedding <=> $1::vector
           LIMIT $4
         ) s
       ),
       keyword AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY kw_rank DESC) AS rnk
         FROM (
           SELECT id, ts_rank_cd(search_tsv, to_tsquery('simple', $3)) AS kw_rank
           FROM products
           WHERE $3::text IS NOT NULL AND search_tsv @@ to_tsquery('simple', $3)
             AND ($2::text IS NULL OR category = $2)
           ORDER BY kw_rank DESC
           LIMIT $4
         ) k
       )
       SELECT ${COLUMNS},
              (1 - (p.text_embedding <=> $1::vector))::float8 AS similarity,
              (COALESCE(1.0 / (60 + s.rnk), 0) + COALESCE(1.0 / (60 + k.rnk), 0))::float8 AS score
       FROM products p
       LEFT JOIN semantic s ON s.id = p.id
       LEFT JOIN keyword k ON k.id = p.id
       WHERE (s.id IS NOT NULL OR k.id IS NOT NULL)
         AND (k.id IS NOT NULL OR (1 - (p.text_embedding <=> $1::vector)) >= $6)
       ORDER BY score DESC, similarity DESC NULLS LAST
       LIMIT $5`,
      [toVectorLiteral(embedding), category ?? null, tsquery, candidates, limit, minSimilarity],
    );
    return rows.map(toProduct);
  }

  /** Dự phòng khi dịch vụ AI không khả dụng: chỉ tìm theo từ khóa. */
  async searchKeyword({ tsquery, category, limit }) {
    if (!tsquery) return [];
    const { rows } = await this.db.query(
      `SELECT ${COLUMNS}
       FROM products p
       WHERE p.search_tsv @@ to_tsquery('simple', $1) AND ($2::text IS NULL OR p.category = $2)
       ORDER BY ts_rank_cd(p.search_tsv, to_tsquery('simple', $1)) DESC, p.id
       LIMIT $3`,
      [tsquery, category ?? null, limit],
    );
    return rows.map(toProduct);
  }

  /** Tìm theo ảnh: so khớp embedding ảnh người dùng với embedding ảnh sản phẩm. */
  async searchByImage({ embedding, category, limit, minSimilarity = 0 }) {
    const { rows } = await this.db.query(
      `SELECT * FROM (
         SELECT ${COLUMNS}, (1 - (p.image_embedding <=> $1::vector))::float8 AS similarity
         FROM products p
         WHERE p.image_embedding IS NOT NULL AND ($2::text IS NULL OR p.category = $2)
         ORDER BY p.image_embedding <=> $1::vector
         LIMIT $3
       ) ranked
       WHERE similarity >= $4
       ORDER BY similarity DESC`,
      [toVectorLiteral(embedding), category ?? null, limit, minSimilarity],
    );
    return rows.map(toProduct);
  }

  /** Sản phẩm gần nhất với một vector văn bản (dùng cho gợi ý cá nhân hóa). */
  async findNearestByText({ embedding, limit }) {
    const { rows } = await this.db.query(
      `SELECT ${COLUMNS}, (1 - (p.text_embedding <=> $1::vector))::float8 AS similarity
       FROM products p
       WHERE p.text_embedding IS NOT NULL
       ORDER BY p.text_embedding <=> $1::vector
       LIMIT $2`,
      [toVectorLiteral(embedding), limit],
    );
    return rows.map(toProduct);
  }

  /**
   * Sản phẩm tương tự: trung bình độ giống về mô tả và về hình ảnh.
   * Quét toàn bảng nên phù hợp tới vài chục nghìn sản phẩm; lớn hơn thì lấy ứng viên
   * bằng HNSW trước rồi mới xếp hạng lại.
   */
  async findSimilar(id, { limit }) {
    const { rows } = await this.db.query(
      `SELECT ${COLUMNS},
              (1 - ((p.text_embedding <=> t.text_embedding) + (p.image_embedding <=> t.image_embedding)) / 2)::float8 AS similarity
       FROM products p
       JOIN products t ON t.id = $1
       WHERE p.id <> t.id
         AND p.text_embedding IS NOT NULL AND p.image_embedding IS NOT NULL
         AND t.text_embedding IS NOT NULL AND t.image_embedding IS NOT NULL
       ORDER BY (p.text_embedding <=> t.text_embedding) + (p.image_embedding <=> t.image_embedding)
       LIMIT $2`,
      [id, limit],
    );
    return rows.map(toProduct);
  }

  async findLatest({ limit }) {
    const { rows } = await this.db.query(`SELECT ${COLUMNS} FROM products p ORDER BY p.created_at DESC, p.id DESC LIMIT $1`, [limit]);
    return rows.map(toProduct);
  }
}
