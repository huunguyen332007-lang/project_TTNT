"""Đánh giá tìm kiếm bằng truy vấn THẬT kèm đáp án đúng (không phụ thuộc torch).

File judgments.csv có ba cột: query, product_id, relevance (1 = liên quan, 2 = rất đúng, 3 = đúng chính xác).
Chỉ số tính trên các truy vấn có ít nhất một sản phẩm đúng:
  ndcg@10   chất lượng thứ hạng, thưởng khi sản phẩm đúng nhất đứng đầu
  recall@10 trong số sản phẩm đúng, bao nhiêu nằm trong top 10
  mrr       trung bình 1/vị trí của sản phẩm đúng đầu tiên (1 = luôn đứng đầu)
  hit@1     tỉ lệ truy vấn mà kết quả đầu tiên là sản phẩm đúng
"""
from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path

import numpy as np


def load_judgments(path: Path) -> dict[str, dict[int, int]]:
    """Đọc judgments.csv -> {truy vấn (chữ thường): {product_id: relevance}}. Bỏ dòng thiếu/không hợp lệ."""
    out: dict[str, dict[int, int]] = defaultdict(dict)
    with open(path, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            q = " ".join((r.get("query") or "").split()).lower()
            try:
                pid, rel = int(r["product_id"]), int(r.get("relevance") or 1)
            except (KeyError, TypeError, ValueError):
                continue
            if q and rel > 0:
                out[q][pid] = max(rel, out[q].get(pid, 0))
    return dict(out)


def _dcg(rels: list[int]) -> float:
    return float(sum((2**r - 1) / np.log2(i + 2) for i, r in enumerate(rels)))


def judgment_metrics(scores: np.ndarray, product_ids: list[int], queries: list[dict[int, int]], k: int = 10) -> dict:
    """scores: (số truy vấn, số sản phẩm) điểm tương đồng; queries[i]: {product_id: relevance} của truy vấn i."""
    pos = {pid: j for j, pid in enumerate(product_ids)}
    ndcg, recall, rr, hit1 = [], [], [], []
    for i, rel in enumerate(queries):
        rel = {p: r for p, r in rel.items() if p in pos}  # đáp án không còn trong danh mục thì bỏ
        if not rel:
            continue
        order = np.argsort(-scores[i], kind="stable")
        ranked = [product_ids[j] for j in order]
        gains = [rel.get(p, 0) for p in ranked[:k]]
        ideal = sorted(rel.values(), reverse=True)[:k]
        ndcg.append(_dcg(gains) / _dcg(ideal))
        recall.append(sum(p in rel for p in ranked[:k]) / len(rel))
        first = next((n for n, p in enumerate(ranked, 1) if p in rel), None)
        rr.append(1 / first if first else 0.0)
        hit1.append(1.0 if ranked[0] in rel else 0.0)
    if not ndcg:
        raise ValueError("Không có truy vấn nào có đáp án nằm trong danh mục sản phẩm")
    return {"queries": len(ndcg), f"ndcg@{k}": float(np.mean(ndcg)), f"recall@{k}": float(np.mean(recall)), "mrr": float(np.mean(rr)), "hit@1": float(np.mean(hit1))}
