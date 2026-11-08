"""Chạy thật hai script dòng lệnh: prepare_data.py (với máy chủ ảnh cục bộ) và finetune_clip.py (với mô hình thu nhỏ)."""
import csv
import functools
import http.server
import json
import subprocess
import sys
import threading
from pathlib import Path

import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
COLORS = {"red": (220, 30, 30), "green": (30, 200, 60), "blue": (30, 60, 220), "yellow": (230, 220, 40)}


def run(*args):
    return subprocess.run([sys.executable, *args], cwd=ROOT, capture_output=True, text=True, timeout=600)


@pytest.fixture()
def image_server(tmp_path):
    (tmp_path / "www").mkdir()
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(tmp_path / "www"))
    handler.log_message = lambda *a, **k: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield tmp_path / "www", f"http://127.0.0.1:{srv.server_port}"
    srv.shutdown()


def test_prepare_data_tai_anh_chia_tap_va_bo_dong_loi(tmp_path, image_server):
    www, base = image_server
    header = ["Tên sản phẩm", "Giá", "Đánh giá", "URL", "Hình ảnh", "Nhãn sản phẩm"]
    rows = []
    for i in range(270):
        color, rgb = list(COLORS.items())[i % 4]
        Image.new("RGB", (48, 48), rgb).save(www / f"p{i}.png")
        # i = 5 có ảnh 404; i = 6,7 dùng chung một ảnh nhưng khác danh mục -> bị loại là ảnh gán nhầm
        img = f"{base}/missing.png" if i == 5 else (f"{base}/p6.png" if i == 7 else f"{base}/p{i}.png")
        rows.append([f"{color} áo số {i}", "10.000₫", "4.5", f"https://shopee.vn/sp-i.1.{i}?x=1", img, "Áo thời trang" if i != 7 else "Son môi"])
    csv_path = tmp_path / "sp.csv"
    with open(csv_path, "w", newline="", encoding="utf8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    cmap = tmp_path / "map.json"
    cmap.write_text(json.dumps({"Áo thời trang": "Thời trang", "Son môi": "Làm đẹp"}), encoding="utf8")

    out = tmp_path / "data"
    r = run("prepare_data.py", "--csv", str(csv_path), "--map", str(cmap), "--out", str(out), "--workers", "4")
    assert r.returncode == 0, r.stdout + r.stderr
    manifest = [json.loads(l) for l in open(out / "manifest.jsonl", encoding="utf8")]
    summary = json.loads((out / "summary.json").read_text(encoding="utf8"))
    ids = {m["source_url"] for m in manifest}
    assert "https://shopee.vn/sp-i.1.5" not in ids, "ảnh 404 phải bị loại"
    assert "https://shopee.vn/sp-i.1.7" not in ids and "https://shopee.vn/sp-i.1.6" not in ids, "ảnh dùng chung giữa 2 danh mục bị loại cả hai"
    assert summary["failed"] == 1 and summary["cleaning"]["conflicting_image"] == 2
    assert len(manifest) == 270 - 3
    assert all((out / m["image_path"]).stat().st_size > 0 and m["split"] in ("train", "val", "test") for m in manifest)
    assert Image.open(out / manifest[0]["image_path"]).format == "JPEG"
    # chạy lại không tải lại và cho cùng kết quả
    r2 = run("prepare_data.py", "--csv", str(csv_path), "--map", str(cmap), "--out", str(out))
    assert r2.returncode == 0
    assert [json.loads(l)["split"] for l in open(out / "manifest.jsonl", encoding="utf8")] == [m["split"] for m in manifest]


def test_finetune_cli_toan_tuyen(tmp_path, tiny_text_model, tiny_image_model):
    import random

    rng = random.Random(1)
    data = tmp_path / "data"
    (data / "images").mkdir(parents=True)
    rows, gid = [], 0
    for color, rgb in COLORS.items():
        for item, cat in (("shirt", "Thời trang"), ("shoe", "Giày dép"), ("bag", "Túi")):
            for k in range(30):
                Image.new("RGB", (40, 40), tuple(max(0, min(255, c + rng.randint(-25, 25))) for c in rgb)).save(data / f"images/{gid}.png")
                rows.append({"id": str(gid), "title": f"{color} {item}", "label": item, "category": cat, "tag": item,
                             "image_path": f"images/{gid}.png", "group": gid, "split": {8: "test", 9: "val"}.get(k % 10, "train")})
                gid += 1
    (data / "manifest.jsonl").write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows), encoding="utf8")

    out = tmp_path / "out"
    r = run("finetune_clip.py", "--data", str(data), "--out", str(out), "--text-model", tiny_text_model, "--image-model", tiny_image_model,
            "--device", "cpu", "--epochs", "12", "--batch-size", "24", "--lr", "3e-3", "--head-lr", "1e-2",
            "--unfreeze-image-layers", "3", "--unfreeze-text-layers", "3", "--workers", "0", "--patience", "12")
    assert r.returncode == 0, r.stdout[-2000:] + r.stderr[-2000:]
    report = json.loads((out / "report.json").read_text(encoding="utf8"))
    assert (out / "best/text/modules.json").exists() and (out / "best/image/modules.json").exists()
    assert (out / "history.csv").read_text().startswith("epoch,loss,")
    assert report["test_finetuned"]["score"] > report["test_baseline"]["score"] + 0.1, report
    assert "chỉ số" in r.stdout and "t2i_R@5" in r.stdout

    # evaluate.py so sánh gốc và đã tinh chỉnh trên cùng tập test
    ev = run("evaluate.py", "--data", str(data), "--tuned", str(out / "best"), "--device", "cpu",
             "--text-model", tiny_text_model, "--image-model", tiny_image_model)
    assert ev.returncode == 0, ev.stdout[-1500:] + ev.stderr[-1500:]
    assert "chênh" in ev.stdout and "t2i_R@5" in ev.stdout
