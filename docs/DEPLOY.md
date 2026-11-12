# Triển khai lên server (VPS)

Tài liệu này hướng dẫn **tự chạy hệ thống trên một VPS** bằng Docker Compose + Caddy (HTTPS tự động), dùng các image mà GitHub Actions đã đẩy lên Docker Hub.

> Bản demo chính thức của đồ án chạy trên **Render** (https://ttnt-frontend.onrender.com); cách dựng xem mục "Triển khai lên Render" trong [README](../README.md). Pipeline CI/CD trong `.github/workflows/ci-cd.yml` build image lên Docker Hub rồi gọi Render Deploy Hook; **không** tự SSH lên VPS. Với VPS, bạn kéo image và khởi động bằng tay theo các bước dưới đây.

## 1. Chọn cấu hình server

Dịch vụ `ai-service` nạp hai model CLIP vào RAM và chạy trên CPU. Ước tính (chưa đo trên dữ liệu của bạn): ai-service dùng khoảng 1,5 đến 2,5 GB, phần còn lại (PostgreSQL, Python backend, nginx, Caddy) khoảng 0,5 GB.

| Mức | Cấu hình | Ghi chú |
|---|---|---|
| Tối thiểu | 2 vCPU, **4 GB RAM**, 20 GB ổ đĩa, Ubuntu 24.04 | Đủ cho demo/đồ án. Nên bật swap (script có sẵn). |
| Thoải mái | 4 vCPU, 8 GB RAM | Suy luận nhanh hơn, dư RAM cho dữ liệu lớn. |

Không nên dùng server 1 đến 2 GB RAM: ai-service sẽ bị hệ điều hành tắt vì thiếu bộ nhớ. Không cần GPU. Giá các nhà cung cấp thay đổi thường xuyên, hãy xem trang giá hiện tại trước khi chọn.

Chọn nhà cung cấp theo nhu cầu:

- **VPS quốc tế giá rẻ** (Hetzner, và các nhà cung cấp tương tự): rẻ nhất cho cấu hình 4 GB, nhưng nhiều gói giá rẻ hay hết hàng. Chọn data center gần người dùng.
- **VPS trong nước** (Viettel IDC, FPT Cloud, VNG Cloud, AZDIGI và các nhà cung cấp khác): độ trễ thấp cho người dùng Việt Nam, thanh toán bằng VND, có hóa đơn. Đối chiếu kỹ cấu hình thực tế (RAM, loại CPU, có giới hạn băng thông không).
- **Gói miễn phí** (Oracle Cloud Always Free, ARM): xem lưu ý ở mục 8.

## 2. Chuẩn bị server (làm một lần)

Đăng nhập server bằng root (hoặc sudo) rồi chạy:

```bash
curl -fsSL https://raw.githubusercontent.com/<tai-khoan>/<repo>/main/deploy/server-setup.sh -o server-setup.sh
sudo bash server-setup.sh
```

Script cài Docker, tạo swap 2 GB, bật firewall (chỉ mở SSH/80/443), tạo user `deploy` và thư mục `/opt/ttnt`.

## 3. Lấy image từ Docker Hub

Sau mỗi lần merge vào `main`, pipeline đẩy ba image lên Docker Hub với tag `latest` và `sha-<mã-commit-đầy-đủ>`:

- `<DOCKERHUB_USERNAME>/ttnt-backend`
- `<DOCKERHUB_USERNAME>/ttnt-frontend`
- `<DOCKERHUB_USERNAME>/ttnt-ai-service`

Image public nên server không cần đăng nhập để `pull`. Nếu để private, chạy `docker login` trên server trước.

## 4. Chép file cấu hình và tạo `.env` trên server

Từ máy của bạn, chép ba file cấu hình lên server (thư mục `/opt/ttnt`):

```bash
scp docker-compose.prod.yml deploy/Caddyfile deploy/backup.sh deploy@<IP-server>:/opt/ttnt/
```

Rồi tạo file `.env`:

```bash
sudo -u deploy nano /opt/ttnt/.env
```

```env
DOCKERHUB_USERNAME=<tên tài khoản Docker Hub chứa image, ví dụ myster03>
POSTGRES_PASSWORD=<chạy: openssl rand -hex 24>
ADMIN_API_KEY=<chạy: openssl rand -hex 24>
DOMAIN=app.ten-mien-cua-ban.com   # hoặc :80 nếu chưa có tên miền
IMPORT_CSV_ON_START=true          # tự đồng bộ CSV vào PostgreSQL khi backend khởi động
```

Có tên miền: tạo bản ghi DNS `A` trỏ về IP server **trước** lần deploy đầu để Caddy xin được chứng chỉ HTTPS (cần mở cổng 80 và 443).

## 5. Deploy

```bash
cd /opt/ttnt
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

Khi backend khởi động, CSV marketplace được đồng bộ vào PostgreSQL trước khi API mở cổng. Frontend tải danh sách từ backend và có thể hiển thị sản phẩm ngay khi database sẵn sàng. Ai-service cần 1 đến 2 phút để nạp model; embedding được tạo nền sau đó, trong lúc chờ tìm kiếm chữ tự dùng chế độ từ khóa. Đặt `IMPORT_CSV_ON_START=false` nếu muốn tắt đồng bộ CSV tự động.

Kiểm tra:

```bash
curl https://app.ten-mien-cua-ban.com/api/health
# {"status":"ok","services":{"database":"up","ai":"up"}}
```

`status: "degraded"` nghĩa là AI chưa sẵn sàng hoặc đã dừng, chưa phải sự cố nghiêm trọng.

## 6. Vận hành

```bash
cd /opt/ttnt
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend ai-service
free -h && docker stats --no-stream          # theo dõi RAM

# Cập nhật lên bản mới nhất
docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d

# Quay về phiên bản cũ (lấy mã commit từ tab Actions)
IMAGE_TAG=sha-<ma-commit-day-du> docker compose -f docker-compose.prod.yml up -d

# Sao lưu database (đặt cron nếu cần)
bash backup.sh
```

## 7. Lưu ý theo từng loại server

- **Server ARM (Oracle Ampere, Hetzner CAX...).** Image build mặc định chỉ cho amd64. Mở `.github/workflows/ci-cd.yml`, bỏ comment dòng `platforms: linux/amd64,linux/arm64` ở bước build (job `publish`). Build ARM bằng giả lập QEMU chậm hơn đáng kể, nhất là image ai-service.
- **Oracle Cloud Always Free.** Hạn mức ARM miễn phí đã được ghi nhận là thu hẹp, đồng thời việc tạo máy hay gặp lỗi hết tài nguyên (Out of host capacity) và cần thẻ để xác minh. Hãy đọc điều khoản hiện hành trên trang Oracle trước khi dựa vào nó.
- **Đổi `DOMAIN` hoặc thêm HTTPS sau khi đã chạy.** Sửa `.env` rồi `docker compose -f docker-compose.prod.yml up -d` là đủ.

## 8. Sự cố thường gặp

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| `ai-service` liên tục khởi động lại, log có `Killed` | Thiếu RAM. Tăng RAM hoặc swap. |
| Caddy không lấy được chứng chỉ | DNS chưa trỏ đúng, hoặc cổng 80/443 bị chặn ở firewall của nhà cung cấp. |
| `pull` báo không tìm thấy image | Sai `DOCKERHUB_USERNAME` trong `.env`, image chưa được đẩy lên (xem tab Actions, job `publish`), hoặc image để private mà chưa `docker login`. |
| Backend Python không cài được dependency | Kiểm tra Python 3.11 và thử `python -m pip install -r backend/requirements-dev.txt`. |
| Sản phẩm mới không hiện trong tìm kiếm AI | Chưa lập chỉ mục: gọi `POST /api/admin/reindex` với `X-Api-Key`. |
