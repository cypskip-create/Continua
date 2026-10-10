import dotenv from "dotenv";
// Local operator run only. Deployment continues to use injected service env.
dotenv.config({ path: "../backend/.env.local", quiet: true });
dotenv.config({ quiet: true });
const { pool, query } = await import("../src/storage/db.js");
const { ensureDefaultSources } = await import("../src/config/defaultSources.js");
const { nseAnnouncementsAdapter } = await import("../src/adapters/nse/announcementsAdapter.js");
const { runAdapter } = await import("../src/adapters/runAdapter.js");
const { enqueueDocuments } = await import("../src/storage/documentJobsRepository.js");
try {
  await ensureDefaultSources();
  const source = (await query("SELECT enabled FROM scraping.sources WHERE id='nse'")).rows[0];
  if (!source?.enabled) throw new Error("NSE filings source is disabled");
  if (process.argv.includes("--discover-only")) {
    const documents = await nseAnnouncementsAdapter.discover();
    await enqueueDocuments("nse", documents);
    console.log(JSON.stringify({ discovered:documents.length }));
  } else {
    const batchesArg = process.argv.find(v => v.startsWith("--batches="));
    const batches = Number(batchesArg?.split("=")[1] ?? 1);
    if (!Number.isInteger(batches) || batches < 1 || batches > 100) throw new Error("Batches must be 1..100");
    const adapter = process.argv.includes("--drain-only") ? { ...nseAnnouncementsAdapter, discover:async () => [] } : nseAnnouncementsAdapter;
    for (let i = 0; i < batches; i++) {
      const summary = await runAdapter(adapter);
      console.log(JSON.stringify({ batch:i+1, ...summary }));
      if (summary.fetched === 0 && summary.failed === 0) break;
    }
  }
  console.log(JSON.stringify({ jobs:(await query("SELECT status,count(*)::int AS count FROM scraping.document_jobs WHERE source_id='nse' GROUP BY status")).rows,
    archiveCoverage:(await query("SELECT archive_url,archive_year,cardinality(pages) AS pages,cardinality(completed_pages) AS completed FROM scraping.archive_checkpoints ORDER BY archive_url,archive_year")).rows }));
} catch (error) { console.error(JSON.stringify({error:(error as Error).message})); process.exitCode=1; }
finally { await pool.end(); }
