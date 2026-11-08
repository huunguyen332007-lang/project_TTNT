# TTNT — Tìm kiếm và gợi ý sản phẩm bằng AI

Dự án sử dụng React + Vite ở frontend, **Python FastAPI ở backend**, FastAPI ở AI Service và PostgreSQL + pgvector để lưu trữ/tìm kiếm embedding.

## Kiến trúc

| Dịch vụ | Công nghệ | Cổng | Vai trò |
|---|---|---:|---|
| Frontend | React 18, Vite, nginx | 8080 | Giao diện tìm kiếm và gợi ý |
| Backend | Python 3.11, FastAPI, psycopg 3 | 3000 | API, nghiệp vụ, truy vấn PostgreSQL, cá nhân hóa |
| AI Service | Python 3.11, FastAPI, CLIP | 8000 | Embedding văn bản và hình ảnh |
| Database | PostgreSQL 16 + pgvector | 5432 | Sản phẩm, vector, lịch sử tìm kiếm, click events |
| Reverse proxy | Caddy | 80/443 | HTTPS và định tuyến production |

Backend Node.js/Express đã được thay thế. Schema PostgreSQL, ba migration SQL hiện tại, dữ liệu CSV, route và định dạng request/response công khai được giữ lại.

## Chạy trên máy tính bằng Docker

Yêu cầu: Docker Desktop (Windows/macOS) hoặc Docker Engine + Compose plugin (Linux). Mở Terminal tại thư mục gốc dự án:

```bash
# Tạo file môi trường (không bắt buộc cho cấu hình local mặc định)
cp .env.example .env

# Build và chạy toàn bộ hệ thống
docker compose up --build
```

Mở giao diện tại `http://localhost:8080`; API tại `http://localhost:3000/api/health`; tài liệu Swagger tại `http://localhost:3000/docs`; AI Service tại `http://localhost:8000/docs`.

Các lệnh thường dùng:

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f ai-service

# Chạy backend ở chế độ phát triển (hot reload + pytest có sẵn)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend pytest -q

docker compose down                     # giữ dữ liệu PostgreSQL trong volume
# Chỉ xóa DB khi thật sự muốn làm mới toàn bộ dữ liệu:
docker compose down -v
```

Lần chạy đầu tải model CLIP khi build AI image; cần Internet và dung lượng RAM/đĩa phù hợp. Backend import CSV vào database theo `IMPORT_CSV_ON_START=true`, sau đó tạo embedding nền. Trong lúc AI Service chưa sẵn sàng, tìm kiếm văn bản tự hạ cấp về tìm kiếm từ khóa.

## Phát triển backend Python trực tiếp

Yêu cầu Python 3.11+. Cần PostgreSQL 16 có extension pgvector và AI Service đang chạy hoặc được trỏ đúng URL.

```bash
cd backend
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env

# Đặt DATABASE_URL và AI_SERVICE_URL phù hợp với môi trường của bạn.
uvicorn app.main:app --reload --host 0.0.0.0 --port 3000
```

Các tác vụ quản trị (thực hiện trong thư mục `backend/`):

```bash
python -m app.cli migrate
python -m app.cli import-csv --dry-run
python -m app.cli import-csv
python -m app.cli import-csv --replace --no-index
python -m app.cli reindex
python -m app.cli reindex --all   # xóa và tạo lại embedding; chỉ dùng sau khi đổi model
pytest -q
```

Khi chạy trực tiếp trên máy, `DATABASE_URL` thường dùng `localhost:5432`. Khi chạy trong Compose, hostname database là `postgres` và hostname AI Service là `ai-service`.

## API giữ nguyên

Tất cả endpoint nằm dưới `/api`.

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/health` | Health status database và AI |
| GET | `/products` | Danh sách, lọc danh mục, phân trang |
| GET | `/products/:id` | Chi tiết sản phẩm |
| GET | `/products/:id/similar` | Sản phẩm tương tự |
| POST | `/products` | Admin: thêm sản phẩm và lập chỉ mục |
| DELETE | `/products/:id` | Admin: xóa sản phẩm |
| GET | `/categories` | Danh mục và số lượng sản phẩm |
| POST | `/search/text` | Tìm kiếm chữ: semantic + full-text hybrid |
| POST | `/search/image` | Tìm kiếm ảnh bằng multipart field `image` |
| POST | `/recommend` | Gợi ý cá nhân hóa theo query, interests, budget, viewedIds |
| GET | `/recommendations` | Gợi ý dựa vào lịch sử tìm kiếm hoặc sản phẩm mới |
| GET / DELETE | `/history` | Đọc hoặc xóa lịch sử của client hiện tại |
| POST | `/events` | Ghi click/like/dislike vào `click_events` |
| POST | `/admin/reindex` | Admin: tạo embedding còn thiếu |
| GET | `/products/:id/reviews?limit=10&offset=0` | Đánh giá của khách hàng (Lazada), hữu ích nhất đứng trước |
| GET | `/admin/stats?days=30&limit=10` | Admin: thống kê lượt tìm, tỉ lệ bấm, vị trí bấm, từ khóa không ai bấm (xem mục bên dưới) |

`X-Client-Id` vẫn là UUID ẩn danh do frontend tạo. Các endpoint quản trị yêu cầu `X-Api-Key: <ADMIN_API_KEY>`. Lỗi được chuẩn hóa thành `{ "error": { "code": "...", "message": "...", "details": [...] } }`.

## Thống kê lượt bấm (`GET /api/admin/stats`)

Đo chất lượng tìm kiếm và gợi ý từ hai bảng `search_history` (lượt tìm) và `click_events` (lượt bấm, thích, không thích). Cần khóa quản trị: đặt `ADMIN_API_KEY` trong `backend/.env` rồi gọi

```bash
curl "http://localhost:3000/api/admin/stats?days=7" -H "X-Api-Key: <ADMIN_API_KEY>"
```

hoặc mở `http://localhost:3000/docs`, chọn `GET /api/admin/stats` → **Try it out**, điền khóa vào ô `X-Api-Key` rồi bấm **Execute**. Tham số: `days` (1-365, mặc định 30) là số ngày gần nhất được tính, `limit` (1-50, mặc định 10) là số dòng tối đa của hai danh sách.

| Trường | Ý nghĩa |
|---|---|
| `searches.total` | Số lượt tìm bằng chữ (có `X-Client-Id`) trong khoảng thời gian |
| `searches.withClick`, `searches.clickThroughRate` | Số lượt tìm mà cùng trình duyệt bấm vào một kết quả của đúng từ khóa đó trong vòng 5 phút, và tỉ lệ so với tổng (`null` khi chưa có dữ liệu) |
| `events` | Tổng lượt bấm, thích, không thích; lượt bấm chia theo nguồn `text` / `image` / `browse` |
| `positions.distribution` | Số lượt bấm theo vị trí trong danh sách (1 = đầu tiên, vị trí 11 trở đi gộp thành `11+`) |
| `positions.top3Share` | Tỉ lệ lượt bấm rơi vào 3 vị trí đầu: càng cao nghĩa là kết quả tốt được xếp càng lên trên |
| `positions.meanReciprocalRank` | Trung bình của 1/vị trí trên các lượt bấm (1 = luôn bấm kết quả đầu tiên) |
| `topProducts` | Sản phẩm được bấm nhiều nhất |
| `zeroClickQueries` | Từ khóa được tìm từ 2 lần trở lên nhưng chưa lần nào được bấm, kèm số kết quả trung bình: nơi tìm kiếm có thể đang sai |

Lưu ý khi đọc số: frontend gửi truy vấn trong lúc người dùng đang gõ, nên các từ gõ dở (ví dụ "tai ng") cũng được tính là một lượt tìm không có bấm. Vì vậy tỉ lệ bấm thực tế cao hơn con số này, và nên lọc danh sách `zeroClickQueries` bằng mắt. Cửa sổ 5 phút giống `training/sql/report_failed_queries.sql`; khác ở chỗ ở đây cú bấm phải thuộc đúng từ khóa đó.

## Dữ liệu Lazada: sản phẩm và đánh giá

`backend/app/seed-data/lazada-products.csv` (6.883 sản phẩm, 7 ngành hàng) và `lazada-reviews.csv` (20.513 đánh giá tiếng Việt) là bản rút gọn cột của hai file `lazada_products_master_dedup.csv` và `lazada_reviews_master_dedup.csv` do nhóm thu thập. Dữ liệu này **không tự nạp khi backend khởi động**, chạy lệnh một lần:

```bash
cd backend
python -m app.cli import-lazada --dry-run     # chỉ đọc và in thống kê, không ghi database
python -m app.cli import-lazada --no-index    # nạp sản phẩm + đánh giá (khoảng 2 giây), chưa tạo embedding
python -m app.cli reindex                     # tạo embedding khi AI Service hoặc Jina đã sẵn sàng
```

Muốn nạp file gốc hoặc file khác: `--products đường/dẫn.csv --reviews đường/dẫn.csv`. Chạy lại nhiều lần không tạo bản ghi trùng.

Lệnh này làm gì:

- **Sản phẩm.** Gom danh mục Lazada về danh mục chung của web theo `lazada-category-map.json` (ví dụ "Mỹ phẩm" thành "Làm đẹp"; "điện thoại", "máy tính bảng" thành "Điện thoại & Máy tính bảng"; "Đồ ăn vặt" giữ thành danh mục mới). Danh mục con (ví dụ "kem nền") được lưu vào `tag` để tìm kiếm theo từ khóa. Giá 0 hoặc trống được lưu là không có giá. Sau đó đi qua cùng bước làm sạch với `import-csv` (bỏ link trùng, tin đăng trùng ảnh và tên).
- **Không ghi đè sản phẩm đã có.** File `marketplace-products.csv` (nạp lại mỗi lần khởi động) cũng chứa 315 sản phẩm trùng link. Nếu cả hai nguồn cùng ghi một dòng thì sẽ đè qua đè lại và làm mất embedding, nên mặc định lệnh chỉ thêm sản phẩm mới. Dùng `--update-existing` nếu thật sự muốn ghi đè.
- **Đánh giá.** Lưu vào bảng `product_reviews` (migration `004`), ghép với sản phẩm qua link. Bỏ phần đuôi "+2 Helpful(3)" và giữ số 3 thành `helpful_count`, bỏ các dòng "Chưa có nội dung đánh giá văn bản". Không lưu thông tin người đánh giá.

Kết quả khi nạp vào database mới (sau khi backend đã nạp `marketplace-products.csv`):

| | Số lượng |
|---|---|
| Sản phẩm đọc được | 6.638 (245 dòng bị loại vì ảnh là ảnh chờ tải `data:image/png;base64`, không phải ảnh thật) |
| Sau khi bỏ trùng | 6.585, trong đó 315 đã có sẵn nên chỉ thêm 6.270 |
| Đánh giá có chữ | 17.020 (3.493 dòng không có chữ) |
| Đánh giá được lưu | 16.242 (742 thuộc sản phẩm bị loại, còn lại là nội dung trùng trong cùng sản phẩm) |

Lưu ý về chất lượng dữ liệu: 40% sản phẩm không có giá và 53% không có điểm sao (hai cột điểm trong file đánh giá là điểm của sản phẩm, không phải của từng đánh giá, và không bổ sung thêm được sản phẩm nào). Một số "đánh giá" thật ra là câu trả lời của shop (ví dụ "Dạ shop mình chân thành cảm ơn..."). Khoảng 27% đánh giá bắt đầu bằng phân loại hàng ("Nhóm màu: Đen Kích cỡ: 39"); phần này được giữ nguyên vì không tách chắc chắn được. Nên lọc các trường hợp này trước khi dùng đánh giá để huấn luyện.

API đọc đánh giá: `GET /api/products/{id}/reviews?limit=10&offset=0` trả `{ items: [{ id, content, helpful }], total, limit, offset }`, đánh giá được nhiều người thấy hữu ích đứng trước.

## Test

```bash
# Backend: unit + API tests (không cần database)
cd backend
pip install -r requirements-dev.txt
pytest -q

# Tích hợp PostgreSQL/pgvector: đặt TEST_DATABASE_URL để bật test DB
# CI GitHub Actions tự khởi tạo pgvector/pg16 và chạy nhóm test này.

# AI Service: dùng embedder giả, không tải model
cd ../ai_service
pip install -r requirements-dev.txt
pytest -q

# Frontend
cd ../frontend
npm ci
node --test "tests/**/*.test.mjs"
npm run build
```

## Docker Compose

- `docker-compose.yml`: toàn bộ stack local, database lưu trong named volume `pgdata`.
- `docker-compose.dev.yml`: override để hot reload backend Python: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build`.
- `docker-compose.prod.yml`: dùng các image đã publish lên GHCR, Caddy làm reverse proxy.
- `docker-compose.finetuned.yml`: nạp checkpoint CLIP đã fine-tune; phải reindex toàn bộ embedding trước khi dùng model mới.

## CI/CD GitHub Actions

Workflow `.github/workflows/ci-cd.yml` chạy:

1. Backend: Python compile, unit/API tests và PostgreSQL integration tests.
2. Frontend: Node test và Vite build.
3. AI Service: pytest.
4. Validate Compose local/dev/production.
5. Khi push `main`: build và publish ba image `ttnt-backend`, `ttnt-frontend`, `ttnt-ai-service` lên GHCR, tag `latest` và `sha-<commit>`.
6. Deploy qua SSH: upload Compose/Caddy/backup config, pull image theo commit, khởi động stack và chờ backend healthy.

Để bật CD, thiết lập GitHub repository secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`; tùy chọn `DEPLOY_PORT` (mặc định 22), `DEPLOY_PATH` (mặc định `/opt/ttnt`). Xem [docs/DEPLOY.md](docs/DEPLOY.md) để chuẩn bị server, SSH và file `.env` production.

## Cấu hình quan trọng

| Biến | Ý nghĩa |
|---|---|
| `DATABASE_URL` | Kết nối PostgreSQL |
| `AI_SERVICE_URL` | URL nội bộ của AI Service (khi `EMBEDDING_PROVIDER=local`) |
| `EMBEDDING_PROVIDER` | `local` (AI Service tự host, mặc định) hoặc `jina` (Jina AI API, không cần AI Service) |
| `JINA_API_KEY`, `JINA_MODEL` | Khóa API và model khi dùng `jina` (mặc định `jina-clip-v2`, cắt về 512 chiều) |
| `JINA_IMAGE_INTERVAL_MS` | Khoảng cách tối thiểu giữa hai request ảnh (mặc định 2500; đặt 0 với key trả phí) |
| `ADMIN_API_KEY` | Khóa quản trị, tối thiểu 16 ký tự |
| `RUN_MIGRATIONS` | Tự chạy migration khi backend start |
| `IMPORT_CSV_ON_START` | Đồng bộ CSV sản phẩm khi start |
| `TEXT_MIN_SIMILARITY`, `IMAGE_MIN_SIMILARITY` | Ngưỡng cosine similarity |
| `TEXT_IMAGE_WEIGHT` | Trọng số độ khớp chữ→ảnh trong rerank tìm kiếm chữ |
| `MAX_UPLOAD_MB` | Dung lượng ảnh upload tối đa |
| `RATE_LIMIT_PER_MIN`, `SEARCH_RATE_LIMIT_PER_MIN` | Giới hạn request theo phút và IP |
| `CORS_ORIGINS` | Danh sách origin, phân tách bằng dấu phẩy; chuỗi rỗng = same-origin |

Rate limit của backend Python lưu trong bộ nhớ tiến trình, tương đương cách triển khai backend cũ; khi cần chạy nhiều replica cần chuyển rate limit sang Redis để dùng chung trạng thái.

## Dùng Jina AI API thay cho AI Service

Khi không có chỗ chạy AI Service (ví dụ Render Free, RAM 512 MB), backend có thể lấy embedding từ Jina AI:

```bash
EMBEDDING_PROVIDER=jina
JINA_API_KEY=jina_xxx          # lấy tại https://jina.ai (API key có số token miễn phí cho key mới)
```

- Model `jina-clip-v2` đưa văn bản (đa ngôn ngữ) và ảnh vào cùng một không gian vector; vector 1024 chiều được cắt Matryoshka về 512 chiều nên **không phải đổi schema**.
- Embedding của model cũ (CLIP ViT-B/32) **không dùng chung được** với Jina. Sau khi đổi provider phải tạo lại toàn bộ:
  `python -m app.cli reindex --all` (lệnh này cũng xóa vector truy vấn cũ trong `search_history`).
- Ảnh được thu nhỏ về tối đa 512x512 trước khi gửi, vì API tính phí theo ô 512x512 (ảnh lớn tốn gấp nhiều lần token).
- Key free bị giới hạn token mỗi phút nên request ảnh được giãn cách (`JINA_IMAGE_INTERVAL_MS`); lập chỉ mục toàn bộ sản phẩm lần đầu mất khoảng 1 giờ.
- Nếu hết token hoặc sai khóa, backend tự hạ cấp về tìm kiếm từ khóa như khi AI Service ngừng.

### Xử lý sự cố: `/api/health` báo `"ai": "down"`

Mở `https://<backend>/api/health` và đọc trường `provider`:

| Kết quả | Nguyên nhân | Cách sửa |
|---|---|---|
| **không có** trường `provider` | backend đang chạy **code cũ** (chưa có `JinaClient`) | chép code mới vào repo, `git push`, đợi Render deploy xong |
| `"provider": "local"` | thiếu `EMBEDDING_PROVIDER=jina`, backend đang gọi AI Service ở `localhost:8000` (không tồn tại trên Render) | Render → service backend → **Environment**: đặt `EMBEDDING_PROVIDER=jina` và `JINA_API_KEY`, rồi lưu để Render deploy lại |
| `"provider": "jina"` và `"ai": "up"` | cấu hình đúng, nhưng `up` ở đây **chưa kiểm tra khóa** (health thường không gọi mạng) | mở `/api/health?deep=true` |

`/api/health?deep=true` gọi thật Jina một lần (vài token, giới hạn 6 lần/phút/IP) và trả `aiError` cho biết lý do cụ thể: sai hoặc hết hạn khóa (`JINA_API_KEY`), hết token (xem số dư tại jina.ai), hay không kết nối được mạng.

Log khởi động cũng ghi rõ chế độ: `Embedding provider: jina (model jina-clip-v2)` hoặc `Embedding provider: local (...)`, kèm cảnh báo nếu `NODE_ENV=production` mà vẫn trỏ tới `localhost`.
