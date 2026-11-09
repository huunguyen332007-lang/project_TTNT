"""So sánh model gốc (float32) với bản nén int8: dung lượng, tốc độ và độ lệch vector.

    cd ai_service
    python -m scripts.benchmark_quantization                    # ảnh tổng hợp
    python -m scripts.benchmark_quantization --images ../training/data/images   # ảnh sản phẩm thật (nếu có)

Cần torch + sentence-transformers và Internet lần đầu (tải model). Chạy trên CPU.
Chỉ số quan trọng nhất là "cosine trung bình giữa vector float32 và int8": càng gần 1.0 càng ít mất chất lượng.
"""
from __future__ import annotations

import argparse
import copy
import io
import random
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from sentence_transformers import SentenceTransformer

from app.config import get_settings

TEXTS = [
    "áo thun nam cotton cổ tròn", "giày thể thao nữ màu trắng", "son môi lì màu đỏ", "ốp lưng điện thoại chống sốc",
    "tai nghe bluetooth không dây", "kem chống nắng SPF 50", "túi xách da nữ", "khăn tắm cotton",
    "bánh quy bơ đồ ăn vặt", "máy tính bảng 10 inch", "đèn bàn học chống cận", "ghế gỗ phòng khách",
]


def size_mb(model: torch.nn.Module) -> float:
    buf = io.BytesIO()
    torch.save(model.state_dict(), buf)
    return buf.tell() / 1e6


def quantize(model: SentenceTransformer) -> SentenceTransformer:
    q = copy.deepcopy(model)
    return torch.ao.quantization.quantize_dynamic(q, {torch.nn.Linear}, dtype=torch.qint8, inplace=True)


def timed(fn, repeat: int) -> float:
    fn()  # khởi động
    start = time.perf_counter()
    for _ in range(repeat):
        fn()
    return (time.perf_counter() - start) / repeat * 1000  # ms


def cosine(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return (a * b).sum(axis=1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1))


def load_images(folder: Path | None, n: int) -> list[Image.Image]:
    if folder and folder.exists():
        files = sorted(p for p in folder.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"})[:n]
        if files:
            return [Image.open(p).convert("RGB") for p in files]
    rng = random.Random(0)
    return [Image.fromarray(np.array([[[rng.randint(0, 255) for _ in range(3)] for _ in range(224)] for _ in range(224)], dtype=np.uint8)) for _ in range(min(n, 8))]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", type=Path, default=None, help="thư mục ảnh thật để thử (mặc định: ảnh ngẫu nhiên)")
    ap.add_argument("--n-images", type=int, default=32)
    ap.add_argument("--repeat", type=int, default=5)
    args = ap.parse_args()

    torch.set_num_threads(max(1, torch.get_num_threads()))
    s = get_settings()
    images = load_images(args.images, args.n_images)
    rows = []
    for kind, name, data in (("Văn bản", s.text_model, TEXTS), ("Ảnh", s.image_model, images)):
        fp = SentenceTransformer(name, device="cpu")
        q8 = quantize(fp)
        enc = lambda m: m.encode(data, batch_size=16, convert_to_numpy=True, normalize_embeddings=True, show_progress_bar=False)
        v_fp, v_q8 = enc(fp), enc(q8)
        cos = cosine(v_fp, v_q8)
        # Thứ hạng có giữ nguyên không: với mỗi mẫu, láng giềng gần nhất (trừ chính nó) có trùng nhau không.
        s_fp, s_q8 = v_fp @ v_fp.T, v_q8 @ v_q8.T
        np.fill_diagonal(s_fp, -1)
        np.fill_diagonal(s_q8, -1)
        same_nn = float((s_fp.argmax(1) == s_q8.argmax(1)).mean())
        rows.append((kind, size_mb(fp), size_mb(q8), timed(lambda: enc(fp), args.repeat), timed(lambda: enc(q8), args.repeat), float(cos.mean()), float(cos.min()), same_nn, len(data)))

    print(f"\n{'Model':<8} {'MB fp32':>8} {'MB int8':>8} {'ms fp32':>9} {'ms int8':>9} {'cos TB':>7} {'cos min':>8} {'NN giữ':>7} {'n':>4}")
    for r in rows:
        print(f"{r[0]:<8} {r[1]:>8.0f} {r[2]:>8.0f} {r[3]:>9.0f} {r[4]:>9.0f} {r[5]:>7.4f} {r[6]:>8.4f} {r[7]:>7.0%} {r[8]:>4}")
    print("\nms = thời gian mã hóa cả tập mẫu; cos = cosine giữa vector fp32 và int8; NN giữ = % mẫu có láng giềng gần nhất không đổi.")


if __name__ == "__main__":
    main()
