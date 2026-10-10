/** Operator-reviewed observations only. Never imports arbitrary publisher claims as IPO facts. */
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { pool, withTransaction } from "../src/storage/db.js";
import { MarketResearchRecordSchema } from "../src/ingestion/normalizers/marketResearchRecord.js";
import { normalizeNseIndices } from "../src/adapters/nse/nseIndices.js";
const path = process.argv[2],
  reviewed = process.argv.includes("--reviewed");
try {
  if (!path)
    throw new Error(
      "Usage: npm run research:import -- records.json [--reviewed]. Without --reviewed this only validates.",
    );
  const records = z
    .array(MarketResearchRecordSchema)
    .max(2000)
    .parse(JSON.parse(await readFile(path, "utf8")));
  if (!reviewed) {
    console.log(
      `Validated ${records.length} observations. No database changes made.`,
    );
  } else {
    await withTransaction(async (db) => {
      for (const r of records) {
        await db.query(
          `INSERT INTO market.research_records(id,kind,title,symbol,observed_at,source_url,payload,verified_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT(id) DO UPDATE SET kind=EXCLUDED.kind, symbol=EXCLUDED.symbol, title=EXCLUDED.title, observed_at=EXCLUDED.observed_at,
      source_url=EXCLUDED.source_url,payload=EXCLUDED.payload,verified_at=now(),updated_at=now()`,
          [
            r.id,
            r.kind,
            r.title,
            r.symbol,
            r.observedAt,
            r.sourceUrl,
            JSON.stringify(r.payload),
          ],
        );
        if (r.kind === "market_statistics" && r.payload.unit === "points" && r.payload.change != null && new URL(r.sourceUrl).hostname.endsWith("nse.co.ke")) {
          const indices = normalizeNseIndices([{ kind: "nse_index", code: r.payload.indicator, value: r.payload.actual, change: r.payload.change, asOf: r.observedAt }]);
          for (const idx of indices) await db.query(`INSERT INTO market.indices(id,code,name,exchange,value,previous_close,change,change_percent,currency,event_timestamp,source)
            VALUES($1,$2,$3,'NSE',$4,$5,$6,$7,'KES',$8,'eod') ON CONFLICT(exchange,code) DO UPDATE SET
              value=EXCLUDED.value,previous_close=EXCLUDED.previous_close,change=EXCLUDED.change,change_percent=EXCLUDED.change_percent,
              event_timestamp=EXCLUDED.event_timestamp,source='eod' WHERE EXCLUDED.event_timestamp >= market.indices.event_timestamp`,
          [idx.id,idx.code,idx.name,idx.value,idx.previousClose,idx.change,idx.changePercent,idx.timestamp]);
        }
      }
    });
    console.log(`Published ${records.length} reviewed official observations.`);
  }
} catch (error) {
  console.error(
    error instanceof z.ZodError
      ? "Invalid observations; review required."
      : error instanceof Error
        ? error.message
        : "Import failed",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
