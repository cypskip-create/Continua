# Build from the repository root. Private R2 remains the durable artifact store.
FROM python:3.13.16-slim-bookworm@sha256:a1165e272e578941b84abc79e4ab38a0305cd12803a5c4247979ac7655f4d641
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates chromium chromium-driver \
       poppler-utils tesseract-ocr tesseract-ocr-eng fonts-liberation \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 continua \
    && useradd --uid 10001 --gid 10001 --create-home continua
WORKDIR /app
COPY scraper-python/requirements-lock.txt /app/requirements-lock.txt
RUN pip install --no-cache-dir -r /app/requirements-lock.txt
RUN python -m pip check \
    && apt-get update \
    && apt-get install -y --no-install-recommends chromium-sandbox \
    && rm -rf /var/lib/apt/lists/*
COPY scraper-python/main.py scraper-python/browser_worker.py scraper-python/scraper_cli.py scraper-python/
COPY scraper-python/continua_scraper/ scraper-python/continua_scraper/
COPY engine-python/continua_engine/ engine-python/continua_engine/
COPY scraper/python/pdf_extract.py scraper/python/pdf_extract.py
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/engine-python \
    CHROMIUM_BIN=/usr/bin/chromium CHROMEDRIVER_BIN=/usr/bin/chromedriver
USER 10001:10001
# Do not disable Chromium's sandbox. Linux namespace/sandbox compatibility and
# the complete service memory budget must pass the final release validation.
EXPOSE 4081
ENTRYPOINT ["python", "/app/scraper-python/main.py"]
