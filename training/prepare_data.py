"""Bước 1: tải ảnh sản phẩm, làm sạch, chia train/val/test và ghi data/manifest.jsonl.

    python prepare_data.py                       # dùng CSV mặc định của dự án
    python prepare_data.py --csv đường/dẫn.csv --out data

Chạy lại an toàn: ảnh đã tải được bỏ qua. Dòng nào tải ảnh lỗi (URL chết, bị chặn) bị loại khỏi manifest.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path

from PIL import Image

from clipft.data import DEFAULT_CSV, DEFAULT_MAP, assign_groups, load_products, split_rows

UA = "Mozilla/5.0 (compatible; ttnt-trainer/1.0)"
MAX_BYTES = 8 * 1024 * 1024


def download(url: str, dest: Path, max_side: int, retries: int = 2) -> str | None:
    """Trả về None nếu thành công, ngược lại là lý do lỗi."""
    if dest.exists() and dest.stat().st_size > 0:
        return None
    err = "không rõ"
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/*"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = resp.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES:
                return "ảnh quá lớn"
            img = Image.open(BytesIO(data))
            img.load()
            img = img.convert("RGB")
            if max(img.size) > max_side:
                img.thumbnail((max_side, max_side))
            dest.parent.mkdir(parents=True, exist_ok=True)
            img.save(dest, "JPEG", quality=92)
            return None
        except Exception as exc:  # noqa: BLE001 - mọi lỗi mạng/ảnh đều chỉ nghĩa là bỏ dòng này
            err = f"{type(exc).__name__}: {exc}"[:120]
            time.sleep(0.5 * (attempt + 1))
    return err


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    ap.add_argument("--map", type=Path, default=DEFAULT_MAP, help="bảng gom nhóm nhãn -> danh mục")
    ap.add_argument("--out", type=Path, default=Path("data"))
    ap.add_argument("--workers", type=int, default=16, help="số luồng tải ảnh")
    ap.add_argument("--max-side", type=int, default=512, help="thu nhỏ ảnh về cạnh dài tối đa này")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--keep-conflicts", action="store_true", help="giữ cả dòng bị gán nhầm ảnh (không khuyến nghị)")
    args = ap.parse_args()

    rows, stats = load_products(args.csv, args.map, keep_conflicts=args.keep_conflicts)
    print("Làm sạch CSV:", json.dumps(stats, ensure_ascii=False))
    assign_groups(rows)
    split_rows(rows, seed=args.seed)

    images = args.out / "images"
    images.mkdir(parents=True, exist_ok=True)
    print(f"Tải {len(rows)} ảnh vào {images} ...")
    done = 0
    with ThreadPoolExecutor(args.workers) as pool:
        futures = [(r, pool.submit(download, r["image_url"], images / f"{r['id']}.jpg", args.max_side)) for r in rows]
        failures: list[tuple[str, str]] = []
        kept = []
        for r, fut in futures:
            reason = fut.result()
            done += 1
            if reason:
                failures.append((r["image_url"], reason))
            else:
                r["image_path"] = f"images/{r['id']}.jpg"
                kept.append(r)
            if done % 200 == 0:
                print(f"  {done}/{len(rows)}")

    with open(args.out / "manifest.jsonl", "w", encoding="utf8") as f:
        for r in kept:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    summary = {
        "cleaning": stats,
        "downloaded": len(kept),
        "failed": len(failures),
        "splits": dict(Counter(r["split"] for r in kept)),
        "categories": dict(Counter(r["category"] for r in kept)),
        "failure_samples": failures[:10],
    }
    (args.out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf8")
    print(json.dumps({k: summary[k] for k in ("downloaded", "failed", "splits")}, ensure_ascii=False))
    if failures:
        print(f"Cảnh báo: {len(failures)} ảnh tải lỗi, ví dụ: {failures[0]}")
    if len(kept) < 200:
        print("Quá ít ảnh tải được (< 200): kiểm tra mạng/URL trước khi huấn luyện.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
