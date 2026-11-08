# PickForYou: giao diện của dự án TTNT

React 18 + Vite. Giao diện gợi ý sản phẩm (tông sáng, điểm nhấn tím than, responsive) chạy trên backend và dữ liệu Shopee/Lazada của dự án.

## Chạy

```bash
npm install
npm run dev          # http://localhost:5173, proxy /api về backend ở :3000
```

Backend phải đang chạy (`docker compose up -d` ở thư mục gốc, hoặc `cd backend && uvicorn app.main:app --reload`). Khi backend khởi động, CSV được đồng bộ vào PostgreSQL; frontend tải sản phẩm qua API backend (`POST /api/recommend`) và danh mục qua (`GET /api/categories`), không đọc CSV trực tiếp trên trình duyệt. Biến môi trường: xem `.env.example`
(`VITE_PROXY_TARGET` cho dev, `VITE_API_URL` chỉ khi backend khác domain).

## Tính năng

- **Tìm bằng chữ** (tìm kiếm AI hybrid), **tìm bằng ảnh** (kéo thả hoặc chọn ảnh), `Ctrl/Cmd + K` để tìm nhanh.
- **Sở thích**: danh mục yêu thích (được ưu tiên) và ngân sách (lọc cứng); **Đã xem** làm tín hiệu gợi ý. Cả hai lưu ở `localStorage` của trình duyệt.
- Mỗi thẻ hiện **Khớp xx%** (cosine similarity, không phải xác suất) và số sao; mặc định "Phù hợp nhất" xếp theo độ khớp rồi số sao. Sắp xếp theo phù hợp / giá / đánh giá, thực hiện trên toàn bộ kết quả ở server; "Xem thêm" nối trang kế tiếp.
- Chi tiết sản phẩm có **sản phẩm tương tự** và nút **Xem trên Shopee/Lazada**.
- Góc trên cho biết chế độ đang dùng: tìm kiếm AI, tìm theo từ khóa khi AI tạm tắt, gợi ý theo hồ sơ, hay lỗi kết nối.

## Cấu trúc

```
src/
  App.jsx                   trang chính: hero, kết quả, lịch sử
  api.js                    gọi backend (/api/recommend, /api/search/image, /api/categories, /api/products/:id/similar)
  useRecommendations.js     tải kết quả theo bộ lọc, phân trang, chống trộn kết quả cũ
  budgets.js                nhãn ngân sách (khóa khớp BUDGETS ở backend/app/constants.py)
  format.js                 giá VND, tên sàn
  styles.css, product.css   giao diện (styles.css là nền từ bản mẫu Sáng Search)
  components/               ProductCard, ProductThumb, DetailModal, PreferenceModal, ImageSearchModal
```

## Lưu ý

- Danh sách gợi ý chỉ được cập nhật theo lịch sử xem khi bạn đổi từ khóa, danh mục, sở thích, ngân sách hoặc cách sắp xếp (hoặc tải lại trang), để mở một sản phẩm không làm danh sách đang xem nhảy về trang đầu.
- Dữ liệu CSV không có số lượt đánh giá, nên "được đánh giá cao" chỉ dựa trên điểm sao; nhiều sản phẩm 5.0 sao có thể chỉ có vài đánh giá.
- Phông chữ (DM Sans, Manrope) tải từ Google Fonts; nếu cần chạy hoàn toàn offline hãy đổi sang `@fontsource`.

## Tìm kiếm gần đây (top 3)

Khi vào lại ứng dụng (hoặc quay về trang chủ sau một tìm kiếm), phía trên danh sách sản phẩm hiện 3 tìm kiếm riêng biệt gần nhất, kèm sản phẩm xếp đầu và số sao của nó. Bấm vào một thẻ để tìm lại đúng từ khóa/ảnh/danh mục đó (kết quả được tải mới). Cùng một tìm kiếm chỉ lưu một bản; từ khóa gõ dở ("áo", "áo th") không bị lưu riêng; tìm không ra kết quả thì không lưu; giữ tối đa 30 tìm kiếm. Kiểm thử logic lưu: `node --test tests/searchCache.test.mjs`.

## Lưu và khôi phục tìm kiếm

- Mỗi request tìm kiếm văn bản (POST `/api/recommend` có từ khóa) và tìm bằng ảnh (POST `/api/search/image`) được lưu trên thiết bị bằng IndexedDB.
- Kết quả sản phẩm được lưu cùng request; ảnh tìm kiếm được lưu dưới dạng Blob trong IndexedDB, không chuyển thành chuỗi base64.
- Kết quả đã lưu dùng để hiển thị 3 tìm kiếm gần đây (mục trên); danh sách chính luôn là dữ liệu CSV của bạn cho tới khi bạn tìm kiếm.
- Frontend gửi `X-Client-Id` UUID ẩn danh ổn định để backend liên kết lịch sử request trong PostgreSQL với trình duyệt đó. Không lưu nội dung ảnh gốc trong PostgreSQL.
- Dữ liệu IndexedDB nằm trên trình duyệt hiện tại; xóa dữ liệu trang web/trình duyệt có thể xóa lịch sử cục bộ.
