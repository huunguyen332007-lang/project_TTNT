"""Nạp dữ liệu sản phẩm và đánh giá thu thập từ Lazada.

Đọc trực tiếp hai file định dạng `lazada_products_master_dedup.csv` và `lazada_reviews_master_dedup.csv`
(hoặc bản đã rút gọn cột trong app/seed-data). Sản phẩm đi qua cùng bước làm sạch với importer.py
rồi ghi bằng ProductRepository.upsert_imported_many; đánh giá được ghép với sản phẩm qua link sản phẩm.
"""
from __future__ import annotations

import csv
import io
import json
import math
import re
from pathlib import Path

from .importer import ROOT, canonical_url, clean_rows, normalize_spaces, parse_rating

SEED = ROOT / "app" / "seed-data"
LAZADA_PRODUCTS_CSV = SEED / "lazada-products.csv"
LAZADA_REVIEWS_CSV = SEED / "lazada-reviews.csv"
LAZADA_CATEGORY_MAP = SEED / "lazada-category-map.json"

PRODUCT_COLUMNS = ("pdp_id", "link_san_pham", "danh_muc_chinh", "danh_muc_con", "ten_san_pham",
                   "gia_vnd", "so_sao", "link_hinh_anh")
REVIEW_COLUMNS = ("pdp_id", "danh_gia")
# Cả hai cột đều là điểm của SẢN PHẨM lặp lại trên từng dòng đánh giá, không phải điểm của từng đánh giá.
REVIEW_PRODUCT_RATING_COLUMNS = ("rating_num", "so_sao_clean")

NO_TEXT_REVIEW = "Chưa có nội dung đánh giá văn bản"
MAX_REVIEW_LENGTH = 2000
# "... +2 Helpful(3)": số ảnh khách đính kèm (+2) và số người thấy hữu ích (3) ở cuối câu.
_HELPFUL_SUFFIX = re.compile(r"\s*(?:\+\d+\s*)?Helpful\((\d+)\)\s*$", re.IGNORECASE)


def _read_csv(text: str, required: tuple[str, ...], name: str):
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")))
    missing = [column for column in required if column not in (reader.fieldnames or [])]
    if missing:
        raise ValueError(f"File {name} thiếu cột: " + ", ".join(missing))
    return reader


def parse_pdp_id(raw):
    try:
        value = int(float(str(raw).strip()))
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def parse_vnd(raw):
    """'99000.0' -> 99000. Rỗng, 0 hoặc không đọc được -> None (giá 0 là giá chưa thu thập được)."""
    try:
        value = float(str(raw or "").strip())
    except ValueError:
        return None
    if math.isnan(value) or value <= 0:
        return None
    return int(round(value))


def map_category(main: str, sub: str, category_map: dict) -> str:
    return (category_map.get("bySubcategory", {}).get(sub.lower())
            or category_map.get("byCategory", {}).get(main)
            or main or "Khác")


def clean_review(raw):
    """Trả (nội dung, số lượt 'hữu ích') hoặc None nếu đánh giá không có chữ."""
    text = normalize_spaces(str(raw or "").replace("\xa0", " "))
    helpful = 0
    match = _HELPFUL_SUFFIX.search(text)
    if match:
        helpful = int(match.group(1))
        text = text[:match.start()].strip()
    if not text or text == NO_TEXT_REVIEW:
        return None
    return text[:MAX_REVIEW_LENGTH], helpful


def parse_products(csv_text: str, category_map: dict):
    rows, invalid = [], []
    for line, record in enumerate(_read_csv(csv_text, PRODUCT_COLUMNS, "sản phẩm"), start=2):
        pdp_id = parse_pdp_id(record.get("pdp_id"))
        title = normalize_spaces(record.get("ten_san_pham"))[:200]
        source_url = canonical_url(record.get("link_san_pham"))
        image_url = str(record.get("link_hinh_anh") or "").strip()
        if not pdp_id or not title or not source_url or not re.match(r"^https?://", image_url, re.I):
            invalid.append({"line": line, "reason": "thiếu mã, tên, link hoặc ảnh hợp lệ"})
            continue
        main = normalize_spaces(record.get("danh_muc_chinh"))
        sub = normalize_spaces(record.get("danh_muc_con"))
        rows.append({"title": title, "category": map_category(main, sub, category_map), "tag": sub,
                     "imageUrl": image_url, "description": "", "price": parse_vnd(record.get("gia_vnd")),
                     "rating": parse_rating(record.get("so_sao")), "sourceUrl": source_url, "pdpId": pdp_id})
    return {"rows": rows, "invalid": invalid}


def parse_reviews(csv_text: str):
    """Trả danh sách đánh giá có chữ và điểm sản phẩm đọc được từ file đánh giá (dùng để lấp chỗ thiếu)."""
    reader = _read_csv(csv_text, REVIEW_COLUMNS, "đánh giá")
    rating_columns = [c for c in REVIEW_PRODUCT_RATING_COLUMNS if c in (reader.fieldnames or [])]
    reviews, product_ratings, stats = [], {}, {"input": 0, "noText": 0, "invalid": 0}
    for record in reader:
        stats["input"] += 1
        pdp_id = parse_pdp_id(record.get("pdp_id"))
        if not pdp_id:
            stats["invalid"] += 1
            continue
        for column in rating_columns:
            rating = parse_rating(record.get(column))
            if rating is not None:
                product_ratings.setdefault(pdp_id, rating)
                break
        cleaned = clean_review(record.get("danh_gia"))
        if cleaned is None:
            stats["noText"] += 1
            continue
        reviews.append({"pdpId": pdp_id, "content": cleaned[0], "helpful": cleaned[1]})
    return {"reviews": reviews, "productRatings": product_ratings, "stats": stats}


async def import_lazada(products_repo, reviews_repo, logger, products_csv=LAZADA_PRODUCTS_CSV,
                        reviews_csv=LAZADA_REVIEWS_CSV, dry_run=False, update_existing=False):
    """Mặc định không ghi đè sản phẩm đã có (cùng link): file marketplace-products.csv được nạp lại mỗi lần
    backend khởi động và cũng chứa sản phẩm Lazada, nếu hai nguồn cùng ghi một dòng thì sẽ đè qua đè lại và
    làm mất embedding. Đánh giá vẫn được gắn vào cả những sản phẩm đã có."""
    category_map = json.loads(LAZADA_CATEGORY_MAP.read_text(encoding="utf-8"))
    parsed = parse_products(Path(products_csv).read_text(encoding="utf-8"), category_map)
    review_data = parse_reviews(Path(reviews_csv).read_text(encoding="utf-8")) if reviews_csv else \
        {"reviews": [], "productRatings": {}, "stats": {"input": 0, "noText": 0, "invalid": 0}}

    filled = 0
    for row in parsed["rows"]:
        if row["rating"] is None and row["pdpId"] in review_data["productRatings"]:
            row["rating"] = review_data["productRatings"][row["pdpId"]]
            filled += 1

    cleaned = clean_rows(parsed["rows"])  # bỏ link trùng, ảnh dùng cho nhiều danh mục, tin đăng trùng
    url_by_pdp = {row["pdpId"]: row["sourceUrl"] for row in cleaned["rows"]}
    reviews = [{"sourceUrl": url_by_pdp[r["pdpId"]], "content": r["content"], "helpful": r["helpful"]}
               for r in review_data["reviews"] if r["pdpId"] in url_by_pdp]

    existing = set() if update_existing else \
        await products_repo.find_existing_source_urls([row["sourceUrl"] for row in cleaned["rows"]])
    to_write = [row for row in cleaned["rows"] if row["sourceUrl"] not in existing]

    stats = {"products": {**cleaned["stats"], "invalid": len(parsed["invalid"]), "ratingFilledFromReviews": filled,
                          "alreadyInDatabase": len(existing)},
             "reviews": {**review_data["stats"], "withText": len(review_data["reviews"]),
                         "productDropped": len(review_data["reviews"]) - len(reviews)}}
    logger.info("Lazada import preprocessing: %s", stats)
    if dry_run:
        return {**stats, "dryRun": True}
    counts = await products_repo.upsert_imported_many(to_write) if to_write else {"inserted": 0, "updated": 0}
    inserted_reviews = await reviews_repo.insert_many(reviews)
    return {**stats, "productsWritten": counts, "reviewsInserted": inserted_reviews}
