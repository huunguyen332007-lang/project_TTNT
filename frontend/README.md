# PickForYou — Frontend gợi ý sản phẩm

Giao diện React (Vite) cho phần mềm **gợi ý sản phẩm cho người dùng**. Giữ nguyên bố cục/phong cách của bản mẫu "Sáng Search": tông sáng, điểm nhấn tím than, responsive.

## Chạy dự án

Yêu cầu: Node.js 18+.

```bash
npm install
npm run dev
```

Mở địa chỉ localhost mà Vite hiển thị. Mặc định chạy bằng **dữ liệu mẫu** `public/products.json` (600 sản phẩm Amazon), không cần backend.

## Tính năng

- Tìm kiếm theo từ khóa (gõ không dấu, gõ dở từ; gõ tiếng Việt như "tai nghe", "sạc", "máy ảnh" sẽ được dịch sang từ khóa tiếng Anh), lọc theo 15 danh mục lấy từ dữ liệu.
- **Sở thích**: chọn danh mục yêu thích + ngân sách để cá nhân hóa.
- **Đã xem**: bấm vào sản phẩm để xem chi tiết; lịch sử được dùng để gợi ý (lưu ở `localStorage`).
- Mỗi thẻ có **lý do gợi ý** ("Giống sản phẩm bạn đã xem", "Vì bạn quan tâm Laptop"…).
- Chi tiết sản phẩm kèm **sản phẩm tương tự**; sắp xếp theo phù hợp / giá / đánh giá.
- Phím tắt `Ctrl/Cmd + K` để tìm nhanh.

## Cấu trúc

```
src/
  App.jsx              # trang chính: hero, kết quả, lịch sử
  api.js               # gọi backend, tự rơi về dữ liệu mẫu nếu lỗi
  recommender.js       # bộ gợi ý dự phòng chạy trên trình duyệt
  format.js            # định dạng giá (USD), số lượng
  styles.css           # giao diện nền (từ bản mẫu Sáng Search)
  product.css          # style riêng cho thẻ sản phẩm, modal chi tiết
  components/          # ProductCard, ProductThumb, PreferenceModal, DetailModal
public/products.json   # 600 sản phẩm mẫu (sinh bằng script bên dưới)
scripts/build_products.py   # làm sạch Recomend_for_cli.xlsx -> products.json (+ CSV đầy đủ)
```

## Dữ liệu

Nguồn: `Recomend_for_cli.xlsx` (sheet `amazon_products_sales_data_clea`, 42.675 dòng). File bị thu thập lặp nên chỉ có **~8.300 sản phẩm duy nhất** sau khi bỏ trùng và bỏ dòng thiếu giá/đánh giá.

```bash
pip install pandas openpyxl
python scripts/build_products.py ../duong-dan/Recomend_for_cli.xlsx                # tạo public/products.json
python scripts/build_products.py ../duong-dan/Recomend_for_cli.xlsx --csv sach.csv # CSV đầy đủ để import PostgreSQL
```

Lưu ý: file `.xlsx` gốc (6 MB) **không** đặt trong thư mục frontend. Dữ liệu không có mô tả/tag nên `brand` và `tags` được sinh từ tiêu đề. Nhãn `product_category` trong dữ liệu gốc có chỗ gán nhầm (ví dụ thẻ nhớ nằm trong "Chargers & Cables"), nên tìm kiếm ưu tiên tiêu đề hơn danh mục.

## Kết nối backend / AI

Đặt biến môi trường (copy `.env.example` thành `.env`):

```
VITE_USE_API=true
VITE_PROXY_TARGET=http://localhost:3000   # backend NodeJS khi chạy dev
```

Frontend gọi **`POST /api/recommend`**:

```jsonc
// request
{ "query": "laptop", "category": "Tất cả", "interests": ["Laptop"], "budget": "mid", "viewedIds": [3, 5] }

// response
{ "items": [ { "id": 3, "name": "...", "category": "Laptops", "brand": "...", "price": 159.99,
               "originalPrice": 189.99, "discount": 16, "rating": 4.5, "reviews": 2100, "sold": 300,
               "badge": "Best Seller", "tags": ["laptop", "student"], "image": "https://...",
               "score": 0.82, "reason": "Giống sản phẩm bạn đã xem" } ] }
```

`budget` nhận: `any | low (<$25) | mid ($25–100) | high ($100–500) | premium (>$500)`. Backend có thể trả thẳng tên cột gốc của file Excel (`product_title`, `discounted_price`, `product_image_url`…) — xem `normalizeProduct()` trong `src/api.js`. Nếu gọi API lỗi, giao diện tự chuyển sang dữ liệu mẫu.

## Lưu ý

Dữ liệu và thuật toán hiện tại chỉ là bản demo (gợi ý theo nội dung: từ khóa, danh mục, thẻ, ngân sách, lịch sử xem). Ảnh sản phẩm lấy từ link Amazon trong dữ liệu; nếu ảnh không tải được sẽ hiện icon theo danh mục.
