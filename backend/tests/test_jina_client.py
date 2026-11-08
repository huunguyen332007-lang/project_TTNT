import base64
import io
import json

import httpx
import pytest
from PIL import Image

from app.ai_client import AiClient, JinaClient, create_ai_client
from app.config import load_settings
from app.errors import HttpError
from app.utils import prepare_image_for_embedding

DIM = 512


def vector(seed=0.1):
    return [seed] * DIM


def png_bytes(size=(1200, 800), mode="RGB", color=(200, 30, 30)):
    out = io.BytesIO()
    Image.new(mode, size, color).save(out, format="PNG")
    return out.getvalue()


def make_client(handler, **kwargs):
    kwargs.setdefault("image_interval_ms", 0)
    kwargs.setdefault("retry_base_delay", 0)
    return JinaClient("test-key", transport=httpx.MockTransport(handler), **kwargs)


def ok(vectors):
    return httpx.Response(200, json={"data": [{"index": i, "embedding": v} for i, v in enumerate(vectors)]})


@pytest.mark.asyncio
async def test_embed_texts_sends_expected_payload_and_orders_by_index():
    seen = {}

    def handler(request):
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        # Trả lộn thứ tự để chắc chắn client sắp xếp lại theo index.
        return httpx.Response(200, json={"data": [{"index": 1, "embedding": vector(0.2)}, {"index": 0, "embedding": vector(0.1)}]})

    client = make_client(handler)
    result = await client.embed_texts(["áo thun", "giày"])
    await client.close()
    assert seen["auth"] == "Bearer test-key"
    assert seen["body"]["model"] == "jina-clip-v2"
    assert seen["body"]["dimensions"] == DIM
    assert seen["body"]["normalized"] is True
    assert seen["body"]["input"] == [{"text": "áo thun"}, {"text": "giày"}]
    assert result[0][0] == pytest.approx(0.1) and result[1][0] == pytest.approx(0.2)


@pytest.mark.asyncio
async def test_embed_image_resizes_to_single_tile_before_upload():
    seen = {}

    def handler(request):
        seen["input"] = json.loads(request.content)["input"]
        return ok([vector()])

    client = make_client(handler)
    await client.embed_image(png_bytes((1200, 800)), "image/png")
    await client.close()
    assert list(seen["input"][0]) == ["image"]
    sent = Image.open(io.BytesIO(base64.b64decode(seen["input"][0]["image"])))
    assert max(sent.size) <= 512 and sent.format == "JPEG"


@pytest.mark.asyncio
async def test_retries_on_rate_limit_then_succeeds():
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(429, headers={"retry-after": "0"}) if len(calls) < 3 else ok([vector()])

    client = make_client(handler)
    assert len(await client.embed_texts(["x"])) == 1
    await client.close()
    assert len(calls) == 3


@pytest.mark.asyncio
async def test_gives_up_after_max_retries_as_ai_unavailable():
    client = make_client(lambda request: httpx.Response(429), max_retries=2)
    with pytest.raises(HttpError) as exc:
        await client.embed_texts(["x"])
    await client.close()
    assert exc.value.status == 503 and exc.value.code == "AI_UNAVAILABLE"


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [401, 402, 403])
async def test_auth_or_quota_errors_degrade_to_ai_unavailable(status):
    client = make_client(lambda request: httpx.Response(status, json={"detail": "x"}))
    with pytest.raises(HttpError) as exc:
        await client.embed_texts(["x"])
    await client.close()
    assert exc.value.code == "AI_UNAVAILABLE"


@pytest.mark.asyncio
async def test_rejected_image_maps_to_invalid_image():
    client = make_client(lambda request: httpx.Response(422, json={"detail": "bad image"}))
    with pytest.raises(HttpError) as exc:
        await client.embed_image(png_bytes((50, 50)), "image/png")
    await client.close()
    assert exc.value.status == 400 and exc.value.code == "INVALID_IMAGE" and exc.value.message == "bad image"


@pytest.mark.asyncio
async def test_undecodable_image_is_rejected_without_calling_api():
    def handler(request):
        raise AssertionError("không được gọi API khi ảnh hỏng")

    client = make_client(handler)
    with pytest.raises(HttpError) as exc:
        await client.embed_image(b"not an image", "image/png")
    await client.close()
    assert exc.value.code == "INVALID_IMAGE"


@pytest.mark.asyncio
async def test_wrong_dimension_response_is_rejected():
    client = make_client(lambda request: ok([[0.1] * 1024]))
    with pytest.raises(HttpError) as exc:
        await client.embed_texts(["x"])
    await client.close()
    assert exc.value.code == "AI_UNAVAILABLE"


@pytest.mark.asyncio
async def test_network_error_is_ai_unavailable():
    def handler(request):
        raise httpx.ConnectError("boom", request=request)

    client = make_client(handler)
    with pytest.raises(HttpError) as exc:
        await client.embed_texts(["x"])
    await client.close()
    assert exc.value.code == "AI_UNAVAILABLE"


@pytest.mark.asyncio
async def test_health_makes_no_network_call():
    def handler(request):
        raise AssertionError("health không được gọi mạng")

    client = make_client(handler)
    assert (await client.health())["status"] == "ok"
    await client.close()


def test_prepare_image_flattens_transparency_and_limits_size():
    encoded = prepare_image_for_embedding(png_bytes((900, 300), "RGBA", (255, 0, 0, 0)))
    image = Image.open(io.BytesIO(base64.b64decode(encoded)))
    assert image.mode == "RGB" and image.size == (512, 171)
    assert image.getpixel((10, 10))[0] > 240 and image.getpixel((10, 10))[1] > 240  # nền trong suốt -> trắng


def test_provider_config_and_factory():
    assert load_settings({"NODE_ENV": "test"}).embedding_provider == "local"
    with pytest.raises(ValueError, match="JINA_API_KEY"):
        load_settings({"EMBEDDING_PROVIDER": "jina"})
    with pytest.raises(ValueError, match="EMBEDDING_PROVIDER"):
        load_settings({"EMBEDDING_PROVIDER": "openai"})
    with pytest.raises(ValueError, match="HTTPS"):
        load_settings({"EMBEDDING_PROVIDER": "jina", "JINA_API_KEY": "k", "JINA_API_URL": "http://x.test"})
    assert isinstance(create_ai_client(load_settings({"NODE_ENV": "test"})), AiClient)
    assert isinstance(create_ai_client(load_settings({"EMBEDDING_PROVIDER": "jina", "JINA_API_KEY": "k"})), JinaClient)
