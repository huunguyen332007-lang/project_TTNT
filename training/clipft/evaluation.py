from __future__ import annotations

import numpy as np
import torch
import torch.nn.functional as F

from .data import product_text
from .dataset import load_image
from .metrics import retrieval_report
from .towers import move


@torch.no_grad()
def encode(tower, items: list, device, batch_size: int = 64, loader=None, amp: bool = False) -> np.ndarray:
    out = []
    for i in range(0, len(items), batch_size):
        chunk = items[i : i + batch_size]
        if loader is not None:
            chunk = [loader(x) for x in chunk]
        with torch.autocast(device_type=torch.device(device).type, dtype=torch.float16, enabled=amp):
            emb = tower.forward(move(tower.prepare(chunk), device))
        out.append(F.normalize(emb.float(), dim=-1).cpu().numpy())
    return np.concatenate(out) if out else np.zeros((0, 0), dtype=np.float32)


def evaluate_rows(img_tower, txt_tower, rows: list[dict], images_root, device, batch_size: int = 64, amp: bool = False) -> dict[str, float]:
    """Chạy các chỉ số truy hồi (xem metrics.retrieval_report) trên một danh sách sản phẩm đã có ảnh."""
    img = encode(img_tower, [f"{images_root}/{r['image_path']}" for r in rows], device, batch_size, loader=load_image, amp=amp)
    txt = encode(txt_tower, [product_text(r) for r in rows], device, batch_size, amp=amp)
    keys = np.array([r["group"] for r in rows])
    cat_ids = {c: i for i, c in enumerate(sorted({r["category"] for r in rows}))}
    cats = np.array([cat_ids[r["category"]] for r in rows])

    # Truy vấn ngắn = tên nhãn gốc (ví dụ "Son môi"); đáp án đúng = ảnh thuộc cùng danh mục gom nhóm.
    labels = sorted({(r["label"], r["category"]) for r in rows if r["label"]})
    label_emb = encode(txt_tower, [l for l, _ in labels], device, batch_size, amp=amp) if labels else None
    label_cats = np.array([cat_ids[c] for _, c in labels]) if labels else None
    return retrieval_report(img, txt, keys, cats, label_emb, label_cats)
