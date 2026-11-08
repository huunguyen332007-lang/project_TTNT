from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from app.config import Settings, get_settings
from app.schemas import ImageEmbedResponse, TextEmbedRequest, TextEmbedResponse
from app.services.embedder import Embedder, InvalidImageError

router = APIRouter(prefix="/embed", tags=["embeddings"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def get_embedder(request: Request) -> Embedder:
    return request.app.state.embedder


def _error(status: int, code: str, message: str) -> HTTPException:
    # Backend Python đọc detail.message để hiển thị cho người dùng.
    return HTTPException(status_code=status, detail={"code": code, "message": message})


# Các hàm dưới đây cố ý là `def` (không phải `async def`): suy luận model là việc tốn CPU,
# FastAPI sẽ chạy chúng trong threadpool nên không chặn event loop (health check vẫn trả lời được).


@router.post("/text", response_model=TextEmbedResponse)
def embed_text(
    body: TextEmbedRequest,
    embedder: Embedder = Depends(get_embedder),
    settings: Settings = Depends(get_settings),
) -> TextEmbedResponse:
    if len(body.texts) > settings.max_texts_per_request:
        raise _error(400, "TOO_MANY_TEXTS", f"Tối đa {settings.max_texts_per_request} văn bản mỗi yêu cầu")
    if any(len(t) > settings.max_text_chars for t in body.texts):
        raise _error(400, "TEXT_TOO_LONG", f"Mỗi văn bản tối đa {settings.max_text_chars} ký tự")
    return TextEmbedResponse(embeddings=embedder.embed_texts(body.texts), dim=embedder.dim)


@router.post("/image", response_model=ImageEmbedResponse)
def embed_image(
    file: UploadFile = File(...),
    embedder: Embedder = Depends(get_embedder),
    settings: Settings = Depends(get_settings),
) -> ImageEmbedResponse:
    # Backend luôn gửi content-type theo ảnh gốc; kiểm tra thêm ở đây để service dùng độc lập vẫn an toàn.
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise _error(415, "UNSUPPORTED_MEDIA_TYPE", "Chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc GIF")
    data = file.file.read(settings.max_image_bytes + 1)
    if len(data) > settings.max_image_bytes:
        raise _error(413, "IMAGE_TOO_LARGE", "Ảnh quá lớn")
    try:
        vector = embedder.embed_image(data)
    except InvalidImageError as exc:
        raise _error(400, "INVALID_IMAGE", str(exc)) from exc
    return ImageEmbedResponse(embedding=vector, dim=embedder.dim)
