import logging

import pytest

from app.errors import HttpError
from app.services import IndexingService, RecommendService, RecommendationService, SearchService


class SilentLogger:
    def warning(self, *args, **kwargs):
        pass

    def info(self, *args, **kwargs):
        pass

    def error(self, *args, **kwargs):
        pass

    def exception(self, *args, **kwargs):
        pass


PRODUCTS = [
    {"id": 1, "title": "Áo", "category": "Thời trang", "price": 50_000, "rating": 4.0},
    {"id": 2, "title": "Giày", "category": "Giày dép", "price": 150_000, "rating": 4.8},
    {"id": 3, "title": "Túi", "category": "Túi xách", "price": None, "rating": None},
]


@pytest.mark.asyncio
async def test_recommend_service_filters_viewed_budget_and_paginates():
    class Products:
        async def list_for_ranking(self, category=None):
            return PRODUCTS

        async def similarity_to_taste(self, ids, category=None):
            return {}

        async def find_by_ids(self, ids):
            return []

    service = RecommendService(Products(), search=None, history=None)
    result = await service.recommend({"viewedIds": [1], "budget": "mid", "sort": "priceAsc", "limit": 1, "offset": 0}, None)
    assert result["mode"] == "personalized"
    assert result["total"] == 1
    assert [x["id"] for x in result["items"]] == [2]


@pytest.mark.asyncio
async def test_recommend_service_uses_search_and_history_for_queries():
    calls = {}

    class Products:
        async def similarity_to_taste(self, ids, category=None):
            return {}

        async def find_by_ids(self, ids):
            return []

    class Search:
        async def search_text(self, query, category, limit, client_id, rerank=True):
            calls["search"] = (query, limit, rerank)
            return {"items": [{**PRODUCTS[0], "similarity": 0.9}], "mode": "hybrid"}

    class History:
        async def recent_text_queries(self, client_id, limit):
            raise AssertionError("Không đọc lịch sử khi truy vấn có từ khóa")

    service = RecommendService(Products(), Search(), History(), text_image_weight=0.2)
    result = await service.recommend({"query": "  áo  ", "limit": 5}, "client-1")
    assert calls["search"] == ("áo", 200, False)
    assert result["mode"] == "hybrid"
    assert result["items"][0]["reason"] == "Khớp từ khóa “áo”"


@pytest.mark.asyncio
async def test_recommendation_service_selects_recent_taste_or_latest():
    calls = {}

    class Products:
        async def find_nearest_by_text(self, embedding, limit):
            calls["nearest"] = (embedding, limit)
            return [{"id": 1, "rating": 5, "similarity": 0.8}]

        async def find_latest(self, limit):
            return [{"id": 9}]

        async def find_by_id(self, product_id):
            return {"id": product_id}

        async def find_similar(self, product_id, limit):
            calls["similar"] = (product_id, limit)
            return [{"id": 2}]

    class History:
        async def recent_text_queries(self, client_id, limit):
            return [{"query": "áo", "embedding": [1.0, 0.0]}]

        async def popular_queries(self, limit):
            return ["ghế"]

    service = RecommendationService(Products(), History())
    personalized = await service.for_client("client-1", 3)
    assert personalized["strategy"] == "personalized"
    assert personalized["basedOn"] == ["áo"]
    assert calls["nearest"][1] == 6
    latest = await service.for_client(None, 2)
    assert latest["strategy"] == "latest"
    assert latest["items"] == [{"id": 9}]
    assert await service.similar_to(7, 4) == [{"id": 2}]
    assert calls["similar"] == (7, 4)


@pytest.mark.asyncio
async def test_search_service_falls_back_to_keyword_when_ai_is_unavailable():
    calls = {}

    class Embeddings:
        async def embed_query(self, query):
            raise HttpError(503, "down", "AI_UNAVAILABLE")

    class Products:
        async def search_keyword(self, tsquery, category, limit):
            calls["keyword"] = (tsquery, category, limit)
            return [{**PRODUCTS[0], "similarity": None}]

    class History:
        async def record(self, *args):
            calls["history"] = args

    service = SearchService(Products(), History(), Embeddings(), SilentLogger(), type("Cfg", (), {"text_min_similarity": 0, "text_image_weight": 0})())
    result = await service.search_text("áo mới", limit=4, client_id="client-1")
    assert result["mode"] == "keyword"
    assert calls["keyword"] == ("áo | mới", None, 8)
    assert calls["history"][0] == "client-1"


@pytest.mark.asyncio
async def test_indexing_service_saves_successful_embedding_when_image_fails():
    saved = []

    class Products:
        async def update_embeddings(self, product_id, text=None, image=None):
            saved.append((product_id, text, image))

    class Embeddings:
        async def embed_product_text(self, product):
            return [0.1] * 512

        async def embed_product_image(self, product):
            raise RuntimeError("image download failed")

    service = IndexingService(Products(), Embeddings(), SilentLogger())
    assert await service.index_one({"id": 5}) is False
    assert saved == [(5, [0.1] * 512, None)]


@pytest.mark.asyncio
async def test_reindex_retries_only_the_embedding_modality_that_failed():
    state = {"text": None, "image": None, "image_attempts": 0}

    class Products:
        async def find_needing_embeddings(self, limit=20, exclude_ids=None):
            if exclude_ids and 8 in exclude_ids:
                return []
            if state["text"] is not None and state["image"] is not None:
                return []
            return [{"id": 8, "needsText": state["text"] is None, "needsImage": state["image"] is None}]

        async def update_embeddings(self, product_id, text=None, image=None):
            if text is not None:
                state["text"] = text
            if image is not None:
                state["image"] = image

    class Embeddings:
        async def embed_product_text(self, product):
            return [0.1] * 512

        async def embed_product_image(self, product):
            state["image_attempts"] += 1
            raise RuntimeError("URL ảnh tạm thời lỗi")

    service = IndexingService(Products(), Embeddings(), SilentLogger())
    result = await service.reindex_missing(batch_size=1)
    assert state["text"] == [0.1] * 512
    assert state["image"] is None
    assert state["image_attempts"] == 2
    assert result == {"indexed": 0, "failed": 1}
