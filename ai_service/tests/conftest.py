import hashlib
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import create_app
from app.services.embedder import InvalidImageError

DIM = 8


class FakeEmbedder:
    """Embedder giả, xác định (cùng đầu vào -> cùng vector), không cần torch."""

    ready = True
    dim = DIM

    def _vec(self, seed: bytes) -> list[float]:
        digest = hashlib.sha256(seed).digest()[: self.dim]
        return [b / 255 for b in digest]

    def embed_texts(self, texts):
        return [self._vec(t.encode()) for t in texts]

    def embed_image(self, data):
        try:
            Image.open(BytesIO(data)).verify()
        except Exception as exc:  # noqa: BLE001
            raise InvalidImageError("Không đọc được ảnh") from exc
        return self._vec(data)


@pytest.fixture
def client():
    with TestClient(create_app(embedder=FakeEmbedder())) as c:
        yield c


def png_bytes(color=(200, 30, 30)) -> bytes:
    buf = BytesIO()
    Image.new("RGB", (16, 16), color).save(buf, format="PNG")
    return buf.getvalue()
