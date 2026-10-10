import { readFile } from "node:fs/promises";
import { z } from "zod";
import { HistoricalPriceRecordSchema } from "../src/ingestion/normalizers/historicalPriceRecord.js";
import { pool, withTransaction } from "../src/storage/db.js";
const input = process.argv[2];
try {
  if (!input) throw new Error("Usage: npm run history:import -- observations.json [--reviewed]. Without --reviewed, validates only.");
  const rows = z.array(HistoricalPriceRecordSchema).min(1).max(200000).parse(JSON.parse(await readFile(input,"utf8")));
  const keys = new Set<string>();
  for (const r of rows) { const key = `${r.symbol}:${r.date}`; if (keys.has(key)) throw new Error(`Duplicate observation: ${key}`); keys.add(key); }
  await withTransaction(async db => {
    // Resolve every ticker first, so unsupported symbols abort the entire import.
    const securities = await db.query<{ id: string; symbol: string }>("SELECT id,symbol FROM market.securities WHERE exchange='NSE' AND status='active' AND symbol=ANY($1)", [[...new Set(rows.map(r => r.symbol))]]);
    const ids = new Map(securities.rows.map(r => [r.symbol,r.id]));
    for (const r of rows) if (!ids.has(r.symbol)) throw new Error(`Unknown active NSE ticker: ${r.symbol}`);
    if (!process.argv.includes("--reviewed")) return;
    for (const r of rows) {
      const id = ids.get(r.symbol)!;
      const timestamp = `${r.date}T00:00:00Z`;
      // No silent replacement of earlier history from another source.
      const stored = await db.query("SELECT open,high,low,close,volume FROM market.candles WHERE security_id=$1 AND interval='1d' AND bar_time=$2 FOR UPDATE", [id,timestamp]);
      if (stored.rows[0] && ["open","high","low","close","volume"].some(key => Number(stored.rows[0][key]) !== r[key as "open"])) throw new Error(`Conflicting existing history for ${r.symbol} ${r.date}; review the source first`);
      await db.query(`INSERT INTO market.candles(security_id,interval,bar_time,open,high,low,close,volume)
        VALUES($1,'1d',$2,$3,$4,$5,$6,$7) ON CONFLICT(security_id,interval,bar_time) DO NOTHING`, [id,timestamp,r.open,r.high,r.low,r.close,r.volume]);
      const canonical = await db.query("SELECT open,high,low,close,volume FROM market.candles WHERE security_id=$1 AND interval='1d' AND bar_time=$2 FOR UPDATE", [id,timestamp]);
      if (["open","high","low","close","volume"].some(key => Number(canonical.rows[0]?.[key]) !== r[key as "open"])) throw new Error(`Concurrent conflicting history for ${r.symbol} ${r.date}`);
      await db.query(`INSERT INTO market.price_history_sources(security_id,bar_time,source_url,permission_reference,adjustment)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(security_id,bar_time,source_url) DO NOTHING`, [id,timestamp,r.sourceUrl,r.permissionReference,r.adjustment]);
    }
  });
  console.log(`${process.argv.includes("--reviewed") ? "Imported" : "Validated"} ${rows.length} historical observations. Daily, weekly and monthly charts use the daily bars.`);
} catch(error) {
  console.error(error instanceof z.ZodError ? "Invalid price observations; review date, OHLC, currency and permission reference." : error instanceof Error ? error.message : "Historical import failed");
  process.exitCode=1;
} finally { await pool.end(); }
