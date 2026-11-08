import pytest

from app.utils import to_vector_literal, parse_vector, mean_vector, to_tsquery, rating_score, rank_by_match_and_rating, taste_from_history
from app.importer import parse_price, parse_rating, canonical_url, parse_rows, clean_rows


def test_vector_and_text_helpers():
    vector = [1.0] * 512
    assert to_vector_literal(vector).startswith("[1.0,1.0")
    assert parse_vector("[0.1,0.2]") == [0.1, 0.2]
    assert len(mean_vector([[1, 0], [0, 1]])) == 2
    assert to_tsquery("Ghế gỗ, 2026") == "ghế | gỗ | 2026"
    with pytest.raises(TypeError):
        to_vector_literal([1, 2])


def test_ranking_helpers():
    assert rating_score(5) == 1
    items = [{"id": 1, "rating": 4.0, "similarity": .8}, {"id": 2, "rating": 5.0, "similarity": .9}]
    assert rank_by_match_and_rating(items)[0]["id"] == 2
    taste = taste_from_history([{"query": "áo khoác", "embedding": [0, 1]}, {"query": "áo", "embedding": [1, 0]}])
    assert taste["queries"] == ["áo khoác"]


def test_csv_import_helpers():
    assert parse_price("40.900₫ - 52.900₫") == 40900
    assert parse_rating("4,8") == 4.8
    assert canonical_url("https://example.com/item?a=1#x") == "https://example.com/item"
    text = "Tên sản phẩm,Giá,Đánh giá,URL,Hình ảnh,Nhãn sản phẩm\nÁo,40.000₫,4.8,https://x.test/1,https://x.test/a.jpg,Áo thun"
    parsed = parse_rows(text, {"Áo thun": "Thời trang"})
    cleaned = clean_rows(parsed["rows"])
    assert cleaned["rows"][0]["category"] == "Thời trang"
    assert cleaned["stats"]["kept"] == 1


def test_real_seed_data_import_counts_remain_unchanged():
    import json
    from pathlib import Path
    from app.importer import CATEGORY_MAP, DEFAULT_CSV

    category_map = json.loads(Path(CATEGORY_MAP).read_text(encoding="utf-8"))
    parsed = parse_rows(Path(DEFAULT_CSV).read_text(encoding="utf-8"), category_map)
    cleaned = clean_rows(parsed["rows"])
    assert len(parsed["rows"]) == 1784
    assert parsed["invalid"] == []
    assert cleaned["stats"]["conflictingImage"] == 28
    assert cleaned["stats"]["kept"] == 1745
    assert sum(row["price"] is None for row in parsed["rows"]) == 88
    assert len({row["category"] for row in parsed["rows"]}) == 10
