import { toVectorLiteral } from '../utils/vector.js';

// Các cột trả về cho client (không bao giờ SELECT cột vector vì rất nặng).
const COLUMNS = `p.id, p.title, p.category, p.tag, p.image_url, p.description, p.price::float8 AS price,
                 p.rating::float8 AS rating, p.source_url,
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
    rating: row.rating ?? null,
    sourceUrl: row.source_url ?? null,
    indexed: row.indexed,
  };
  if (row.similarity !== undefined && row.similarity !== null) product.similarity = Number(row.similarity);
  if (row.image_similarity !== undefined && row.image_similarity !== null) product.imageSimilarity = Number(row.image_similarity);
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

  async insert({ title, category, tag, imageUrl, description, price, rating, sourceUrl }) {
    const { rows } = await this.db.query(
      `INSERT INTO products (title, category, tag, image_url, description, price, rating, source_url)
       VALUES ($1, COALESCE($2, 'Khác'), COALESCE($3, ''), $4, COALESCE($5, ''), $6, $7, $8)
       RETURNING id`,
      [title, category ?? null, tag ?? null, imageUrl, description ?? null, price ?? null, rating ?? null, sourceUrl ?? null],
    );
    return this.findById(rows[0].id);
  }

  /**
   * Nạp sản phẩm import: thêm mới hoặc cập nhật theo source_url nên chạy lại nhiều lần không tạo bản ghi trùng.
   * Nếu nội dung văn bản/ảnh đổi thì xóa embedding cũ để lần reindex sau tạo lại.
   * @returns {Promise<'inserted'|'updated'>}
   */
  async upsertImported({ title, category, tag, imageUrl, description = '', price, rating, sourceUrl }) {
    const { rows } = await this.db.query(
      `INSERT INTO products (title, category, tag, image_url, description, price, rating, source_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (source_url) WHERE source_url IS NOT NULL DO UPDATE SET
         text_embedding = CASE WHEN (products.title, products.category, products.tag, products.description)
                                    IS DISTINCT FROM (EXCLUDED.title, EXCLUDED.category, EXCLUDED.tag, EXCLUDED.description)
                               THEN NULL ELSE products.text_embedding END,
         image_embedding = CASE WHEN products.image_url IS DISTINCT FROM EXCLUDED.image_url
                                THEN NULL ELSE products.image_embedding END,
         title = EXCLUDED.title, category = EXCLUDED.category, tag = EXCLUDED.tag, image_url = EXCLUDED.image_url,
         description = EXCLUDED.description, price = EXCLUDED.price, rating = EXCLUDED.rating, updated_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [title, category, tag, imageUrl, description, price ?? null, rating ?? null, sourceUrl],
    );
    return rows[0].inserted ? 'inserted' : 'updated';
  }

  /**
   * Import đồng loạt CSV theo source_url. Chia lô để giới hạn số bind params và tránh
   * gửi hàng nghìn round-trip SQL riêng lẻ khi backend khởi động.
   * Embedding cũ chỉ bị xóa khi nội dung văn bản hoặc URL ảnh thay đổi.
   */
  async upsertImportedMany(products, { batchSize = 300 } = {}) {
    const counts = { inserted: 0, updated: 0 };
    const columnsPerRow = 8;

    for (let start = 0; start < products.length; start += batchSize) {
      const batch = products.slice(start, start + batchSize);
      const values = [];
      const tuples = batch.map((product, index) => {
        const base = index * columnsPerRow;
        values.push(
          product.title,
          product.category ?? 'Khác',
          product.tag ?? '',
          product.imageUrl,
          product.description ?? '',
          product.price ?? null,
          product.rating ?? null,
          product.sourceUrl,
        );
        return `(${Array.from({ length: columnsPerRow }, (_, i) => `$${base + i + 1}`).join(', ')})`;
      });

      const { rows } = await this.db.query(
        `INSERT INTO products (title, category, tag, image_url, description, price, rating, source_url)
         VALUES ${tuples.join(', ')}
         ON CONFLICT (source_url) WHERE source_url IS NOT NULL DO UPDATE SET
           text_embedding = CASE WHEN (products.title, products.category, products.tag, products.description)
                                      IS DISTINCT FROM (EXCLUDED.title, EXCLUDED.category, EXCLUDED.tag, EXCLUDED.description)
                                 THEN NULL ELSE products.text_embedding END,
           image_embedding = CASE WHEN products.image_url IS DISTINCT FROM EXCLUDED.image_url
                                  THEN NULL ELSE products.image_embedding END,
           title = EXCLUDED.title, category = EXCLUDED.category, tag = EXCLUDED.tag, image_url = EXCLUDED.image_url,
           description = EXCLUDED.description, price = EXCLUDED.price, rating = EXCLUDED.rating,
           updated_at = CASE
             WHEN (products.title, products.category, products.tag, products.image_url, products.description, products.price, products.rating)
                  IS DISTINCT FROM
                  (EXCLUDED.title, EXCLUDED.category, EXCLUDED.tag, EXCLUDED.image_url, EXCLUDED.description, EXCLUDED.price, EXCLUDED.rating)
             THEN NOW() ELSE products.updated_at END
         RETURNING (xmax = 0) AS inserted`,
        values,
      );

      for (const row of rows) counts[row.inserted ? 'inserted' : 'updated'] += 1;
    }

    return counts;
  }

  /** Xóa toàn bộ sản phẩm (dùng cho `import:csv --replace`). Trả về số dòng đã xóa. */
  async removeAll() {
    const { rowCount } = await this.db.query('DELETE FROM products');
    return rowCount;
  }

  /**
   * Xóa 6 sản phẩm mẫu cũ (ảnh Unsplash, không có source_url) còn sót trong database từ các lần chạy trước,
   * để giao diện chỉ hiển thị dữ liệu CSV của bạn. Sản phẩm bạn tự thêm qua API (ảnh của bạn) không bị đụng tới.
   */
  async removeSampleProducts() {
    const { rowCount } = await this.db.query(
      "DELETE FROM products WHERE source_url IS NULL AND image_url LIKE 'https://images.unsplash.com/%'",
    );
    return rowCount;
  }

  /** Xóa mọi embedding để tạo lại từ đầu, ví dụ sau khi đổi sang model đã fine-tune. */
  async clearEmbeddings() {
    const { rowCount } = await this.db.query(
      'UPDATE products SET text_embedding = NULL, image_embedding = NULL, embedded_at = NULL WHERE text_embedding IS NOT NULL OR image_embedding IS NOT NULL',
    );
    return rowCount;
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
              -- chữ -> ảnh: độ khớp giữa truy vấn và ẢNH sản phẩm (mục tiêu mà fine-tune CLIP huấn luyện trực tiếp)
              (1 - (p.image_embedding <=> $1::vector))::float8 AS image_similarity,
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

  /** Toàn bộ sản phẩm (nhẹ, không có vector) để chấm điểm gợi ý trong bộ nhớ. Phù hợp tới vài chục nghìn sản phẩm. */
  async listForRanking({ category }) {
    const { rows } = await this.db.query(
      `SELECT ${COLUMNS} FROM products p WHERE ($1::text IS NULL OR p.category = $1) ORDER BY p.id`,
      [category ?? null],
    );
    return rows.map(toProduct);
  }

  async findByIds(ids) {
    if (!ids.length) return [];
    const { rows } = await this.db.query(`SELECT ${COLUMNS} FROM products p WHERE p.id = ANY($1::int[])`, [ids]);
    return rows.map(toProduct);
  }

  /**
   * Độ giống (cosine) của mọi sản phẩm với "khẩu vị" = vector trung bình các sản phẩm đã xem.
   * Chỉ dùng embedding đã có trong database nên vẫn chạy khi dịch vụ AI tắt. Không trả về chính các sản phẩm đã xem.
   * @returns {Promise<Map<number, number>>}
   */
  async similarityToTaste(viewedIds, { category } = {}) {
    if (!viewedIds.length) return new Map();
    const { rows } = await this.db.query(
      `WITH taste AS (SELECT AVG(text_embedding) AS v FROM products WHERE id = ANY($1::int[]) AND text_embedding IS NOT NULL)
       SELECT p.id, (1 - (p.text_embedding <=> t.v))::float8 AS similarity
       FROM products p, taste t
       WHERE t.v IS NOT NULL AND p.text_embedding IS NOT NULL AND NOT (p.id = ANY($1::int[]))
         AND ($2::text IS NULL OR p.category = $2)`,
      [viewedIds, category ?? null],
    );
    return new Map(rows.map((r) => [r.id, r.similarity]));
  }

  /** Độ giống (cosine) của mọi sản phẩm với một vector văn bản bất kỳ, ví dụ khẩu vị rút ra từ lịch sử tìm kiếm. */
  async similarityToVector(embedding, { category } = {}) {
    const { rows } = await this.db.query(
      `SELECT p.id, (1 - (p.text_embedding <=> $1::vector))::float8 AS similarity
       FROM products p
       WHERE p.text_embedding IS NOT NULL AND ($2::text IS NULL OR p.category = $2)`,
      [toVectorLiteral(embedding), category ?? null],
    );
    return new Map(rows.map((r) => [r.id, r.similarity]));
  }

  async findLatest({ limit }) {
    const { rows } = await this.db.query(`SELECT ${COLUMNS} FROM products p ORDER BY p.created_at DESC, p.id DESC LIMIT $1`, [limit]);
    return rows.map(toProduct);
  }
}
