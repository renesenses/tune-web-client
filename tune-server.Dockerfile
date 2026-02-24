FROM python:3.12-slim-bookworm

LABEL maintainer="renesenses"
LABEL description="Tune Server - Multi-room music server"

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    libasound2-dev \
    libportaudio2 \
    portaudio19-dev \
    avahi-daemon \
    avahi-utils \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN useradd --system --create-home --shell /bin/bash tune-server

WORKDIR /opt/tune-server

# Copy everything first, then install
COPY pyproject.toml .
COPY tune_server/ tune_server/
RUN pip install --no-cache-dir .

# Default environment
ENV TUNE_MUSIC_DIRS='["/music"]' \
    TUNE_DB_PATH=/data/tune_server.db \
    TUNE_ARTWORK_CACHE_DIR=/data/artwork_cache \
    TUNE_LOG_FORMAT=json

# Data & music volumes — ensure writable by app user
RUN mkdir -p /data /music && chown tune-server:tune-server /data
VOLUME /data
VOLUME /music

# Ports: API + HTTP audio stream
EXPOSE 8888 8080

USER tune-server

CMD ["python", "-m", "tune_server"]
