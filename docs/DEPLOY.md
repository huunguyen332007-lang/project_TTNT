# Triển khai lên server

## 1. Chọn cấu hình server

Dịch vụ `ai-service` nạp hai model CLIP vào RAM và chạy trên CPU. Ước tính (chưa đo trên dữ liệu của bạn): ai-service dùng khoảng 1,5 đến 2,5 GB, phần còn lại (PostgreSQL, Node, nginx, Caddy) khoảng 0,5 GB.

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

## 3. Tạo cặp khóa SSH cho GitHub Actions

Trên máy của bạn:

```bash
ssh-keygen -t ed25519 -f ttnt_deploy -C "github-actions" -N ""
```

- Nội dung `ttnt_deploy.pub` dán vào `/home/deploy/.ssh/authorized_keys` trên server.
- Nội dung `ttnt_deploy` (khóa riêng) dán vào GitHub secret `DEPLOY_SSH_KEY`. Sau đó xóa file này khỏi máy.

## 4. Tạo file `.env` trên server

```bash
sudo -u deploy nano /opt/ttnt/.env
```

```env
POSTGRES_PASSWORD=<chạy: openssl rand -hex 24>
ADMIN_API_KEY=<chạy: openssl rand -hex 24>
DOMAIN=app.ten-mien-cua-ban.com   # hoặc :80 nếu chưa có tên miền
SEED_ON_START=true                # đặt false khi đã có dữ liệu thật
```

Có tên miền: tạo bản ghi DNS `A` trỏ về IP server **trước** lần deploy đầu để Caddy xin được chứng chỉ HTTPS (cần mở cổng 80 và 443).

## 5. Thêm secret vào GitHub

Settings → Secrets and variables → Actions → New repository secret:

| Secret | Giá trị |
|---|---|
| `DEPLOY_HOST` | IP hoặc tên miền server |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | khóa riêng ở bước 3 |
| `DEPLOY_PORT` | (tùy chọn) mặc định 22 |
| `DEPLOY_PATH` | (tùy chọn) mặc định `/opt/ttnt` |

Tùy chọn: Settings → Environments → tạo `production` và bật *Required reviewers* để mỗi lần deploy cần một người duyệt.

## 6. Deploy

Merge vào `main` (hoặc Actions → CI/CD → Run workflow trên `main`). Pipeline: test → build 3 image → đẩy lên GHCR → SSH lên server → `docker compose up -d` → đợi backend `healthy`.

Lần đầu, ai-service cần 1 đến 2 phút để nạp model. Trong lúc đó tìm kiếm tự dùng chế độ từ khóa, và sản phẩm mẫu được lập chỉ mục nền khi AI sẵn sàng.

Kiểm tra:

```bash
curl https://app.ten-mien-cua-ban.com/api/health
# {"status":"ok","services":{"database":"up","ai":"up"}}
```

`status: "degraded"` nghĩa là AI chưa sẵn sàng hoặc đã dừng, chưa phải sự cố nghiêm trọng.

## 7. Vận hành

```bash
cd /opt/ttnt
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend ai-service
free -h && docker stats --no-stream          # theo dõi RAM

# Quay về phiên bản cũ (lấy mã commit từ tab Actions hoặc GitHub Packages)
export GHCR_OWNER=<chu-so-huu-chu-thuong> IMAGE_TAG=sha-<ma-commit-day-du>
docker compose -f docker-compose.prod.yml up -d

# Sao lưu database (đặt cron nếu cần)
bash backup.sh
```

Nếu GHCR package ở chế độ private, lệnh `pull` bằng tay cần `docker login ghcr.io` với một Personal Access Token có quyền `read:packages`. Pipeline tự đăng nhập bằng token tạm nên không cần.

## 8. Lưu ý theo từng loại server

- **Server ARM (Oracle Ampere, Hetzner CAX...).** Image build mặc định chỉ cho amd64. Mở `.github/workflows/ci-cd.yml`, bỏ comment dòng `platforms: linux/amd64,linux/arm64` ở bước build. Build ARM bằng giả lập QEMU chậm hơn đáng kể, nhất là image ai-service.
- **Oracle Cloud Always Free.** Hạn mức ARM miễn phí đã được ghi nhận là thu hẹp, đồng thời việc tạo máy hay gặp lỗi hết tài nguyên (Out of host capacity) và cần thẻ để xác minh. Hãy đọc điều khoản hiện hành trên trang Oracle trước khi dựa vào nó.
- **Đổi `DOMAIN` hoặc thêm HTTPS sau khi đã chạy.** Sửa `.env` rồi `docker compose -f docker-compose.prod.yml up -d` là đủ.

## 9. Sự cố thường gặp

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| `ai-service` liên tục khởi động lại, log có `Killed` | Thiếu RAM. Tăng RAM hoặc swap. |
| Caddy không lấy được chứng chỉ | DNS chưa trỏ đúng, hoặc cổng 80/443 bị chặn ở firewall của nhà cung cấp. |
| Pipeline lỗi ở bước SSH | Sai `DEPLOY_SSH_KEY` (phải là khóa **riêng**, đủ dòng BEGIN/END) hoặc public key chưa nằm trong `authorized_keys`. |
| `npm ci` báo lockfile không khớp | Chạy `npm install` ở thư mục tương ứng rồi commit `package-lock.json`. |
| Sản phẩm mới không hiện trong tìm kiếm AI | Chưa lập chỉ mục: gọi `POST /api/admin/reindex` với `X-Api-Key`. |
