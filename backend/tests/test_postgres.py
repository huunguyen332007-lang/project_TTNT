import os

import pytest
from app.main import _run_migrations
from app.repositories import ProductRepository


@pytest.mark.asyncio
async def test_migrations_and_product_repository_roundtrip():
    psycopg = pytest.importorskip("psycopg")
    psycopg_pool = pytest.importorskip("psycopg_pool")
    from psycopg.rows import dict_row
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL chưa được cấu hình")
    pool = psycopg_pool.AsyncConnectionPool(conninfo=database_url, min_size=1, max_size=2,
                               kwargs={"row_factory": dict_row}, open=False)
    await pool.open()
    repo = ProductRepository(pool)
    source_url = "https://integration.test/ttnt-python-migration-check"
    try:
        await _run_migrations(pool)
        await repo.execute("DELETE FROM products WHERE source_url=%s", (source_url,))
        inserted = await repo.upsert_imported_many([{
            "title": "Sản phẩm kiểm thử backend Python", "category": "Kiểm thử", "tag": "test",
            "imageUrl": "https://integration.test/item.jpg", "description": "Kiểm tra lưu PostgreSQL",
            "price": 123000, "rating": 4.5, "sourceUrl": source_url,
        }])
        assert inserted == {"inserted": 1, "updated": 0}
        found = await repo.one("SELECT id FROM products WHERE source_url=%s", (source_url,))
        item = await repo.find_by_id(found["id"])
        assert item["title"] == "Sản phẩm kiểm thử backend Python"
        assert item["price"] == 123000.0
        listed = await repo.list("Kiểm thử", 10, 0)
        assert listed["total"] >= 1
        updated = await repo.upsert_imported_many([{
            "title": "Sản phẩm kiểm thử backend Python v2", "category": "Kiểm thử", "tag": "test",
            "imageUrl": "https://integration.test/item.jpg", "description": "Kiểm tra lưu PostgreSQL",
            "price": 124000, "rating": 4.6, "sourceUrl": source_url,
        }])
        assert updated == {"inserted": 0, "updated": 1}
        item = await repo.find_by_id(found["id"])
        assert item["title"].endswith("v2")
    finally:
        await repo.execute("DELETE FROM products WHERE source_url=%s", (source_url,))
        await pool.close()
