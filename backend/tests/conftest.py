import pytest
import pytest_asyncio

from app.config import load_settings
from app.main import create_app
from app.errors import not_found


ADMIN_KEY = "test-admin-api-key-123456"
CLIENT_ID = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b"
PRODUCT = {
    "id": 1, "title": "Ghế gỗ", "category": "Nội thất", "tag": "", "imageUrl": "https://x.test/a.jpg",
    "description": "Ghế gỗ sồi", "price": None, "rating": None, "sourceUrl": None, "indexed": True,
}


class Services:
    def __init__(self):
        self.calls = {}
        self.health_status = "ok"
        self.health = self
        self.products = self
        self.search = self
        self.recommendations = self
        self.history = self
        self.events = self
        self.indexing = self

    async def check(self):
        return {"status": self.health_status, "services": {"database": "up", "ai": "up"}}

    async def list(self, category=None, limit=24, offset=0):
        return {"items": [PRODUCT], "total": 1, "limit": limit, "offset": offset}

    async def get(self, product_id):
        if product_id == 404:
            raise not_found("Không tìm thấy sản phẩm")
        return PRODUCT

    async def categories(self):
        return [{"name": "Nội thất", "count": 1}]

    async def create(self, body):
        self.calls["create"] = body
        return {"item": {**PRODUCT, **body, "id": 2}, "indexed": True}

    async def remove(self, product_id):
        self.calls["removed"] = product_id

    async def search_text(self, query, category=None, limit=12, client_id=None, rerank=True):
        self.calls["text"] = {"query": query, "category": category, "limit": limit, "clientId": client_id}
        return {"items": [{**PRODUCT, "similarity": 0.9}], "count": 1, "mode": "hybrid", "query": query}

    async def search_image(self, buffer, mime_type, category=None, limit=12, client_id=None):
        self.calls["image"] = {"buffer": buffer, "mimeType": mime_type, "category": category, "limit": limit, "clientId": client_id}
        return {"items": [], "count": 0}

    async def recommend(self, body, client_id):
        self.calls["recommend"] = {**body, "clientId": client_id}
        return {"items": [{**PRODUCT, "score": 0.5, "reason": "Gợi ý cho bạn"}], "total": 1, "mode": "browse", "basedOn": []}

    async def for_client(self, client_id, limit=8):
        self.calls["recommendations"] = {"clientId": client_id, "limit": limit}
        return {"strategy": "latest", "basedOn": [], "items": [PRODUCT], "trendingQueries": []}

    async def similar_to(self, product_id, limit=6):
        return [PRODUCT]

    async def recent(self, client_id, limit=10):
        self.calls["history"] = client_id
        return []

    async def clear(self, client_id):
        self.calls["cleared"] = client_id

    async def record(self, client_id, body):
        self.calls["event"] = {"clientId": client_id, **body}

    async def reindex_missing(self):
        return {"indexed": 3, "failed": 0}


@pytest_asyncio.fixture
async def client():
    import httpx
    service = Services()
    settings = load_settings({
        "NODE_ENV": "test", "LOG_LEVEL": "silent", "ADMIN_API_KEY": ADMIN_KEY,
        "RATE_LIMIT_PER_MIN": "1000", "SEARCH_RATE_LIMIT_PER_MIN": "1000", "MAX_UPLOAD_MB": "1",
        "CORS_ORIGINS": "http://localhost:5173",
    })
    service_map = {
        "health": service, "products": service, "search": service, "recommend": service,
        "recommendations": service, "history": service, "events": service, "indexing": service,
    }
    app = create_app(settings, services_override=service_map)
    # ASGITransport does not automatically run FastAPI lifespan handlers.
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        c.services = service
        yield c
