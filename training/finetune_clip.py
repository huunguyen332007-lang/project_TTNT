"""Bước 2: fine-tune CLIP trên manifest.jsonl, lưu checkpoint tốt nhất theo điểm trên tập val.

    python finetune_clip.py                      # cấu hình khuyến nghị, cần GPU (Colab T4 là đủ)
    python finetune_clip.py --device cpu --batch-size 16 --epochs 3   # thử nhanh trên CPU

Kết quả trong --out (mặc định output/):
    best/text, best/image   hai model định dạng sentence-transformers, cắm thẳng vào ai_service
    report.json             so sánh mô hình gốc và mô hình tinh chỉnh trên tập val và test
    history.csv             điểm theo từng epoch
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import numpy as np  # noqa: E402
import torch  # noqa: E402

from clipft.dataset import make_train_loader  # noqa: E402
from clipft.evaluation import evaluate_rows  # noqa: E402
from clipft.towers import load_towers  # noqa: E402
from clipft.trainer import TrainConfig, fit  # noqa: E402

TEXT_MODEL = "sentence-transformers/clip-ViT-B-32-multilingual-v1"  # giống ai_service/app/config.py
IMAGE_MODEL = "clip-ViT-B-32"


def read_manifest(data_dir: Path) -> list[dict]:
    path = data_dir / "manifest.jsonl"
    if not path.exists():
        sys.exit(f"Chưa có {path}. Chạy `python prepare_data.py` trước.")
    return [json.loads(line) for line in open(path, encoding="utf8")]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=Path("data"))
    ap.add_argument("--out", type=Path, default=Path("output"))
    ap.add_argument("--text-model", default=TEXT_MODEL)
    ap.add_argument("--image-model", default=IMAGE_MODEL)
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--batch-size", type=int, default=64, help="batch lớn = nhiều mẫu âm hơn = thường tốt hơn")
    ap.add_argument("--lr", type=float, default=1e-5)
    ap.add_argument("--head-lr", type=float, default=1e-4)
    ap.add_argument("--unfreeze-image-layers", type=int, default=2, help="số lớp ViT cuối được huấn luyện (0 = chỉ lớp chiếu)")
    ap.add_argument("--unfreeze-text-layers", type=int, default=2, help="số lớp DistilBERT cuối được huấn luyện")
    ap.add_argument("--patience", type=int, default=3)
    ap.add_argument("--workers", type=int, default=2 if sys.platform.startswith("linux") else 0)
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    ap.add_argument("--no-amp", action="store_true", help="tắt fp16 trên GPU")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    rows = read_manifest(args.data)
    split = {s: [r for r in rows if r["split"] == s] for s in ("train", "val", "test")}
    print({s: len(v) for s, v in split.items()}, "| thiết bị:", args.device)
    if len(split["val"]) < 30 or len(split["test"]) < 30:
        sys.exit("Tập val/test quá nhỏ để so sánh đáng tin. Kiểm tra lại prepare_data.py (nhiều ảnh tải lỗi?).")

    img_tower, txt_tower = load_towers(
        args.text_model, args.image_model, args.unfreeze_text_layers, args.unfreeze_image_layers, device=args.device
    )
    print(f"Tham số huấn luyện: ảnh {img_tower.trainable_count():,} | văn bản {txt_tower.trainable_count():,}")
    amp = args.device.startswith("cuda") and not args.no_amp

    def run_eval(subset):
        return lambda: evaluate_rows(img_tower, txt_tower, split[subset], args.data, args.device, amp=amp)

    best_dir = args.out / "best"

    def save_best():
        txt_tower.save(best_dir / "text")
        img_tower.save(best_dir / "image")

    cfg = TrainConfig(epochs=args.epochs, lr=args.lr, head_lr=args.head_lr, patience=args.patience, amp=amp)
    loader = make_train_loader(split["train"], args.data, img_tower, txt_tower, args.batch_size, args.workers, args.seed)
    base_test = run_eval("test")()  # đo mô hình gốc trên test TRƯỚC khi bị thay đổi
    result = fit(img_tower, txt_tower, loader, run_eval("val"), cfg, args.device, save_best=save_best)

    args.out.mkdir(parents=True, exist_ok=True)
    with open(args.out / "history.csv", "w", newline="", encoding="utf8") as f:
        keys = list(result["history"][0])
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        w.writerows(result["history"])

    report = {"args": {k: str(v) for k, v in vars(args).items()}, "best_epoch": result["best_epoch"], "val_baseline": result["history"][0]}
    report["test_baseline"] = base_test
    if result["saved"]:
        tuned_img, tuned_txt = load_towers(str(best_dir / "text"), str(best_dir / "image"), device=args.device)  # nạp lại = kiểm tra checkpoint đọc được
        report["test_finetuned"] = evaluate_rows(tuned_img, tuned_txt, split["test"], args.data, args.device, amp=amp)
        print(f"\nĐã lưu mô hình tốt nhất (epoch {result['best_epoch']}) vào {best_dir}")
    else:
        report["test_finetuned"] = None
        print("\nKhông epoch nào tốt hơn mô hình gốc trên tập val: KHÔNG có gì được lưu. Hãy giữ mô hình gốc.")
    (args.out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")

    from evaluate import print_comparison

    print_comparison(report["test_baseline"], report["test_finetuned"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
