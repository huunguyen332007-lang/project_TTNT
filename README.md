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
| Frontend | React 18 + Vite (JavaScript), giao diện PickForYou | `frontend/` |
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
    db/             pool, migration (.sql), dữ liệu CSV
    import/         đọc & làm sạch CSV sản phẩm (hàm thuần, có test)
    scripts/        migrate / import-csv / reindex (chạy bằng npm run ...)
    utils/          http-error, vector, logger...
    app.js          dựng Express app      server.js  khởi động
  tests/            unit/ (logic) và http/ (toàn bộ API)
ai_service/app/     config, routers, services (embedder CLIP)
frontend/src/       giao diện PickForYou: App.jsx, api.js, useRecommendations.js, components/ (xem frontend/README.md)
training/           fine-tune CLIP (xem training/README.md)
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

Backend tự đồng bộ `backend/src/db/seed-data/marketplace-products.csv` vào PostgreSQL trước khi mở API. Frontend gọi `/api/recommend` và `/api/categories` để tải sản phẩm/danh mục trực tiếp từ database, nên dữ liệu CSV hiển thị ngay cả khi AI chưa tạo xong embedding. AI sẽ lập chỉ mục nền sau khi backend khởi động (xem log: `docker compose logs -f backend`).

### Nạp dữ liệu sản phẩm thật (CSV Shopee/Lazada)

File `backend/src/db/seed-data/marketplace-products.csv` (1.784 dòng dữ liệu) được tự động làm sạch và đồng bộ vào PostgreSQL mỗi khi backend khởi động (mặc định `IMPORT_CSV_ON_START=true`). Lần đầu sẽ thêm mới; những lần sau cập nhật theo `source_url`, không tạo bản ghi trùng và không xóa embedding nếu nội dung không đổi.

Để nạp thủ công sau khi thay CSV, dùng:

```bash
docker compose exec backend npm run import:csv
```

Chỉ dùng `--replace` khi bạn chủ động muốn xóa toàn bộ sản phẩm đang có trước khi nạp CSV:

- `--replace` xóa các sản phẩm hiện có trước khi nạp. Bỏ cờ này để nạp thêm/cập nhật; chạy lại nhiều lần không tạo bản ghi trùng (khóa theo URL gốc, đã bỏ query string).
- `--dry-run` chỉ in thống kê làm sạch; `--no-index` nạp dữ liệu nhưng để tạo embedding sau (`npm run reindex`); `--keep-conflicts` giữ cả các dòng bị gán nhầm ảnh.
- Làm sạch: loại 28 dòng có ảnh bị gán nhầm (một URL ảnh dùng chung cho nhiều danh mục khác nhau) và 11 dòng đăng trùng → còn 1.745 sản phẩm. Giá `0₫` và đánh giá `0` trong nguồn coi là "không có dữ liệu".
- 37 nhãn gốc được gom thành 10 danh mục hiển thị ở tab; bảng gom nhóm nằm ở `backend/src/db/seed-data/category-map.json` (sửa rồi import lại với `--replace`). Nhãn gốc được giữ trong trường `tag`.
- Tạo embedding cho ~1.700 sản phẩm trên CPU mất khoảng vài chục phút (phần lớn là tải ảnh và chạy CLIP). Dữ liệu đã hiển thị được ngay, tìm kiếm ngữ nghĩa sẽ tốt dần khi chỉ mục xong.

Dùng model đã fine-tune: xem `training/README.md` và `docker-compose.finetuned.yml`.

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

**Gợi ý cá nhân hóa (`POST /api/recommend`).** Giao diện chỉ cần một endpoint này cho mọi thao tác duyệt/tìm. Có từ khóa thì lấy ứng viên bằng tìm kiếm hybrid ở trên; không có thì chấm điểm cả danh mục. Điểm = từ khóa (0.40) + giống các sản phẩm đã xem (0.20, vector trung bình embedding văn bản) + danh mục yêu thích (0.15) + danh mục đã xem (0.10) + điểm đánh giá (0.15). Ngân sách (`low` < 100k, `mid` 100k–300k, `high` 300k–1 triệu, `premium` > 1 triệu) là bộ lọc cứng và loại cả sản phẩm chưa có giá; `sort` áp dụng trên toàn bộ kết quả trước khi phân trang bằng `limit`/`offset`. Lịch sử xem do trình duyệt lưu và gửi lên (`viewedIds`), server không lưu. `mode`: `hybrid` (tìm kiếm AI), `keyword` (AI tạm tắt), `personalized`, `browse`. Chỉ lượt có từ khóa chịu giới hạn `SEARCH_RATE_LIMIT_PER_MIN`.

## API

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/health` | `ok` / `degraded` (AI tắt) / `error` (DB lỗi) |
| GET | `/api/products?category=&limit=&offset=` | Danh sách sản phẩm trực tiếp từ PostgreSQL |
| GET | `/api/products/:id` | Chi tiết |
| GET | `/api/products/:id/similar?limit=` | Sản phẩm tương tự |
| GET | `/api/categories` | Danh mục và số lượng |
| POST | `/api/search/text` | Body JSON `{ "query": "...", "category"?: "...", "limit"?: 12 }` |
| POST | `/api/search/image` | `multipart/form-data`, trường `image` (+ `category`, `limit`) |
| POST | `/api/recommend` | Gợi ý cá nhân hóa cho giao diện: `{ query?, category?, interests?, budget?, viewedIds?, sort?, limit?, offset? }` → `{ items, total, mode }` |
| GET | `/api/recommendations` | Gợi ý theo lịch sử tìm kiếm lưu ở server (không dùng bởi giao diện hiện tại) |
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

- **Thứ hạng khi tìm kiếm.** Sản phẩm vừa khớp cao vừa nhiều sao được đưa lên đầu. Tìm bằng chữ (`/api/recommend`): 60% độ khớp (cosine similarity thật, trộn thêm độ khớp chữ→ảnh theo `TEXT_IMAGE_WEIGHT`), 25% số sao, phần còn lại là cá nhân hóa. Tìm bằng ảnh: 70% độ giống, 30% số sao. Số sao được quy đổi 3 sao trở xuống = 0, 5 sao = 1 để phân biệt 4.0/4.5/5.0; chưa có đánh giá thì trung tính. Hàm nằm ở `backend/src/utils/ranking.js` (có test). Vì CSV không có số lượt đánh giá, sản phẩm 5.0 sao có thể chỉ có vài đánh giá: nếu thấy sao đang lấn át độ khớp, giảm `RATING_WEIGHT` / `SEARCH_WEIGHTS.popular`.
<<<<<<< HEAD
=======
- **Gợi ý từ lịch sử tìm kiếm.** Khi chưa gõ gì, hệ thống đọc 5 truy vấn chữ gần nhất của trình duyệt này trong bảng `search_history` (PostgreSQL), bỏ truy vấn trùng và truy vấn gõ dở, trộn vector của chúng với trọng số giảm dần theo độ cũ (0.7 mỗi bước), rồi ưu tiên sản phẩm gần khẩu vị đó, kết hợp số sao và sở thích. Thẻ sản phẩm ghi lý do "Dựa trên tìm kiếm “…”". Hiện chỉ dùng truy vấn chữ; tìm bằng ảnh chưa được ghi embedding nên chưa ảnh hưởng. Nút "Xóa" ở mục Tìm kiếm gần đây cũng xóa lịch sử này trong PostgreSQL.
>>>>>>> d642a4f5436e776b2fbe4f031def991d04107e0b
- **Ngưỡng độ giống.** `TEXT_MIN_SIMILARITY` và `IMAGE_MIN_SIMILARITY` mặc định 0 (không lọc) vì giá trị phù hợp phụ thuộc dữ liệu của bạn. Hãy thử vài truy vấn thật, quan sát `similarity` trong kết quả rồi đặt ngưỡng. Con số "Khớp xx%" trên giao diện là cosine similarity, không phải xác suất.
- **Dữ liệu** chỉ gồm sản phẩm trong CSV của bạn. 6 sản phẩm mẫu cũ (ảnh Unsplash) đã bị bỏ khỏi mã nguồn và tự bị xóa khỏi database khi backend khởi động. Muốn thêm sản phẩm lẻ, dùng `POST /api/products`.
- **Lịch sử cá nhân hóa** dựa vào định danh lưu trong trình duyệt, không phải tài khoản: đổi trình duyệt hoặc xóa dữ liệu sẽ mất lịch sử. Gợi ý cá nhân hóa mới dùng truy vấn văn bản, chưa dùng truy vấn ảnh.
- **Quy mô.** HNSW lo phần tìm theo văn bản và ảnh. `findSimilar` quét toàn bảng nên ổn tới vài chục nghìn sản phẩm; lớn hơn nên lấy ứng viên bằng HNSW rồi mới xếp hạng lại.
- **Tiếng Việt có dấu** trong nhánh từ khóa dùng cấu hình `simple` (không bỏ dấu). Nhánh vector bù lại cho các truy vấn gõ không dấu.
