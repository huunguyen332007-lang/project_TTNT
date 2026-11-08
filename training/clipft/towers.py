"""Hai "tháp" mã hóa: bọc SentenceTransformer (đúng định dạng ai_service đang nạp) + chính sách đóng băng.

Mặc định chỉ mở khóa vài lớp cuối: với ~1.4 nghìn cặp huấn luyện, tinh chỉnh toàn bộ gần như chắc chắn gây
overfit và làm mô hình "quên" kiến thức CLIP tổng quát.
"""
from __future__ import annotations

from pathlib import Path

import torch
from torch import nn


def move(features: dict, device) -> dict:
    return {k: (v.to(device) if torch.is_tensor(v) else v) for k, v in features.items()}


def _freeze(module: nn.Module) -> None:
    for p in module.parameters():
        p.requires_grad_(False)


def _unfreeze(module: nn.Module) -> list[tuple[str, nn.Parameter]]:
    named = list(module.named_parameters())
    for _, p in named:
        p.requires_grad_(True)
    return named


def _groups(named: list[tuple[str, nn.Parameter]], lr: float, weight_decay: float) -> list[dict]:
    """Không áp weight decay cho bias và LayerNorm."""
    decay = [p for n, p in named if p.ndim >= 2 and "norm" not in n.lower()]
    plain = [p for n, p in named if not (p.ndim >= 2 and "norm" not in n.lower())]
    return [g for g in ({"params": decay, "lr": lr, "weight_decay": weight_decay}, {"params": plain, "lr": lr, "weight_decay": 0.0}) if g["params"]]


class Tower:
    """Giao diện mà trainer dùng. Test thay bằng tháp giả."""

    module: nn.Module

    def prepare(self, items: list) -> dict:  # chạy trên CPU, an toàn trong DataLoader worker
        raise NotImplementedError

    def forward(self, features: dict) -> torch.Tensor:  # (B, D), chưa chuẩn hóa
        raise NotImplementedError

    def param_groups(self, lr: float, head_lr: float, weight_decay: float) -> list[dict]:
        raise NotImplementedError

    def save(self, path: str | Path) -> None:
        raise NotImplementedError


def _find_layers(auto_model: nn.Module) -> nn.ModuleList:
    for path in ("transformer.layer", "encoder.layer", "layers"):  # DistilBERT, BERT/XLM-R, khác
        obj = auto_model
        try:
            for part in path.split("."):
                obj = getattr(obj, part)
        except AttributeError:
            continue
        if isinstance(obj, nn.ModuleList):
            return obj
    raise ValueError(f"Không tìm thấy danh sách lớp transformer trong {type(auto_model).__name__}")


class STTower(Tower):
    def __init__(self, st, kind: str, unfreeze_layers: int = 2):
        from sentence_transformers.models import Dense

        if kind not in ("image", "text"):
            raise ValueError("kind phải là 'image' hoặc 'text'")
        self.st, self.module, self.kind = st, st, kind
        _freeze(st)
        st.eval()  # luôn ở eval: tắt dropout của DistilBERT cho ổn định; tham số vẫn nhận gradient
        self.body: list[tuple[str, nn.Parameter]] = []
        self.head: list[tuple[str, nn.Parameter]] = []

        n = max(0, unfreeze_layers)
        if kind == "image":
            clip = st[0].model  # transformers.CLIPModel; nửa văn bản của nó không dùng và giữ nguyên
            layers = clip.vision_model.encoder.layers
            for blk in list(layers)[len(layers) - n :]:
                self.body += _unfreeze(blk)
            self.body += _unfreeze(clip.vision_model.post_layernorm)
            self.head += _unfreeze(clip.visual_projection)
        else:
            layers = _find_layers(st[0].auto_model)
            for blk in list(layers)[len(layers) - n :]:
                self.body += _unfreeze(blk)
            for m in st.modules():
                if isinstance(m, Dense):  # lớp chiếu 768 -> 512 vào không gian CLIP
                    self.head += _unfreeze(m)
        if not self.head:
            raise ValueError("Không tìm thấy lớp chiếu cuối để huấn luyện")

    def prepare(self, items):
        return self.st.tokenize(items)

    def forward(self, features):
        return self.st(dict(features))["sentence_embedding"]

    def param_groups(self, lr, head_lr, weight_decay):
        return _groups(self.body, lr, weight_decay) + _groups(self.head, head_lr, weight_decay)

    def trainable_count(self) -> int:
        return sum(p.numel() for _, p in self.body + self.head)

    def save(self, path):
        Path(path).mkdir(parents=True, exist_ok=True)
        self.st.save(str(path))


def load_towers(text_model: str, image_model: str, unfreeze_text: int = 2, unfreeze_image: int = 2, device: str = "cpu"):
    """Nạp từ tên trên HuggingFace hoặc đường dẫn thư mục đã lưu. Trả về (tháp ảnh, tháp văn bản)."""
    from sentence_transformers import SentenceTransformer

    img = STTower(SentenceTransformer(image_model, device=device), "image", unfreeze_image)
    txt = STTower(SentenceTransformer(text_model, device=device), "text", unfreeze_text)
    return img, txt
