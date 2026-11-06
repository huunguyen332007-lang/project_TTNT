from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

# Giới hạn độ dài từng văn bản được kiểm tra lại trong router theo cấu hình.
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class TextEmbedRequest(BaseModel):
    texts: list[Text] = Field(min_length=1)


class TextEmbedResponse(BaseModel):
    embeddings: list[list[float]]
    dim: int


class ImageEmbedResponse(BaseModel):
    embedding: list[float]
    dim: int


class HealthResponse(BaseModel):
    status: str
    dim: int
    text_model: str
    image_model: str
