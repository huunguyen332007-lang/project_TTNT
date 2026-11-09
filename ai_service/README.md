# AI Service: tạo embedding cho chữ và ảnh

Dịch vụ HTTP (FastAPI) biến **văn bản tiếng Việt** và **ảnh** thành vector 512 chiều trong **cùng một không gian vector**. Backend dùng các vector này để tìm kiếm ngữ nghĩa bằng chữ, tìm bằng ảnh và gợi ý sản phẩm (lưu trong PostgreSQL + pgvector).

AI Service **không** có database và không biết gì về sản phẩm. Nó chỉ nhận chữ hoặc ảnh và trả về vector.

```
Người dùng ──> Frontend ──> Backend ──(chữ / ảnh)──> AI Service ──(vector 512 chiều)──> Backend ──> pgvector
```

## 1. Model sử dụng

Cả hai model đều **miễn phí, đã huấn luyện sẵn (pretrained)**, tải từ Hugging Face qua thư viện `sentence-transformers`. Không cần API key.

| Tháp | Model | Kiến trúc | Vai trò |
|---|---|---|---|
| Văn bản | `sentence-transformers/clip-ViT-B-32-multilingual-v1` | DistilBERT đa ngôn ngữ (có tiếng Việt) + lớp chiếu 768→512 | Nhúng truy vấn và mô tả sản phẩm |
| Ảnh | `clip-ViT-B-32` | CLIP ViT-B/32 của OpenAI | Nhúng ảnh người dùng tải lên và ảnh sản phẩm |

Vì sao hai model khác nhau mà so sánh được với nhau: model văn bản đa ngôn ngữ được huấn luyện (distillation) để vector của nó **trùng không gian** với tháp văn bản của CLIP gốc. Nhờ vậy một câu tiếng Việt và một bức ảnh nằm trong cùng không gian 512 chiều, có thể đo bằng cosine similarity.

Vector trả về đã **chuẩn hóa độ dài bằng 1**, nên cosine similarity bằng tích vô hướng. Đây cũng là toán tử `<=>` (cosine distance) mà pgvector dùng trong backend.

## 2. Cấu trúc thư mục

```
ai_service/
├── app/
│   ├── main.py                 # tạo FastAPI app, nạp model lúc khởi động, endpoint /health
│   ├── config.py               # cấu hình đọc từ biến môi trường AI_*
│   ├── schemas.py              # định dạng request/response (pydantic)
│   ├── routers/embeddings.py   # endpoint POST /embed/text và POST /embed/image
│   └── services/embedder.py    # ClipEmbedder: nạp model, mã hóa chữ/ảnh, nén int8
├── scripts/
│   ├── download_models.py          # tải sẵn model lúc build Docker image
│   └── benchmark_quantization.py   # so sánh bản gốc và bản nén int8
├── tests/                      # pytest, dùng embedder giả nên không cần torch hay model
├── Dockerfile
├── requirements.txt            # đầy đủ (transformers, sentence-transformers...)
├── requirements-base.txt       # thư viện nhẹ, không có torch
└── requirements-dev.txt        # dùng cho test/CI
```

## 3. API

Tài liệu Swagger tự sinh: `http://localhost:8000/docs`.

### `GET /health`

Backend và Docker dùng endpoint này để kiểm tra dịch vụ.

```json
{ "status": "ok", "dim": 512, "text_model": "sentence-transformers/clip-ViT-B-32-multilingual-v1",
  "image_model": "clip-ViT-B-32", "quantized": false }
```

Trả **503** `{"status": "loading"}` nếu model chưa nạp xong. Khi đó backend tự hạ cấp về tìm kiếm từ khóa.

### `POST /embed/text`

```bash
curl -X POST http://localhost:8000/embed/text \
  -H "Content-Type: application/json" \
  -d '{"texts": ["áo thun nam", "giày thể thao"]}'
```

```json
{ "embeddings": [[0.012, -0.034, "... 512 số"], [0.051, 0.007, "..."]], "dim": 512 }
```

Mỗi văn bản cho ra một vector, đúng thứ tự gửi lên.

### `POST /embed/image`

Gửi ảnh bằng `multipart/form-data`, trường tên `file`.

```bash
curl -X POST http://localhost:8000/embed/image -F "file=@anh.jpg;type=image/jpeg"
```

```json
{ "embedding": [0.021, -0.008, "... 512 số"], "dim": 512 }
```

Trước khi mã hóa, ảnh được xoay theo EXIF (ảnh chụp bằng điện thoại hay bị xoay) và đổi về RGB (xử lý PNG trong suốt, ảnh xám, ảnh palette).

### Giới hạn và mã lỗi

| Giới hạn | Giá trị mặc định | Lỗi khi vượt |
|---|---|---|
| Số văn bản mỗi request | 64 | 400 `TOO_MANY_TEXTS` |
| Độ dài mỗi văn bản | 2000 ký tự | 400 `TEXT_TOO_LONG` |
| Danh sách `texts` rỗng hoặc văn bản chỉ có khoảng trắng | không cho phép | 422 (pydantic) |
| Định dạng ảnh | JPG, PNG, WEBP, GIF | 415 `UNSUPPORTED_MEDIA_TYPE` |
| Dung lượng ảnh | 8 MB | 413 `IMAGE_TOO_LARGE` |
| Kích thước ảnh | 40 triệu điểm ảnh | 400 `INVALID_IMAGE` |
| Ảnh hỏng, không đọc được | | 400 `INVALID_IMAGE` |

Lỗi do dịch vụ chủ động trả về có dạng `{"detail": {"code": "...", "message": "..."}}`. Backend đọc `detail.message` để hiển thị cho người dùng.

## 4. Cấu hình

Đặt bằng biến môi trường có tiền tố `AI_` (hoặc trong file `.env`).

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `AI_TEXT_MODEL` | `sentence-transformers/clip-ViT-B-32-multilingual-v1` | Tên model trên Hugging Face hoặc đường dẫn thư mục model (dùng cho model đã fine-tune) |
| `AI_IMAGE_MODEL` | `clip-ViT-B-32` | Như trên, cho tháp ảnh |
| `AI_EMBEDDING_DIM` | `512` | Số chiều vector. Phải khớp cột `vector(512)` trong PostgreSQL, nếu lệch dịch vụ báo lỗi ngay khi khởi động |
| `AI_DEVICE` | `cpu` | Thiết bị chạy model (`cpu` hoặc `cuda`) |
| `AI_QUANTIZE` | `false` | `true`: nén int8, xem mục 6. Chỉ dùng với `AI_DEVICE=cpu` |
| `AI_MAX_TEXTS_PER_REQUEST` | `64` | Giới hạn ở bảng trên |
| `AI_MAX_TEXT_CHARS` | `2000` | |
| `AI_MAX_IMAGE_BYTES` | `8388608` | |
| `AI_MAX_IMAGE_PIXELS` | `40000000` | Chặn ảnh quá lớn trước khi giải mã (tránh "decompression bomb") |
| `AI_PRELOAD` | `true` | `false` thì không nạp model lúc khởi động (chỉ dùng khi test) |

## 5. Chạy dịch vụ

**Cùng cả hệ thống (khuyến nghị):** ở thư mục gốc dự án chạy `docker compose up --build`. Lần build đầu tải khoảng 1 GB model nên cần Internet. Model được **tải sẵn vào image** nên khi chạy không cần mạng (`HF_HUB_OFFLINE=1`).

**Chỉ AI Service, không dùng Docker:**

```bash
cd ai_service
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\Activate.ps1
pip install torch --index-url https://download.pytorch.org/whl/cpu   # bản CPU nhẹ hơn nhiều so với bản CUDA
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Khởi động mất khoảng vài chục giây đến 2 phút để nạp model; `/health` chỉ trả 200 sau khi nạp xong. Dockerfile chờ tối đa 120 giây (`start-period`) trước khi đánh dấu container lỗi.

**Các quyết định trong Dockerfile:**

- Cài `torch` bản **CPU** (~200 MB thay vì ~2 GB bản CUDA), tách thành layer riêng để được cache.
- Chạy **một worker**: model chiếm nhiều RAM, thêm worker chỉ nhân đôi bộ nhớ mà không nhanh hơn trên CPU nhỏ.
- Chạy bằng user không phải root (`appuser`).
- Các endpoint là `def` thường (không phải `async def`): FastAPI chạy chúng trong threadpool nên suy luận tốn CPU không chặn `/health`.

**RAM cần dùng:** khoảng 1.5 đến 2.5 GB cho bản gốc (số ước tính trong `docs/DEPLOY.md`, chưa đo trên máy thật). Thiếu RAM thì container bị tắt với log `Killed`.

## 6. Nén model (giảm RAM và tăng tốc trên CPU)

Hai model gốc khá nặng cho server nhỏ. Dự án dùng **dynamic quantization int8** của PyTorch để nén.

**Cách hoạt động.** Trọng số của các lớp `nn.Linear` (chiếm gần hết tham số của lớp attention và MLP trong cả ViT lẫn DistilBERT) được lưu bằng số nguyên 8 bit thay vì float32, tức nhỏ hơn 4 lần. Khi chạy, kích hoạt vẫn tính bằng float rồi được lượng tử hóa tức thời.

**Bật lên:**

```bash
AI_QUANTIZE=true uvicorn app.main:app --port 8000
# hoặc trong docker-compose: thêm  AI_QUANTIZE: "true"  vào environment của dịch vụ ai-service
```

`GET /health` sẽ báo `"quantized": true`.

**Vì sao chọn cách này:**

| Cách nén | Tình trạng | Nhận xét |
|---|---|---|
| **Dynamic quantization int8** | **Đã làm** | Không cần dữ liệu, không huấn luyện lại, chỉ thêm vài dòng code. Vector giữ nguyên 512 chiều nên **không đổi schema** |
| Giữ model pretrained gốc, không nén | Mặc định | Chất lượng cao nhất, tốn RAM nhất |
| Xuất ONNX + lượng tử hóa int8 (onnxruntime) | Chưa làm | Có thể nhanh hơn, nhưng phải viết lại phần nạp model và tiền xử lý ảnh |
| Chưng cất (distillation) sang model nhỏ hơn | Chưa làm | Cần huấn luyện, cần GPU và dữ liệu, không kịp cho đồ án |
| Dùng API ngoài (Jina `jina-clip-v2`) | Đã có sẵn trong backend | Không tốn RAM ở server nhưng cần API key, giới hạn token và phải đổi cả không gian vector (xem README gốc) |

**Giới hạn cần biết:**

- Bảng embedding từ vựng của DistilBERT (khoảng 91 triệu tham số) **không phải** `nn.Linear` nên không được nén. Vì vậy tháp văn bản giảm ít hơn tháp ảnh.
- Nén làm vector lệch nhẹ so với bản gốc. **Hãy chạy benchmark để biết độ lệch thực tế** trước khi đưa vào báo cáo.
- Nếu database đã được lập chỉ mục bằng bản gốc rồi mới bật `AI_QUANTIZE`, nên chạy lại `python -m app.cli reindex --all` ở backend để mọi vector cùng một nguồn. Với độ lệch nhỏ thì không bắt buộc, nhưng làm vậy là an toàn nhất.
- Chỉ chạy trên CPU. Đặt `AI_QUANTIZE=true` cùng `AI_DEVICE=cuda` sẽ báo lỗi ngay khi khởi động.

**Đo hiệu quả:**

```bash
cd ai_service
python -m scripts.benchmark_quantization
# hoặc thử bằng ảnh sản phẩm thật:
python -m scripts.benchmark_quantization --images ../training/data/images
```

Script in ra bảng cho từng tháp: dung lượng fp32 và int8 (MB), thời gian mã hóa (ms), cosine trung bình và nhỏ nhất giữa vector gốc và vector nén, và tỉ lệ mẫu giữ nguyên láng giềng gần nhất. Cosine càng gần 1.0 thì càng ít mất chất lượng.

> Lưu ý: số liệu dung lượng, tốc độ và độ lệch trong báo cáo cần lấy từ lần chạy benchmark thật trên máy của nhóm, không dùng số ước lượng.

## 7. Dùng model đã fine-tune

Thư mục `training/` fine-tune cả hai tháp trên dữ liệu sản phẩm và lưu ra `training/output/best/{text,image}` (cùng định dạng `sentence-transformers`). Để dùng:

```bash
docker compose -f docker-compose.yml -f docker-compose.finetuned.yml up -d ai-service
docker compose exec backend python -m app.cli reindex --all     # bắt buộc
```

File compose đó chỉ đặt `AI_TEXT_MODEL=/models/text` và `AI_IMAGE_MODEL=/models/image`. `reindex --all` là **bắt buộc** vì vector cũ nằm ở không gian khác với model mới; trộn hai loại trong cùng database sẽ cho kết quả tìm kiếm sai. Có thể kết hợp với `AI_QUANTIZE=true`.

## 8. Test

```bash
cd ai_service
pip install -r requirements-dev.txt    # không cần torch, cài rất nhanh
pytest -q
```

Test dùng `FakeEmbedder` (vector băm từ nội dung đầu vào, không cần model thật) để kiểm tra API: định dạng trả về, kiểm tra đầu vào, mã lỗi, `/health` trả 503 khi đang nạp. Chúng **không** kiểm tra chất lượng embedding của model thật.

## 9. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| Container khởi động lại liên tục, log có `Killed` | Thiếu RAM. Tăng RAM hoặc swap, hoặc bật `AI_QUANTIZE=true` |
| `/health` trả 503 `loading` | Model vẫn đang nạp, đợi 1 đến 2 phút |
| Lỗi `Model trả về vector X/Y chiều, cấu hình yêu cầu 512` | Model không phải loại 512 chiều. Không đổi model sang loại khác chiều khi chưa sửa cột `vector(512)` trong database |
| Lỗi `AI_QUANTIZE chỉ hỗ trợ AI_DEVICE=cpu` | Đang bật nén cùng GPU. Đặt `AI_DEVICE=cpu` hoặc tắt `AI_QUANTIZE` |
| Backend báo `"ai": "down"` trong `/api/health` | AI Service chưa chạy, hoặc `AI_SERVICE_URL` của backend trỏ sai (trong Compose phải là `http://ai-service:8000`) |
| Build Docker lỗi khi tải model | Máy build không có Internet hoặc không truy cập được Hugging Face |
