from __future__ import annotations

import math

import torch
import torch.nn.functional as F


def clip_loss(img: torch.Tensor, txt: torch.Tensor, logit_scale: torch.Tensor, keys: torch.Tensor | None = None) -> torch.Tensor:
    """InfoNCE hai chiều (ảnh->văn bản và văn bản->ảnh) trên các cặp (ảnh, văn bản) cùng batch.

    logit_scale: tham số log của nhiệt độ nghịch đảo (như CLIP gốc), được exp() và chặn ở 100.
    keys: nhóm của từng cặp. Hai cặp khác nhau nhưng cùng nhóm (sản phẩm đăng trùng) KHÔNG bị coi là mẫu âm của nhau,
    nếu không mô hình sẽ bị phạt vì "không phân biệt được" hai thứ thực chất là một.
    """
    img = F.normalize(img.float(), dim=-1)
    txt = F.normalize(txt.float(), dim=-1)
    logits = logit_scale.exp().clamp(max=100.0) * img @ txt.t()
    if keys is not None:
        same = keys[:, None] == keys[None, :]
        same &= ~torch.eye(len(keys), dtype=torch.bool, device=keys.device)
        logits = logits.masked_fill(same, float("-inf"))
    target = torch.arange(len(img), device=img.device)
    return (F.cross_entropy(logits, target) + F.cross_entropy(logits.t(), target)) / 2


def init_logit_scale(value: float = 50.0) -> torch.nn.Parameter:
    """CLIP gốc học nhiệt độ tới ~100; bắt đầu ở 50 vì hai tháp đã được căn chỉnh sẵn."""
    return torch.nn.Parameter(torch.tensor(math.log(value)))
