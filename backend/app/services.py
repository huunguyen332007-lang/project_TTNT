from __future__ import annotations

import asyncio
import logging
import math
from collections import Counter
from urllib.parse import urlparse

import httpx

from .errors import HttpError, not_found
from .repositories import ProductRepository, SearchHistoryRepository, EventRepository
from .utils import (build_product_text, to_tsquery, rank_by_match_and_rating, relevance_scores,
                    rating_score, taste_from_history, mean_vector)
from .constants import BUDGETS, DEFAULT_PAGE_SIZE, DEFAULT_SEARCH_LIMIT


class EmbeddingService:
    def __init__(self, ai):
        self.ai = ai
        self.cache: dict[str, list[float]] = {}

    async def embed_query(self, text):
        key = text.strip().casefold()
        if key in self.cache:
            value = self.cache.pop(key)
            self.cache[key] = value
            return value
        vector = (await self.ai.embed_texts([text]))[0]
        self.cache[key] = vector
        if len(self.cache) > 500:
            self.cache.pop(next(iter(self.cache)))
        return vector

    async def embed_uploaded_image(self, buffer, mime_type):
        return await self.ai.embed_image(buffer, mime_type)

    async def embed_product_text(self, product):
        return (await self.ai.embed_texts([build_product_text(product)]))[0]

    async def embed_product_image(self, product):
        url = urlparse(product["imageUrl"])
        if url.scheme not in {"http", "https"}:
            raise HttpError(400, "URL ảnh phải dùng http hoặc https", "INVALID_IMAGE")
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True, headers={"accept": "image/*", "user-agent": "ttnt-indexer/2.0"}) as client:
                async with client.stream("GET", product["imageUrl"]) as response:
                    if response.status_code >= 400:
                        raise HttpError(502, f"Không tải được ảnh ({response.status_code}): {product['imageUrl']}", "INVALID_IMAGE")
                    mime = response.headers.get("content-type", "").split(";")[0].strip().lower()
                    if not mime.startswith("image/"):
                        raise HttpError(502, f"URL không trả về ảnh ({mime or 'không rõ loại'})", "INVALID_IMAGE")
                    declared = int(response.headers.get("content-length") or 0)
                    if declared > 8 * 1024 * 1024:
                        raise HttpError(502, "Ảnh quá lớn để lập chỉ mục", "INVALID_IMAGE")
                    chunks, size = [], 0
                    async for chunk in response.aiter_bytes():
                        size += len(chunk)
                        if size > 8 * 1024 * 1024:
                            raise HttpError(502, "Ảnh quá lớn để lập chỉ mục", "INVALID_IMAGE")
                        chunks.append(chunk)
            return await self.ai.embed_image(b"".join(chunks), mime)
        except (httpx.HTTPError, TimeoutError) as exc:
            raise HttpError(502, f"Không tải được ảnh: {product['imageUrl']}", "INVALID_IMAGE") from exc


class IndexingService:
    def __init__(self, products, embeddings, logger):
        self.products, self.embeddings, self.logger = products, embeddings, logger

    async def index_one(self, product):
        want_text, want_image = product.get("needsText", True), product.get("needsImage", True)
        results = await asyncio.gather(
            self.embeddings.embed_product_text(product) if want_text else asyncio.sleep(0, result=None),
            self.embeddings.embed_product_image(product) if want_image else asyncio.sleep(0, result=None),
            return_exceptions=True,
        )
        failures = [x for x in results if isinstance(x, Exception)]
        if len(failures) == int(want_text) + int(want_image):
            raise failures[0]
        for failure in failures:
            self.logger.warning("Partial embedding failure for product %s: %s", product["id"], failure)
        await self.products.update_embeddings(product["id"], results[0] if not isinstance(results[0], Exception) else None,
                                              results[1] if not isinstance(results[1], Exception) else None)
        return not failures

    async def reindex_missing(self, batch_size=20, concurrency=1):
        indexed, failed_ids = 0, []
        while True:
            batch = await self.products.find_needing_embeddings(batch_size, failed_ids)
            if not batch:
                break
            for start in range(0, len(batch), max(1, concurrency)):
                chunk = batch[start:start + max(1, concurrency)]
                results = await asyncio.gather(*(self.index_one(p) for p in chunk), return_exceptions=True)
                for product, result in zip(chunk, results):
                    if not isinstance(result, Exception) and result is True:
                        indexed += 1
                    elif not isinstance(result, Exception):
                        # index_one() may have saved one modality; query the row again to retry the missing one.
                        # On the next pass, a failure of that sole remaining modality raises and is excluded.
                        continue
                    elif getattr(result, "code", None) == "AI_UNAVAILABLE":
                        raise result
                    else:
                        failed_ids.append(product["id"])
                        self.logger.warning("Indexing failed for product %s: %s", product["id"], result)
            self.logger.info("Index progress indexed=%d failed=%d", indexed, len(failed_ids))
        return {"indexed": indexed, "failed": len(failed_ids)}

    async def reindex_in_background(self, attempts=40, delay_seconds=5):
        for attempt in range(1, attempts + 1):
            try:
                result = await self.reindex_missing()
                if result["indexed"] or result["failed"]:
                    self.logger.info("Background indexing complete: %s", result)
                return result
            except Exception as exc:
                if getattr(exc, "code", None) != "AI_UNAVAILABLE":
                    self.logger.exception("Background indexing failed")
                    return None
                self.logger.info("AI unavailable; retry indexing %s/%s", attempt, attempts)
                await asyncio.sleep(delay_seconds)
        self.logger.warning("Background indexing skipped; run `python -m app.cli reindex` later")
        return None


class ProductService:
    def __init__(self, products, indexing, logger):
        self.products, self.indexing, self.logger = products, indexing, logger

    async def list(self, category=None, limit=DEFAULT_PAGE_SIZE, offset=0):
        result = await self.products.list(category, limit, offset)
        return {**result, "limit": limit, "offset": offset}

    async def get(self, product_id):
        item = await self.products.find_by_id(product_id)
        if not item:
            raise not_found("Không tìm thấy sản phẩm")
        return item

    async def categories(self):
        return await self.products.list_categories()

    async def create(self, input_data):
        created = await self.products.insert(input_data)
        indexed = False
        try:
            indexed = await self.indexing.index_one(created)
        except Exception as exc:
            self.logger.warning("Saved product %s without full indexing: %s", created["id"], exc)
        return {"item": await self.products.find_by_id(created["id"]) or created, "indexed": indexed}

    async def remove(self, product_id):
        if not await self.products.remove(product_id):
            raise not_found("Không tìm thấy sản phẩm")


class SearchService:
    def __init__(self, products, history, embeddings, logger, config):
        self.products, self.history, self.embeddings, self.logger, self.config = products, history, embeddings, logger, config

    async def _record(self, client_id, kind, query, category, count, embedding):
        if not client_id:
            return
        try:
            await self.history.record(client_id, kind, query, category, count, embedding)
        except Exception:
            self.logger.warning("Could not record search history", exc_info=True)

    async def search_text(self, query, category=None, limit=DEFAULT_SEARCH_LIMIT, client_id=None, rerank=True):
        text = query.strip()
        tsquery = to_tsquery(text)
        embedding = None
        try:
            embedding = await self.embeddings.embed_query(text)
        except Exception as exc:
            if getattr(exc, "code", None) != "AI_UNAVAILABLE":
                raise
            self.logger.warning("AI unavailable; falling back to keyword search")
        pool = min(100, limit * 2) if rerank else limit
        if embedding:
            items = await self.products.search_hybrid(embedding, tsquery, category, pool, self.config.text_min_similarity)
        else:
            items = await self.products.search_keyword(tsquery, category, pool)
        if rerank:
            items = rank_by_match_and_rating(items, self.config.text_image_weight)[:limit]
        await self._record(client_id, "text", text, category, len(items), embedding)
        return {"items": items, "count": len(items), "mode": "hybrid" if embedding else "keyword", "query": text}

    async def search_image(self, buffer, mime_type, category=None, limit=DEFAULT_SEARCH_LIMIT, client_id=None):
        embedding = await self.embeddings.embed_uploaded_image(buffer, mime_type)
        found = await self.products.search_by_image(embedding, category, min(100, limit * 2), self.config.image_min_similarity)
        items = rank_by_match_and_rating(found)[:limit]
        await self._record(client_id, "image", "", category, len(items), None)
        return {"items": items, "count": len(items)}


class HistoryService:
    def __init__(self, history):
        self.history = history

    async def recent(self, client_id, limit=10):
        return await self.history.recent(client_id, limit) if client_id else []

    async def clear(self, client_id):
        if client_id:
            await self.history.clear(client_id)


class EventService:
    def __init__(self, events):
        self.events = events

    async def record(self, client_id, body):
        kind = body.get("kind", "browse")
        query = body.get("query", "").strip()[:250] if kind == "text" else ""
        if kind == "text" and not query:
            kind = "browse"
        return await self.events.record(client_id, kind, query, body["productId"], body.get("position"), body.get("event", "click"))


def _minmax_map(pool, score_map):
    values = [score_map[p["id"]] for p in pool if p["id"] in score_map]
    if not values:
        return None
    lo, hi = min(values), max(values)
    return lambda v: (v - lo) / (hi - lo) if hi > lo else 1.0


def rank_products(pool, query="", text_rank=None, taste=None, interests=None, viewed_categories=None,
                  viewed_count=0, budget_active=False, history_taste=None, history_query=""):
    taste, interests, viewed_categories = taste or {}, interests or [], viewed_categories or {}
    taste_norm = _minmax_map(pool, taste)
    history_norm = _minmax_map(pool, history_taste or {})
    ranked = []
    for p in pool:
        text_score = (text_rank or {}).get(p["id"], 0)
        signals = []
        if taste_norm and p["id"] in taste:
            signals.append(taste_norm(taste[p["id"]]))
        history_score = history_norm(history_taste[p["id"]]) if history_norm and p["id"] in (history_taste or {}) else None
        if history_score is not None:
            signals.append(history_score)
        taste_score = sum(signals) / len(signals) if signals else 0
        interest = int(p.get("category") in interests)
        viewed_cat = viewed_categories.get(p.get("category"), 0) / viewed_count if viewed_count else 0
        rating = p.get("rating")
        popular = rating_score(rating) if text_rank is not None else (rating / 5 if rating else 0.5)
        if text_rank is not None:
            weights = {"text": .6, "taste": .07, "interest": .05, "viewedCategory": .03, "popular": .25}
        elif history_norm:
            weights = {"text": 0, "taste": .4, "interest": .15, "viewedCategory": .1, "popular": .2}
        else:
            weights = {"text": .4, "taste": .2, "interest": .15, "viewedCategory": .1, "popular": .15}
        score = weights["text"] * text_score + weights["taste"] * taste_score + weights["interest"] * interest + weights["viewedCategory"] * viewed_cat + weights["popular"] * popular
        reason = "Gợi ý cho bạn"
        if rating is not None and rating >= 4.7:
            reason = "Được đánh giá cao"
        if budget_active:
            reason = "Hợp ngân sách của bạn"
        if interest:
            reason = f"Vì bạn quan tâm {p['category']}"
        if taste_score >= .75:
            reason = "Giống sản phẩm bạn đã xem"
        if history_score is not None and history_score >= .75 and text_rank is None:
            reason = f"Dựa trên tìm kiếm “{history_query}”"
        if text_rank is not None:
            reason = f"Khớp từ khóa “{query}”"
        ranked.append({**p, "score": round(score, 4), "reason": reason})
    return sorted(ranked, key=lambda p: (-p["score"], p["id"]))


class RecommendService:
    def __init__(self, products, search, history, text_image_weight=0):
        self.products, self.search, self.history, self.text_image_weight = products, search, history, text_image_weight

    async def recommend(self, body, client_id):
        query = body.get("query", "").strip()
        category = body.get("category")
        viewed_ids = body.get("viewedIds", [])
        viewed = set(viewed_ids)
        text_rank, history_taste, based_on = None, None, []
        if query:
            found = await self.search.search_text(query, category, 200, client_id, rerank=False)
            pool, mode = found["items"], found["mode"]
            text_rank = relevance_scores(pool, self.text_image_weight)
        else:
            pool = [p for p in await self.products.list_for_ranking(category) if p["id"] not in viewed]
            recent = await self.history.recent_text_queries(client_id, 20) if client_id else []
            taste = taste_from_history(recent)
            if taste:
                history_taste = await self.products.similarity_to_vector(taste["embedding"], category)
                based_on = taste["queries"]
            mode = "personalized" if viewed_ids or body.get("interests") or taste else "browse"
        budget = body.get("budget", "any")
        budget_range = BUDGETS.get(budget)
        if budget_range:
            pool = [p for p in pool if p.get("price") is not None and budget_range[0] <= p["price"] < budget_range[1]]
        if viewed_ids:
            taste_map, viewed_products = await asyncio.gather(self.products.similarity_to_taste(viewed_ids, category), self.products.find_by_ids(viewed_ids))
        else:
            taste_map, viewed_products = {}, []
        viewed_categories = dict(Counter(p["category"] for p in viewed_products))
        ranked = rank_products(pool, query, text_rank, taste_map, body.get("interests", []), viewed_categories,
                               len(viewed_products), bool(budget_range), history_taste, based_on[0] if based_on else "")
        sort = body.get("sort", "relevance")
        if sort == "priceAsc":
            ranked.sort(key=lambda p: (p.get("price") is None, p.get("price") if p.get("price") is not None else math.inf, -p["score"], p["id"]))
        elif sort == "priceDesc":
            ranked.sort(key=lambda p: (p.get("price") is None, -(p.get("price") or 0), -p["score"], p["id"]))
        elif sort == "rating":
            ranked.sort(key=lambda p: (p.get("rating") is None, -(p.get("rating") or 0), -p["score"], p["id"]))
        offset, limit = body.get("offset", 0), body.get("limit", 96)
        return {"items": ranked[offset:offset + limit], "total": len(ranked), "mode": mode, "basedOn": based_on}


class RecommendationService:
    def __init__(self, products, history):
        self.products, self.history = products, history

    async def for_client(self, client_id, limit=8):
        recent, trending = await asyncio.gather(
            self.history.recent_text_queries(client_id, 20) if client_id else asyncio.sleep(0, result=[]),
            self.history.popular_queries(6),
        )
        taste = taste_from_history(recent, 5)
        if taste:
            found = await self.products.find_nearest_by_text(taste["embedding"], limit * 2)
            return {"strategy": "personalized", "basedOn": taste["queries"], "items": rank_by_match_and_rating(found)[:limit], "trendingQueries": trending}
        return {"strategy": "latest", "basedOn": [], "items": await self.products.find_latest(limit), "trendingQueries": trending}

    async def similar_to(self, product_id, limit=6):
        if not await self.products.find_by_id(product_id):
            raise not_found("Không tìm thấy sản phẩm")
        return await self.products.find_similar(product_id, limit)


class HealthService:
    def __init__(self, pool, ai):
        self.pool, self.ai = pool, ai

    async def check(self, deep: bool = False):
        """deep=True: với Jina gọi thật một embedding nhỏ để xác nhận khóa API và hạn mức (tốn vài token)."""
        try:
            async with self.pool.connection() as conn:
                await conn.execute("SELECT 1")
            database = "up"
        except Exception:
            database = "down"
        provider = getattr(self.ai, "provider", "unknown")
        ai_error = None
        try:
            await (self.ai.probe() if deep else self.ai.health())
            ai_status = "up"
        except Exception as exc:
            ai_status = "down"
            ai_error = getattr(exc, "message", None) or "Không kết nối được dịch vụ AI"
        status = "error" if database == "down" else "degraded" if ai_status == "down" else "ok"
        result = {"status": status, "services": {"database": database, "ai": ai_status}, "provider": provider}
        if ai_status == "down":
            result["aiError"] = ai_error
            if provider == "local":
                result["hint"] = ("Backend đang chạy EMBEDDING_PROVIDER=local nên gọi AI Service tự host. "
                                  "Nếu không có AI Service (ví dụ trên Render free), đặt EMBEDDING_PROVIDER=jina và JINA_API_KEY.")
        return result


class StatsService:
    """Thống kê hành vi người dùng để đo chất lượng tìm kiếm và gợi ý (dùng cho báo cáo và cải thiện mô hình)."""

    CLICK_WINDOW_MINUTES = 5   # cú bấm trong 5 phút sau khi tìm mới tính cho lượt tìm đó
    MAX_POSITION_BUCKET = 10   # vị trí thứ 11 trở đi gộp thành một nhóm "11+"
    MIN_SEARCHES_FOR_ZERO_CLICK = 2

    def __init__(self, stats):
        self.stats = stats

    @staticmethod
    def _ratio(part, total):
        """Tỉ lệ làm tròn 4 chữ số; None khi chưa có dữ liệu (tránh chia cho 0 và tránh hiểu nhầm là 0%)."""
        return round(part / total, 4) if total else None

    async def summary(self, days=30, limit=10):
        searches = await self.stats.search_summary(days, self.CLICK_WINDOW_MINUTES)
        counts = await self.stats.event_counts(days)
        buckets, mrr = await self.stats.click_positions(days, self.MAX_POSITION_BUCKET)
        top_products = await self.stats.top_clicked_products(days, limit)
        zero_click = await self.stats.zero_click_queries(days, self.CLICK_WINDOW_MINUTES, self.MIN_SEARCHES_FOR_ZERO_CLICK, limit)

        by_kind = {"text": 0, "image": 0, "browse": 0}
        by_event = {"click": 0, "like": 0, "dislike": 0}
        for kind, event, n in counts:
            by_event[event] = by_event.get(event, 0) + n
            if event == "click":
                by_kind[kind] = by_kind.get(kind, 0) + n

        positioned = sum(n for _, n in buckets)
        distribution = [
            {"position": f"{self.MAX_POSITION_BUCKET + 1}+" if bucket >= self.MAX_POSITION_BUCKET else bucket + 1,
             "clicks": n, "share": self._ratio(n, positioned)}
            for bucket, n in buckets
        ]
        top3 = sum(n for bucket, n in buckets if bucket < 3)

        return {
            "days": days,
            "searches": {
                "total": searches["total"],
                "withClick": searches["with_click"],
                "clickThroughRate": self._ratio(searches["with_click"], searches["total"]),
            },
            "events": {
                "clicks": by_event["click"],
                "likes": by_event["like"],
                "dislikes": by_event["dislike"],
                "clicksByKind": by_kind,
            },
            "positions": {
                "distribution": distribution,
                "top3Share": self._ratio(top3, positioned),
                "meanReciprocalRank": round(mrr, 4) if mrr is not None else None,
            },
            "topProducts": top_products,
            "zeroClickQueries": zero_click,
        }


class ReviewService:
    """Đánh giá của khách hàng cho từng sản phẩm."""

    def __init__(self, reviews, products):
        self.reviews, self.products = reviews, products

    async def list_for_product(self, product_id, limit=10, offset=0):
        if not await self.products.find_by_id(product_id):
            raise not_found("Không tìm thấy sản phẩm")
        result = await self.reviews.list_for_product(product_id, limit, offset)
        return {**result, "limit": limit, "offset": offset}
