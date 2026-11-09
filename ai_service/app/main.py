import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import embeddings
from app.schemas import HealthResponse
from app.services.embedder import ClipEmbedder, Embedder

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(embedder: Embedder | None = None) -> FastAPI:
    """Tạo app. Truyền `embedder` giả khi test để không phải tải model."""
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if embedder is None:
            real = ClipEmbedder(
                settings.text_model, settings.image_model, settings.device, settings.embedding_dim, settings.max_image_pixels,
                settings.quantize,
            )
            if settings.preload:
                real.load()  # uvicorn chỉ nhận request sau khi nạp xong -> healthcheck chỉ xanh khi model sẵn sàng
            app.state.embedder = real
        else:
            app.state.embedder = embedder
        yield

    app = FastAPI(title="TTNT AI Service", version="2.0.0", lifespan=lifespan)
    app.include_router(embeddings.router)

    @app.get("/health", response_model=HealthResponse, tags=["system"])
    def health():
        current = app.state.embedder
        if not current.ready:
            return JSONResponse(status_code=503, content={"status": "loading"})
        return HealthResponse(
            status="ok", dim=current.dim, text_model=settings.text_model, image_model=settings.image_model,
            quantized=bool(getattr(current, "quantize", False)),
        )

    return app


app = create_app()  # điểm vào cho uvicorn: `uvicorn app.main:app`
