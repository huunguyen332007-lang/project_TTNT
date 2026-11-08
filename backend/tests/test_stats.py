"""Test cho phần thống kê lượt bấm (StatsService + GET /api/admin/stats)."""
import pytest

from app.services import StatsService
from conftest import ADMIN_KEY


class FakeStatsRepository:
    def __init__(self, searches=None, counts=None, buckets=None, mrr=None, top=None, zero=None):
        self.searches = searches or {"total": 0, "with_click": 0}
        self.counts = counts or []
        self.buckets = buckets or []
        self.mrr = mrr
        self.top = top or []
        self.zero = zero or []
        self.calls = {}

    async def search_summary(self, days, window_minutes):
        self.calls["search_summary"] = (days, window_minutes)
        return self.searches

    async def event_counts(self, days):
        return self.counts

    async def click_positions(self, days, max_bucket):
        self.calls["click_positions"] = (days, max_bucket)
        return self.buckets, self.mrr

    async def top_clicked_products(self, days, limit):
        self.calls["top"] = (days, limit)
        return self.top

    async def zero_click_queries(self, days, window_minutes, min_searches, limit):
        self.calls["zero"] = (days, window_minutes, min_searches, limit)
        return self.zero


@pytest.mark.asyncio
async def test_summary_computes_rates_and_groups_events():
    repo = FakeStatsRepository(
        searches={"total": 8, "with_click": 2},
        counts=[("text", "click", 5), ("browse", "click", 3), ("image", "click", 2), ("text", "like", 4), ("browse", "dislike", 1)],
        buckets=[(0, 4), (1, 2), (2, 1), (5, 1), (10, 2)],   # bucket 10 = vị trí 11 trở đi
        mrr=0.61234,
        top=[{"id": 7, "title": "Tai nghe", "category": "Âm thanh", "clicks": 3}],
        zero=[{"query": "áo mưa", "searches": 3, "avgResults": 0}],
    )
    result = await StatsService(repo).summary(days=7, limit=5)

    assert result["days"] == 7
    assert result["searches"] == {"total": 8, "withClick": 2, "clickThroughRate": 0.25}
    assert result["events"] == {
        "clicks": 10, "likes": 4, "dislikes": 1,
        "clicksByKind": {"text": 5, "image": 2, "browse": 3},
    }
    positions = result["positions"]
    assert [d["position"] for d in positions["distribution"]] == [1, 2, 3, 6, "11+"]
    assert positions["distribution"][0] == {"position": 1, "clicks": 4, "share": 0.4}
    assert positions["top3Share"] == 0.7                   # (4 + 2 + 1) / 10
    assert positions["meanReciprocalRank"] == 0.6123
    assert result["topProducts"][0]["id"] == 7
    assert result["zeroClickQueries"][0]["query"] == "áo mưa"
    # Tham số truyền xuống tầng dữ liệu: cửa sổ 5 phút, gộp từ vị trí 11, tối thiểu 2 lượt tìm
    assert repo.calls["search_summary"] == (7, 5)
    assert repo.calls["click_positions"] == (7, 10)
    assert repo.calls["zero"] == (7, 5, 2, 5)
    assert repo.calls["top"] == (7, 5)


@pytest.mark.asyncio
async def test_summary_without_data_returns_none_rates_instead_of_dividing_by_zero():
    result = await StatsService(FakeStatsRepository()).summary()
    assert result["searches"] == {"total": 0, "withClick": 0, "clickThroughRate": None}
    assert result["positions"] == {"distribution": [], "top3Share": None, "meanReciprocalRank": None}
    assert result["events"]["clicks"] == 0
    assert result["topProducts"] == [] and result["zeroClickQueries"] == []


@pytest.mark.asyncio
async def test_stats_endpoint_requires_admin_key_and_validates_params(client):
    assert (await client.get("/api/admin/stats")).status_code == 401
    ok = await client.get("/api/admin/stats?days=7&limit=3", headers={"X-Api-Key": ADMIN_KEY})
    assert ok.status_code == 200
    assert ok.json()["days"] == 7
    assert client.services.calls["stats"] == {"days": 7, "limit": 3}
    default = await client.get("/api/admin/stats", headers={"X-Api-Key": ADMIN_KEY})
    assert client.services.calls["stats"] == {"days": 30, "limit": 10}
    assert default.status_code == 200
    for bad in ("days=0", "days=366", "limit=0", "limit=51", "days=abc"):
        response = await client.get(f"/api/admin/stats?{bad}", headers={"X-Api-Key": ADMIN_KEY})
        assert response.status_code == 400, bad
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"
