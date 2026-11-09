from __future__ import annotations

import math
from dataclasses import dataclass

import torch

from .loss import clip_loss, init_logit_scale
from .towers import move


@dataclass
class TrainConfig:
    epochs: int = 8
    lr: float = 1e-5  # các lớp transformer được mở khóa
    head_lr: float = 1e-4  # lớp chiếu cuối và nhiệt độ
    weight_decay: float = 0.01
    warmup_frac: float = 0.1
    grad_clip: float = 1.0
    patience: int = 3  # dừng sớm nếu val không cải thiện sau chừng này epoch
    min_delta: float = 1e-4
    logit_scale_init: float = 50.0
    amp: bool = False  # fp16 autocast, chỉ nên bật trên GPU


def fit(img_tower, txt_tower, train_loader, evaluate_fn, cfg: TrainConfig, device, save_best=None, log=print):
    """Huấn luyện đối chiếu ảnh-văn bản.

    evaluate_fn() -> dict có khóa 'score' (càng cao càng tốt), gọi trước khi huấn luyện (epoch 0 = mô hình gốc)
    và sau mỗi epoch. save_best() được gọi mỗi khi score vượt mốc tốt nhất TRƯỚC ĐÓ, kể cả mô hình gốc ở epoch 0
    không được lưu: nếu không epoch nào hơn mô hình gốc thì không có gì được lưu và `saved` = False.
    """
    device = torch.device(device)
    img_tower.module.to(device)
    txt_tower.module.to(device)
    # Tạo Parameter TRỰC TIẾP trên thiết bị: Parameter.to('cuda') trả về tensor không phải lá (non-leaf)
    # nên AdamW từ chối ("can't optimize a non-leaf Tensor"). Trên CPU .to() không làm gì nên lỗi này chỉ hiện khi dùng GPU.
    logit_scale = torch.nn.Parameter(init_logit_scale(cfg.logit_scale_init).detach().to(device))

    groups = (
        img_tower.param_groups(cfg.lr, cfg.head_lr, cfg.weight_decay)
        + txt_tower.param_groups(cfg.lr, cfg.head_lr, cfg.weight_decay)
        + [{"params": [logit_scale], "lr": cfg.head_lr, "weight_decay": 0.0}]
    )
    params = [p for g in groups for p in g["params"]]
    opt = torch.optim.AdamW(groups, betas=(0.9, 0.98), eps=1e-6)

    total = max(1, cfg.epochs * len(train_loader))
    warm = max(1, int(total * cfg.warmup_frac))
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lambda s: (s + 1) / warm if s < warm else 0.5 * (1 + math.cos(math.pi * (s - warm) / max(1, total - warm)))
    )
    scaler = torch.amp.GradScaler("cuda", enabled=cfg.amp and device.type == "cuda")
    use_amp = cfg.amp and device.type == "cuda"

    base = evaluate_fn()
    history = [{"epoch": 0, "loss": float("nan"), **base}]
    log(f"epoch 0 (mô hình gốc): score={base['score']:.4f}")
    best_score, best_epoch, bad, saved = base["score"], 0, 0, False

    for epoch in range(1, cfg.epochs + 1):
        running, n = 0.0, 0
        for img_f, txt_f, keys in train_loader:
            img_f, txt_f, keys = move(img_f, device), move(txt_f, device), keys.to(device)
            with torch.autocast(device_type=device.type, dtype=torch.float16, enabled=use_amp):
                ie, te = img_tower.forward(img_f), txt_tower.forward(txt_f)
            loss = clip_loss(ie, te, logit_scale, keys)
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.unscale_(opt)
            torch.nn.utils.clip_grad_norm_(params, cfg.grad_clip)
            scaler.step(opt)
            scaler.update()
            sched.step()
            with torch.no_grad():
                logit_scale.clamp_(max=math.log(100.0))
            running, n = running + float(loss), n + 1

        m = evaluate_fn()
        history.append({"epoch": epoch, "loss": running / max(1, n), **m})
        mark = ""
        if m["score"] > best_score + cfg.min_delta:
            best_score, best_epoch, bad, saved = m["score"], epoch, 0, True
            if save_best:
                save_best()
            mark = "  <- tốt nhất, đã lưu"
        else:
            bad += 1
        log(f"epoch {epoch}: loss={running / max(1, n):.4f} score={m['score']:.4f} (nhiệt độ={logit_scale.exp().item():.1f}){mark}")
        if bad >= cfg.patience:
            log(f"Dừng sớm: {cfg.patience} epoch liên tiếp không cải thiện")
            break
    return {"history": history, "best_epoch": best_epoch, "best_score": best_score, "baseline_score": base["score"], "saved": saved}
