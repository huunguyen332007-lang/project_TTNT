-- Dữ liệu import từ sàn thương mại: điểm đánh giá và đường dẫn gốc của sản phẩm.
-- source_url (đã bỏ query string) là khóa nhận diện để import lại nhiều lần không tạo bản ghi trùng.
ALTER TABLE products ADD COLUMN IF NOT EXISTS rating     NUMERIC(2, 1);
ALTER TABLE products ADD COLUMN IF NOT EXISTS source_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS products_source_url_uidx
  ON products (source_url) WHERE source_url IS NOT NULL;
