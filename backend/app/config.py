from __future__ import annotations

import math
import os
from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass(frozen=True)
class Settings:
    env: str = "development"
    port: int = 3000
    log_level: str = "info"
    database_url: str = "postgres://ttnt:ttnt@localhost:5432/ttnt"
    db_pool_max: int = 10
    ai_service_url: str = "http://localhost:8000"
    ai_timeout_ms: int = 30000
    cors_origins: tuple[str, ...] = ("http://localhost:5173", "http://localhost:8080")
    admin_api_key: str | None = None
    run_migrations: bool = True
    import_csv_on_start: bool = True
    trust_proxy: int = 0
    max_upload_bytes: int = 5 * 1024 * 1024
    rate_limit_per_min: int = 120
    search_rate_limit_per_min: int = 30
    text_min_similarity: float = 0.0
    image_min_similarity: float = 0.0
    text_image_weight: float = 0.3

    @property
    def is_production(self) -> bool:
        return self.env == "production"


def _int(env: dict[str, str], name: str, default: int, minimum: int = 1) -> int:
    try:
        value = int(env.get(name, default))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} phải là số nguyên") from exc
    if value < minimum:
        raise ValueError(f"{name} phải >= {minimum}")
    return value


def _float(env: dict[str, str], name: str, default: float, low: float = 0, high: float = 1) -> float:
    try:
        value = float(env.get(name, default))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} phải là số") from exc
    if not low <= value <= high:
        raise ValueError(f"{name} phải nằm trong khoảng {low}..{high}")
    return value


def _bool(env: dict[str, str], name: str, default: bool) -> bool:
    raw = env.get(name)
    if raw is None or raw == "":
        return default
    if raw.lower() not in {"true", "false"}:
        raise ValueError(f"{name} chỉ nhận true hoặc false")
    return raw.lower() == "true"


def load_settings(source: dict[str, str] | None = None) -> Settings:
    if source is None:
        # Local direct-run mode reads backend/.env; Docker/CI environment always wins.
        try:
            from dotenv import load_dotenv
            load_dotenv()
        except ImportError:
            pass
    e = dict(os.environ if source is None else source)
    e = {k: v for k, v in e.items() if v != ""}
    env = e.get("NODE_ENV", "development")
    if env not in {"development", "test", "production"}:
        raise ValueError("NODE_ENV phải là development, test hoặc production")
    database_url = e.get("DATABASE_URL", "postgres://ttnt:ttnt@localhost:5432/ttnt")
    try:
        parsed = urlparse(database_url)
        valid_db_url = parsed.scheme in {"postgres", "postgresql"} and bool(parsed.hostname) and (parsed.port is None or 1 <= parsed.port <= 65535)
    except ValueError:
        valid_db_url = False
    if not valid_db_url:
        raise ValueError("DATABASE_URL phải là URL PostgreSQL hợp lệ")
    ai_service_url = e.get("AI_SERVICE_URL", "http://localhost:8000").rstrip("/")
    try:
        ai_parsed = urlparse(ai_service_url)
        valid_ai_url = ai_parsed.scheme in {"http", "https"} and bool(ai_parsed.hostname) and (ai_parsed.port is None or 1 <= ai_parsed.port <= 65535)
    except ValueError:
        valid_ai_url = False
    if not valid_ai_url:
        raise ValueError("AI_SERVICE_URL phải là URL HTTP/HTTPS hợp lệ")
    if env == "production" and "DATABASE_URL" not in e:
        raise ValueError("Production bắt buộc phải có DATABASE_URL")
    log_level = e.get("LOG_LEVEL", "info")
    if log_level not in {"fatal", "error", "warn", "info", "debug", "trace", "silent"}:
        raise ValueError("LOG_LEVEL không hợp lệ")
    try:
        upload_mb = float(e.get("MAX_UPLOAD_MB", 5))
    except ValueError as exc:
        raise ValueError("MAX_UPLOAD_MB phải là số dương") from exc
    if not math.isfinite(upload_mb) or upload_mb <= 0:
        raise ValueError("MAX_UPLOAD_MB phải là số dương")
    admin_key = e.get("ADMIN_API_KEY")
    if admin_key and len(admin_key) < 16:
        raise ValueError("ADMIN_API_KEY phải có ít nhất 16 ký tự")
    raw_origins = (source if source is not None else os.environ).get("CORS_ORIGINS")
    origins = tuple(x.strip() for x in raw_origins.split(",") if x.strip()) if raw_origins is not None else ("http://localhost:5173", "http://localhost:8080")
    return Settings(
        env=env,
        port=_int(e, "PORT", 3000),
        log_level=log_level,
        database_url=database_url,
        db_pool_max=_int(e, "DB_POOL_MAX", 10),
        ai_service_url=ai_service_url,
        ai_timeout_ms=_int(e, "AI_TIMEOUT_MS", 30000),
        cors_origins=origins,
        admin_api_key=admin_key,
        run_migrations=_bool(e, "RUN_MIGRATIONS", True),
        import_csv_on_start=_bool(e, "IMPORT_CSV_ON_START", True),
        trust_proxy=_int(e, "TRUST_PROXY", 0, 0),
        max_upload_bytes=round(upload_mb * 1024 * 1024),
        rate_limit_per_min=_int(e, "RATE_LIMIT_PER_MIN", 120),
        search_rate_limit_per_min=_int(e, "SEARCH_RATE_LIMIT_PER_MIN", 30),
        text_min_similarity=_float(e, "TEXT_MIN_SIMILARITY", 0),
        image_min_similarity=_float(e, "IMAGE_MIN_SIMILARITY", 0),
        text_image_weight=_float(e, "TEXT_IMAGE_WEIGHT", 0.3),
    )
