"""Kiểm tra các câu SQL thống kê trên PostgreSQL thật. Bị bỏ qua nếu chưa đặt TEST_DATABASE_URL.

Test so sánh số liệu trước/sau khi thêm dữ liệu riêng của nó, nên chạy được cả trên database đã có dữ liệu,
và tự dọn dữ liệu thử khi kết thúc.
"""
import os
import uuid

import pytest

from app.main import _run_migrations
from app.repositories import ProductRepository, StatsRepository
from app.services import StatsService

PREFIX = "zz-stat-test-"
SOURCE_URL = "https://integration.test/ttnt-stats-check"


async def _search(repo, client_id, query, minutes_ago=0, days_ago=0, results=5):
    await repo.execute(
        """INSERT INTO search_history (client_id, kind, query, result_count, searched_at)
        VALUES (%s, 'text', %s, %s, NOW() - make_interval(days => %s, mins => %s))""",
        (client_id, query, results, days_ago, minutes_ago),
    )


async def _event(repo, client_id, kind, query, product_id, position, event="click"):
    await repo.execute(
        "INSERT INTO click_events (client_id, kind, query, product_id, position, event) VALUES (%s,%s,%s,%s,%s,%s)",
        (client_id, kind, query, product_id, position, event),
    )


async def _cleanup(repo):
    await repo.execute("DELETE FROM search_history WHERE query LIKE %s", (PREFIX + "%",))
    await repo.execute("DELETE FROM products WHERE source_url = %s", (SOURCE_URL,))  # click_events xóa theo (ON DELETE CASCADE)


@pytest.mark.asyncio
async def test_stats_sql_on_real_postgres():
    psycopg_pool = pytest.importorskip("psycopg_pool")
    from psycopg.rows import dict_row
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL chưa được cấu hình")
    pool = psycopg_pool.AsyncConnectionPool(conninfo=database_url, min_size=1, max_size=2,
                                            kwargs={"row_factory": dict_row}, open=False)
    await pool.open()
    products = ProductRepository(pool)
    stats = StatsService(StatsRepository(pool))
    try:
        await _run_migrations(pool)
        await _cleanup(products)
        await products.upsert_imported_many([{
            "title": "Sản phẩm thử thống kê", "category": "Kiểm thử", "tag": "test",
            "imageUrl": "https://integration.test/stats.jpg", "description": "", "price": 1000,
            "rating": 4.0, "sourceUrl": SOURCE_URL,
        }])
        product_id = (await products.one("SELECT id FROM products WHERE source_url=%s", (SOURCE_URL,)))["id"]
        before = await stats.summary(days=30, limit=50)

        a, b, c = (str(uuid.uuid4()) for _ in range(3))
        # A: tìm "ao mua" 2 lần, không bấm -> phải lọt vào danh sách từ khóa không ai bấm
        await _search(products, a, PREFIX + "ao mua", results=0)
        await _search(products, a, PREFIX + "ao mua", minutes_ago=10, results=0)
        # B: tìm "tai nghe" 2 lần, lần mới nhất có bấm (viết hoa, thừa dấu cách vẫn phải khớp)
        await _search(products, b, PREFIX + "tai nghe", minutes_ago=60)
        await _search(products, b, PREFIX + "tai nghe")
        await _event(products, b, "text", "  " + (PREFIX + "TAI NGHE") + " ", product_id, 0)
        # C: tìm 20 phút trước, bấm bây giờ -> quá 5 phút nên không tính là "có bấm"
        await _search(products, c, PREFIX + "tre")
        await products.execute("UPDATE search_history SET searched_at = NOW() - INTERVAL '20 minutes' WHERE client_id = %s", (c,))
        await _event(products, c, "text", PREFIX + "tre", product_id, 4)
        # Dữ liệu 40 ngày trước: nằm ngoài cửa sổ 30 ngày
        await _search(products, a, PREFIX + "cu", days_ago=40)
        # Bấm khi duyệt trang chủ (không có từ khóa) và một lượt thích
        await _event(products, a, "browse", "", product_id, 2)
        await _event(products, a, "browse", "", product_id, None, event="like")

        after = await stats.summary(days=30, limit=50)

        assert after["searches"]["total"] - before["searches"]["total"] == 5        # 2 (A) + 2 (B) + 1 (C), bỏ bản ghi 40 ngày
        assert after["searches"]["withClick"] - before["searches"]["withClick"] == 1  # chỉ lượt mới nhất của B
        assert after["events"]["clicks"] - before["events"]["clicks"] == 3
        assert after["events"]["likes"] - before["events"]["likes"] == 1
        assert after["events"]["clicksByKind"]["browse"] - before["events"]["clicksByKind"]["browse"] == 1

        def by_position(summary):
            return {d["position"]: d["clicks"] for d in summary["positions"]["distribution"]}
        for position in (1, 3, 5):                                                  # vị trí 0, 2, 4 hiển thị là 1, 3, 5
            assert by_position(after).get(position, 0) - by_position(before).get(position, 0) == 1

        top = {p["id"]: p for p in after["topProducts"]}
        assert top[product_id]["clicks"] == 3 and top[product_id]["title"] == "Sản phẩm thử thống kê"

        zero = {q["query"]: q for q in after["zeroClickQueries"]}
        assert zero[PREFIX + "ao mua"] == {"query": PREFIX + "ao mua", "searches": 2, "avgResults": 0}
        assert PREFIX + "tai nghe" not in zero      # có ít nhất một lần bấm
        assert PREFIX + "tre" not in zero           # chỉ tìm 1 lần (cần ít nhất 2)
    finally:
        await _cleanup(products)
        await pool.close()
