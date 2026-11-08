-- Đánh giá của khách hàng thu thập từ sàn thương mại (hiện là Lazada).
-- Không lưu thông tin người đánh giá. Mỗi nội dung chỉ lưu một lần cho mỗi sản phẩm (content_hash),
-- nên chạy lại lệnh import nhiều lần không tạo bản ghi trùng.
CREATE TABLE IF NOT EXISTS product_reviews (
  id            BIGSERIAL   PRIMARY KEY,
  product_id    INTEGER     NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  content       TEXT        NOT NULL CHECK (btrim(content) <> ''),
  helpful_count INTEGER     NOT NULL DEFAULT 0 CHECK (helpful_count >= 0),
  source        TEXT        NOT NULL DEFAULT 'lazada',
  content_hash  TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, content_hash)
);

CREATE INDEX IF NOT EXISTS product_reviews_product_idx ON product_reviews (product_id, helpful_count DESC, id);
