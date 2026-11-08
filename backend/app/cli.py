from __future__ import annotations

import argparse
import asyncio
import logging
from pathlib import Path

from .ai_client import create_ai_client
from .config import load_settings
from .importer import DEFAULT_CSV, import_csv
from .lazada import LAZADA_PRODUCTS_CSV, LAZADA_REVIEWS_CSV, import_lazada
from .main import _run_migrations, _wait_for_database
from .repositories import ProductRepository, ReviewRepository, SearchHistoryRepository
from .services import EmbeddingService, IndexingService


async def run(args):
    from psycopg.rows import dict_row
    from psycopg_pool import AsyncConnectionPool

    settings = load_settings()
    levels = {"fatal": logging.CRITICAL, "error": logging.ERROR, "warn": logging.WARNING,
              "info": logging.INFO, "debug": logging.DEBUG, "trace": logging.DEBUG,
              "silent": logging.CRITICAL + 1}
    logging.basicConfig(level=levels[settings.log_level],
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")
    log = logging.getLogger("ttnt.cli")
    pool = AsyncConnectionPool(conninfo=settings.database_url, min_size=1, max_size=settings.db_pool_max,
                               timeout=5, kwargs={"row_factory": dict_row}, open=False)
    await pool.open()
    ai = None
    try:
        await _wait_for_database(pool, attempts=5)
        # CLI scripts mirror the old bootstrap: apply pending migrations before each task.
        await _run_migrations(pool)
        if args.command == "migrate":
            log.info("Database đã ở phiên bản mới nhất")
            return
        products = ProductRepository(pool)
        if args.command == "import-csv":
            result = await import_csv(products, log, args.file or DEFAULT_CSV,
                                      keep_conflicts=args.keep_conflicts, replace=args.replace, dry_run=args.dry_run)
            log.info("CSV import result: %s", result)
            if not args.dry_run and not args.no_index:
                ai = create_ai_client(settings)
                indexing = IndexingService(products, EmbeddingService(ai), log)
                await indexing.reindex_missing(concurrency=4)
            return
        if args.command == "import-lazada":
            reviews_csv = None if args.no_reviews else (args.reviews or LAZADA_REVIEWS_CSV)
            result = await import_lazada(products, ReviewRepository(pool), log, args.products or LAZADA_PRODUCTS_CSV,
                                         reviews_csv, dry_run=args.dry_run, update_existing=args.update_existing)
            log.info("Lazada import result: %s", result)
            if not args.dry_run and not args.no_index:
                ai = create_ai_client(settings)
                indexing = IndexingService(products, EmbeddingService(ai), log)
                await indexing.reindex_missing(concurrency=4)
            return
        if args.command == "reindex":
            if args.all:
                cleared = await products.clear_embeddings()
                log.info("Đã xóa embedding của %s sản phẩm", cleared)
                # Vector truy vấn cũ thuộc không gian của model cũ, trộn với model mới sẽ cho taste vector sai.
                stale = await SearchHistoryRepository(pool).clear_query_embeddings()
                log.info("Đã xóa embedding của %s truy vấn trong lịch sử tìm kiếm", stale)
            ai = create_ai_client(settings)
            indexing = IndexingService(products, EmbeddingService(ai), log)
            result = await indexing.reindex_missing(concurrency=4)
            log.info("Indexing result: %s", result)
    finally:
        if ai:
            await ai.close()
        await pool.close()


def main():
    parser = argparse.ArgumentParser(description="Các tác vụ quản trị backend TTNT")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("migrate", help="Áp dụng các migration SQL chưa chạy")
    reindex = sub.add_parser("reindex", help="Tạo embedding còn thiếu")
    reindex.add_argument("--all", action="store_true", help="Xóa mọi embedding trước khi tạo lại")
    importer = sub.add_parser("import-csv", help="Import dữ liệu marketplace CSV")
    importer.add_argument("file", nargs="?", type=Path)
    importer.add_argument("--replace", action="store_true")
    importer.add_argument("--keep-conflicts", action="store_true")
    importer.add_argument("--dry-run", action="store_true")
    importer.add_argument("--no-index", action="store_true")
    lazada = sub.add_parser("import-lazada", help="Import sản phẩm và đánh giá Lazada")
    lazada.add_argument("--products", type=Path, help="File sản phẩm (mặc định app/seed-data/lazada-products.csv)")
    lazada.add_argument("--reviews", type=Path, help="File đánh giá (mặc định app/seed-data/lazada-reviews.csv)")
    lazada.add_argument("--no-reviews", action="store_true", help="Chỉ nạp sản phẩm, bỏ qua đánh giá")
    lazada.add_argument("--dry-run", action="store_true", help="Chỉ đọc và thống kê, không ghi database")
    lazada.add_argument("--no-index", action="store_true", help="Không tạo embedding sau khi nạp")
    lazada.add_argument("--update-existing", action="store_true",
                        help="Ghi đè cả sản phẩm đã có trong database (mặc định chỉ thêm sản phẩm mới)")
    args = parser.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
