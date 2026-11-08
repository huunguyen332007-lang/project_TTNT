-- Dữ liệu hành vi để đánh giá và cải thiện tìm kiếm: sau mỗi truy vấn người dùng bấm vào sản phẩm nào, ở vị trí nào.
-- client_id là định danh ẩn danh do trình duyệt tạo, không phải tài khoản.
CREATE TABLE IF NOT EXISTS click_events (
  id          BIGSERIAL PRIMARY KEY,
  client_id   UUID,
  kind        TEXT        NOT NULL DEFAULT 'browse' CHECK (kind IN ('text', 'image', 'browse')),
  query       TEXT        NOT NULL DEFAULT '',          -- rỗng khi kind = 'image' hoặc 'browse'
  product_id  INTEGER     NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  position    INTEGER,                                  -- vị trí trong danh sách kết quả, 0 = đầu tiên
  event       TEXT        NOT NULL DEFAULT 'click' CHECK (event IN ('click', 'like', 'dislike')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS click_events_product_idx ON click_events (product_id);
CREATE INDEX IF NOT EXISTS click_events_query_idx ON click_events (lower(query)) WHERE kind = 'text';
CREATE INDEX IF NOT EXISTS click_events_client_idx ON click_events (client_id, created_at DESC);
