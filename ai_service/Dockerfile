# syntax=docker/dockerfile:1
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/opt/hf-cache

WORKDIR /app

# 1) torch bản CPU (~200MB thay vì ~2GB bản CUDA). Tách layer riêng để được cache.
RUN pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu

# 2) Thư viện Python còn lại
COPY requirements-base.txt requirements.txt ./
RUN pip install -r requirements.txt

# 3) Tải sẵn model vào image: khởi động nhanh, không cần Internet khi chạy.
COPY app ./app
COPY scripts ./scripts
RUN python -m scripts.download_models

RUN useradd --create-home --uid 10001 appuser && chown -R appuser /app /opt/hf-cache
USER appuser
ENV HF_HUB_OFFLINE=1

EXPOSE 8000

# Model nạp mất vài chục giây nên cho start-period dài.
HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=10 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"

# Một worker: model chiếm nhiều RAM, nhiều worker sẽ nhân đôi bộ nhớ mà không nhanh hơn trên CPU nhỏ.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
