import { query } from "../db.js";
import type { MarketIndex } from "../../types/market.js";

export const indicesRepository = {
  async upsertIndex(idx: MarketIndex): Promise<void> {
    await query(
      `INSERT INTO market.indices
         (id, code, name, exchange, value, previous_close, change, change_percent, currency, event_timestamp, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (exchange, code) DO UPDATE SET
         value = EXCLUDED.value, previous_close = EXCLUDED.previous_close, change = EXCLUDED.change,
         change_percent = EXCLUDED.change_percent, event_timestamp = EXCLUDED.event_timestamp,
         source = EXCLUDED.source, updated_at = now()
       WHERE EXCLUDED.event_timestamp >= market.indices.event_timestamp OR market.indices.source <> 'eod'`,
      [idx.id, idx.code, idx.name, idx.exchange, idx.value, idx.previousClose, idx.change,
       idx.changePercent, idx.currency, idx.timestamp, idx.source]
    );
  },

  async upsertIndicesBatch(indices: MarketIndex[]): Promise<void> {
    for (const idx of indices) await this.upsertIndex(idx);
  },

  async listByExchange(exchange: string): Promise<MarketIndex[]> {
    const res = await query<any>(
      `SELECT id, code, name, exchange, value, previous_close as "previousClose", change,
              change_percent as "changePercent", currency, event_timestamp as "timestamp", source
       FROM market.indices WHERE exchange = $1 AND (exchange <> 'NSE' OR source = 'eod') ORDER BY code`,
      [exchange]
    );
    return res.rows;
  },
};
