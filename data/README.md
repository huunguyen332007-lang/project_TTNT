# Lazada Dataset

## 1. Giới thiệu

Bộ dữ liệu Lazada bao gồm thông tin sản phẩm và nội dung đánh giá của
khách hàng. Dữ liệu được tổ chức thành hai tệp CSV, phục vụ cho phân
tích khám phá dữ liệu (EDA), thống kê đặc điểm sản phẩm và phân tích
đánh giá.

  --------------------------------------------------------------------------
  Tệp dữ liệu                            Nội dung
  -------------------------------------- -----------------------------------
  `lazada_products_cleaned_master.csv`   Bảng dữ liệu tổng hợp thông tin của
                                         toàn bộ sản phẩm, bao gồm cả nhóm
                                         sản phẩm `Others`.

  `lazada_reviews_cleaned.csv`           Dữ liệu đánh giá gắn với thông tin
                                         sản phẩm.
  --------------------------------------------------------------------------

## 2. Mô tả các tệp dữ liệu

### 2.1. `lazada_products_cleaned_master.csv`

Đây là bảng dữ liệu sản phẩm tổng hợp và được sử dụng làm bảng chính cho
các phân tích tổng quan. Tệp này đã hợp nhất dữ liệu từ
`lazada_products_cleaned_master.csv` phiên bản trước và
`lazada_others_cleaned.csv`. Vì vậy, các sản phẩm thuộc nhóm danh mục
`Others` hiện được lưu trực tiếp trong tệp này; không còn tệp CSV riêng
cho nhóm `Others`.

  -----------------------------------------------------------------------
  Tên cột                             Ý nghĩa
  ----------------------------------- -----------------------------------
  `Link sản phẩm`                     Đường dẫn đến trang sản phẩm trên
                                      Lazada; định danh của sản phẩm.

  `danh_muc_chinh`                    Danh mục sản phẩm cấp chính.

  `danh_muc_con`                      Danh mục sản phẩm cấp con.

  `ten_san_pham`                      Tên sản phẩm.

  `gia_vnd`                           Giá sản phẩm, đơn vị VND.

  `gia_vnd_goc`                       Chuỗi giá được ghi nhận trong dữ
                                      liệu.

  `so_sao`                            Điểm đánh giá trung bình của sản
                                      phẩm, theo thang điểm 0--5.

  `so_luot_ban`                       Số lượt bán của sản phẩm.

  `link_hinh_anh`                     Đường dẫn hình ảnh sản phẩm.

  `so_luong_danh_gia`                 Số lượng nội dung đánh giá được ghi
                                      nhận cho sản phẩm.

  `danh_sach_danh_gia`                Nội dung các đánh giá của sản phẩm;
                                      các đánh giá được phân tách bằng
                                      chuỗi `||`.
  -----------------------------------------------------------------------

### 2.2. `lazada_reviews_cleaned.csv`

Tệp này tập trung vào dữ liệu đánh giá, phù hợp cho các phân tích nội
dung, từ khóa, cảm xúc và thống kê đánh giá theo sản phẩm hoặc danh mục.

Các cột dữ liệu:

-   `Link sản phẩm`
-   `danh_muc_chinh`
-   `danh_muc_con`
-   `ten_san_pham`
-   `gia_vnd`
-   `so_sao`
-   `so_luot_ban`
-   `link_hinh_anh`
-   `danh_sach_danh_gia`

Mỗi bản ghi thể hiện thông tin sản phẩm đi kèm nội dung đánh giá tương
ứng.

## 3. Lưu ý về dữ liệu

-   **Phạm vi sản phẩm:** `lazada_products_cleaned_master.csv` chứa dữ
    liệu sản phẩm đã hợp nhất, bao gồm cả nhóm danh mục `Others`.
-   **Giá sản phẩm:** một số sản phẩm có giá trị `gia_vnd` bị thiếu do
    thông tin giá không đầy đủ. Trường `gia_vnd_goc` được giữ lại để
    tham khảo chuỗi giá ban đầu.
-   **Giá trị thiếu:** một số sản phẩm có thể không có thông tin về giá,
    điểm sao hoặc lượt bán. Giá trị thiếu không đồng nghĩa với sản phẩm
    không hợp lệ.
-   **Điểm đánh giá:** `so_sao` sử dụng thang điểm từ 0 đến 5.
-   **Định danh sản phẩm:** `Link sản phẩm` là trường định danh phù hợp
    để phân biệt các sản phẩm, kể cả khi chúng có tên giống nhau.
-   **Nội dung đánh giá:** trong tệp sản phẩm tổng hợp, nhiều đánh giá
    của cùng một sản phẩm được nối với nhau bằng chuỗi `||`.

## 4. Định dạng dữ liệu

-   **Định dạng tệp:** CSV.
-   **Mã hóa:** UTF-8 with BOM (`utf-8-sig`).
-   **Dấu phân tách cột:** dấu phẩy (`,`).
-   **Đơn vị giá:** VND.
-   **Thang điểm đánh giá:** 0--5.

## 5. Mục đích sử dụng

  --------------------------------------------------------------------------
  Tệp dữ liệu                            Mục đích sử dụng
  -------------------------------------- -----------------------------------
  `lazada_products_cleaned_master.csv`   Phân tích tổng quan toàn bộ sản
                                         phẩm, bao gồm giá bán, danh mục,
                                         lượt bán và điểm đánh giá; có thể
                                         phân tích riêng nhóm `Others` thông
                                         qua cột danh mục.

  `lazada_reviews_cleaned.csv`           Phân tích nội dung đánh giá, từ
                                         khóa, cảm xúc và phản hồi của khách
                                         hàng.
  --------------------------------------------------------------------------
