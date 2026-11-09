from app.services.embedder import ClipEmbedder
from tests.conftest import DIM, png_bytes


def test_health_ok(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["dim"] == DIM


def test_health_503_while_loading():
    from fastapi.testclient import TestClient

    from app.main import create_app
    from tests.conftest import FakeEmbedder

    loading = FakeEmbedder()
    loading.ready = False
    with TestClient(create_app(embedder=loading)) as c:
        assert c.get("/health").status_code == 503


def test_embed_text_returns_one_vector_per_text(client):
    r = client.post("/embed/text", json={"texts": ["ghế gỗ", "đèn bàn"]})
    assert r.status_code == 200
    body = r.json()
    assert len(body["embeddings"]) == 2
    assert all(len(v) == DIM for v in body["embeddings"])
    assert body["embeddings"][0] != body["embeddings"][1]


def test_embed_text_is_deterministic(client):
    a = client.post("/embed/text", json={"texts": ["ghế"]}).json()["embeddings"][0]
    b = client.post("/embed/text", json={"texts": ["ghế"]}).json()["embeddings"][0]
    assert a == b


def test_embed_text_validation(client):
    assert client.post("/embed/text", json={"texts": []}).status_code == 422
    assert client.post("/embed/text", json={"texts": ["   "]}).status_code == 422
    assert client.post("/embed/text", json={}).status_code == 422

    too_long = client.post("/embed/text", json={"texts": ["a" * 2001]})
    assert too_long.status_code == 400
    assert too_long.json()["detail"]["code"] == "TEXT_TOO_LONG"

    too_many = client.post("/embed/text", json={"texts": ["a"] * 65})
    assert too_many.status_code == 400
    assert too_many.json()["detail"]["code"] == "TOO_MANY_TEXTS"


def test_embed_image_ok(client):
    r = client.post("/embed/image", files={"file": ("a.png", png_bytes(), "image/png")})
    assert r.status_code == 200
    assert len(r.json()["embedding"]) == DIM


def test_embed_image_rejects_wrong_content_type(client):
    r = client.post("/embed/image", files={"file": ("a.txt", b"hello", "text/plain")})
    assert r.status_code == 415
    assert r.json()["detail"]["code"] == "UNSUPPORTED_MEDIA_TYPE"


def test_embed_image_rejects_corrupt_image(client):
    r = client.post("/embed/image", files={"file": ("a.png", b"not an image", "image/png")})
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "INVALID_IMAGE"


def test_embed_image_requires_file(client):
    assert client.post("/embed/image").status_code == 422


def test_error_shape_matches_what_backend_expects(client):
    # Backend Python đọc detail.message; giữ cố định để hai bên không lệch nhau.
    detail = client.post("/embed/image", files={"file": ("a.png", b"x", "image/png")}).json()["detail"]
    assert set(detail) == {"code", "message"}


def test_clip_embedder_decode_handles_modes_and_rejects_garbage():
    """Phần giải mã ảnh của embedder thật không cần torch nên test được trong CI."""
    from io import BytesIO

    import pytest
    from PIL import Image

    from app.services.embedder import InvalidImageError

    emb = ClipEmbedder("t", "i", "cpu", 512, 1_000_000)
    rgba = BytesIO()
    Image.new("RGBA", (10, 10), (1, 2, 3, 0)).save(rgba, format="PNG")
    assert emb._decode(rgba.getvalue()).mode == "RGB"

    palette = BytesIO()
    Image.new("P", (10, 10)).save(palette, format="PNG")
    assert emb._decode(palette.getvalue()).mode == "RGB"

    with pytest.raises(InvalidImageError):
        emb._decode(b"garbage")


def test_health_reports_quantized_flag(client):
    assert client.get("/health").json()["quantized"] is False


def test_quantize_setting_defaults_to_off():
    from app.config import Settings

    assert Settings().quantize is False
