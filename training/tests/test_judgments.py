import numpy as np
import pytest

from clipft.judgments import judgment_metrics, load_judgments


def test_xep_hang_hoan_hao_va_te_nhat():
    ids = [10, 20, 30, 40]
    perfect = np.array([[0.9, 0.1, 0.2, 0.3]])  # sản phẩm 10 đứng đầu
    worst = np.array([[0.1, 0.2, 0.3, 0.9]])  # sản phẩm 10 đứng cuối
    good = judgment_metrics(perfect, ids, [{10: 3}], k=2)
    bad = judgment_metrics(worst, ids, [{10: 3}], k=2)
    assert good["ndcg@2"] == good["recall@2"] == good["mrr"] == good["hit@1"] == 1.0
    assert bad["ndcg@2"] == bad["recall@2"] == bad["hit@1"] == 0.0
    assert bad["mrr"] == pytest.approx(0.25)


def test_ndcg_thuong_khi_san_pham_dung_nhat_dung_dau():
    ids = [1, 2, 3]
    rel = [{1: 1, 2: 3}]
    best_first = judgment_metrics(np.array([[0.1, 0.9, 0.0]]), ids, rel, k=3)["ndcg@3"]
    weak_first = judgment_metrics(np.array([[0.9, 0.1, 0.0]]), ids, rel, k=3)["ndcg@3"]
    assert best_first == pytest.approx(1.0) and weak_first < best_first


def test_bo_dap_an_khong_con_trong_danh_muc_va_truy_van_khong_con_dap_an():
    ids = [1, 2]
    m = judgment_metrics(np.array([[0.9, 0.1], [0.9, 0.1]]), ids, [{1: 1, 999: 1}, {999: 1}], k=2)
    assert m["queries"] == 1 and m["recall@2"] == 1.0
    with pytest.raises(ValueError):
        judgment_metrics(np.array([[0.9, 0.1]]), ids, [{999: 1}])


def test_load_judgments_gop_theo_truy_van_khong_phan_biet_hoa_thuong(tmp_path):
    f = tmp_path / "j.csv"
    f.write_text("query,product_id,relevance\nÁo  Thun,5,1\náo thun,5,3\náo thun,6,\nxấu,abc,1\n,7,1\nson,8,0\n", encoding="utf8")
    assert load_judgments(f) == {"áo thun": {5: 3, 6: 1}}
