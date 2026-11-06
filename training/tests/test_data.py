from collections import defaultdict

from clipft.data import assign_groups, build_product_text, load_products, split_rows


def test_lam_sach_dung_so_lieu_cua_backend():
    rows, stats = load_products()
    assert stats == {"input": 1784, "invalid": 0, "duplicate_url": 0, "conflicting_image": 28, "duplicate_listing": 11, "kept": 1745}
    assert len(rows) == 1745
    assert len({r["source_url"] for r in rows}) == 1745
    assert all(len(set(r["image_url"] for r in rows if r["image_url"] == u)) == 1 for u in {r["image_url"] for r in rows[:50]})


def test_van_ban_nhung_giong_backend():
    assert build_product_text("Giày A", "Giày dép", "Giày thể thao") == "Giày A. Giày dép. Giày thể thao"
    assert build_product_text("Son", "Làm đẹp", "") == "Son. Làm đẹp"  # nhãn rỗng bị bỏ, không có dấu chấm thừa


def test_chia_tap_theo_nhom_khong_ro_ri():
    rows, _ = load_products()
    assign_groups(rows)
    split_rows(rows, seed=1)
    splits = defaultdict(set)
    for r in rows:
        splits[r["group"]].add(r["split"])
    assert all(len(s) == 1 for s in splits.values()), "một nhóm (ảnh/tiêu đề trùng) nằm ở nhiều tập => rò rỉ"
    counts = {s: sum(r["split"] == s for r in rows) for s in ("train", "val", "test")}
    assert counts["val"] > 120 and counts["test"] > 120 and counts["train"] > 1200
    # danh mục quá nhỏ (Thể thao: 4 sản phẩm) chỉ nằm ở train
    assert {r["split"] for r in rows if r["category"] == "Thể thao"} == {"train"}


def test_chia_tap_tai_lap_duoc_theo_seed():
    a, _ = load_products(); assign_groups(a); split_rows(a, seed=7)
    b, _ = load_products(); assign_groups(b); split_rows(b, seed=7)
    c, _ = load_products(); assign_groups(c); split_rows(c, seed=8)
    assert [r["split"] for r in a] == [r["split"] for r in b]
    assert [r["split"] for r in a] != [r["split"] for r in c]


def test_nhom_gom_anh_dung_chung_va_tieu_de_trung():
    rows = [
        {"image_url": "i1", "title": "A"}, {"image_url": "i1", "title": "B"},  # chung ảnh
        {"image_url": "i2", "title": "b"},  # cùng tiêu đề (không phân biệt hoa thường) với dòng 2 -> nối chuỗi
        {"image_url": "i3", "title": "C"},
    ]
    assign_groups(rows)
    assert rows[0]["group"] == rows[1]["group"] == rows[2]["group"] != rows[3]["group"]
