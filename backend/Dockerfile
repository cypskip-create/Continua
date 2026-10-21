# Multi-stage build: syntax-check/copy plain JavaScript, run Node + isolated
# Python calculations. Type contracts and tests are development-only.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:24-trixie-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv && rm -rf /var/lib/apt/lists/*
COPY python ./python
RUN python3 -m venv /opt/numerics && /opt/numerics/bin/pip install --no-cache-dir -r python/requirements.txt
ENV PATH="/opt/numerics/bin:$PATH" OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY scripts ./scripts

EXPOSE 4000
CMD ["node", "dist/index.js"]
