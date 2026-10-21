# Build from the repository root. Candidate only: the application retains its
# production cutover guard until the complete migration release gates pass.
FROM golang:1.27.3-bookworm@sha256:972b4110ba0f47539a975c31e52c64765e1ff19f2d74469ae4a595c6676e80a5 AS compiler
WORKDIR /build/backend-go
COPY backend-go/go.mod backend-go/go.sum ./
RUN go mod download
COPY backend-go/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/continua ./cmd/continua \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/continua-admin ./cmd/continua-admin \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/continua-review ./cmd/continua-review \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/continua-key ./cmd/continua-key

FROM python:3.13.16-slim-bookworm@sha256:a1165e272e578941b84abc79e4ab38a0305cd12803a5c4247979ac7655f4d641
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 continua \
    && useradd --uid 10001 --gid 10001 --no-create-home continua
WORKDIR /app
COPY --from=compiler /out/ /usr/local/bin/
COPY engine-python/worker.py engine-python/worker.py
COPY engine-python/engine_cli.py engine-python/engine_cli.py
COPY engine-python/continua_engine/ engine-python/continua_engine/
COPY backend/python/engine_calculations.py backend/python/engine_calculations.py
COPY backend/python/continua_risk.py backend/python/continua_risk.py
COPY backend/python/investment_intelligence.py backend/python/investment_intelligence.py
COPY backend/python/financial_extensions.py backend/python/financial_extensions.py
COPY backend/python/requirements.txt backend/python/requirements.txt
RUN pip install --no-cache-dir -r backend/python/requirements.txt
COPY backend/migration/ backend/migration/
COPY supabase/migrations/ supabase/migrations/
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    NATIVE_PYTHON_BIN=/usr/local/bin/python \
    NATIVE_PYTHON_SCRIPT=/app/engine-python/worker.py
USER 10001:10001
# Loopback is intentional during candidate validation; this image is not a
# production Render blueprint and does not enable jobs or paid providers.
EXPOSE 4080
ENTRYPOINT ["/usr/local/bin/continua"]
