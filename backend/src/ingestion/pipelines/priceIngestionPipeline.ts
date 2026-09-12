/**
 * The live price pipeline: collect (with retry) → normalize → validate →
 * cache → store → broadcast → audit-log. Runs once per poll tick (or per
 * streamed message, in live mode) for every active symbol on an exchange.
 * Failures at any stage are dead-lettered, not silently dropped, and the
 * ingestion log always gets a row — even a total collector failure — so
 * the audit trail never has a gap.
 */
import type { IExchangeAdapter } from "../../adapters/types.js";
import { priceCollector } from "../collectors/priceCollector.js";
import { normalizePrice } from "../../normalization/prices/normalizePrice.js";
import { validateBatch } from "../validators/validate.js";
import { QuoteSchema } from "../validators/schemas.js";
import { pricesRepository } from "../../storage/repositories/pricesRepository.js";
import { cache, CacheKeys } from "../../storage/cache.js";
import { ingestionLogRepository } from "../../storage/repositories/ingestionLogRepository.js";
import { deadLetterRepository } from "../../storage/repositories/deadLetterRepository.js";
import { marketEventBus } from "../../streaming/pubsub.js";
import { logger } from "../../monitoring/logger.js";
import type { Quote } from "../../types/market.js";

export async function runPriceIngestion(adapter: IExchangeAdapter, symbols: string[] = []): Promise<void> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  let accepted: Quote[] = [];

  try {
    const raw = await priceCollector.collectQuotes(adapter, symbols);
    const normalized = raw.map(normalizePrice);
    // zod's inferred type widens `exchange`/`status` etc. from our literal
    // union types back to `string` — validateBatch only tells us shape
    // validity, so we keep working with the original typed `Quote` objects
    // for anything that passed, rather than the zod-inferred shape.
    const { valid: validShapes, rejected } = validateBatch(QuoteSchema, normalized);
    for (const r of rejected) {
      errors.push(`Quote rejected: ${JSON.stringify(r.issues)}`);
      await deadLetterRepository.record({
        exchange: adapter.exchange, dataset: "price",
        symbol: (r.record as any)?.symbol ?? null, payload: r.record,
        error: r.issues.map((i) => `${i.path}: ${i.message}`).join("; "),
      });
    }
    const validSymbols = new Set(validShapes.map((v) => v.securityId));
    const valid = normalized.filter((q) => validSymbols.has(q.securityId));

    for (const quote of valid) {
      accepted.push(quote);
    }

    if (accepted.length > 0) {
      await pricesRepository.upsertQuotesBatch(accepted);
      for (const q of accepted) {
        await cache.set(CacheKeys.quote(q.symbol), q, 10_000);
        marketEventBus.publishQuote(q);
      }
      await cache.del(CacheKeys.movers());
    }
  } catch (err) {
    // Collector exhausted its retries and threw — the whole tick failed for
    // this adapter. Still record it (dead-letter + ingestion log) instead
    // of letting the exception erase all trace of the attempt.
    errors.push(`Price collection failed: ${String(err)}`);
    await deadLetterRepository.record({
      exchange: adapter.exchange, dataset: "price", symbol: null,
      payload: { symbols }, error: String(err),
    });
  }

  await ingestionLogRepository.log({
    exchange: adapter.exchange, dataset: "price",
    status: errors.length === 0 ? "success" : (accepted.length > 0 ? "partial" : "failed"),
    recordCount: accepted.length, errorCount: errors.length,
    startedAt, finishedAt: new Date().toISOString(),
    errors: errors.length ? errors.slice(0, 20) : undefined,
  });

  if (errors.length) logger.warn({ exchange: adapter.exchange, errorCount: errors.length }, "Price ingestion completed with errors");
}