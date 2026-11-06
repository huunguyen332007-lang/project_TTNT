"""Đánh giá/so sánh mô hình trên tập test của manifest.

    python evaluate.py                                  # chỉ mô hình gốc
    python evaluate.py --tuned output/best              # gốc so với đã tinh chỉnh (thư mục có text/ và image/)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import torch  # noqa: E402

from clipft.evaluation import evaluate_rows  # noqa: E402
from clipft.towers import load_towers  # noqa: E402

TEXT_MODEL = "sentence-transformers/clip-ViT-B-32-multilingual-v1"
IMAGE_MODEL = "clip-ViT-B-32"
ORDER = ["t2i_R@1", "t2i_R@5", "t2i_R@10", "i2t_R@1", "i2t_R@5", "i2t_R@10", "i2i_P@10", "t2t_P@10", "q2i_P@10", "score"]


def print_comparison(base: dict, tuned: dict | None) -> None:
    print(f"\n{'chỉ số':<10} {'gốc':>8}" + (f" {'tinh chỉnh':>11} {'chênh':>8}" if tuned else ""))
    for k in ORDER:
        if k not in base:
            continue
        line = f"{k:<10} {base[k]:>8.3f}"
        if tuned:
            line += f" {tuned[k]:>11.3f} {tuned[k] - base[k]:>+8.3f}"
        print(line)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=Path("data"))
    ap.add_argument("--split", default="test", choices=["val", "test"])
    ap.add_argument("--tuned", type=Path, help="thư mục chứa text/ và image/ đã tinh chỉnh")
    ap.add_argument("--text-model", default=TEXT_MODEL, help="model văn bản gốc để so sánh")
    ap.add_argument("--image-model", default=IMAGE_MODEL, help="model ảnh gốc để so sánh")
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    args = ap.parse_args()

    rows = [json.loads(l) for l in open(args.data / "manifest.jsonl", encoding="utf8")]
    rows = [r for r in rows if r["split"] == args.split]
    print(f"{len(rows)} sản phẩm ({args.split})")

    def run(text_model, image_model):
        img, txt = load_towers(text_model, image_model, device=args.device)
        return evaluate_rows(img, txt, rows, args.data, args.device)

    base = run(args.text_model, args.image_model)
    tuned = run(str(args.tuned / "text"), str(args.tuned / "image")) if args.tuned else None
    print_comparison(base, tuned)
    return 0


if __name__ == "__main__":
    sys.exit(main())
