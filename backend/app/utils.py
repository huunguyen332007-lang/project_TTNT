from __future__ import annotations

import math
import re
import unicodedata
from collections.abc import Iterable

from .constants import EMBEDDING_DIM


def to_vector_literal(values: list[float], dim: int = EMBEDDING_DIM) -> str:
    if not isinstance(values, list) or len(values) != dim:
        raise TypeError(f"Vector phải có đúng {dim} chiều")
    if any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in values):
        raise TypeError("Vector chứa giá trị không hợp lệ")
    return "[" + ",".join(str(float(v)) for v in values) + "]"


def parse_vector(value) -> list[float] | None:
    if value is None:
        return None
    if isinstance(value, list):
        return [float(v) for v in value]
    if isinstance(value, str):
        return [float(v) for v in value.strip("[]").split(",") if v.strip()]
    return [float(v) for v in value]


def mean_vector(vectors: list[list[float]]) -> list[float]:
    if not vectors:
        raise ValueError("Cần ít nhất một vector")
    dim = len(vectors[0])
    if any(len(v) != dim for v in vectors):
        raise ValueError("Các vector phải cùng số chiều")
    sums = [sum(v[i] for v in vectors) for i in range(dim)]
    norm = math.sqrt(sum(x * x for x in sums))
    return [x / norm for x in sums] if norm else sums


def to_tsquery(query: str, max_terms: int = 12) -> str | None:
    normalized = unicodedata.normalize("NFC", str(query)).lower()
    terms = re.findall(r"[^\W_]+", normalized, flags=re.UNICODE)[:max_terms]
    terms = list(dict.fromkeys(terms))
    return " | ".join(terms) if terms else None


def build_product_text(product: dict) -> str:
    return ". ".join(str(product.get(k) or "").strip() for k in ("title", "category", "tag", "description") if str(product.get(k) or "").strip())


def clamp01(v: float) -> float:
    return min(1.0, max(0.0, float(v)))


def minmax(values: list[float]):
    low, high = min(values), max(values)
    return lambda v: (v - low) / (high - low) if high > low else 1.0


def rating_score(rating) -> float:
    return clamp01((float(rating) - 3) / 2) if rating else 0.5


def relevance_scores(items: list[dict], text_image_weight: float = 0) -> dict[int, float]:
    n = len(items)
    sims = [p["similarity"] for p in items if isinstance(p.get("similarity"), (int, float))]
    imgs = [p["imageSimilarity"] for p in items if isinstance(p.get("imageSimilarity"), (int, float))]
    sim_norm = minmax(sims) if sims else None
    img_norm = minmax(imgs) if imgs else None
    weight = clamp01(text_image_weight)
    output = {}
    for i, product in enumerate(items):
        rank = 1 - i / n if n > 1 else 1
        sim = product.get("similarity")
        rel = 0.7 * sim_norm(sim) + 0.3 * rank if isinstance(sim, (int, float)) and sim_norm else rank
        img = product.get("imageSimilarity")
        if weight > 0 and img_norm and isinstance(img, (int, float)):
            rel = (1 - weight) * rel + weight * img_norm(img)
        output[product["id"]] = rel
    return output


def rank_by_match_and_rating(items: list[dict], text_image_weight: float = 0) -> list[dict]:
    rel = relevance_scores(items, text_image_weight)
    scored = [(0.7 * rel[p["id"]] + 0.3 * rating_score(p.get("rating")), i, p) for i, p in enumerate(items)]
    return [p for _, _, p in sorted(scored, key=lambda x: (-x[0], x[1]))]


def distinct_queries(rows: list[dict], max_items: int = 5) -> list[dict]:
    kept = []
    for row in rows:
        query = (row.get("query") or "").strip().lower()
        if not query or not row.get("embedding"):
            continue
        if any((r.get("query") or "").strip().lower() == query or
               len((r.get("query") or "").strip()) > len(query) and
               (r.get("query") or "").strip().lower().startswith(query) for r in kept):
            continue
        kept.append(row)
        if len(kept) == max_items:
            break
    return kept


def taste_from_history(rows: list[dict], max_items: int = 5, decay: float = 0.7):
    picked = distinct_queries(rows, max_items)
    if not picked:
        return None
    vectors = []
    weights = []
    for i, row in enumerate(picked):
        vectors.append([v * decay ** i for v in row["embedding"]])
    return {"embedding": mean_vector(vectors), "queries": [r["query"].strip() for r in picked]}
