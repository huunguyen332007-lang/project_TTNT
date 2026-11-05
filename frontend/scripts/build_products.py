"""
Làm sạch Recomend_for_cli.xlsx và xuất products.json (bản mẫu) cho frontend.

Cách dùng (chạy trong thư mục frontend/):
    pip install pandas openpyxl
    python scripts/build_products.py path/to/Recomend_for_cli.xlsx
    python scripts/build_products.py path/to/Recomend_for_cli.xlsx --per-category 60
    python scripts/build_products.py path/to/Recomend_for_cli.xlsx --csv cleaned.csv   # bản đầy đủ để import PostgreSQL

Các bước làm sạch:
  1. Bỏ dòng thiếu giá hoặc thiếu điểm đánh giá.
  2. Bỏ trùng theo tiêu đề (file gốc bị thu thập lặp: ~42k dòng nhưng chỉ ~9k sản phẩm), giữ dòng mới nhất.
  3. Sinh brand (từ đầu tiêu đề) và tags (từ khóa trong tiêu đề) vì file không có mô tả/tag.
  4. Chọn top N sản phẩm mỗi danh mục theo độ phổ biến để frontend demo nhẹ.
"""
import argparse, json, math, re
from collections import Counter
import pandas as pd

STOP = set("""
a an and the for with of to in on at by from or as is are be this that it its your you our new
pack set kit pcs piece pieces inch inches ft feet black white blue red silver gray grey gold pink green
compatible support supports up use used using free more max pro plus mini 2024 2025 2023 high
quality fast long lasting wireless-ready included include includes works work designed design
""".split())
GENERIC_BADGES = {"Best Seller": "Best Seller", "Amazon's": "Amazon's Choice", "Limited time deal": "Limited time deal"}


def tokenize(title: str):
    return re.findall(r"[a-z][a-z0-9\-]{2,}", title.lower())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("--per-category", type=int, default=40)
    ap.add_argument("--out", default="public/products.json")
    ap.add_argument("--csv", help="xuất thêm bản sạch đầy đủ ra CSV")
    args = ap.parse_args()

    df = pd.read_excel(args.xlsx, sheet_name=0)
    n0 = len(df)
    df = df.dropna(subset=["product_title", "discounted_price", "product_rating"])
    df = df[df["discounted_price"] > 0]
    n1 = len(df)
    df = df.sort_values("data_collected_at").drop_duplicates("product_title", keep="last").reset_index(drop=True)
    print(f"{n0} dòng -> {n1} sau khi bỏ thiếu giá/rating -> {len(df)} sản phẩm duy nhất")

    # --- brand: từ đầu tiên của tiêu đề nếu xuất hiện đủ nhiều ---
    first = df.product_title.str.split().str[0].str.strip(",.-:()[]")
    cnt = Counter(first.str.lower())
    canon = {}
    for w in first:
        canon.setdefault(w.lower(), w)
    brands = [canon[w.lower()] if cnt[w.lower()] >= 8 and w.lower() not in STOP and len(w) > 1 else "" for w in first]

    # --- tags: từ khóa trung bình-phổ biến, theo thứ tự xuất hiện trong tiêu đề ---
    toks = [tokenize(t) for t in df.product_title]
    dfreq = Counter(w for ts in toks for w in set(ts))
    N = len(df)
    ok = {w for w, c in dfreq.items() if 15 <= c <= 0.08 * N and w not in STOP}
    tags = []
    for ts in toks:
        seen, out = set(), []
        for w in ts:
            if w in ok and w not in seen:
                seen.add(w); out.append(w)
            if len(out) == 6:
                break
        tags.append(out)

    recs = pd.DataFrame({
        "id": range(1, N + 1),
        "name": df.product_title.str.strip(),
        "category": df.product_category,
        "brand": brands,
        "price": df.discounted_price.round(2),
        "originalPrice": df.original_price.fillna(df.discounted_price).round(2),
        "discount": df.discount_percentage.fillna(0).round(0).astype(int),
        "rating": df.product_rating,
        "reviews": df.total_reviews.fillna(0).astype(int),
        "sold": df.purchased_last_month.fillna(0).astype(int),
        "badge": df.is_best_seller.map(GENERIC_BADGES).fillna(""),
        "coupon": df.has_coupon.fillna("").ne("No Coupon") & df.has_coupon.fillna("").ne(""),
        "image": df.product_image_url,
        "tags": tags,
    })

    if args.csv:
        full = recs.copy(); full["tags"] = full.tags.str.join(",")
        full.to_csv(args.csv, index=False, encoding="utf-8-sig")
        print("CSV đầy đủ:", args.csv, len(full), "dòng")

    recs["_pop"] = recs.rating * recs.reviews.map(math.log1p)
    sample = (recs.sort_values("_pop", ascending=False)
                  .groupby("category", sort=False).head(args.per_category)
                  .sort_values(["category", "_pop"], ascending=[True, False])
                  .drop(columns="_pop"))
    sample["id"] = range(1, len(sample) + 1)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(sample.to_dict("records"), f, ensure_ascii=False, separators=(",", ":"))
    print(f"Đã ghi {args.out}: {len(sample)} sản phẩm, {sample.category.nunique()} danh mục")


if __name__ == "__main__":
    main()
