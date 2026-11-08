"""Test đọc và làm sạch dữ liệu Lazada, API đánh giá, và nạp vào PostgreSQL thật (nếu có TEST_DATABASE_URL)."""
import json
import os

import pytest

from app.lazada import (LAZADA_CATEGORY_MAP, clean_review, import_lazada, map_category, parse_products,
                        parse_reviews, parse_vnd)

CATEGORY_MAP = json.loads(LAZADA_CATEGORY_MAP.read_text(encoding="utf-8"))
PRODUCTS_CSV = """pdp_id,link_san_pham,danh_muc_chinh,danh_muc_con,ten_san_pham,gia_vnd,so_sao,so_luot_ban,link_hinh_anh
101,https://www.lazada.vn/products/pdp-i101.html?spm=abc,Đồ điện tử,điện thoại,"Điện  thoại   A",4990000.0,4.8,120.0,https://img.lazcdn.com/a.jpg
102,https://www.lazada.vn/products/pdp-i102.html,Đồ điện tử,tai nghe bluetooth,Tai nghe B,,,,https://img.lazcdn.com/b.jpg
103,https://www.lazada.vn/products/pdp-i103.html,Đồ ăn vặt,bánh tráng trộn,Bánh tráng C,0.0,6,,https://img.lazcdn.com/c.jpg
104,https://www.lazada.vn/products/pdp-i104.html,Quần áo,áo thun nam,Áo D,99000,4.5,,data:image/png;base64,AAAA
"""
REVIEWS_CSV = """pdp_id,danh_gia,rating_num,so_sao_clean
101,Máy đẹp pin trâu +2 Helpful(3),4.8,
102,Chưa có nội dung đánh giá văn bản,,4.6
102,"Nhóm màu:\xa0Đen  Nghe hay Helpful(0)",,4.6
104,Áo đẹp Helpful(1),,
999,Sản phẩm không tồn tại Helpful(0),,
"""


def test_parse_vnd_treats_zero_and_blank_as_missing():
    assert parse_vnd("99000.0") == 99000
    assert parse_vnd("") is None and parse_vnd("0.0") is None and parse_vnd("abc") is None and parse_vnd("nan") is None


def test_map_category_prefers_subcategory():
    assert map_category("Đồ điện tử", "điện thoại", CATEGORY_MAP) == "Điện thoại & Máy tính bảng"
    assert map_category("Đồ điện tử", "tai nghe bluetooth", CATEGORY_MAP) == "Âm thanh & Công nghệ"
    assert map_category("Mỹ phẩm", "kem nền", CATEGORY_MAP) == "Làm đẹp"
    assert map_category("Danh mục lạ", "x", CATEGORY_MAP) == "Danh mục lạ"


def test_clean_review_strips_helpful_suffix_and_skips_empty():
    assert clean_review("Hàng ổn +2 Helpful(5)") == ("Hàng ổn", 5)
    assert clean_review("Màu:\xa0Đen   giao nhanh") == ("Màu: Đen giao nhanh", 0)
    assert clean_review("Chưa có nội dung đánh giá văn bản") is None
    assert clean_review("Helpful(0)") is None
    assert len(clean_review("a" * 5000)[0]) == 2000


def test_parse_products_maps_fields_and_rejects_placeholder_images():
    parsed = parse_products(PRODUCTS_CSV, CATEGORY_MAP)
    rows = {r["pdpId"]: r for r in parsed["rows"]}
    assert set(rows) == {101, 102, 103}
    assert parsed["invalid"] == [{"line": 5, "reason": "thiếu mã, tên, link hoặc ảnh hợp lệ"}]
    a = rows[101]
    assert a["title"] == "Điện thoại A" and a["category"] == "Điện thoại & Máy tính bảng" and a["tag"] == "điện thoại"
    assert a["price"] == 4990000 and a["rating"] == 4.8
    assert a["sourceUrl"] == "https://www.lazada.vn/products/pdp-i101.html"   # bỏ ?spm=...
    assert rows[102]["price"] is None and rows[102]["rating"] is None
    assert rows[103]["price"] is None and rows[103]["rating"] is None             # giá 0, sao 6 không hợp lệ


def test_parse_products_requires_columns():
    with pytest.raises(ValueError, match="thiếu cột"):
        parse_products("pdp_id,ten_san_pham\n1,A\n", CATEGORY_MAP)


def test_parse_reviews_keeps_text_reviews_and_product_ratings():
    data = parse_reviews(REVIEWS_CSV)
    assert data["stats"] == {"input": 5, "noText": 1, "invalid": 0}
    assert [r["content"] for r in data["reviews"]] == ["Máy đẹp pin trâu", "Nhóm màu: Đen Nghe hay", "Áo đẹp",
                                                       "Sản phẩm không tồn tại"]
    assert data["productRatings"] == {101: 4.8, 102: 4.6}


class FakeProducts:
    def __init__(self, existing=()):
        self.existing = set(existing)

    async def find_existing_source_urls(self, urls):
        return {u for u in urls if u in self.existing}

    async def upsert_imported_many(self, rows):
        self.rows = rows
        return {"inserted": len(rows), "updated": 0}


class FakeReviews:
    async def insert_many(self, reviews):
        self.reviews = reviews
        return len(reviews)


class Silent:
    def info(self, *args, **kwargs):
        pass


@pytest.mark.asyncio
async def test_import_lazada_fills_ratings_and_links_reviews(tmp_path):
    (tmp_path / "p.csv").write_text(PRODUCTS_CSV, encoding="utf-8")
    (tmp_path / "r.csv").write_text(REVIEWS_CSV, encoding="utf-8")
    products, reviews = FakeProducts(), FakeReviews()
    result = await import_lazada(products, reviews, Silent(), tmp_path / "p.csv", tmp_path / "r.csv")
    by_title = {r["title"]: r for r in products.rows}
    assert by_title["Tai nghe B"]["rating"] == 4.6                # lấy từ file đánh giá
    assert result["products"]["ratingFilledFromReviews"] == 1
    # Đánh giá của sản phẩm 104 (ảnh lỗi) và 999 (không có) bị bỏ vì không có sản phẩm để gắn
    assert [r["content"] for r in reviews.reviews] == ["Máy đẹp pin trâu", "Nhóm màu: Đen Nghe hay"]
    assert reviews.reviews[0] == {"sourceUrl": "https://www.lazada.vn/products/pdp-i101.html",
                                  "content": "Máy đẹp pin trâu", "helpful": 3}
    assert result["reviews"]["productDropped"] == 2
    assert result["reviewsInserted"] == 2

    dry = await import_lazada(FakeProducts(), FakeReviews(), Silent(), tmp_path / "p.csv", tmp_path / "r.csv",
                              dry_run=True)
    assert dry["dryRun"] is True and "reviewsInserted" not in dry


@pytest.mark.asyncio
async def test_import_lazada_does_not_overwrite_existing_products_but_keeps_their_reviews(tmp_path):
    (tmp_path / "p.csv").write_text(PRODUCTS_CSV, encoding="utf-8")
    (tmp_path / "r.csv").write_text(REVIEWS_CSV, encoding="utf-8")
    url_a = "https://www.lazada.vn/products/pdp-i101.html"
    products, reviews = FakeProducts(existing=[url_a]), FakeReviews()
    result = await import_lazada(products, reviews, Silent(), tmp_path / "p.csv", tmp_path / "r.csv")
    assert url_a not in {r["sourceUrl"] for r in products.rows}
    assert result["products"]["alreadyInDatabase"] == 1
    assert reviews.reviews[0]["sourceUrl"] == url_a                    # đánh giá vẫn gắn vào sản phẩm đã có

    products = FakeProducts(existing=[url_a])
    await import_lazada(products, FakeReviews(), Silent(), tmp_path / "p.csv", tmp_path / "r.csv",
                        update_existing=True)
    assert url_a in {r["sourceUrl"] for r in products.rows}


@pytest.mark.asyncio
async def test_reviews_endpoint(client):
    response = await client.get("/api/products/5/reviews?limit=3&offset=6")
    assert response.status_code == 200
    assert client.services.calls["reviews"] == {"product_id": 5, "limit": 3, "offset": 6}
    assert response.json()["total"] == 1
    for bad in ("/api/products/0/reviews", "/api/products/5/reviews?limit=0", "/api/products/5/reviews?limit=51",
                "/api/products/5/reviews?offset=-1"):
        assert (await client.get(bad)).status_code == 400, bad


@pytest.mark.asyncio
async def test_lazada_import_on_real_postgres(tmp_path):
    psycopg_pool = pytest.importorskip("psycopg_pool")
    from psycopg.rows import dict_row

    from app.main import _run_migrations
    from app.repositories import ProductRepository, ReviewRepository
    from app.services import ReviewService

    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL chưa được cấu hình")
    # Mã sản phẩm riêng của test để không đụng dữ liệu thật trong database
    products_csv = PRODUCTS_CSV.replace("pdp-i10", "pdp-i98765410")
    (tmp_path / "p.csv").write_text(products_csv, encoding="utf-8")
    (tmp_path / "r.csv").write_text(REVIEWS_CSV, encoding="utf-8")
    pool = psycopg_pool.AsyncConnectionPool(conninfo=database_url, min_size=1, max_size=2,
                                            kwargs={"row_factory": dict_row}, open=False)
    await pool.open()
    products, reviews = ProductRepository(pool), ReviewRepository(pool)
    cleanup = "DELETE FROM products WHERE source_url LIKE %s"
    try:
        await _run_migrations(pool)
        await products.execute(cleanup, ("https://www.lazada.vn/products/pdp-i98765410%",))
        first = await import_lazada(products, reviews, Silent(), tmp_path / "p.csv", tmp_path / "r.csv")
        assert first["productsWritten"] == {"inserted": 3, "updated": 0}
        assert first["reviewsInserted"] == 2
        again = await import_lazada(products, reviews, Silent(), tmp_path / "p.csv", tmp_path / "r.csv")
        assert again["productsWritten"] == {"inserted": 0, "updated": 0} and again["reviewsInserted"] == 0
        assert again["products"]["alreadyInDatabase"] == 3
        forced = await import_lazada(products, reviews, Silent(), tmp_path / "p.csv", tmp_path / "r.csv",
                                     update_existing=True)
        assert forced["productsWritten"] == {"inserted": 0, "updated": 3}

        row = await products.one("SELECT id, price::float8 AS price, category FROM products WHERE source_url=%s",
                                 ("https://www.lazada.vn/products/pdp-i98765410" + "1.html",))
        assert row["price"] == 4990000 and row["category"] == "Điện thoại & Máy tính bảng"
        page = await ReviewService(reviews, products).list_for_product(row["id"], limit=5, offset=0)
        assert page["total"] == 1 and page["items"][0]["content"] == "Máy đẹp pin trâu" and page["items"][0]["helpful"] == 3
        empty = await ReviewService(reviews, products).list_for_product(row["id"], limit=5, offset=10)
        assert empty["items"] == [] and empty["total"] == 1
    finally:
        await products.execute(cleanup, ("https://www.lazada.vn/products/pdp-i98765410%",))
        await pool.close()
