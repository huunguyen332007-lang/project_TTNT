-- Danh mục kèm id thật trong PostgreSQL, dùng cho eval_judgments.py và để tra id khi viết judgments.csv.
-- Chạy:  docker compose exec -T postgres psql -q -U ttnt -d ttnt < training/sql/export_product_ids.sql > products_ids.csv
COPY (SELECT id, title, category, tag FROM products ORDER BY id) TO STDOUT WITH (FORMAT csv, HEADER true);
