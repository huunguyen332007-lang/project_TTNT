from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Cấu hình đọc từ biến môi trường có tiền tố AI_ (ví dụ AI_DEVICE=cpu)."""

    model_config = SettingsConfigDict(env_prefix="AI_", env_file=".env", extra="ignore")

    # Văn bản (đa ngôn ngữ, có tiếng Việt) và ảnh dùng chung không gian vector 512 chiều của CLIP ViT-B/32.
    text_model: str = "sentence-transformers/clip-ViT-B-32-multilingual-v1"
    image_model: str = "clip-ViT-B-32"
    embedding_dim: int = 512
    device: str = "cpu"

    max_texts_per_request: int = 64
    max_text_chars: int = 2000
    max_image_bytes: int = 8 * 1024 * 1024
    max_image_pixels: int = 40_000_000

    # False: không nạp model lúc khởi động (dùng trong test).
    preload: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
