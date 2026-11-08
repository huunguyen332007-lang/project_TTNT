from __future__ import annotations

import csv
import io
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CSV = ROOT / "app" / "seed-data" / "marketplace-products.csv"
CATEGORY_MAP = ROOT / "app" / "seed-data" / "category-map.json"
REQUIRED_COLUMNS = ("Tên sản phẩm", "Giá", "Đánh giá", "URL", "Hình ảnh", "Nhãn sản phẩm")


def normalize_spaces(value) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(value or ""))).strip()


def parse_price(raw):
    first = re.split(r"[-–]", str(raw or ""), maxsplit=1)[0]
    digits = re.sub(r"[^\d]", "", first)
    number = int(digits) if digits else 0
    return number if number > 0 else None


def parse_rating(raw):
    try:
        value = float(str(raw or "").strip().replace(",", "."))
    except ValueError:
        return None
    return round(value * 10) / 10 if 0 < value <= 5 else None


def canonical_url(raw):
    try:
        parts = urlsplit(str(raw or "").strip())
        scheme = parts.scheme.lower()
        if scheme not in {"http", "https"} or not parts.netloc:
            return None
        host = parts.netloc.lower()
        if (scheme == "http" and host.endswith(":80")) or (scheme == "https" and host.endswith(":443")):
            host = host.rsplit(":", 1)[0]
        return urlunsplit((scheme, host, parts.path or "/", "", ""))
    except ValueError:
        return None


def parse_rows(csv_text: str, category_map: dict):
    records = csv.DictReader(io.StringIO(csv_text.lstrip("\ufeff")))
    if records.fieldnames is None:
        return {"rows": [], "invalid": []}
    missing = [column for column in REQUIRED_COLUMNS if column not in records.fieldnames]
    if missing:
        raise ValueError("File CSV thiếu cột: " + ", ".join(missing))
    rows, invalid = [], []
    for line, record in enumerate(records, start=2):
        title = normalize_spaces(record.get("Tên sản phẩm"))[:200]
        source_url = canonical_url(record.get("URL"))
        image_url = str(record.get("Hình ảnh") or "").strip()
        if not title or not source_url or not re.match(r"^https?://", image_url, re.I):
            invalid.append({"line": line, "reason": "thiếu tên, URL hoặc ảnh hợp lệ"})
            continue
        label = normalize_spaces(record.get("Nhãn sản phẩm"))
        category = category_map.get(label, label or "Khác")
        rows.append({"title": title, "category": category, "tag": "" if label == category else label,
                     "imageUrl": image_url, "description": "", "price": parse_price(record.get("Giá")),
                     "rating": parse_rating(record.get("Đánh giá")), "sourceUrl": source_url})
    return {"rows": rows, "invalid": invalid}


def clean_rows(rows, keep_conflicts=False):
    stats = {"input": len(rows), "duplicateUrl": 0, "conflictingImage": 0, "duplicateListing": 0}
    seen_urls, unique = set(), []
    for row in rows:
        if row["sourceUrl"] in seen_urls:
            stats["duplicateUrl"] += 1
        else:
            seen_urls.add(row["sourceUrl"])
            unique.append(row)
    cats_by_image = {}
    for row in unique:
        cats_by_image.setdefault(row["imageUrl"], set()).add(row["category"])
    if keep_conflicts:
        filtered = unique
    else:
        filtered = []
        for row in unique:
            if len(cats_by_image[row["imageUrl"]]) > 1:
                stats["conflictingImage"] += 1
            else:
                filtered.append(row)
    seen_listing, kept = set(), []
    for row in filtered:
        key = (row["imageUrl"], row["title"].lower())
        if key in seen_listing:
            stats["duplicateListing"] += 1
        else:
            seen_listing.add(key)
            kept.append(row)
    stats["kept"] = len(kept)
    return {"rows": kept, "stats": stats}


async def import_csv(products_repo, logger, csv_path=DEFAULT_CSV, keep_conflicts=False, replace=False, dry_run=False):
    category_map = json.loads(CATEGORY_MAP.read_text(encoding="utf-8"))
    parsed = parse_rows(Path(csv_path).read_text(encoding="utf-8"), category_map)
    cleaned = clean_rows(parsed["rows"], keep_conflicts=keep_conflicts)
    stats = {**cleaned["stats"], "invalid": len(parsed["invalid"])}
    logger.info("CSV import preprocessing: %s", stats)
    if dry_run:
        return {**stats, "dryRun": True, "inserted": 0, "updated": 0}
    removed = await products_repo.remove_all() if replace else 0
    counts = await products_repo.upsert_imported_many(cleaned["rows"])
    if not replace:
        removed = await products_repo.remove_sample_products()
    return {**stats, **counts, "removed": removed}
