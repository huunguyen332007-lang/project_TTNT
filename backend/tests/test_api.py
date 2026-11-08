import pytest

from conftest import ADMIN_KEY, CLIENT_ID


def json_post(body, headers=None):
    return {"json": body, "headers": headers or {}}


@pytest.mark.asyncio
async def test_health_and_products_contract(client):
    health = await client.get("/api/health")
    assert health.status_code == 200
    assert (await client.get("/api/products")).json()["limit"] == 24
    assert (await client.get("/api/products?limit=abc")).status_code == 400
    assert (await client.get("/api/products?limit=1000")).json()["error"]["code"] == "VALIDATION_ERROR"
    assert (await client.get("/api/products/404")).json()["error"]["code"] == "NOT_FOUND"
    assert (await client.get("/api/products/abc")).status_code == 400


@pytest.mark.asyncio
async def test_categories_similar_and_history(client):
    assert (await client.get("/api/categories")).json()["items"][0]["name"] == "Nội thất"
    assert len((await client.get("/api/products/1/similar")).json()["items"]) == 1
    response = await client.get("/api/history", headers={"X-Client-Id": CLIENT_ID})
    assert response.json() == {"items": []}
    assert client.services.calls["history"] == CLIENT_ID
    assert (await client.delete("/api/history", headers={"X-Client-Id": CLIENT_ID})).status_code == 204


@pytest.mark.asyncio
async def test_text_search_validation_and_client_id(client):
    assert (await client.post("/api/search/text", json={"query": "  "})).status_code == 400
    response = await client.post("/api/search/text", json={"query": " ghế gỗ ", "limit": 5}, headers={"X-Client-Id": CLIENT_ID})
    assert response.status_code == 200
    assert response.json()["mode"] == "hybrid"
    assert client.services.calls["text"] == {"query": "ghế gỗ", "category": None, "limit": 5, "clientId": CLIENT_ID}
    await client.post("/api/search/text", json={"query": "ghế"}, headers={"X-Client-Id": "bad-id"})
    assert client.services.calls["text"]["clientId"] is None


@pytest.mark.asyncio
async def test_image_search_multipart(client):
    missing = await client.post("/api/search/image")
    assert missing.status_code == 400
    response = await client.post("/api/search/image", files={"image": ("x.png", b"fake-image", "image/png")}, data={"limit": "4"}, headers={"X-Client-Id": CLIENT_ID})
    assert response.status_code == 200
    assert client.services.calls["image"]["mimeType"] == "image/png"
    invalid = await client.post("/api/search/image", files={"image": ("x.txt", b"no", "text/plain")})
    assert invalid.status_code == 415


@pytest.mark.asyncio
async def test_recommend_events_and_admin(client):
    response = await client.post("/api/recommend", json={"query": "", "viewedIds": [1], "limit": 4}, headers={"X-Client-Id": CLIENT_ID})
    assert response.status_code == 200
    assert client.services.calls["recommend"]["viewedIds"] == [1]
    event = await client.post("/api/events", json={"productId": 1, "kind": "text", "query": " ghế "}, headers={"X-Client-Id": CLIENT_ID})
    assert event.status_code == 204
    assert client.services.calls["event"]["clientId"] == CLIENT_ID
    assert client.services.calls["event"]["query"] == " ghế "

    body = {"title": "Ghế mới", "imageUrl": "https://example.com/a.jpg", "price": 120000}
    denied = await client.post("/api/products", json=body)
    assert denied.status_code == 401
    accepted = await client.post("/api/products", json=body, headers={"X-Api-Key": ADMIN_KEY})
    assert accepted.status_code == 201
    assert accepted.json()["item"]["id"] == 2
    reindex = await client.post("/api/admin/reindex", headers={"X-Api-Key": ADMIN_KEY})
    assert reindex.json()["indexed"] == 3
    assert (await client.delete("/api/products/1", headers={"X-Api-Key": ADMIN_KEY})).status_code == 204


@pytest.mark.asyncio
async def test_unknown_route_error_shape(client):
    response = await client.get("/api/not-a-route")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_json_schema_keeps_number_types_and_body_limit(client):
    headers = {"X-Api-Key": ADMIN_KEY}
    bad_price = await client.post("/api/products", json={"title": "Test", "imageUrl": "https://example.com/a.jpg", "price": "120000"}, headers=headers)
    assert bad_price.status_code == 400
    bad_event = await client.post("/api/events", json={"productId": "1"}, headers={"X-Client-Id": CLIENT_ID})
    assert bad_event.status_code == 400
    numeric_event = await client.post("/api/events", json={"productId": 1.0, "position": 0.0}, headers={"X-Client-Id": CLIENT_ID})
    assert numeric_event.status_code == 204
    bad_viewed = await client.post("/api/recommend", json={"viewedIds": ["1"]})
    assert bad_viewed.status_code == 400
    oversized = await client.post("/api/events", content=b" " * (100 * 1024 + 1), headers={"content-type": "application/json", "content-length": str(100 * 1024 + 1)})
    assert oversized.status_code == 413
    assert oversized.json()["error"]["code"] == "FILE_TOO_LARGE"
