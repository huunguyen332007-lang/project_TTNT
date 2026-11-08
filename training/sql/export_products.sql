-- Xuất sản phẩm từ PostgreSQL ra CSV đúng định dạng mà prepare_data.py đọc.
-- Chạy:  docker compose exec -T postgres psql -q -U ttnt -d ttnt < training/sql/export_products.sql > products.csv
COPY (
  SELECT title AS "Tên sản phẩm", price AS "Giá", rating AS "Đánh giá", source_url AS "URL", image_url AS "Hình ảnh",
         CASE WHEN tag <> '' THEN tag ELSE category END AS "Nhãn sản phẩm"
  FROM products
  WHERE source_url IS NOT NULL
  ORDER BY id
) TO STDOUT WITH (FORMAT csv, HEADER true);
