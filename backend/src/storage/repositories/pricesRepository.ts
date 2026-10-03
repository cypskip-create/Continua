import { query } from "../db.js";
import type { Quote } from "../../types/market.js";

export const pricesRepository = {
  /** Live quotes are upserted in place, keyed by security — we only ever
   *  need the latest tick in the relational store; intraday history lives
   *  in candles, not here. This keeps the hot table tiny and fast. */
  async upsertQuote(q: Quote): Promise<void> {
    await query(
      `INSERT INTO market.live_quotes
         (security_id, symbol, exchange, last_price, open, high, low, previous_close,
          change, change_percent, volume, bid, ask, market_cap, currency, status, event_timestamp, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (security_id) DO UPDATE SET
         last_price = EXCLUDED.last_price, open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
         previous_close = EXCLUDED.previous_close, change = EXCLUDED.change, change_percent = EXCLUDED.change_percent,
         volume = EXCLUDED.volume, bid = EXCLUDED.bid, ask = EXCLUDED.ask, market_cap = EXCLUDED.market_cap,
         status = EXCLUDED.status, event_timestamp = EXCLUDED.event_timestamp, source = EXCLUDED.source, updated_at = now()`,
      [q.securityId, q.symbol, q.exchange, q.lastPrice, q.open, q.high, q.low, q.previousClose,
       q.change, q.changePercent, q.volume, q.bid ?? null, q.ask ?? null, q.marketCap ?? null,
       q.currency, q.status, q.timestamp, q.source]
    );
  },

  async upsertQuotesBatch(quotes: Quote[]): Promise<void> {
    if (quotes.length === 0) return;
    const columnsPerQuote = 18;
    const values: unknown[] = [];
    const rows = quotes.map((q, rowIndex) => {
      const offset = rowIndex * columnsPerQuote;
      values.push(
        q.securityId, q.symbol, q.exchange, q.lastPrice, q.open, q.high, q.low,
        q.previousClose, q.change, q.changePercent, q.volume, q.bid ?? null,
        q.ask ?? null, q.marketCap ?? null, q.currency, q.status, q.timestamp, q.source,
      );
      return `(${Array.from({ length: columnsPerQuote }, (_, i) => `$${offset + i + 1}`).join(",")})`;
    });

    // One round trip and one transaction instead of N sequential INSERTs.
    // On a hosted Postgres connection the old implementation could spend
    // most of a polling interval waiting on network latency alone.
    await query(
      `INSERT INTO market.live_quotes
         (security_id, symbol, exchange, last_price, open, high, low, previous_close,
          change, change_percent, volume, bid, ask, market_cap, currency, status, event_timestamp, source)
       VALUES ${rows.join(",")}
       ON CONFLICT (security_id) DO UPDATE SET
         last_price = EXCLUDED.last_price, open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
         previous_close = EXCLUDED.previous_close, change = EXCLUDED.change, change_percent = EXCLUDED.change_percent,
         volume = EXCLUDED.volume, bid = EXCLUDED.bid, ask = EXCLUDED.ask, market_cap = EXCLUDED.market_cap,
         status = EXCLUDED.status, event_timestamp = EXCLUDED.event_timestamp, source = EXCLUDED.source, updated_at = now()`,
      values,
    );
  },

  async getQuote(securityId: string): Promise<Quote | null> {
    const res = await query<any>(
      `SELECT security_id as "securityId", symbol, exchange, last_price as "lastPrice", open, high, low,
              previous_close as "previousClose", change, change_percent as "changePercent", volume, bid, ask,
              market_cap as "marketCap", currency, status, event_timestamp as "timestamp", source
       FROM market.live_quotes WHERE security_id = $1`,
      [securityId]
    );
    return res.rows[0] ?? null;
  },

  async getQuotesBatch(securityIds: string[]): Promise<Quote[]> {
    if (securityIds.length === 0) return [];
    const res = await query<any>(
      `SELECT security_id as "securityId", symbol, exchange, last_price as "lastPrice", open, high, low,
              previous_close as "previousClose", change, change_percent as "changePercent", volume, bid, ask,
              market_cap as "marketCap", currency, status, event_timestamp as "timestamp", source
       FROM market.live_quotes WHERE security_id = ANY($1)`,
      [securityIds]
    );
    return res.rows;
  },

  async getTopMovers(exchange: string, limit = 10): Promise<{ gainers: Quote[]; losers: Quote[] }> {
    const cols = `security_id as "securityId", symbol, exchange, last_price as "lastPrice", open, high, low,
      previous_close as "previousClose", change, change_percent as "changePercent", volume, bid, ask,
      market_cap as "marketCap", currency, status, event_timestamp as "timestamp", source`;
    const [gainers, losers] = await Promise.all([
      query<any>(`SELECT ${cols} FROM market.live_quotes WHERE exchange = $1 AND status = 'active' ORDER BY change_percent DESC LIMIT $2`, [exchange, limit]),
      query<any>(`SELECT ${cols} FROM market.live_quotes WHERE exchange = $1 AND status = 'active' ORDER BY change_percent ASC LIMIT $2`, [exchange, limit]),
    ]);
    return { gainers: gainers.rows, losers: losers.rows };
  },
};
