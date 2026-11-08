"""Chỉ số truy hồi tính trực tiếp từ ma trận embedding (đã chuẩn hóa), chỉ dùng numpy."""
from __future__ import annotations

import numpy as np


def _topk(sims: np.ndarray, k: int) -> np.ndarray:
    k = min(k, sims.shape[1])
    idx = np.argpartition(-sims, k - 1, axis=1)[:, :k]
    order = np.take_along_axis(sims, idx, axis=1).argsort(axis=1)[:, ::-1]
    return np.take_along_axis(idx, order, axis=1)


def recall_at_k(sims: np.ndarray, row_keys: np.ndarray, col_keys: np.ndarray, k: int) -> float:
    """Tỉ lệ truy vấn có ít nhất một đáp án đúng (cùng nhóm) trong top-k."""
    top = _topk(sims, k)
    hit = (col_keys[top] == row_keys[:, None]).any(axis=1)
    return float(hit.mean())


def precision_at_k(sims: np.ndarray, rel: np.ndarray, k: int) -> float:
    """rel[i, j] = 1 nếu cột j liên quan tới truy vấn i. Trả về precision@k trung bình.
    Ô có sims = -inf nghĩa là "bị loại" (chính nó, bản trùng) và không được tính là kết quả,
    kể cả khi số ứng viên còn lại ít hơn k (khi đó chia cho số kết quả thực có)."""
    top = _topk(sims, k)
    valid = np.isfinite(np.take_along_axis(sims, top, axis=1))
    hits = (np.take_along_axis(rel, top, axis=1) * valid).sum(axis=1)
    count = valid.sum(axis=1)
    has = count > 0
    return float((hits[has] / count[has]).mean()) if has.any() else 0.0


def retrieval_report(
    img: np.ndarray,
    txt: np.ndarray,
    keys: np.ndarray,
    cats: np.ndarray,
    label_emb: np.ndarray | None = None,
    label_cats: np.ndarray | None = None,
    ks=(1, 5, 10),
) -> dict[str, float]:
    """
    t2i / i2t R@k  : văn bản sản phẩm -> ảnh của nó (và ngược lại); đo độ căn chỉnh hai tháp.
    i2i P@10       : ảnh -> ảnh khác; tỉ lệ kết quả cùng danh mục. Đây là việc "tìm bằng ảnh" của ứng dụng làm.
    t2t P@10       : văn bản -> văn bản khác cùng danh mục. Đây là việc "tìm bằng văn bản" của ứng dụng làm.
    q2i P@10       : câu truy vấn NGẮN (tên nhãn, ví dụ "Son môi") -> ảnh; gần với cách người dùng gõ nhất.
    score          : trung bình của t2i R@5, i2t R@5, i2i P@10, t2t P@10 và q2i P@10 nếu có (dùng chọn checkpoint tốt nhất).
    """
    out: dict[str, float] = {}
    t2i = txt @ img.T
    for k in ks:
        out[f"t2i_R@{k}"] = recall_at_k(t2i, keys, keys, k)
        out[f"i2t_R@{k}"] = recall_at_k(t2i.T, keys, keys, k)

    same_cat = (cats[:, None] == cats[None, :]).astype(np.float32)
    dup = keys[:, None] == keys[None, :]  # chính nó và các bản trùng không được tính là kết quả
    for name, emb in (("i2i", img), ("t2t", txt)):
        sims = emb @ emb.T
        sims[dup] = -np.inf
        out[f"{name}_P@10"] = precision_at_k(sims, same_cat, 10)

    if label_emb is not None and len(label_emb):
        rel = (label_cats[:, None] == cats[None, :]).astype(np.float32)
        out["q2i_P@10"] = precision_at_k(label_emb @ img.T, rel, 10)

    # q2i (truy vấn ngắn -> ảnh) là kiểu người dùng thật sự gõ, nên cũng quyết định checkpoint nào được giữ lại.
    parts = [out["t2i_R@5"], out["i2t_R@5"], out["i2i_P@10"], out["t2t_P@10"]]
    if "q2i_P@10" in out:
        parts.append(out["q2i_P@10"])
    out["score"] = float(np.mean(parts))
    return out
