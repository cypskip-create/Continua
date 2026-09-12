# Multi-stage build. The browser-automation code landed (see
# src/crawler/renderWithBrowser.ts), which needs actual Chromium +
# its OS-level shared libraries — a plain node:20-slim image has neither.
# Microsoft's Playwright image ships exactly the browser build each
# playwright npm version expects, plus every OS dependency already
# installed, so both stages use it instead of hand-rolling
# `apt-get` + `playwright install-deps` (which drifts out of sync with
# the npm version over time). The tag's version MUST match package.json's
# "playwright" version — currently ^1.63.0 → mcr.microsoft.com/playwright:v1.63.0-*.
# Bumping the playwright dependency requires bumping this tag too.
FROM mcr.microsoft.com/playwright:v1.63.0-jammy AS build
WORKDIR /app
# poppler-utils provides pdftotext (native PDF text extraction) AND
# pdftoppm (PDF-to-image rasterization for the OCR fallback, Phase 5).
# Same package, both tools. (Chromium's own deps are already in the base
# image — this is on top of that, not instead of it.)
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.63.0-jammy AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
# The base image already has matching-version Chromium/Firefox/WebKit
# under PLAYWRIGHT_BROWSERS_PATH, so this `npm install` reuses them
# instead of re-downloading — no separate `playwright install` step needed.
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist

EXPOSE 4100
CMD ["node", "dist/index.js"]