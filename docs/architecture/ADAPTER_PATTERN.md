# Adapter Pattern — Adding a New Exchange

This is the whole point of the architecture: everything above the adapter
layer (ingestion, normalization, storage, calculation, API) operates on
`types/market.ts`'s standard schema and has no idea which exchange it came
from. Adding NGX, JSE, EGX, GSE, or BRVM means writing one adapter — nothing
else in the system changes.

## The four files every adapter needs

Using NSE as the reference implementation (`backend/src/adapters/nse/`):

| File | Responsibility |
|---|---|
| `xxxRawTypes.ts` | Shapes exactly as the provider sends them — field names, casing, enums, all provider-specific. Nothing outside this adapter's folder should ever import from here. |
| `xxxClient.ts` | Transport only. Two implementations: `MockXxxClient` (synthetic data, zero external dependency, lets every other layer be built/tested before a contract is signed) and `RealXxxClient` (the actual HTTP/WebSocket client against the licensed feed). Implements a client interface (`IXxxClient`) so the two are interchangeable. |
| `xxxMapper.ts` | Pure functions: raw shapes → standard schema (`types/market.ts`). This is where field-name differences, unit differences (e.g. market cap in millions vs. absolute), enum translation, and timezone normalization get absorbed. No side effects, easy to unit test. |
| `xxxAdapter.ts` | Implements `IExchangeAdapter` (`adapters/types.ts`) by composing the client and mapper. This is the ONLY file the rest of the system imports from this adapter's folder. |

## The contract (`adapters/types.ts`)

```ts
interface IExchangeAdapter {
  readonly exchange: ExchangeCode;
  listSecurities(): Promise<Security[]>;
  getQuotes(symbols: string[]): Promise<Quote[]>;
  getCandles(symbol, interval, from, to): Promise<Candle[]>;
  getFundamentals(symbol): Promise<FundamentalsBundle | null>;
  getCorporateActions(symbol | null, since): Promise<CorporateAction[]>;
  getEarningsEvents(symbol | null, since): Promise<EarningsEvent[]>;
  getOwnership(symbol): Promise<OwnershipRecord[]>;
  subscribeQuotes(symbols, onQuote): () => void;   // unsubscribe fn
}
```

Every method returns standard-schema types. Nothing provider-specific ever
crosses this boundary.

## Steps to add a new exchange

1. **Scaffold.** A placeholder already exists at
   `backend/src/adapters/future/<exchange>/README.md` for NGX, JSE, EGX,
   GSE, and BRVM — it repeats these instructions in context.
2. **Write the raw types** (`xxxRawTypes.ts`) matching the actual provider
   contract once you have it. Until then, a `Mock` client can use whatever
   shapes are convenient — they're internal to the adapter.
3. **Write the client** (`xxxClient.ts`): `MockXxxClient` first (so the rest
   of the system can be tested against this exchange immediately), then
   `RealXxxClient` when a licensed feed is contracted. Follow
   `nseClient.ts`'s pattern: a shared `INseClient`-style interface, a
   `createXxxClient()` factory switched by an env var
   (`XXX_CLIENT_MODE=mock|live`, mirroring `NSE_CLIENT_MODE`).
4. **Write the mapper** (`xxxMapper.ts`): one pure function per entity type
   (`mapSecurity`, `mapQuote`, `mapCandle`, `mapFinancials`,
   `mapCorporateAction`, `mapEarningsEvent`, `mapOwnership`). Use a stable
   natural ID scheme: `${EXCHANGE}:${symbol}` for securities, matching NSE's
   convention, so downstream code that already assumes this format (cache
   keys, natural-key lookups) keeps working.
5. **Write the adapter** (`xxxAdapter.ts`): implements `IExchangeAdapter`,
   delegates to client + mapper. Should be almost identical in shape to
   `nseAdapter.ts`.
6. **Move the folder** out of `adapters/future/xxx/` to `adapters/xxx/`.
7. **Register it** in `adapters/registry.ts`:
   ```ts
   const registry = new Map<ExchangeCode, IExchangeAdapter>([
     ["NSE", new NseAdapter()],
     ["NGX", new NgxAdapter()],   // ← add this line
   ]);
   ```
8. **Add the exchange code** to `ACTIVE_EXCHANGES` in `config/index.ts`.
9. **Add DB reference row.** Insert the new exchange into `market.exchanges`
   (a migration, following the pattern of the NSE seed row in
   `030_market_schema.sql`).
10. **Add the mock's seed data.** For local dev/testing without a live
    feed, give the mock client a handful of realistic seed securities
    (see `SEED` in `nseClient.ts` for the pattern — symbol, company name,
    sector, ISIN, base price, shares outstanding).

Nothing in `ingestion/`, `normalization/`, `storage/`, `services/`, `api/`,
or `streaming/` needs to change. The workers (`priceWorker`,
`financialsWorker`, `corporateActionsWorker`, `candlesWorker`) all loop over
`getAllAdapters()` already — a newly registered adapter is picked up
automatically on the next scheduled run.

## A note on natural IDs

Every entity in the standard schema uses a stable, human-debuggable string
ID rather than a random UUID: `NSE:SCOM` for a security,
`NSE:company:SCOM` for a company, `NSE:period:SCOM:2026` for a fiscal
period. This is deliberate — it means IDs are deterministic across
re-ingestion (no duplicate-detection logic needed for upserts), and a log
line or a `curl` response is immediately legible without a join. Keep this
convention when building a new adapter's mapper.