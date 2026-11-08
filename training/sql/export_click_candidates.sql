-- Gợi ý ứng viên cho judgments.csv từ hành vi thật: cặp (từ khóa, sản phẩm) được bấm từ 2 lần trở lên.
-- Đây chỉ là TÍN HIỆU YẾU (người dùng hay bấm vào kết quả đứng đầu dù chưa chắc đúng): hãy xem lại bằng tay trước khi dùng làm đáp án.
-- Chạy:  docker compose exec -T postgres psql -q -U ttnt -d ttnt < training/sql/export_click_candidates.sql > click_candidates.csv
COPY (
  SELECT lower(btrim(query)) AS query, product_id, COUNT(*) AS clicks, COUNT(DISTINCT client_id) AS people, MIN(position) AS best_position
  FROM click_events
  WHERE kind = 'text' AND event = 'click' AND btrim(query) <> ''
  GROUP BY 1, 2
  HAVING COUNT(*) >= 2
  ORDER BY clicks DESC
) TO STDOUT WITH (FORMAT csv, HEADER true);
