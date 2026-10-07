/** Operator-reviewed observations only. Never imports arbitrary publisher claims as IPO facts. */
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { pool, withTransaction } from "../src/storage/db.js";
import { MarketResearchRecordSchema } from "../src/ingestion/normalizers/marketResearchRecord.js";
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
      for (const r of records)
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
