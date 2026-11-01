-- Extension pgvector (image pgvector/pgvector:pg16 đã cài sẵn; cần quyền superuser lần đầu).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS products (
  id              SERIAL PRIMARY KEY,
  title           TEXT        NOT NULL,
  category        TEXT        NOT NULL DEFAULT 'Khác',
  tag             TEXT        NOT NULL DEFAULT '',
  image_url       TEXT        NOT NULL,
  description     TEXT        NOT NULL DEFAULT '',
  price           NUMERIC(14, 0),

  -- Embedding 512 chiều (CLIP). text_embedding: mô tả sản phẩm; image_embedding: ảnh sản phẩm.
  text_embedding  vector(512),
  image_embedding vector(512),
  embedded_at     TIMESTAMPTZ,

  -- Cột full-text sinh tự động, dùng cho nhánh tìm theo từ khóa của hybrid search.
  search_tsv      tsvector GENERATED ALWAYS AS (
                    to_tsvector('simple', title || ' ' || category || ' ' || tag || ' ' || description)
                  ) STORED,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);
CREATE INDEX IF NOT EXISTS products_tsv_idx ON products USING GIN (search_tsv);
-- HNSW + cosine: tìm láng giềng gần nhất xấp xỉ, nhanh hơn quét toàn bảng khi dữ liệu lớn.
CREATE INDEX IF NOT EXISTS products_text_embedding_idx
  ON products USING hnsw (text_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS products_image_embedding_idx
  ON products USING hnsw (image_embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS search_history (
  id              BIGSERIAL PRIMARY KEY,
  client_id       UUID,                       -- định danh ẩn danh do trình duyệt tạo, không phải tài khoản
  kind            TEXT        NOT NULL CHECK (kind IN ('text', 'image')),
  query           TEXT        NOT NULL DEFAULT '',
  category        TEXT,
  result_count    INTEGER     NOT NULL DEFAULT 0,
  query_embedding vector(512),                -- chỉ lưu cho truy vấn văn bản, dùng để gợi ý cá nhân hóa
  searched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS search_history_client_idx ON search_history (client_id, searched_at DESC);
CREATE INDEX IF NOT EXISTS search_history_text_idx ON search_history (lower(query)) WHERE kind = 'text';
