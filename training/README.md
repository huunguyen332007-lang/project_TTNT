# Fine-tune CLIP cho dữ liệu sản phẩm

Tinh chỉnh hai tháp mà `ai_service` đang dùng, trên cặp (ảnh sản phẩm, tên sản phẩm tiếng Việt):

| Tháp | Model gốc | Việc nó làm trong ứng dụng |
|---|---|---|
| Văn bản | `sentence-transformers/clip-ViT-B-32-multilingual-v1` (DistilBERT đa ngôn ngữ → 512 chiều) | nhúng truy vấn và văn bản sản phẩm |
| Ảnh | `clip-ViT-B-32` (OpenAI CLIP ViT-B/32 → 512 chiều) | nhúng ảnh người dùng tải lên và ảnh sản phẩm |

Mục tiêu huấn luyện là InfoNCE hai chiều: kéo ảnh và văn bản **của cùng một sản phẩm** lại gần nhau, đẩy các sản phẩm khác trong batch ra xa.

## Chạy

Cần GPU. Google Colab (T4 miễn phí) là đủ: một lần chạy khoảng 10-20 phút. Trên CPU vẫn chạy được nhưng rất chậm.

```bash
cd training
pip install -r requirements.txt

python prepare_data.py        # tải ~1.7k ảnh, làm sạch, chia train/val/test  -> data/
python finetune_clip.py       # huấn luyện                                    -> output/
```

Trên Colab: tải `project_TTNT` lên (hoặc mount Drive), rồi chạy từng dòng trên trong ô lệnh có tiền tố `!` sau `%cd project_TTNT/training`. Nhớ tải thư mục `output/best` về máy.

Kết quả cuối cùng in ra bảng so sánh mô hình gốc và mô hình đã tinh chỉnh **trên tập test chưa từng được dùng để chọn checkpoint**. `output/report.json` giữ cùng số liệu, `output/history.csv` là điểm theo epoch.

## Thu thập dữ liệu từ PostgreSQL và đánh giá bằng truy vấn thật

PostgreSQL là nơi lưu mọi dữ liệu: sản phẩm (`products`), từ khóa đã tìm (`search_history`) và các cú bấm vào sản phẩm (`click_events`, ghi qua `POST /api/events`). Các file trong `sql/` xuất chúng ra CSV:

```bash
docker compose exec -T postgres psql -q -U ttnt -d ttnt < training/sql/export_products.sql    > products.csv       # để huấn luyện
docker compose exec -T postgres psql -q -U ttnt -d ttnt < training/sql/export_product_ids.sql  > products_ids.csv   # để đánh giá
python prepare_data.py --csv products.csv && python finetune_clip.py
python eval_judgments.py --products products_ids.csv --judgments judgments.csv --tuned output/best
```

`judgments.csv` có cột `query,product_id,relevance` (1 liên quan, 2 rất đúng, 3 đúng chính xác). `eval_judgments.py` báo `ndcg@10`, `recall@10`, `mrr`, `hit@1` cho mô hình văn bản gốc và đã tinh chỉnh, bằng đúng các truy vấn bạn quan tâm; nó chỉ đánh giá phía chữ. Hướng dẫn đầy đủ nằm trong tài liệu "Hướng dẫn thu thập dữ liệu và huấn luyện mô hình".

## Đưa model vào ứng dụng

Chép `output/best/` về `training/output/best/` trên máy chạy Docker, rồi:

```bash
docker compose -f docker-compose.yml -f docker-compose.finetuned.yml up -d ai-service
docker compose exec backend python -m app.cli reindex --all
```

`reindex --all` là bắt buộc (xem giải thích trong `docker-compose.finetuned.yml`).

## Đọc kết quả thế nào

| Chỉ số | Ý nghĩa | Liên quan tới ứng dụng |
|---|---|---|
| `t2i_R@k`, `i2t_R@k` | văn bản sản phẩm → đúng ảnh của nó, và ngược lại | đo độ căn chỉnh hai tháp (mục tiêu trực tiếp của huấn luyện) |
| `i2i_P@10` | ảnh → 10 ảnh gần nhất, bao nhiêu % cùng danh mục | **tìm bằng ảnh** |
| `t2t_P@10` | văn bản → 10 văn bản gần nhất, bao nhiêu % cùng danh mục | **tìm bằng chữ** (ứng dụng so truy vấn với văn bản sản phẩm) |
| `q2i_P@10` | truy vấn ngắn là tên nhãn ("Son môi") → ảnh | gần với cách người dùng gõ nhất |
| `score` | trung bình `t2i_R@5`, `i2t_R@5`, `i2i_P@10`, `t2t_P@10`, `q2i_P@10` | tiêu chí chọn checkpoint (có `q2i` để ưu tiên checkpoint tốt cho truy vấn ngắn người dùng gõ) |

Nên ưu tiên nhìn `i2i_P@10`, `t2t_P@10`, `q2i_P@10` vì chúng phản ánh đúng thứ người dùng thấy.
Nếu `report.json` có `"test_finetuned": null`, nghĩa là không epoch nào hơn mô hình gốc trên tập val và không có gì được lưu: hãy giữ mô hình gốc.

## Những điều cần biết

- **Dữ liệu nhỏ.** Tập test chỉ ~176 sản phẩm nên các chỉ số dao động vài phần trăm; chênh lệch dưới ~0.03 chưa đủ kết luận. Mặc định chỉ mở khóa 2 lớp cuối mỗi tháp + lớp chiếu, learning rate nhỏ, dừng sớm: đây là để tránh overfit và "quên" kiến thức CLIP, đừng tăng tay nếu chưa có lý do.
- **Nhãn gốc nhiễu.** Cột "Nhãn sản phẩm" có chỗ sai (ví dụ một chiếc váy mang nhãn mỹ phẩm) và nhiều nhãn chồng nhau, nên `*_P@10` theo danh mục có trần thấp hơn 1.0 dù mô hình tốt. Hãy so mô hình gốc với tinh chỉnh trên cùng một tập (như script làm), đừng đọc số tuyệt đối.
- **Ảnh gán nhầm bị loại.** 28 dòng có chung một URL ảnh nhưng thuộc các danh mục khác nhau (một ảnh cho ốp lưng, áo khoác, khăn tắm…) bị loại giống hệt `backend/` khi import; nếu để lại, cặp (ảnh, tên) sai sẽ làm hỏng huấn luyện.
- **Không rò rỉ.** Sản phẩm dùng chung ảnh hoặc trùng tên được gom thành một nhóm và luôn nằm cùng một tập; trong batch chúng cũng không bị coi là mẫu âm của nhau.
- **Văn bản huấn luyện** xen kẽ dạng đầy đủ như lúc lập chỉ mục (`tên. danh mục. nhãn`), chỉ tên, và vài từ đầu của tên, vì người dùng gõ truy vấn ngắn.
- Tìm bằng chữ của ứng dụng so truy vấn với **văn bản** sản phẩm và (từ bản này) cả với **ảnh** sản phẩm: độ khớp chữ→ảnh được trộn vào thứ hạng với tỉ trọng `TEXT_IMAGE_WEIGHT` (mặc định 0.3, đặt 0 để tắt). Đây là chiều mà huấn luyện tối ưu trực tiếp, nên nếu `t2i_R@5` trong `report.json` tăng rõ thì có thể nâng tỉ trọng này; nếu không tăng, hãy hạ về 0.

## Kiểm thử

```bash
cd training && pytest -q
```

Test dựng CLIP và DistilBERT **thu nhỏ khởi tạo ngẫu nhiên** (không cần mạng) nhưng đi qua đúng `SentenceTransformer`, DataLoader, vòng huấn luyện, lưu/nạp lại và cả hai script dòng lệnh. Chúng kiểm tra logic, **không** kiểm tra chất lượng trên model CLIP thật.
