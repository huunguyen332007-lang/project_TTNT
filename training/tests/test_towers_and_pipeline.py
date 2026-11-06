import numpy as np
import torch

from clipft.dataset import make_train_loader, random_crop, sample_text
from clipft.evaluation import evaluate_rows
from clipft.loss import clip_loss, init_logit_scale
from clipft.towers import STTower, load_towers, move
from clipft.trainer import TrainConfig, fit


def trainable(tower):
    return {n for n, p in tower.module.named_parameters() if p.requires_grad}


def test_chinh_sach_dong_bang_thap_anh(tiny_text_model, tiny_image_model):
    img, _ = load_towers(tiny_text_model, tiny_image_model, unfreeze_text=1, unfreeze_image=1)
    names = trainable(img)
    assert names, "phải có tham số huấn luyện"
    assert all(("vision_model.encoder.layers.2" in n) or ("post_layernorm" in n) or ("visual_projection" in n) for n in names), names
    # không có gì ở nửa văn bản của CLIP, ở embedding, hay ở các lớp ViT đầu
    assert not any("text_model" in n or "text_projection" in n or "embeddings" in n or "layers.0" in n for n in names)


def test_chinh_sach_dong_bang_thap_van_ban(tiny_text_model, tiny_image_model):
    _, txt = load_towers(tiny_text_model, tiny_image_model, unfreeze_text=2, unfreeze_image=0)
    names = trainable(txt)
    assert any("transformer.layer.2" in n for n in names) and any("transformer.layer.1" in n for n in names)
    assert not any("embeddings" in n or "layer.0" in n for n in names)
    assert any(n.startswith("2.linear") for n in names), "lớp Dense chiếu về 512 chiều phải được huấn luyện"


def test_unfreeze_0_chi_huan_luyen_lop_chieu(tiny_text_model, tiny_image_model):
    img, txt = load_towers(tiny_text_model, tiny_image_model, unfreeze_text=0, unfreeze_image=0)
    assert all("visual_projection" in n or "post_layernorm" in n for n in trainable(img))
    assert all(n.startswith("2.linear") for n in trainable(txt))


def test_forward_va_gradient_chi_cham_tham_so_duoc_mo(tiny_text_model, tiny_image_model, synthetic_rows):
    rows, root = synthetic_rows
    img, txt = load_towers(tiny_text_model, tiny_image_model, unfreeze_text=1, unfreeze_image=1)
    from PIL import Image

    ie = img.forward(img.prepare([Image.open(root / r["image_path"]).convert("RGB") for r in rows[:4]]))
    te = txt.forward(txt.prepare([r["title"] for r in rows[:4]]))
    assert ie.shape == (4, 16) and te.shape == (4, 16)
    clip_loss(ie, te, init_logit_scale(), torch.arange(4)).backward()
    for tower in (img, txt):
        with_grad = {n for n, p in tower.module.named_parameters() if p.grad is not None and p.grad.abs().sum() > 0}
        assert with_grad and with_grad <= trainable(tower), "gradient chỉ được rơi vào tham số đã mở khóa"


def test_luu_va_nap_lai_cho_cung_embedding(tiny_text_model, tiny_image_model, tmp_path):
    img, txt = load_towers(tiny_text_model, tiny_image_model)
    for p in txt.module.parameters():  # làm khác mô hình gốc để chắc chắn đang so bản đã lưu
        p.data.add_(0.01)
    txt.save(tmp_path / "text")
    _, txt2 = load_towers(str(tmp_path / "text"), tiny_image_model)
    a = txt.forward(txt.prepare(["red shirt", "blue shoe"])).detach().numpy()
    b = txt2.forward(txt2.prepare(["red shirt", "blue shoe"])).detach().numpy()
    assert np.allclose(a, b, atol=1e-5)
    # ai_service nạp bằng SentenceTransformer(path).encode(...): cũng phải ra cùng kết quả
    from sentence_transformers import SentenceTransformer

    c = SentenceTransformer(str(tmp_path / "text")).encode(["red shirt", "blue shoe"], normalize_embeddings=False)
    assert np.allclose(a, c, atol=1e-5)


def test_sample_text_va_random_crop():
    import random

    row = {"title": "Giày thể thao nam thoáng khí siêu nhẹ", "category": "Giày dép", "tag": "Giày thể thao"}
    rng = random.Random(0)
    seen = {sample_text(row, rng) for _ in range(200)}
    assert "Giày thể thao nam thoáng khí siêu nhẹ. Giày dép. Giày thể thao" in seen and row["title"] in seen
    assert any(0 < len(s.split()) <= 6 and s != row["title"] for s in seen)
    from PIL import Image

    for _ in range(50):
        w, h = random_crop(Image.new("RGB", (100, 80)), rng).size
        assert 0.6 * 100 <= w <= 100 and 0.6 * 80 <= h <= 80


def test_huan_luyen_toan_tuyen_tren_mo_hinh_that_thu_nho(tiny_text_model, tiny_image_model, synthetic_rows, tmp_path):
    """Đi qua đúng đường chạy thật: SentenceTransformer -> DataLoader -> fit -> lưu -> nạp lại.
    Điểm kiểm: điểm val phải tăng rõ so với mô hình ngẫu nhiên ban đầu và checkpoint nạp lại cho điểm y hệt."""
    rows, root = synthetic_rows
    split = {s: [r for r in rows if r["split"] == s] for s in ("train", "val", "test")}
    torch.manual_seed(0)
    img, txt = load_towers(tiny_text_model, tiny_image_model, unfreeze_text=3, unfreeze_image=3)
    loader = make_train_loader(split["train"], root, img, txt, batch_size=24, workers=0, seed=0)
    evaluate = lambda subset: (lambda: evaluate_rows(img, txt, split[subset], root, "cpu"))

    best = tmp_path / "best"
    result = fit(
        img, txt, loader, evaluate("val"),
        TrainConfig(epochs=25, lr=3e-3, head_lr=1e-2, patience=25, warmup_frac=0.1), "cpu",
        save_best=lambda: (txt.save(best / "text"), img.save(best / "image")), log=lambda *_: None,
    )
    assert result["saved"] and result["best_score"] > result["baseline_score"] + 0.15, result
    assert result["history"][0]["epoch"] == 0 and len(result["history"]) >= 2

    img2, txt2 = load_towers(str(best / "text"), str(best / "image"))
    reloaded = evaluate_rows(img2, txt2, split["val"], root, "cpu")
    assert abs(reloaded["score"] - result["best_score"]) < 1e-4, "checkpoint nạp lại phải cho đúng điểm lúc lưu"
    # và tổng quát hóa sang tập test chưa từng thấy
    test_after = evaluate_rows(img2, txt2, split["test"], root, "cpu")
    assert test_after["t2i_R@5"] > 0.5


def test_khong_luu_gi_neu_khong_epoch_nao_tot_hon_goc(tiny_text_model, tiny_image_model, synthetic_rows):
    rows, root = synthetic_rows
    train = [r for r in rows if r["split"] == "train"]
    img, txt = load_towers(tiny_text_model, tiny_image_model)
    loader = make_train_loader(train, root, img, txt, batch_size=24)
    saved = []
    fixed = {"score": 0.99}  # điểm val "không bao giờ" cải thiện
    result = fit(img, txt, loader, lambda: fixed, TrainConfig(epochs=3, patience=2), "cpu", save_best=lambda: saved.append(1), log=lambda *_: None)
    assert result["saved"] is False and saved == []
    assert len(result["history"]) == 1 + 2, "phải dừng sớm sau `patience` epoch không cải thiện"
