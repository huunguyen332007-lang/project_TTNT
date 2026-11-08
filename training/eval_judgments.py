"""So sánh mô hình văn bản gốc và đã tinh chỉnh bằng TRUY VẤN THẬT của bạn (phía tìm bằng chữ).

    python eval_judgments.py --products products_ids.csv --judgments judgments.csv --tuned output/best

products_ids.csv: xuất từ PostgreSQL, cột id,title,category,tag (xem README mục "Thu thập dữ liệu").
judgments.csv   : cột query,product_id,relevance.
Chỉ đánh giá tháp văn bản (truy vấn so với văn bản sản phẩm), đúng như nhánh chính của tìm bằng chữ.
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
from pathlib import Path

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import numpy as np  # noqa: E402

from clipft.data import build_product_text  # noqa: E402
from clipft.judgments import judgment_metrics, load_judgments  # noqa: E402

TEXT_MODEL = "sentence-transformers/clip-ViT-B-32-multilingual-v1"


def run(model_path: str, texts: list[str], queries: list[str], ids: list[int], rels: list[dict], device: str) -> dict:
    from sentence_transformers import SentenceTransformer

    st = SentenceTransformer(model_path, device=device)
    prod = st.encode(texts, batch_size=64, normalize_embeddings=True, show_progress_bar=False)
    qry = st.encode(queries, batch_size=64, normalize_embeddings=True, show_progress_bar=False)
    return judgment_metrics(np.asarray(qry) @ np.asarray(prod).T, ids, rels)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--products", type=Path, required=True)
    ap.add_argument("--judgments", type=Path, required=True)
    ap.add_argument("--tuned", type=Path, help="thư mục chứa text/ đã tinh chỉnh (output/best)")
    ap.add_argument("--text-model", default=TEXT_MODEL)
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()

    with open(args.products, encoding="utf-8-sig", newline="") as f:
        prods = list(csv.DictReader(f))
    ids = [int(p["id"]) for p in prods]
    texts = [build_product_text(p["title"], p.get("category") or "", p.get("tag") or "") for p in prods]
    judged = load_judgments(args.judgments)
    queries, rels = list(judged), list(judged.values())
    print(f"{len(prods)} sản phẩm, {len(queries)} truy vấn có đáp án")

    base = run(args.text_model, texts, queries, ids, rels, args.device)
    tuned = run(str(args.tuned / "text"), texts, queries, ids, rels, args.device) if args.tuned else None
    print(f"\n{'chỉ số':<11}{'gốc':>8}" + (f"{'tinh chỉnh':>12}{'chênh':>8}" if tuned else ""))
    for k in (k for k in base if k != "queries"):
        line = f"{k:<11}{base[k]:>8.3f}"
        if tuned:
            line += f"{tuned[k]:>12.3f}{tuned[k] - base[k]:>+8.3f}"
        print(line)
    print(f"(tính trên {base['queries']} truy vấn; ít hơn ~50 truy vấn thì chênh lệch nhỏ chưa đáng tin)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
