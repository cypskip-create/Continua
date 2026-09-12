import { query } from "../db.js";

export interface DeadLetterRecord {
  exchange: string;
  dataset: "price" | "candle" | "financials" | "corporate_action" | "earnings" | "ownership" | "index" | "announcement" | "financial_statement_candidate" | "news";
  symbol: string | null;
  payload: unknown;
  error: string;
}

/** Records that failed validation or exhausted their retries — preserved
 *  for manual review instead of only appearing as a truncated string in
 *  ingestion_logs.errors. This is what "dead-letter handling" in the spec
 *  means in practice: nothing silently vanishes, even when it can't be
 *  automatically processed. */
export const deadLetterRepository = {
  async record(entry: DeadLetterRecord): Promise<void> {
    await query(
      `INSERT INTO market.dead_letters (exchange, dataset, symbol, payload, error, occurred_at)
       VALUES ($1,$2,$3,$4,$5, now())`,
      [entry.exchange, entry.dataset, entry.symbol, JSON.stringify(entry.payload), entry.error]
    );
  },

  async recordBatch(entries: DeadLetterRecord[]): Promise<void> {
    for (const entry of entries) await this.record(entry);
  },

  async recent(limit = 100): Promise<any[]> {
    const res = await query<any>(
      `SELECT id, exchange, dataset, symbol, payload, error, occurred_at as "occurredAt"
       FROM market.dead_letters ORDER BY occurred_at DESC LIMIT $1`,
      [limit]
    );
    return res.rows;
  },
};