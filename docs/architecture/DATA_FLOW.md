# Data Flow

This traces exactly what happens to data at each stage, for the three
categories of dataset the system handles: live prices, historical candles,
and slow-moving datasets (fundamentals, corporate actions, earnings,
ownership).

## 1. Live prices — every `PRICE_POLL_INTERVAL_MS` (default 5s)

```
priceWorker.runPriceIngestionOnce()
  -> for each registered adapter (NSE today):
     -> priceCollector.collectQuotes(adapter, symbols)
          -> adapter.getQuotes(symbols)
               -> nseClient.fetchQuotes(symbols)   [raw NSE-shaped payload]
               -> nseMapper.mapQuote(raw)           [-> standard Quote]
     -> normalizePrice(quote)   [round, recompute change/changePercent
                                 from lastPrice/previousClose, clamp]
     -> validateBatch(QuoteSchema, normalized)   [reject malformed rows]
     -> checkPricePlausibility(quote, previousQuote)   [reject >25% one-tick jumps]
     -> pricesRepository.upsertQuotesBatch(plausible)   [-> market.live_quotes]
     -> cache.set(CacheKeys.quote(symbol), quote, 10s)
     -> marketEventBus.publishQuote(quote)   [-> WebSocket clients subscribed to symbol]
     -> ingestionLogRepository.log(...)   [audit trail either way]
```

Rejected/implausible records never stop the batch — one bad print from a
feed degrades to "partial" success for that tick, logged with specifics,
not a failed ingestion run.

## 2. Historical candles — deep backfill once at boot, daily top-up after

```
Bootstrap:  candlesWorker.runCandlesBackfillOnce()   [400 days, all symbols]
Daily cron: candlesWorker.runCandlesTopUpOnce()      [5-day trailing window]

  -> candlesIngestionPipeline.ingestDailyCandles(adapter, symbols, days)
       -> adapter.getCandles(symbol, "1d", from, to)
            -> nseClient.fetchCandles(...) -> nseMapper.mapCandle(...)
       -> validateBatch(CandleSchema, raw)
       -> candlesRepository.upsertCandlesBatch(daily)        [-> market.candles]
       -> candleAggregator.aggregateCandles(daily, "1w"|"1M"|"1y")
       -> candlesRepository.upsertCandlesBatch(derived)      [same table, different interval]
```

One fetch (daily resolution) produces every other resolution via
aggregation — no separate adapter call per timeframe. The 5-day top-up
window overlaps the previous run on purpose: upserts are idempotent, so
re-processing a few already-stored days is a cheap way to self-heal a
partially-failed prior run.

## 3. Fundamentals — daily cron (`FINANCIALS_SYNC_CRON`, default 02:00)

```
financialsWorker.runFinancialsSyncOnce()
  -> for each adapter: fundamentalsCollector.collectForSymbols(adapter, symbols)
       -> adapter.getFundamentals(symbol) for each symbol, in parallel
            -> combines: security list + company profile + latest financial period
  -> fundamentalsIngestionPipeline.runFundamentalsIngestion(adapter, symbols)
       for each bundle:
         -> normalizeSecurity / normalizeCompany
         -> normalizeIncomeStatement / normalizeCashFlow
         -> checkBalanceSheetIntegrity(balance)   [logs a warning >2% mismatch,
                                                    does NOT block storage —
                                                    see note below]
         -> securitiesRepository.upsertCompany(company)    [company before
         -> securitiesRepository.upsertSecurity(security)   security: FK order]
         -> financialsRepository.upsertPeriodBundle(period, income, balance, cashFlow)
         -> IF a live quote already exists for this security:
              researchService.recomputeAndStore(securityId, quote.lastPrice)
              cache.del(ratios / afriScore for this symbol)
```

**Why balance sheet integrity check warns instead of rejecting:** minor
rounding drift between a provider's reported totals is common and not a
reason to lose an entire filing. A mismatch beyond 2% is very likely a
mapping bug and gets logged prominently for a human to look at, but the
record is still stored — an incomplete-but-present financial statement is
more useful to research than a missing one.

## 4. Corporate actions, earnings, ownership — daily cron (`CORPORATE_ACTIONS_SYNC_CRON`)

```
corporateActionsWorker.runCorporateActionsSyncOnce()
  -> corporateActionsIngestionPipeline.runCorporateActionsIngestion(adapter, since, symbols)
       -> corporateActionsCollector.collectActions/collectEarnings/collectOwnership
       -> normalizeCorporateAction(action)   [rejects e.g. negative dividend amounts]
       -> corporateActionsRepository.upsert*(...)
       -> marketEventBus.publishCorporateAction(action)   [-> WebSocket]
```

Runs a 7-day lookback window every time (not just "since last run") so a
missed or partially-failed prior run self-heals on the next scheduled pass.

## Bootstrap sequence (full detail in `workers/scheduler.ts`)

Order matters because of foreign keys and because research needs both a
price AND fundamentals to compute anything:

```
1. runFinancialsSyncOnce()        — companies + securities + financials exist
2. runCorporateActionsSyncOnce()  — depends on securities existing
3. runCandlesBackfillOnce()       — depends on securities existing
4. runPriceIngestionOnce()        — ONE synchronous pass; live_quotes populated
5. researchService.recomputeAllForExchange("NSE")
                                   — now every symbol has both a quote AND
                                     fundamentals, so ratios/AfriScore get
                                     computed for the WHOLE universe, not
                                     just symbols someone happens to query
6. Start recurring workers: price interval, financials cron,
   corporate-actions cron, candles cron
```

## Read path (API request, e.g. `GET /api/v1/research/SCOM`)

```
researchController.getResearch
  -> securitiesRepository.getBySymbol("NSE", "SCOM")
  -> cache.getOrSet(ratios key, 60s, () => researchService.getRatios(id))
  -> cache.getOrSet(afriScore key, 60s, () => researchService.getAfriScore(id))
  -> IF either is missing (cache AND DB both empty — shouldn't happen post-
     bootstrap, but covers a brand-new symbol added mid-day):
       fetch current quote, researchService.recomputeAndStore(id, price)
  -> respond { ratios, score }
```