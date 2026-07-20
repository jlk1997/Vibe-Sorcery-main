FROM python:3.11-slim

WORKDIR /app

# 国内网络构建时默认走清华源；海外可 build-arg PIP_INDEX_URL=https://pypi.org/simple
ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ENV PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_DEFAULT_TIMEOUT=600 \
    PIP_RETRIES=10

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libsndfile1 curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt

RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir --retries 10 --timeout 600 \
    -i "${PIP_INDEX_URL}" -r /app/backend/requirements.txt

COPY backend /app/backend
COPY src /app/src
COPY docs/legal /app/docs/legal

ENV PYTHONPATH=/app:/app/backend
WORKDIR /app/backend

EXPOSE 8000
