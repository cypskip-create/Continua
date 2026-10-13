/** Exhaustive native-rewrite ledger. Most features remain pending; never hides them. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
const inventory=JSON.parse(await readFile(new URL('../../docs/architecture/FEATURE_LANGUAGE_DECISIONS.json',import.meta.url),'utf8'));
const nativePorts={
 'backend/src/services/research/enginePortfolioRisk.js':['engine-python/continua_engine/risk.py','Native observed-return risk, covariance attribution and gap exclusion pass the expanded reference suite; no fabricated rates, prices or actual-account returns.'],
 'backend/src/services/analytics/candleAggregator.js':['engine-python/continua_engine/candles.py','177-case numerical/schema parity suite plus 28 owned-database read comparisons; all supported calendar intervals'],
 'backend/src/ingestion/normalizers/issuerIdentity.js':['engine-python/continua_engine/publisher.py','177-case native parity suite including exact legal suffix and masthead boundaries'],
 'backend/src/services/research/enginePreferences.js':['engine-python/continua_engine/preferences.py','177-case schema/opt-in calculation parity suite; native Go owner-scoped persistence and HTTP tests'],
 'backend/src/services/technical/indicators.js':['engine-python/continua_engine/indicators.py','127-case native Python parity suite'],
 'backend/src/services/research/ratiosEngine.js':['engine-python/continua_engine/ratios.py','127-case native Python parity suite'],
 'backend/src/services/technical/valuationHistory.js':['engine-python/continua_engine/valuation.py','127-case native Python parity suite'],
 'backend/src/services/research/enginePortfolio.js':['engine-python/continua_engine/portfolio.py','127-case native Python parity suite'],
 'backend/src/services/research/engineMonitoring.js':['engine-python/continua_engine/monitoring.py','127-case native Python parity suite'],
 'backend/src/services/research/dividendMetrics.js':['engine-python/continua_engine/dividends.py','127-case native Python parity suite'],
 'backend/src/services/research/reportedResearch.js':['engine-python/continua_engine/reported.py','127-case native Python parity suite'],
};
const partial={
 'backend/src/services/research/engineWorkspace.js':'Native Go verified-owner portfolio positions and free overview use native Python calculations. Monitoring/cash-flow persistence and HTTP exist. Full portfolio research, snapshots/performance, peers, briefing and worker integration remain pending.',
 'backend/src/services/research/engineAnalytics.js':'Native Python annual diagnostics, source-quality warnings and illustrative scenarios pass reference comparisons. Snapshot fingerprint/change-detection compatibility remains pending.',
 'backend/src/services/research/engineRiskLab.js':'Native Python risk contributions and source-backed total-return adjustments pass reference comparisons; existing native numerical labs are reused. Complete lab-route/input contracts and integration remain pending.',
 'backend/src/services/paystackCommon.js':'Go prices, exact-body HMAC, strict agreements and provider URL contracts are implemented; full differential contract coverage and hosted integration remain required.',
 'backend/src/services/paystackNative.js':'Go provider execution, durable account-locked reservations, verified live SQL fulfillment/test isolation, optional token enrollment and recovery are implemented and mock-tested; production configuration, provider sandbox/golden/restart validation remain pending.',
 'backend/src/services/paystackLive.js':'Go legacy initialize/owner-scoped verification/recovery uses the retained atomic fulfillment function; legacy receipt/provider schema differential coverage and hosted tests remain pending.',
 'backend/src/api/routes/billing.routes.js':'Native Go account HTTP handlers and signed raw-body webhook exist; middleware delegate tests pass. Candidate startup intentionally does not activate billing/webhooks/renewals until configuration and end-to-end validation pass.',
 'backend/src/workers/cardRenewalWorker.js':'Go ten-minute scheduler, singleflight, durable locked reservations and verification-only ambiguous recovery exist; SQL/provider mocks pass. Restart/concurrent-host/provider sandbox and memory tests remain pending; worker is not launched.',
 'backend/src/api/middleware/apiKeyAuth.js':'Native Go lookup/hash/cache exists; full middleware/error/rate-limit golden contracts are still required.',
 'backend/src/storage/repositories/pricesRepository.js':'Native Go quote reads exist; writes/movers/freshness/ingestion remain pending.',
 'backend/src/storage/repositories/engineRepository.js':'Native Go preferences/save/record-interest preserve schema/ownership/interests. Monitoring list/save/delete and notifications are owner-scoped; save enforces capacity under an account lock. Snapshot observation, monitoring-worker evaluation/notifications and AI-budget methods remain pending.',
 'backend/src/storage/repositories/candlesRepository.js':'Native Go sourced candle/price/sparkline/high-low/average-volume reads exist and 28 owned-database comparisons pass; transactional batch writes remain pending.',
 'backend/src/storage/repositories/financialsRepository.js':'Native Go reviewed, nonfuture latest/history reads pass owned-database comparisons; canonical component/bundle writes and publication integration remain pending.',
 'backend/src/storage/repositories/securitiesRepository.js':'Native Go security/instrument/sector/company/publisher-profile reads pass owned-database comparisons; sector/company/security writes remain pending.',
 'backend/src/storage/repositories/indicesRepository.js':'Native Go publisher-EOD index reads pass comparisons; upsert/ingestion integration remains pending.',
 'backend/src/services/marketData/historicalService.js':'Native Go HTTP/cache/read and Python calendar aggregation pass fixtures and owned-database comparisons; complete legacy date-input/error-query compatibility and hosted load validation remain pending.',
 'backend/src/services/marketData/indexService.js':'Native Go read/cache and refresh callback hook exist; collector catch-up and index ingestion integration remain pending.',
 'backend/src/services/research/publisherFinancialTables.js':'Native Python strict raw table validator and Go permission/digest/ticker/tab/latest-category reads pass fixtures and owned-database comparisons; whole collector/publication and coverage validation remain pending.',
 'backend/src/services/research/publisherProfile.js':'Native Python exact issuer profile validation and Go publisher-digest/URL reads pass profile fixtures and owned-database comparisons; whole source collector and coverage validation remain pending.',
 'backend/src/storage/cache.js':'Native Go byte-bounded memory LRU/singleflight/TTL/cancellation pass tests. Redis and Upstash alternatives are not yet ported.',
 'backend/src/api/middleware/requireSubscriber.js':'Native Go verified user/plan and Premium/Plus helpers exist; complete route integration remains pending.',
 'scraper/src/storage/r2Storage.js':'Native Python streaming upload/verification and private temporary-file read/checksum/cleanup exist and tests pass. Full collector/backfill/operator integration and hosted recovery remain pending.',
 'scraper/src/storage/r2Archive.js':'Native Python bounded singleflight archive copies raw content and immutable extraction snapshots, retains originals, applies hash/size verification and version/path CAS, with cooldown and cancellation tests. Private legacy-reader driver, scheduler/boot/operator integration and hosted backfill/restart tests remain pending.',
 'scraper/src/crawler/urlSafety.js':'Native Python DNS pinning/source policy exists; whole collector integration and source regression coverage remain pending.',
 'scraper/src/storage/db.js':'Native psycopg async pool, bounded deadlines, transaction handling and disabled prepared statements pass real read-only owned-database connectivity; full collector integration/restart/load remains pending.',
 'scraper/src/storage/documentJobsRepository.js':'Native Python enqueue/claim/requeue/finish preserve durable attempt tokens and SKIP LOCKED recovery; mocked SQL/queue tests pass. Real concurrent claim/restart/adapter integration remains pending.',
 'scraper/src/storage/rawArtifactsRepository.js':'Native Python atomic hash upsert and URL attribution preserve artifact IDs and verified paths; transaction fixture tests pass. Whole private storage/collector integration remains pending.',
 'scraper/src/storage/extractionsRepository.js':'Native Python immutable insertion/latest/review/unextracted readers preserve versions, review flags and cooldown; fixtures pass. Whole extraction/operator/publication integration remains pending.',
 'scraper/src/storage/sourcesRepository.js':'Native Python source readers/upsert/insert-if-missing preserve permission fields and operator disables; fixtures pass. Built-in catalogue/adapter/boot integration remains pending.',
 'scraper/src/storage/crawlStateRepository.js':'Native Python discovery/claims/status/hash checkpoint methods add last-seen lease CAS and preserve active leases; fixtures pass. Full crawler/real restart integration remains pending.',
 'scraper/src/extraction/serialWorkQueue.js':'Native bounded serial queue/cancellation/failure recovery tests pass; all browser/PDF/archive scheduling integration and resource tests remain pending.',
 'scraper/src/adapters/kenyanstocks/tabPlan.js':'Native Python tab/category plans pass six pure reference comparisons; full browser-observed discovery/resume integration remains pending. Credential-bearing URLs are intentionally rejected.',
};
const features=[];
for(const item of inventory.features){
 const source=await readFile(new URL('../../'+item.file,import.meta.url),'utf8');
 const retained=item.file.endsWith('.sql')||item.file.endsWith('.py')||item.file.startsWith('supabase/functions/');
 const targetLanguage=item.file.endsWith('.sql')?'SQL':item.file.startsWith('supabase/functions/')?'JavaScript/Deno (provider-native)':item.file.startsWith('scraper/')||item.file.endsWith('.py')||/backend\/src\/services\/(research|technical|analytics|portfolio|screening)\//.test(item.file)?'Python':'Go';
 const status=nativePorts[item.file]?'ported':retained?'retained':partial[item.file]?'partial':'pending';
 features.push({legacyFile:item.file,legacySha256:createHash('sha256').update(source).digest('hex'),targetLanguage,status,
  rationale:targetLanguage==='Go'?'Native bounded HTTP/database/security/job runtime; no Node forwarding.':targetLanguage==='Python'?'Evidence/numerical/document tooling and asynchronous collection; bounded work required.':'Retain authoritative SQL or provider-compatible entrypoint.',
  ...(nativePorts[item.file]?{replacement:nativePorts[item.file][0],validation:nativePorts[item.file][1]}:{}),
  ...(partial[item.file]?{remaining:partial[item.file]}:{}),
 });
}
const result=spawnSync(process.execPath,['backend/scripts/exportMigrationInventory.js'],{cwd:root,encoding:'utf8',maxBuffer:4194304});
if(result.status!==0)throw new Error('Route inventory failed');
const modules=JSON.parse(result.stdout).modules;
const partialRoutes=new Set(['GET /indices','GET /instruments','GET /sectors','GET /quotes','GET /quotes/:symbol',
 'GET /companies/:symbol','GET /historical/sparklines','GET /historical/:symbol','GET /historical/:symbol/performance',
 'GET /financials/:symbol','GET /financials/:symbol/history','GET /financials/:symbol/publisher-tables',
 'GET /engine/preferences','POST /engine/preferences','POST /engine/interests','GET /engine/recommendations',
 'GET /engine/portfolio/overview','POST /engine/cash-flows','DELETE /engine/cash-flows/:id',
 'GET /engine/monitoring','POST /engine/monitoring','DELETE /engine/monitoring/:id','GET /engine/monitoring/activity']);
const routes=modules.flatMap(m=>m.routes.map(r=>({legacyFile:m.file,...r,status:partialRoutes.has(`${r.method} ${r.path}`)?'partial':'pending',
 note:partialRoutes.has(`${r.method} ${r.path}`)?'Native candidate handlers/SQL/Python exist; fixtures and read-only comparisons cover applicable paths. Full middleware/query/error, collector integration and hosted/load validation remain required.':r.path===null?'Dynamic mount: manual resolution required.':'Full auth/validation/behavior port required.'})));
const ledger={schemaVersion:1,asOf:'2026-10-13',scope:'Full native-runtime rewrite; not the already-deployed TS-to-JS migration.',productionCutoverAllowed:false,
 nativeCandidate:'backend-go/cmd/continua (loopback only; readiness deliberately 503)',features,routes,
 requiredReleaseGates:['All source features ported or deliberately retained with rationale','Every route/mount resolved and tested','Native auth/ownership/entitlements parity','Signed payment/idempotency/recovery/test-mode parity','Every worker/adapter/publication/mapping ported','Financial numerical/missing-data/provenance parity','Restart/retry/queue/R2 recovery parity','Render-equivalent memory/concurrency/recovery load tests','Rollback and hosted smoke checks']};
await writeFile(new URL('../../docs/architecture/NATIVE_REWRITE_LEDGER.json',import.meta.url),JSON.stringify(ledger,null,2)+'\n');
// Preserve deployed-language facts while recording the researched native target.
inventory.nativeRewrite={status:'in_progress',productionCutoverAllowed:false,ledger:'docs/architecture/NATIVE_REWRITE_LEDGER.json',
 boundaries:{backend:'Go for cancellable HTTP/auth/database/billing/streaming/jobs',engine:'Python for numerical/evidence/schema calculations; Go for authenticated persistence/API',scraper:'Python for bounded asynchronous collection/extraction, psycopg PostgreSQL and boto3 private R2',database:'Retained SQL/RLS/atomic fulfillment',providerEdge:'Retained provider-compatible JavaScript/Deno'},
 validation:'Go/Python component and read-only compatibility checks are not full release approval.'};
await writeFile(new URL('../../docs/architecture/FEATURE_LANGUAGE_DECISIONS.json',import.meta.url),JSON.stringify(inventory,null,2)+'\n');
const counts={};for(const f of features)counts[f.status]=(counts[f.status]??0)+1;
console.log(JSON.stringify({sourceFeatures:features.length,counts,routeAndMountEntries:routes.length,productionCutoverAllowed:false}));
