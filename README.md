# MachineSearch (project_TTNT)

Hệ thống gợi ý sản phẩm bằng AI. Người dùng có thể **mô tả bằng lời** hoặc **tải ảnh lên**, hệ thống trả về những sản phẩm gần nhất.

- Tìm bằng văn bản: embedding văn bản (CLIP đa ngôn ngữ, hiểu tiếng Việt) kết hợp full-text, lưu trong PostgreSQL + pgvector.
- Tìm bằng hình ảnh: embedding ảnh (CLIP ViT-B/32) so khớp với ảnh sản phẩm.
- Gợi ý: sản phẩm tương tự, và gợi ý cá nhân hóa từ lịch sử tìm kiếm (không cần đăng nhập).

## Kiến trúc

```
Trình duyệt ──► nginx (frontend, React) ──/api──► backend (Node.js + Express) ──► PostgreSQL + pgvector
                                                        │
                                                        └──► ai-service (FastAPI + CLIP) : tạo embedding
```

| Thành phần | Công nghệ | Thư mục |
|---|---|---|
| Frontend | React 18 + Vite (JavaScript) | `frontend/` |
| Backend API | Node.js 22, Express 5, pg, zod | `backend/` |
| AI service | Python 3.11, FastAPI, sentence-transformers (CLIP) | `ai_service/` |
| Database | PostgreSQL 16 + pgvector | image `pgvector/pgvector:pg16` |

## Cấu trúc thư mục

```
backend/
  src/
    config/         đọc & kiểm tra biến môi trường
    routes/         khai báo đường dẫn API
    controllers/    nhận request, gọi service, trả response
    services/       logic nghiệp vụ (tìm kiếm, gợi ý, lập chỉ mục...)
    repositories/   toàn bộ câu lệnh SQL
    clients/        gọi dịch vụ ngoài (ai-service)
    middlewares/    validate, upload, rate-limit, xử lý lỗi, bảo vệ admin
    validators/     schema zod cho dữ liệu vào
    db/             pool, migration (.sql), dữ liệu mẫu
    scripts/        migrate / seed / reindex (chạy bằng npm run ...)
    utils/          http-error, vector, logger...
    app.js          dựng Express app      server.js  khởi động
  tests/            unit/ (logic) và http/ (toàn bộ API)
ai_service/app/     config, routers, services (embedder CLIP)
frontend/src/       api/, hooks/, components/, pages/, styles/, utils/
deploy/             Caddyfile, server-setup.sh, backup.sh
docs/DEPLOY.md      hướng dẫn đưa lên server
.github/workflows/  CI/CD
```

## Chạy trên máy cá nhân

Cần Docker Desktop (hoặc Docker Engine + Compose) và khoảng 4 GB RAM trống.

```bash
docker compose up --build
```

Lần đầu mất vài phút vì image `ai-service` tải sẵn model (~1 GB). Sau đó:

| Địa chỉ | Là gì |
|---|---|
| http://localhost:8080 | Giao diện web |
| http://localhost:3000/api/health | Kiểm tra backend |
| http://localhost:8000/docs | Tài liệu API của ai-service |

Backend khởi động ngay cả khi AI còn đang nạp model: lúc đó tìm kiếm tự hạ xuống chế độ từ khóa, và sản phẩm mẫu sẽ được lập chỉ mục nền khi AI sẵn sàng (xem log: `docker compose logs -f backend`).

### Chạy từng phần (để phát triển)

```bash
docker compose up -d postgres ai-service          # hạ tầng

cd backend && cp .env.example .env && npm install
npm run dev                                       # API ở :3000, tự reload

cd frontend && npm install
npm run dev                                       # giao diện ở :5173, proxy /api về :3000
```

## Cách tìm kiếm hoạt động

**Văn bản (hybrid).** Câu truy vấn được ai-service chuyển thành vector 512 chiều. PostgreSQL lấy 50 sản phẩm gần nhất theo vector (HNSW, cosine) và 50 sản phẩm khớp từ khóa (full-text), rồi trộn hai bảng xếp hạng bằng Reciprocal Rank Fusion. RRF chỉ dùng thứ hạng nên không cần chuẩn hóa điểm giữa hai nhánh. Nếu ai-service không phản hồi, hệ thống tự dùng riêng nhánh từ khóa.

**Ảnh.** Ảnh tải lên (tối đa 5 MB) được chuyển thành vector bằng CLIP rồi so với vector ảnh của từng sản phẩm.

**Gợi ý.** `GET /api/products/:id/similar` lấy trung bình độ giống về mô tả và hình ảnh. `GET /api/recommendations` lấy vector trung bình của 5 truy vấn gần nhất của trình duyệt (định danh ẩn danh `X-Client-Id`), chưa có lịch sử thì trả sản phẩm mới nhất.

## API

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/health` | `ok` / `degraded` (AI tắt) / `error` (DB lỗi) |
| GET | `/api/products?category=&limit=&offset=` | Danh sách sản phẩm |
| GET | `/api/products/:id` | Chi tiết |
| GET | `/api/products/:id/similar?limit=` | Sản phẩm tương tự |
| GET | `/api/categories` | Danh mục và số lượng |
| POST | `/api/search/text` | Body JSON `{ "query": "...", "category"?: "...", "limit"?: 12 }` |
| POST | `/api/search/image` | `multipart/form-data`, trường `image` (+ `category`, `limit`) |
| GET | `/api/recommendations` | Gợi ý cho trình duyệt hiện tại |
| GET / DELETE | `/api/history` | Xem / xóa lịch sử tìm kiếm của trình duyệt |
| POST | `/api/products` | **Admin**: thêm sản phẩm và tự lập chỉ mục |
| DELETE | `/api/products/:id` | **Admin** |
| POST | `/api/admin/reindex` | **Admin**: tạo embedding còn thiếu |

Endpoint admin cần header `X-Api-Key: <ADMIN_API_KEY>`. Lỗi luôn có dạng `{ "error": { "code": "...", "message": "..." } }`.

Thêm một sản phẩm:

```bash
curl -X POST http://localhost:3000/api/products \
  -H "X-Api-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"title":"Ghế gỗ sồi","category":"Nội thất","imageUrl":"https://.../ghe.jpg","description":"Ghế gỗ sồi tối giản","price":1290000}'
```

## Test

```bash
cd backend && npm test           # unit + toàn bộ API (không cần database thật)
cd ai_service && pip install -r requirements-dev.txt && pytest
```

Test của ai-service dùng embedder giả nên không cần tải model.

## Quy trình Git và CI/CD

Giữ quy ước của nhóm: làm tính năng ở `feature` → push lên `dev` để kiểm tra → merge vào `main`.

| Sự kiện | Chạy gì |
|---|---|
| Push `feature`/`dev`, mở PR vào `dev`/`main` | Test backend, build frontend, test ai-service, kiểm tra Compose |
| Push vào `main` | Như trên, rồi build 3 image, đẩy lên GitHub Container Registry, SSH vào server và `docker compose up -d` |

**Trước khi dùng CI lần đầu:** chạy `npm install` trong `backend/` và `frontend/`, rồi commit cả hai file `package-lock.json` (CI và Docker ưu tiên `npm ci` nên cần lockfile khớp `package.json`; nếu thiếu/lệch, chúng tự dùng `npm install` kèm cảnh báo).

Cách chuẩn bị server và các secret cần thêm vào GitHub: xem [docs/DEPLOY.md](docs/DEPLOY.md).

## Tinh chỉnh và hạn chế đã biết

- **Ngưỡng độ giống.** `TEXT_MIN_SIMILARITY` và `IMAGE_MIN_SIMILARITY` mặc định 0 (không lọc) vì giá trị phù hợp phụ thuộc dữ liệu của bạn. Hãy thử vài truy vấn thật, quan sát `similarity` trong kết quả rồi đặt ngưỡng. Con số "Khớp xx%" trên giao diện là cosine similarity, không phải xác suất.
- **Dữ liệu mẫu** hiện là 6 ảnh cảm hứng thiết kế. Thay bằng sản phẩm thật qua `POST /api/products` hoặc sửa `backend/src/db/seed-data/products.json`.
- **Lịch sử cá nhân hóa** dựa vào định danh lưu trong trình duyệt, không phải tài khoản: đổi trình duyệt hoặc xóa dữ liệu sẽ mất lịch sử. Gợi ý cá nhân hóa mới dùng truy vấn văn bản, chưa dùng truy vấn ảnh.
- **Quy mô.** HNSW lo phần tìm theo văn bản và ảnh. `findSimilar` quét toàn bảng nên ổn tới vài chục nghìn sản phẩm; lớn hơn nên lấy ứng viên bằng HNSW rồi mới xếp hạng lại.
- **Tiếng Việt có dấu** trong nhánh từ khóa dùng cấu hình `simple` (không bỏ dấu). Nhánh vector bù lại cho các truy vấn gõ không dấu.
