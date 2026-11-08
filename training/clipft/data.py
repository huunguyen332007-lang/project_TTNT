"""Đọc và làm sạch CSV, gom nhóm trùng lặp và chia train/val/test. Không phụ thuộc torch.

Quy tắc làm sạch PHẢI giống backend (backend/app/importer.py) để tập huấn luyện
đúng bằng tập sản phẩm đang nằm trong database. tests/test_data.py kiểm tra các con số này.
"""
from __future__ import annotations

import csv
import hashlib
import json
import random
import unicodedata
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlsplit

REPO = Path(__file__).resolve().parents[2]
SEED_DIR = REPO / "backend" / "app" / "seed-data"
DEFAULT_CSV = SEED_DIR / "marketplace-products.csv"
DEFAULT_MAP = SEED_DIR / "category-map.json"

COL_TITLE, COL_URL, COL_IMAGE, COL_LABEL = "Tên sản phẩm", "URL", "Hình ảnh", "Nhãn sản phẩm"


def norm_spaces(s: str | None) -> str:
    return " ".join(unicodedata.normalize("NFC", s or "").split())


def canonical_url(raw: str) -> str | None:
    parts = urlsplit((raw or "").strip())
    scheme = parts.scheme.lower()
    if scheme not in {"http", "https"} or not parts.netloc:
        return None
    host = parts.netloc.lower()
    if (scheme == "http" and host.endswith(":80")) or (scheme == "https" and host.endswith(":443")):
        host = host.rsplit(":", 1)[0]
    return parts._replace(scheme=scheme, netloc=host, path=parts.path or "/", query="", fragment="").geturl()


def build_product_text(title: str, category: str, tag: str, description: str = "") -> str:
    """Giống buildProductText() của backend: đây chính là văn bản được nhúng cho mỗi sản phẩm."""
    return ". ".join(p for p in (title.strip(), category.strip(), tag.strip(), description.strip()) if p)


def product_text(row: dict) -> str:
    return build_product_text(row["title"], row["category"], row["tag"])


def load_products(csv_path: Path = DEFAULT_CSV, map_path: Path = DEFAULT_MAP, keep_conflicts: bool = False):
    """Trả về (danh sách sản phẩm sạch, thống kê). Mỗi sản phẩm là dict có khóa:
    id, title, label (nhãn gốc), category (đã gom nhóm), tag, image_url, source_url."""
    category_map = json.loads(Path(map_path).read_text(encoding="utf8"))
    rows, invalid = [], 0
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            title = norm_spaces(r.get(COL_TITLE))[:200]
            source_url = canonical_url(r.get(COL_URL, ""))
            image_url = (r.get(COL_IMAGE) or "").strip()
            if not title or not source_url or not image_url.lower().startswith(("http://", "https://")):
                invalid += 1
                continue
            label = norm_spaces(r.get(COL_LABEL))
            category = category_map.get(label, label or "Khác")
            rows.append(
                {
                    "id": hashlib.sha1(source_url.encode()).hexdigest()[:12],
                    "title": title,
                    "label": label,
                    "category": category,
                    "tag": "" if label == category else label,
                    "image_url": image_url,
                    "source_url": source_url,
                }
            )

    stats = {"input": len(rows) + invalid, "invalid": invalid, "duplicate_url": 0, "conflicting_image": 0, "duplicate_listing": 0}
    seen, step1 = set(), []
    for r in rows:
        if r["source_url"] in seen:
            stats["duplicate_url"] += 1
            continue
        seen.add(r["source_url"])
        step1.append(r)

    cats_by_image = defaultdict(set)
    for r in step1:
        cats_by_image[r["image_url"]].add(r["category"])
    step2 = []
    for r in step1:
        if not keep_conflicts and len(cats_by_image[r["image_url"]]) > 1:
            stats["conflicting_image"] += 1
            continue
        step2.append(r)

    seen, kept = set(), []
    for r in step2:
        key = (r["image_url"], r["title"].lower())
        if key in seen:
            stats["duplicate_listing"] += 1
            continue
        seen.add(key)
        kept.append(r)
    stats["kept"] = len(kept)
    return kept, stats


def assign_groups(rows: list[dict]) -> None:
    """Gán r['group'] sao cho sản phẩm dùng chung ảnh hoặc có cùng tiêu đề thuộc cùng một nhóm.
    Dùng để (1) chia tập không rò rỉ và (2) không coi bản trùng là mẫu âm trong loss."""
    parent = list(range(len(rows)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    first_seen: dict[tuple, int] = {}
    for i, r in enumerate(rows):
        for key in (("img", r["image_url"]), ("title", r["title"].lower())):
            if key in first_seen:
                parent[find(i)] = find(first_seen[key])
            else:
                first_seen[key] = i
    roots: dict[int, int] = {}
    for i, r in enumerate(rows):
        r["group"] = roots.setdefault(find(i), len(roots))


def split_rows(rows: list[dict], seed: int = 42, val_frac: float = 0.1, test_frac: float = 0.1) -> None:
    """Gán r['split'] in {'train','val','test'}. Chia theo NHÓM, phân tầng theo danh mục;
    danh mục quá ít nhóm (< 10) thì dồn hết vào train để không có tập val/test vô nghĩa.
    Một nhóm trải qua nhiều danh mục (hiếm) được giao cho danh mục xử lý trước."""
    by_cat: dict[str, set[int]] = defaultdict(set)
    for r in rows:
        by_cat[r["category"]].add(r["group"])

    rng = random.Random(seed)
    group_split: dict[int, str] = {}
    for cat in sorted(by_cat):
        groups = sorted(g for g in by_cat[cat] if g not in group_split)
        rng.shuffle(groups)
        n = len(groups)
        n_val = round(n * val_frac) if n >= 10 else 0
        n_test = round(n * test_frac) if n >= 10 else 0
        for g in groups[:n_val]:
            group_split[g] = "val"
        for g in groups[n_val : n_val + n_test]:
            group_split[g] = "test"
        for g in groups[n_val + n_test :]:
            group_split[g] = "train"
    for r in rows:
        r["split"] = group_split[r["group"]]
