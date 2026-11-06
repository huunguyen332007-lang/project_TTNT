"""Tải sẵn model vào cache lúc build Docker image để container khởi động nhanh và không cần Internet."""
from sentence_transformers import SentenceTransformer

from app.config import get_settings

settings = get_settings()
for name in (settings.text_model, settings.image_model):
    print(f"Tải {name} ...")
    SentenceTransformer(name, device="cpu")
print("Xong.")
