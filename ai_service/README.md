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

`X-Client-Id` vẫn là UUID ẩn danh do frontend tạo. Các endpoint quản trị yêu cầu `X-Api-Key: <ADMIN_API_KEY>`. Lỗi được chuẩn hóa thành `{ "error": { "code": "...", "message": "...", "details": [...] } }`.

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

## Pretrain model cho AI Service

Phần này mô tả quá trình huấn luyện (pretrain/fine-tune) model CLIP mà AI Service sử dụng. Số liệu lấy từ `report.json` và `history.csv` của lần chạy tốt nhất. Cách nạp model đã huấn luyện vào dịch vụ xem `docker-compose.finetuned.yml` ở mục Docker Compose và `ai_service/README.md`.

### Kiến trúc và chiến lược huấn luyện

| Thành phần | Model nền |
|---|---|
| Tháp ảnh | `clip-ViT-B-32` |
| Tháp văn bản | `sentence-transformers/clip-ViT-B-32-multilingual-v1` (đa ngôn ngữ) |

Hai tháp cùng chiếu vào không gian 512 chiều và được huấn luyện theo hướng contrastive (ảnh ↔ chữ). Để tránh overfit trên tập dữ liệu nhỏ và huấn luyện nhanh hơn, mỗi tháp chỉ mở khóa **2 lớp cuối** (cùng lớp chiếu), phần còn lại giữ nguyên.

### Cấu hình huấn luyện

| Tham số | Giá trị |
|---|---|
| Số epoch tối đa | 8 |
| Early stopping (`patience`) | 3 |
| Batch size | 64 |
| Learning rate lớp mở khóa (`lr`) | `1e-5` |
| Learning rate lớp chiếu (`head_lr`) | `1e-4` |
| Số lớp mở khóa | 2 lớp ảnh, 2 lớp văn bản |
| Mixed precision (AMP) | Bật |
| Thiết bị | `cuda` |
| `workers` / `seed` | 2 / 42 |

Checkpoint tốt nhất được chọn theo `score` trên tập val. Lần chạy này không bị dừng sớm, `best_epoch = 8`.

### Ý nghĩa các chỉ số

- `t2i_R@K`: chữ → ảnh, tỷ lệ tìm đúng ảnh trong top K.
- `i2t_R@K`: ảnh → chữ, tỷ lệ tìm đúng mô tả trong top K.
- `i2i_P@10`: độ chính xác top 10 khi tìm ảnh bằng ảnh.
- `t2t_P@10`: độ chính xác top 10 khi tìm chữ bằng chữ.
- `q2i_P@10`: độ chính xác top 10 khi dùng truy vấn ngắn để tìm ảnh.
- `score`: điểm tổng hợp dùng để chọn checkpoint và early stopping.

### Kết quả trên tập test

| Chỉ số | Model gốc | Đã tinh chỉnh | Chênh |
|---|---:|---:|---:|
| `t2i_R@1` | 0,233 | **0,443** | +0,210 |
| `i2t_R@1` | 0,239 | **0,420** | +0,182 |
| `t2i_R@5` | 0,449 | **0,688** | +0,239 |
| `i2t_R@5` | 0,472 | **0,676** | +0,205 |
| `t2i_R@10` | 0,534 | **0,830** | +0,295 |
| `i2t_R@10` | 0,580 | **0,881** | +0,301 |
| `i2i_P@10` | 0,694 | **0,710** | +0,015 |
| `t2t_P@10` | 0,603 | **0,680** | +0,077 |
| `q2i_P@10` | 0,354 | **0,593** | +0,239 |
| `score` | 0,514 | **0,669** | **+0,155** |

### Tiến trình huấn luyện (tập val)

Epoch 0 là model gốc chưa tinh chỉnh nên chưa có `loss`.

| Epoch | Loss | `t2i_R@1` | `i2t_R@1` | `t2i_R@10` | `i2t_R@10` | `q2i_P@10` | `score` |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 (gốc) | nan | 0,211 | 0,177 | 0,543 | 0,526 | 0,379 | 0,507 |
| 1 | 2,518 | 0,240 | 0,286 | 0,754 | 0,709 | 0,486 | 0,608 |
| 2 | 1,736 | 0,331 | 0,331 | 0,771 | 0,766 | 0,568 | 0,648 |
| 3 | 1,327 | 0,337 | 0,337 | 0,783 | 0,760 | 0,539 | 0,649 |
| 4 | 1,041 | 0,366 | 0,326 | 0,823 | 0,794 | 0,571 | 0,672 |
| 5 | 0,895 | 0,354 | 0,349 | 0,834 | 0,834 | 0,593 | 0,678 |
| 6 | 0,766 | 0,371 | 0,366 | 0,829 | 0,829 | 0,586 | 0,679 |
| 7 | 0,733 | 0,360 | 0,354 | 0,829 | 0,829 | 0,589 | 0,683 |
| **8** | **0,677** | 0,360 | 0,354 | 0,829 | 0,829 | 0,589 | **0,684** |

Nhận xét:

- Các bài toán chéo modality (chữ ↔ ảnh) cải thiện mạnh nhất, `R@1` gần như tăng gấp đôi.
- `q2i_P@10` tăng từ 0,354 lên 0,593, cho thấy model hiểu truy vấn ngắn tốt hơn rõ rệt.
- `i2i_P@10` chỉ tăng nhẹ vì CLIP gốc vốn đã mạnh ở việc so khớp ảnh với ảnh.
- Phần lớn mức tăng đến từ 4 epoch đầu; sau epoch 5 `score` val gần như phẳng, nên thêm dữ liệu có thể hiệu quả hơn tăng epoch.
- Tập val (175 mẫu) và test (176 mẫu) nhỏ nên các chỉ số có thể dao động vài điểm phần trăm; nên đọc theo xu hướng tổng thể.

### Chạy lại huấn luyện

```bash
cd training
python finetune_clip.py \
  --data data --out output \
  --text_model sentence-transformers/clip-ViT-B-32-multilingual-v1 \
  --image_model clip-ViT-B-32 \
  --epochs 8 --batch_size 64 \
  --lr 1e-5 --head_lr 1e-4 \
  --unfreeze_image_layers 2 --unfreeze_text_layers 2 \
  --patience 3 --workers 2 --device cuda --seed 42
```

Kết quả được lưu trong `report.json` (tham số, kết quả model gốc và model tinh chỉnh) và `history.csv` (số liệu từng epoch). Sau khi dùng model mới phải reindex toàn bộ embedding: `python -m app.cli reindex --all`.
