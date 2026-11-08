from __future__ import annotations

import math
import random

import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset

from .data import product_text


def sample_text(row: dict, rng=random) -> str:
    """Người dùng gõ truy vấn ngắn chứ không gõ "tên. danh mục. nhãn", nên khi huấn luyện xen kẽ nhiều dạng văn bản
    của cùng một sản phẩm (50% đầy đủ như lúc lập chỉ mục, 30% chỉ tên, 20% vài từ đầu của tên)."""
    p = rng.random()
    if p < 0.5:
        return product_text(row)
    words = row["title"].split()
    if p < 0.8 or len(words) <= 3:
        return row["title"]
    return " ".join(words[: rng.randint(3, min(6, len(words)))])


def random_crop(img: Image.Image, rng=random, scale=(0.75, 1.0)) -> Image.Image:
    """Cắt ngẫu nhiên 75-100% diện tích. Không lật ngang vì có sản phẩm in chữ."""
    w, h = img.size
    area = rng.uniform(*scale) * w * h
    ratio = rng.uniform(0.9, 1.1)
    cw, ch = min(w, max(8, int(math.sqrt(area * ratio)))), min(h, max(8, int(math.sqrt(area / ratio))))
    x, y = rng.randint(0, w - cw), rng.randint(0, h - ch)
    return img.crop((x, y, x + cw, y + ch))


def load_image(path) -> Image.Image:
    return Image.open(path).convert("RGB")


class PairDataset(Dataset):
    def __init__(self, rows: list[dict], images_root, train: bool):
        self.rows, self.root, self.train = rows, images_root, train

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        r = self.rows[i]
        img = load_image(f"{self.root}/{r['image_path']}")
        if self.train:
            return random_crop(img), sample_text(r), r["group"]
        return img, product_text(r), r["group"]


def make_train_loader(rows, images_root, img_tower, txt_tower, batch_size, workers=0, seed=0) -> DataLoader:
    """Mỗi batch: (đặc trưng ảnh, đặc trưng văn bản, nhóm). Token hóa/tiền xử lý ảnh làm ngay trong collate (worker)."""

    def collate(batch):
        imgs, texts, keys = zip(*batch)
        return img_tower.prepare(list(imgs)), txt_tower.prepare(list(texts)), torch.tensor(keys)

    g = torch.Generator().manual_seed(seed)
    return DataLoader(
        PairDataset(rows, images_root, train=True),
        batch_size=batch_size,
        shuffle=True,
        drop_last=len(rows) >= 2 * batch_size,  # batch lẻ cuối epoch có quá ít mẫu âm
        num_workers=workers,
        collate_fn=collate,
        generator=g,
        persistent_workers=workers > 0,
    )
