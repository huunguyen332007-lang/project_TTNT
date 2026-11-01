from __future__ import annotations

import logging
from io import BytesIO
from typing import Protocol

from PIL import Image, ImageOps, UnidentifiedImageError

logger = logging.getLogger(__name__)


class InvalidImageError(ValueError):
    """Ảnh không đọc được hoặc vượt giới hạn cho phép."""


class Embedder(Protocol):
    """Giao diện mà router sử dụng; test thay bằng bản giả để khỏi cần nạp model."""

    ready: bool
    dim: int

    def embed_texts(self, texts: list[str]) -> list[list[float]]: ...

    def embed_image(self, data: bytes) -> list[float]: ...


class ClipEmbedder:
    """Tạo embedding đã chuẩn hóa (độ dài 1) nên cosine similarity = tích vô hướng."""

    def __init__(self, text_model: str, image_model: str, device: str, dim: int, max_pixels: int):
        self.text_model_name = text_model
        self.image_model_name = image_model
        self.device = device
        self.dim = dim
        self.max_pixels = max_pixels
        self.ready = False
        self._text = None
        self._image = None

    def load(self) -> None:
        # Import tại đây để các phần khác (và test) không bắt buộc phải cài torch.
        from sentence_transformers import SentenceTransformer

        logger.info("Nạp model văn bản: %s", self.text_model_name)
        self._text = SentenceTransformer(self.text_model_name, device=self.device)
        logger.info("Nạp model ảnh: %s", self.image_model_name)
        self._image = SentenceTransformer(self.image_model_name, device=self.device)

        # Kiểm tra sớm: lệch số chiều sẽ làm hỏng cột vector(512) trong PostgreSQL.
        probe_text = self.embed_texts(["kiểm tra"])[0]
        probe_image = self.embed_image(self._probe_png())
        if len(probe_text) != self.dim or len(probe_image) != self.dim:
            raise RuntimeError(
                f"Model trả về vector {len(probe_text)}/{len(probe_image)} chiều, cấu hình yêu cầu {self.dim}"
            )
        self.ready = True
        logger.info("Model đã sẵn sàng (dim=%d, device=%s)", self.dim, self.device)

    @staticmethod
    def _probe_png() -> bytes:
        buf = BytesIO()
        Image.new("RGB", (32, 32), (128, 128, 128)).save(buf, format="PNG")
        return buf.getvalue()

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        vectors = self._text.encode(
            texts, batch_size=32, convert_to_numpy=True, normalize_embeddings=True, show_progress_bar=False
        )
        return vectors.tolist()

    def embed_image(self, data: bytes) -> list[float]:
        image = self._decode(data)
        vector = self._image.encode(image, convert_to_numpy=True, normalize_embeddings=True, show_progress_bar=False)
        return vector.tolist()

    def _decode(self, data: bytes) -> Image.Image:
        try:
            image = Image.open(BytesIO(data))  # chỉ đọc header, chưa giải mã điểm ảnh
            # Pillow mặc định chỉ cảnh báo khi vượt giới hạn, nên tự chặn tường minh trước khi giải mã.
            if image.width * image.height > self.max_pixels:
                raise InvalidImageError("Ảnh có kích thước quá lớn, hãy chọn ảnh nhỏ hơn")
            image.load()
        except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError) as exc:
            raise InvalidImageError("Không đọc được ảnh, hãy thử tệp JPG, PNG hoặc WEBP khác") from exc
        image = ImageOps.exif_transpose(image)  # ảnh chụp bằng điện thoại thường bị xoay theo EXIF
        return image.convert("RGB")  # xử lý PNG trong suốt, ảnh palette, ảnh xám
