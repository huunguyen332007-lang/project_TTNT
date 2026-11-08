from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import math
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import Depends, FastAPI, File, Form, Header, Query, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, field_validator
from starlette.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .ai_client import create_ai_client
from .config import Settings, load_settings
from .constants import ALLOWED_IMAGE_TYPES, DEFAULT_PAGE_SIZE, DEFAULT_RECOMMEND_LIMIT, DEFAULT_SEARCH_LIMIT, MAX_PAGE_SIZE, MAX_RECOMMEND_LIMIT, MAX_SEARCH_LIMIT, BUDGETS, RECOMMEND_SORTS
from .errors import HttpError
from .importer import import_csv
from .repositories import ProductRepository, SearchHistoryRepository, EventRepository
from .services import (EmbeddingService, IndexingService, ProductService, SearchService, HistoryService,
                       EventService, RecommendService, RecommendationService, HealthService)

logger = logging.getLogger("ttnt.backend")
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class ProductCreate(ApiModel):
    title: str = Field(min_length=1, max_length=200)
    category: str | None = Field(default=None, min_length=1, max_length=100)
    tag: str | None = Field(default=None, max_length=50)
    image_url: str = Field(alias="imageUrl", max_length=2000)
    description: str | None = Field(default=None, max_length=2000)
    price: StrictFloat | None = Field(default=None, ge=0, le=1e12)
    rating: StrictFloat | None = Field(default=None, ge=0, le=5)
    source_url: str | None = Field(default=None, alias="sourceUrl", max_length=2000)

    @field_validator("title", "category", "tag", "image_url", "description", "source_url", mode="before")
    @classmethod
    def trim_strings(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("category")
    @classmethod
    def nonempty_category(cls, value):
        if value == "":
            raise ValueError("String must contain at least 1 character")
        return value

    @field_validator("image_url", "source_url")
    @classmethod
    def validate_urls(cls, value):
        if value is None:
            return value
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Invalid URL")
        return value

    def as_service_dict(self):
        return {"title": self.title, "category": self.category, "tag": self.tag, "imageUrl": self.image_url,
                "description": self.description, "price": self.price, "rating": self.rating, "sourceUrl": self.source_url}


class SearchTextBody(ApiModel):
    query: str = Field(min_length=1, max_length=250)
    category: str | None = Field(default=None, min_length=1, max_length=100)
    limit: int = Field(default=DEFAULT_SEARCH_LIMIT, ge=1, le=MAX_SEARCH_LIMIT)

    @field_validator("query", "category", mode="before")
    @classmethod
    def trim_query(cls, value):
        return value.strip() if isinstance(value, str) else value


class RecommendBody(ApiModel):
    query: str = Field(default="", max_length=250)
    category: str | None = Field(default=None, min_length=1, max_length=100)
    interests: list[str] = Field(default_factory=list, max_length=30)
    budget: str = "any"
    viewed_ids: list[StrictInt] = Field(default_factory=list, alias="viewedIds", max_length=50)
    sort: str = "relevance"
    limit: int = Field(default=DEFAULT_RECOMMEND_LIMIT, ge=1, le=MAX_RECOMMEND_LIMIT)
    offset: int = Field(default=0, ge=0, le=1_000_000)

    @field_validator("query", "category", mode="before")
    @classmethod
    def trim_query(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("viewed_ids", mode="before")
    @classmethod
    def validate_viewed_ids_are_json_numbers(cls, values):
        if not isinstance(values, list):
            return values
        normalized = []
        for value in values:
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or int(value) != value:
                raise ValueError("viewedIds phải là mảng số nguyên dương")
            normalized.append(int(value))
        return normalized

    @field_validator("interests")
    @classmethod
    def validate_interests(cls, values):
        if any(not x.strip() or len(x.strip()) > 100 for x in values):
            raise ValueError("Danh mục quan tâm phải có từ 1 đến 100 ký tự")
        return [x.strip() for x in values]

    @field_validator("budget")
    @classmethod
    def validate_budget(cls, value):
        if value not in {"any", *BUDGETS.keys()}:
            raise ValueError("Input should be 'any' hoặc một mức ngân sách hợp lệ")
        return value

    @field_validator("sort")
    @classmethod
    def validate_sort(cls, value):
        if value not in RECOMMEND_SORTS:
            raise ValueError("Thứ tự sắp xếp không hợp lệ")
        return value

    @field_validator("viewed_ids")
    @classmethod
    def validate_viewed_ids(cls, values):
        if any(x <= 0 for x in values):
            raise ValueError("viewedIds phải là số nguyên dương")
        return values

    def as_service_dict(self):
        return {"query": self.query, "category": self.category, "interests": self.interests, "budget": self.budget,
                "viewedIds": self.viewed_ids, "sort": self.sort, "limit": self.limit, "offset": self.offset}


class EventBody(ApiModel):
    product_id: StrictInt = Field(alias="productId", gt=0)
    kind: str = "browse"
    query: str = Field(default="", max_length=250)
    position: StrictInt | None = Field(default=None, ge=0, le=1000)
    event: str = "click"

    @field_validator("product_id", "position", mode="before")
    @classmethod
    def validate_event_integer_numbers(cls, value):
        if value is None:
            return value
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or int(value) != value:
            raise ValueError("Giá trị phải là số nguyên")
        return int(value)

    @field_validator("kind")
    @classmethod
    def valid_kind(cls, value):
        if value not in {"text", "image", "browse"}:
            raise ValueError("kind không hợp lệ")
        return value

    @field_validator("event")
    @classmethod
    def valid_event(cls, value):
        if value not in {"click", "like", "dislike"}:
            raise ValueError("event không hợp lệ")
        return value

    def as_service_dict(self):
        return {"productId": self.product_id, "kind": self.kind, "query": self.query,
                "position": self.position, "event": self.event}


async def _wait_for_database(pool, attempts=30, delay_seconds=2):
    for attempt in range(1, attempts + 1):
        try:
            async with pool.connection() as conn:
                await conn.execute("SELECT 1")
            return
        except Exception:
            logger.warning("Waiting for PostgreSQL (%s/%s)", attempt, attempts)
            if attempt == attempts:
                raise
            await asyncio.sleep(delay_seconds)


async def _run_migrations(pool):
    migration_dir = Path(__file__).resolve().parent / "migrations"
    async with pool.connection() as conn:
        await conn.execute("SELECT pg_advisory_lock(%s)", (727001,))
        try:
            await conn.execute("""CREATE TABLE IF NOT EXISTS schema_migrations (
                name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""")
            cur = await conn.execute("SELECT name FROM schema_migrations")
            applied = {row["name"] for row in await cur.fetchall()}
            for path in sorted(migration_dir.glob("*.sql")):
                if path.name in applied:
                    continue
                logger.info("Applying migration %s", path.name)
                async with conn.transaction():
                    await conn.execute(path.read_text(encoding="utf-8"))
                    await conn.execute("INSERT INTO schema_migrations(name) VALUES (%s)", (path.name,))
        finally:
            await conn.execute("SELECT pg_advisory_unlock(%s)", (727001,))


class RateLimiter:
    def __init__(self):
        self.hits: dict[tuple[str, str], list[float]] = {}

    def check(self, key: str, bucket: str, limit: int):
        now = time.monotonic()
        history = [t for t in self.hits.get((key, bucket), []) if now - t < 60]
        if len(history) >= limit:
            self.hits[(key, bucket)] = history
            raise HttpError(429, "Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút", "RATE_LIMITED")
        history.append(now)
        self.hits[(key, bucket)] = history


def _client_ip(request: Request, settings: Settings) -> str:
    if settings.trust_proxy > 0:
        forwarded = request.headers.get("x-forwarded-for", "").split(",")
        if forwarded:
            return forwarded[-min(settings.trust_proxy, len(forwarded))].strip()
    return request.client.host if request.client else "unknown"


def _log_embedding_provider(settings: Settings, ai) -> None:
    """Ghi rõ nguồn embedding vào log khởi động: lỗi `ai: down` thường chỉ vì chạy nhầm chế độ."""
    if ai.provider == "jina":
        logger.info("Embedding provider: jina (model %s)", settings.jina_model)
        return
    logger.info("Embedding provider: local (AI Service tại %s)", settings.ai_service_url)
    host = urlsplit(settings.ai_service_url).hostname
    if settings.is_production and host in {"localhost", "127.0.0.1", "::1"}:
        logger.warning("NODE_ENV=production nhưng EMBEDDING_PROVIDER=local đang trỏ tới %s: trừ khi AI Service chạy cùng máy, "
                       "đây gần như chắc chắn là thiếu EMBEDDING_PROVIDER=jina (và JINA_API_KEY). /api/health sẽ báo ai: down.", host)


def create_app(settings: Settings | None = None, services_override: dict | None = None) -> FastAPI:
    settings = settings or load_settings()
    python_log_level = {
        "fatal": logging.CRITICAL, "error": logging.ERROR, "warn": logging.WARNING,
        "info": logging.INFO, "debug": logging.DEBUG, "trace": logging.DEBUG,
        "silent": logging.CRITICAL + 1,
    }[settings.log_level]
    logging.basicConfig(level=python_log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    logger.setLevel(python_log_level)
    background_tasks: list[asyncio.Task] = []

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if services_override is not None:
            app.state.services = services_override
            app.state.pool = None
            yield
            return
        from psycopg.rows import dict_row
        from psycopg_pool import AsyncConnectionPool

        pool = AsyncConnectionPool(
            conninfo=settings.database_url,
            min_size=1,
            max_size=settings.db_pool_max,
            timeout=5,
            kwargs={"row_factory": dict_row},
            open=False,
        )
        await pool.open()
        app.state.pool = pool
        try:
            await _wait_for_database(pool)
            if settings.run_migrations:
                await _run_migrations(pool)
            products_repo = ProductRepository(pool)
            history_repo = SearchHistoryRepository(pool)
            event_repo = EventRepository(pool)
            ai = create_ai_client(settings)
            _log_embedding_provider(settings, ai)
            embeddings = EmbeddingService(ai)
            indexing = IndexingService(products_repo, embeddings, logger)
            search = SearchService(products_repo, history_repo, embeddings, logger, settings)
            app.state.services = {
                "health": HealthService(pool, ai),
                "products": ProductService(products_repo, indexing, logger),
                "search": search,
                "recommend": RecommendService(products_repo, search, history_repo, settings.text_image_weight),
                "recommendations": RecommendationService(products_repo, history_repo),
                "history": HistoryService(history_repo),
                "events": EventService(event_repo),
                "indexing": indexing,
                "repositories": {"products": products_repo, "history": history_repo},
                "ai": ai,
            }
            if settings.import_csv_on_start:
                await import_csv(products_repo, logger)
            task = asyncio.create_task(indexing.reindex_in_background(), name="background-reindex")
            background_tasks.append(task)
            yield
        finally:
            for task in background_tasks:
                if not task.done():
                    task.cancel()
            if background_tasks:
                await asyncio.gather(*background_tasks, return_exceptions=True)
            if getattr(app.state, "services", None) and app.state.services.get("ai"):
                await app.state.services["ai"].close()
            await pool.close()

    app = FastAPI(title="TTNT API", version="3.0.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.rate_limiter = RateLimiter()
    if services_override is not None:
        app.state.services = services_override

    if settings.cors_origins:
        app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_credentials=False,
                           allow_methods=["GET", "POST", "DELETE", "OPTIONS"], allow_headers=["*"])

    @app.middleware("http")
    async def common_middleware(request: Request, call_next):
        start = time.perf_counter()
        if request.url.path.startswith("/api"):
            content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            raw_length = request.headers.get("content-length")
            if content_type == "application/json" and raw_length:
                try:
                    too_large = int(raw_length) > 100 * 1024
                except ValueError:
                    too_large = False
                if too_large:
                    return JSONResponse(status_code=413, content={"error": {"code": "FILE_TOO_LARGE", "message": "Dữ liệu gửi lên quá lớn"}})
            try:
                app.state.rate_limiter.check(_client_ip(request, settings), "api", settings.rate_limit_per_min)
            except HttpError as exc:
                return JSONResponse(status_code=exc.status, content={"error": {"code": exc.code, "message": exc.message}})
            raw_id = request.headers.get("x-client-id", "")
            request.state.client_id = raw_id.lower() if UUID_RE.fullmatch(raw_id) else None
        response = await call_next(request)
        response.headers.setdefault("Cross-Origin-Resource-Policy", "cross-origin")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        if request.url.path != "/api/health":
            logger.info("%s %s -> %s (%.1f ms)", request.method, request.url.path, response.status_code, (time.perf_counter() - start) * 1000)
        return response

    @app.exception_handler(HttpError)
    async def http_error_handler(_request: Request, exc: HttpError):
        error = {"code": exc.code, "message": exc.message}
        if exc.details:
            error["details"] = exc.details
        return JSONResponse(status_code=exc.status, content={"error": error})

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_request: Request, exc: RequestValidationError):
        details = []
        for error in exc.errors():
            field = ".".join(str(x) for x in error.get("loc", ()) if x not in {"body", "query", "path"})
            details.append({"field": field, "message": error.get("msg", "Dữ liệu không hợp lệ")})
        message = details[0]["message"] if details else "Dữ liệu gửi lên không hợp lệ"
        return JSONResponse(status_code=400, content={"error": {"code": "VALIDATION_ERROR", "message": message, "details": details}})

    @app.exception_handler(StarletteHTTPException)
    async def framework_http_error_handler(_request: Request, exc: StarletteHTTPException):
        if isinstance(exc.detail, dict):
            error = exc.detail
        else:
            message = "Đường dẫn không tồn tại" if exc.status_code == 404 else str(exc.detail)
            error = {"code": "NOT_FOUND" if exc.status_code == 404 else "ERROR", "message": message}
        return JSONResponse(status_code=exc.status_code, content={"error": error}, headers=exc.headers)

    @app.exception_handler(Exception)
    async def unhandled_error_handler(_request: Request, exc: Exception):
        logger.exception("Unhandled backend error")
        return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL_ERROR", "message": "Đã có lỗi ở máy chủ, vui lòng thử lại sau"}})

    def services(request: Request):
        return request.app.state.services

    def require_admin(request: Request, x_api_key: str | None = Header(default=None, alias="X-Api-Key")):
        if not settings.admin_api_key:
            raise HttpError(503, "Chức năng quản trị chưa được bật (thiếu ADMIN_API_KEY)", "ADMIN_DISABLED")
        provided = hashlib.sha256((x_api_key or "").encode()).digest()
        expected = hashlib.sha256(settings.admin_api_key.encode()).digest()
        if not hmac.compare_digest(provided, expected):
            raise HttpError(401, "Khóa API không hợp lệ", "UNAUTHORIZED")

    def apply_rate_limit(request: Request, bucket: str, limit: int):
        app.state.rate_limiter.check(_client_ip(request, settings), bucket, limit)

    @app.get("/api/health")
    async def health(request: Request, deep: bool = False):
        if deep:
            apply_rate_limit(request, "health-deep", 6)  # mỗi lần gọi tốn token Jina nên giới hạn chặt
        result = await services(request)["health"].check(deep=deep)
        return JSONResponse(status_code=503 if result["status"] == "error" else 200, content=result)

    @app.get("/api/products")
    async def list_products(request: Request, category: str | None = None,
                            limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
                            offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0):
        if category is not None and not 1 <= len(category.strip()) <= 100:
            raise HttpError(400, "category phải có từ 1 đến 100 ký tự", "VALIDATION_ERROR")
        return await services(request)["products"].list(category.strip() if category else None, limit, offset)

    @app.post("/api/products", status_code=201)
    async def create_product(request: Request, body: ProductCreate, _admin=Depends(require_admin)):
        return await services(request)["products"].create(body.as_service_dict())

    @app.get("/api/products/{product_id}")
    async def get_product(request: Request, product_id: int):
        if product_id <= 0:
            raise HttpError(400, "id phải là số nguyên dương", "VALIDATION_ERROR")
        return {"item": await services(request)["products"].get(product_id)}

    @app.get("/api/products/{product_id}/similar")
    async def similar_products(request: Request, product_id: int,
                               limit: Annotated[int, Query(ge=1, le=20)] = 6):
        if product_id <= 0:
            raise HttpError(400, "id phải là số nguyên dương", "VALIDATION_ERROR")
        items = await services(request)["recommendations"].similar_to(product_id, limit)
        return {"items": items}

    @app.delete("/api/products/{product_id}", status_code=204)
    async def delete_product(request: Request, product_id: int, _admin=Depends(require_admin)):
        if product_id <= 0:
            raise HttpError(400, "id phải là số nguyên dương", "VALIDATION_ERROR")
        await services(request)["products"].remove(product_id)
        return Response(status_code=204)

    @app.get("/api/categories")
    async def categories(request: Request):
        return {"items": await services(request)["products"].categories()}

    @app.post("/api/search/text")
    async def search_text(request: Request, body: SearchTextBody):
        apply_rate_limit(request, "search", settings.search_rate_limit_per_min)
        return await services(request)["search"].search_text(body.query, body.category, body.limit, request.state.client_id)

    @app.post("/api/search/image")
    async def search_image(request: Request, image: UploadFile | None = File(default=None),
                           category: str | None = Form(default=None),
                           limit: Annotated[int, Form(ge=1, le=MAX_SEARCH_LIMIT)] = DEFAULT_SEARCH_LIMIT):
        apply_rate_limit(request, "search", settings.search_rate_limit_per_min)
        if image is None:
            raise HttpError(400, "Vui lòng chọn một ảnh để tìm kiếm", "INVALID_IMAGE")
        if image.content_type not in ALLOWED_IMAGE_TYPES:
            raise HttpError(415, "Chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc GIF", "UNSUPPORTED_MEDIA_TYPE")
        if category is not None and not 1 <= len(category.strip()) <= 100:
            raise HttpError(400, "category phải có từ 1 đến 100 ký tự", "VALIDATION_ERROR")
        buffer = await image.read(settings.max_upload_bytes + 1)
        if len(buffer) > settings.max_upload_bytes:
            raise HttpError(413, "Ảnh quá lớn, vui lòng chọn ảnh nhỏ hơn", "FILE_TOO_LARGE")
        return await services(request)["search"].search_image(buffer, image.content_type, category.strip() if category else None,
                                                              limit, request.state.client_id)

    @app.get("/api/recommendations")
    async def recommendations(request: Request, limit: Annotated[int, Query(ge=1, le=20)] = 8):
        return await services(request)["recommendations"].for_client(request.state.client_id, limit)

    @app.post("/api/recommend")
    async def recommend(request: Request, body: RecommendBody):
        if body.query:
            apply_rate_limit(request, "search", settings.search_rate_limit_per_min)
        return await services(request)["recommend"].recommend(body.as_service_dict(), request.state.client_id)

    @app.get("/api/history")
    async def recent_history(request: Request, limit: Annotated[int, Query(ge=1, le=20)] = 10):
        return {"items": await services(request)["history"].recent(request.state.client_id, limit)}

    @app.delete("/api/history", status_code=204)
    async def clear_history(request: Request):
        await services(request)["history"].clear(request.state.client_id)
        return Response(status_code=204)

    @app.post("/api/events", status_code=204)
    async def record_event(request: Request, body: EventBody):
        apply_rate_limit(request, "events", 120)
        await services(request)["events"].record(request.state.client_id, body.as_service_dict())
        return Response(status_code=204)

    @app.post("/api/admin/reindex", dependencies=[Depends(require_admin)])
    async def reindex(request: Request):
        return await services(request)["indexing"].reindex_missing()

    return app


app = create_app()
