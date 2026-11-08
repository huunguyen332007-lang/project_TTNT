from __future__ import annotations

import asyncio
import logging
import time

import httpx

from .constants import EMBEDDING_DIM
from .errors import HttpError
from .utils import prepare_image_for_embedding

logger = logging.getLogger("ttnt.ai")


class AiClient:
    provider = "local"

    def __init__(self, base_url: str, timeout_ms: int = 30000):
        self.base_url = base_url.rstrip("/")
        self.timeout = httpx.Timeout(timeout_ms / 1000)
        self.client = httpx.AsyncClient(timeout=self.timeout)

    async def close(self):
        await self.client.aclose()

    async def _request(self, path: str, *, reject_code="VALIDATION_ERROR", timeout=None, **kwargs):
        try:
            response = await self.client.request("GET" if path == "/health" else "POST", self.base_url + path, timeout=timeout or self.timeout, **kwargs)
        except httpx.RequestError as exc:
            raise HttpError(503, "Dịch vụ AI chưa phản hồi, vui lòng thử lại sau", "AI_UNAVAILABLE") from exc
        if 400 <= response.status_code < 500:
            try:
                body = response.json()
                detail = body.get("detail")
                message = detail.get("message") if isinstance(detail, dict) else detail
                message = message if isinstance(message, str) else "Dịch vụ AI từ chối dữ liệu đầu vào"
            except Exception:
                message = "Dịch vụ AI từ chối dữ liệu đầu vào"
            status = 400 if response.status_code == 422 else response.status_code
            raise HttpError(status, message, reject_code)
        if response.status_code >= 500:
            raise HttpError(503, "Dịch vụ AI đang gặp sự cố", "AI_UNAVAILABLE")
        return response.json()

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        data = await self._request("/embed/text", json={"texts": texts})
        return data["embeddings"]

    async def embed_image(self, buffer: bytes, mime_type: str) -> list[float]:
        data = await self._request("/embed/image", reject_code="INVALID_IMAGE", files={"file": ("upload", buffer, mime_type)})
        return data["embedding"]

    async def health(self):
        return await self._request("/health", timeout=httpx.Timeout(2.0))

    probe = health  # AI Service tự host: health đã gọi mạng thật, không cần kiểm tra sâu hơn


class JinaClient:
    """Tạo embedding qua Jina AI Embeddings API, cùng giao diện với AiClient.

    Dùng jina-clip-v2: văn bản (đa ngôn ngữ, có tiếng Việt) và ảnh nằm chung một không gian vector.
    Vector gốc 1024 chiều được cắt Matryoshka về 512 chiều nên không phải đổi schema database.
    """

    provider = "jina"
    RETRY_STATUSES = {429, 502, 503, 504}
    MAX_TEXT_CHARS = 2000

    def __init__(self, api_key: str, model: str = "jina-clip-v2", url: str = "https://api.jina.ai/v1/embeddings",
                 dimensions: int = EMBEDDING_DIM, timeout_ms: int = 30000, image_interval_ms: int = 2500,
                 max_retries: int = 3, retry_base_delay: float = 1.0, transport: httpx.AsyncBaseTransport | None = None):
        self.api_key, self.model, self.url, self.dimensions = api_key, model, url, dimensions
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(timeout_ms / 1000), transport=transport)
        self.image_interval = max(0, image_interval_ms) / 1000
        self.max_retries, self.retry_base_delay = max_retries, retry_base_delay
        self._image_lock = asyncio.Lock()
        self._last_image_call = 0.0

    async def close(self):
        await self.client.aclose()

    def _retry_delay(self, attempt: int, response: httpx.Response) -> float:
        try:
            retry_after = float(response.headers.get("retry-after", ""))
        except ValueError:
            retry_after = 0.0
        return min(30.0, max(retry_after, self.retry_base_delay * 2 ** attempt))

    async def _embed(self, items: list[dict], reject_code: str = "VALIDATION_ERROR") -> list[list[float]]:
        payload = {"model": self.model, "dimensions": self.dimensions, "normalized": True,
                   "embedding_type": "float", "input": items}
        headers = {"Authorization": f"Bearer {self.api_key}", "Accept": "application/json"}
        response = None
        for attempt in range(self.max_retries + 1):
            try:
                response = await self.client.post(self.url, json=payload, headers=headers)
            except httpx.RequestError as exc:
                raise HttpError(503, "Dịch vụ embedding chưa phản hồi, vui lòng thử lại sau", "AI_UNAVAILABLE") from exc
            if response.status_code not in self.RETRY_STATUSES or attempt == self.max_retries:
                break
            await asyncio.sleep(self._retry_delay(attempt, response))
        status = response.status_code
        if status in (400, 413, 422):
            message = "Dịch vụ embedding từ chối dữ liệu đầu vào"
            try:
                detail = response.json().get("detail")
                if isinstance(detail, str) and detail:
                    message = detail
            except Exception:
                pass
            raise HttpError(400, message, reject_code)
        if status in (401, 402, 403):
            # Sai khóa hoặc hết hạn mức: người dùng không sửa được, nên hạ cấp về tìm từ khóa thay vì báo lỗi 4xx.
            # Thông điệp cụ thể chỉ lộ ra ở /api/health?deep=true để chủ hệ thống biết cần sửa gì.
            reason = {401: "Jina từ chối khóa API (sai, hết hạn hoặc đã bị thu hồi): kiểm tra JINA_API_KEY",
                      402: "Jina báo hết token/hạn mức: kiểm tra số dư tại jina.ai",
                      403: "Jina từ chối quyền truy cập của khóa API này"}[status]
            logger.error("Jina API từ chối yêu cầu (HTTP %s): %s", status, reason)
            raise HttpError(503, reason, "AI_UNAVAILABLE")
        if status != 200:
            raise HttpError(503, "Dịch vụ embedding đang gặp sự cố", "AI_UNAVAILABLE")
        try:
            rows = sorted(response.json()["data"], key=lambda row: row["index"])
            vectors = [[float(v) for v in row["embedding"]] for row in rows]
        except (KeyError, TypeError, ValueError) as exc:
            raise HttpError(503, "Dịch vụ embedding trả dữ liệu không hợp lệ", "AI_UNAVAILABLE") from exc
        if len(vectors) != len(items) or any(len(v) != self.dimensions for v in vectors):
            raise HttpError(503, "Dịch vụ embedding trả vector sai kích thước", "AI_UNAVAILABLE")
        return vectors

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return await self._embed([{"text": text[:self.MAX_TEXT_CHARS]} for text in texts])

    async def embed_image(self, buffer: bytes, mime_type: str) -> list[float]:
        try:
            encoded = prepare_image_for_embedding(buffer)
        except ValueError as exc:
            raise HttpError(400, str(exc), "INVALID_IMAGE") from exc
        # Gói free giới hạn token mỗi phút; mỗi ảnh ~4.000 token nên giãn cách để không bị 429 liên tục.
        async with self._image_lock:
            wait = self._last_image_call + self.image_interval - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
            try:
                return (await self._embed([{"image": encoded}], reject_code="INVALID_IMAGE"))[0]
            finally:
                self._last_image_call = time.monotonic()

    async def health(self):
        # Không gọi mạng: mỗi lần gọi đều tốn token và health check chạy liên tục.
        return {"status": "ok", "provider": "jina", "model": self.model}

    async def probe(self):
        """Kiểm tra thật khóa API và hạn mức bằng một embedding 1 từ (vài token). Chỉ dùng cho /api/health?deep=true."""
        await self._embed([{"text": "ping"}])
        return {"status": "ok", "provider": "jina", "model": self.model}


def create_ai_client(settings):
    if settings.embedding_provider == "jina":
        return JinaClient(settings.jina_api_key, settings.jina_model, settings.jina_api_url,
                          timeout_ms=settings.ai_timeout_ms, image_interval_ms=settings.jina_image_interval_ms)
    return AiClient(settings.ai_service_url, settings.ai_timeout_ms)
