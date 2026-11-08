-- Từ khóa được tìm nhiều nhưng không dẫn tới cú bấm nào trong 5 phút: nơi mô hình/dữ liệu có khả năng đang sai.
-- Lưu ý: gõ dở (ví dụ "áo th") cũng bị tính; hãy lọc bằng mắt. Chạy:
--   docker compose exec -T postgres psql -U ttnt -d ttnt < training/sql/report_failed_queries.sql
SELECT lower(btrim(h.query)) AS query, COUNT(*) AS lan_tim, ROUND(AVG(h.result_count)) AS so_ket_qua_tb
FROM search_history h
WHERE h.kind = 'text' AND btrim(h.query) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM click_events c
    WHERE c.client_id = h.client_id AND c.kind = 'text'
      AND c.created_at BETWEEN h.searched_at AND h.searched_at + INTERVAL '5 minutes'
  )
GROUP BY 1
ORDER BY lan_tim DESC
LIMIT 30;
