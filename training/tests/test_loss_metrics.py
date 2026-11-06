import numpy as np
import torch

from clipft.loss import clip_loss, init_logit_scale
from clipft.metrics import precision_at_k, recall_at_k, retrieval_report


def unit(x):
    return x / np.linalg.norm(x, axis=1, keepdims=True)


def test_loss_thap_khi_cap_khop_va_cao_khi_bi_xao_tron():
    torch.manual_seed(0)
    z = torch.nn.functional.normalize(torch.randn(16, 32), dim=-1)
    scale = init_logit_scale(50.0)
    good = clip_loss(z, z, scale).item()
    shuffled = clip_loss(z, z[torch.randperm(16).roll(1)], scale).item()
    assert good < 0.05 and shuffled > good + 1


def test_loss_khong_phat_ban_trung_trong_cung_nhom():
    # hai cặp giống hệt nhau (cùng nhóm): không có mask thì loss ~ log 2 mỗi chiều, có mask thì về ~0
    z = torch.nn.functional.normalize(torch.randn(4, 8), dim=-1)
    z = torch.cat([z, z[:1]])  # dòng 4 trùng dòng 0
    scale = init_logit_scale(100.0)
    without = clip_loss(z, z, scale).item()
    with_mask = clip_loss(z, z, scale, keys=torch.tensor([0, 1, 2, 3, 0])).item()
    assert without > 0.1 and with_mask < 0.01


def test_loss_co_gradient_va_chi_so_nhiet_do_hoc_duoc():
    a = torch.randn(6, 8, requires_grad=True)
    b = torch.randn(6, 8, requires_grad=True)
    s = init_logit_scale()
    clip_loss(a, b, s, torch.arange(6)).backward()
    assert a.grad is not None and b.grad is not None and s.grad is not None and torch.isfinite(a.grad).all()


def test_recall_va_precision_tinh_tay():
    sims = np.array([[0.9, 0.1, 0.5], [0.2, 0.3, 0.8]])
    keys = np.array([0, 1])  # hàng 0 đúng ở cột 0; hàng 1 đúng ở cột 1
    col = np.array([0, 1, 2])
    assert recall_at_k(sims, keys, col, 1) == 0.5  # hàng 0 trúng ở top-1; hàng 1 top-1 là cột 2
    assert recall_at_k(sims, keys, col, 2) == 1.0
    rel = np.array([[1, 0, 1], [0, 0, 1]], dtype=np.float32)
    assert precision_at_k(sims, rel, 2) == 0.75  # hàng 0 top2 = {0,2} -> 1.0; hàng 1 top2 = {2,1} -> 0.5


def test_report_diem_hoan_hao_va_ngau_nhien():
    rng = np.random.default_rng(0)
    n, d = 60, 16
    cats = np.repeat(np.arange(3), 20)
    centers = unit(rng.normal(size=(3, d)))
    img = unit(centers[cats] + 0.05 * rng.normal(size=(n, d)))
    txt = unit(img + 0.01 * rng.normal(size=(n, d)))
    keys = np.arange(n)
    perfect = retrieval_report(img, txt, keys, cats, unit(centers), np.arange(3))
    assert perfect["t2i_R@5"] > 0.9 and perfect["i2i_P@10"] > 0.95 and perfect["q2i_P@10"] == 1.0
    noise = retrieval_report(unit(rng.normal(size=(n, d))), unit(rng.normal(size=(n, d))), keys, cats)
    assert noise["t2i_R@1"] < 0.15 and noise["i2i_P@10"] < 0.5 and perfect["score"] > noise["score"] + 0.4


def test_i2i_khong_tinh_ban_trung_la_ket_qua():
    img = unit(np.array([[1, 0], [1, 0.0001], [0, 1], [0, 1.0001]]))
    keys = np.array([0, 0, 1, 1])  # cặp (0,1) và (2,3) là bản trùng của nhau
    cats = np.array([0, 0, 1, 1])
    r = retrieval_report(img, img, keys, cats)
    # nếu bản trùng bị tính, i2i sẽ ~ 1.0 chỉ nhờ nó; khi loại ra, các kết quả còn lại khác danh mục => 0
    assert r["i2i_P@10"] == 0.0
