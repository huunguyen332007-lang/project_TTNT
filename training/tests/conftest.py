"""Fixture: mô hình CLIP (ảnh) và DistilBERT (văn bản) THU NHỎ, khởi tạo ngẫu nhiên, dựng cục bộ (không cần mạng)
nhưng đi qua đúng lớp SentenceTransformer / sentence_transformers.models.CLIPModel mà ai_service dùng."""
import json

import pytest
from PIL import Image

COLORS = {"red": (220, 30, 30), "green": (30, 200, 60), "blue": (30, 60, 220), "yellow": (230, 220, 40)}
WORDS = ["red", "green", "blue", "yellow", "shirt", "shoe", "bag", "cap", "xin", "chao", "ao", "giay", "."]
DIM = 16


@pytest.fixture(scope="session")
def tiny_text_model(tmp_path_factory):
    from sentence_transformers import SentenceTransformer, models
    from torch import nn
    from transformers import DistilBertConfig, DistilBertModel, DistilBertTokenizerFast

    d = tmp_path_factory.mktemp("tiny_text_hf")
    vocab = ["[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]"] + WORDS
    (d / "vocab.txt").write_text("\n".join(vocab), encoding="utf8")
    DistilBertTokenizerFast(vocab_file=str(d / "vocab.txt"), do_lower_case=True).save_pretrained(d)
    DistilBertModel(DistilBertConfig(vocab_size=len(vocab), dim=32, n_layers=3, n_heads=2, hidden_dim=64, max_position_embeddings=64)).save_pretrained(d)

    word = models.Transformer(str(d), max_seq_length=32)
    st = SentenceTransformer(modules=[word, models.Pooling(32, "mean"), models.Dense(32, DIM, activation_function=nn.Identity())])
    out = tmp_path_factory.mktemp("tiny_text_st")
    st.save(str(out))
    return str(out)


@pytest.fixture(scope="session")
def tiny_image_model(tmp_path_factory):
    from sentence_transformers import SentenceTransformer
    from sentence_transformers.models import CLIPModel as STCLIP
    from transformers import CLIPConfig, CLIPImageProcessor, CLIPModel, CLIPProcessor, CLIPTextConfig, CLIPTokenizer, CLIPVisionConfig
    from transformers.models.clip.tokenization_clip import bytes_to_unicode

    d = tmp_path_factory.mktemp("tiny_clip_hf")
    chars = list(bytes_to_unicode().values())
    vocab = {t: i for i, t in enumerate(chars + [c + "</w>" for c in chars] + ["<|startoftext|>", "<|endoftext|>"])}
    (d / "vocab.json").write_text(json.dumps(vocab), encoding="utf8")
    (d / "merges.txt").write_text("#version: 0.2\n", encoding="utf8")
    cfg = CLIPConfig.from_text_vision_configs(
        CLIPTextConfig(vocab_size=len(vocab), hidden_size=32, intermediate_size=64, num_hidden_layers=2, num_attention_heads=2, max_position_embeddings=16, eos_token_id=vocab["<|endoftext|>"]),
        CLIPVisionConfig(hidden_size=32, intermediate_size=64, num_hidden_layers=3, num_attention_heads=2, image_size=32, patch_size=16),
        projection_dim=DIM,
    )
    CLIPModel(cfg).save_pretrained(d)
    CLIPProcessor(
        image_processor=CLIPImageProcessor(size={"shortest_edge": 32}, crop_size={"height": 32, "width": 32}),
        tokenizer=CLIPTokenizer(str(d / "vocab.json"), str(d / "merges.txt")),
    ).save_pretrained(d)

    st = SentenceTransformer(modules=[STCLIP(str(d))])
    out = tmp_path_factory.mktemp("tiny_clip_st")
    st.save(str(out))
    return str(out)


@pytest.fixture()
def synthetic_rows(tmp_path):
    """Sản phẩm giả: ảnh là khối màu (có nhiễu), tên chứa tên màu. 4 màu x 3 món đồ, mỗi nhóm = 1 cặp (màu, món)."""
    import random

    rng = random.Random(0)
    (tmp_path / "images").mkdir()
    rows, gid = [], 0
    for color, rgb in COLORS.items():
        for item, cat in (("shirt", "Thời trang"), ("shoe", "Giày dép"), ("bag", "Túi")):
            for k in range(6):
                img = Image.new("RGB", (40, 40), tuple(max(0, min(255, c + rng.randint(-25, 25))) for c in rgb))
                path = f"images/{gid}_{k}.png"
                img.save(tmp_path / path)
                rows.append(
                    {"id": f"{gid}_{k}", "title": f"{color} {item}", "label": item, "category": cat, "tag": item, "image_path": path, "group": gid * 10 + k,
                     "split": "val" if k == 5 else ("test" if k == 4 else "train")}
                )
            gid += 1
    return rows, tmp_path
