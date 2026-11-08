from __future__ import annotations

import httpx

from .errors import HttpError


class AiClient:
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
