/** Exhaustive native-rewrite ledger. Most features remain pending; never hides them. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
const inventory=JSON.parse(await readFile(new URL('../../docs/architecture/FEATURE_LANGUAGE_DECISIONS.json',import.meta.url),'utf8'));
const nativePorts={
 'backend/src/services/technical/indicators.js':['engine-python/continua_engine/indicators.py','127-case native Python parity suite'],
 'backend/src/services/research/ratiosEngine.js':['engine-python/continua_engine/ratios.py','127-case native Python parity suite'],
 'backend/src/services/technical/valuationHistory.js':['engine-python/continua_engine/valuation.py','127-case native Python parity suite'],
 'backend/src/services/research/enginePortfolio.js':['engine-python/continua_engine/portfolio.py','127-case native Python parity suite'],
 'backend/src/services/research/engineMonitoring.js':['engine-python/continua_engine/monitoring.py','127-case native Python parity suite'],
 'backend/src/services/research/dividendMetrics.js':['engine-python/continua_engine/dividends.py','127-case native Python parity suite'],
 'backend/src/services/research/reportedResearch.js':['engine-python/continua_engine/reported.py','127-case native Python parity suite'],
};
const partial={
 'backend/src/services/paystackCommon.js':'Go prices and exact-body HMAC are implemented; checkout agreements/provider URL contracts still require complete parity.',
 'backend/src/services/paystackNative.js':'Go native input/phone validation exists; provider execution, fulfillment, recovery and renewal are NOT yet ported.',
 'backend/src/api/middleware/apiKeyAuth.js':'Native Go lookup/hash/cache exists; full middleware/error/rate-limit golden contracts are still required.',
 'backend/src/storage/repositories/pricesRepository.js':'Native Go quote reads exist; writes/movers/freshness/ingestion remain pending.',
 'backend/src/services/research/enginePreferences.js':'Native Python opt-in preference calculations exist; full schema/persistence/API/consent integration remains pending.',
 'backend/src/api/middleware/requireSubscriber.js':'Native Go verified user/plan and Premium/Plus helpers exist; complete route integration remains pending.',
 'scraper/src/storage/r2Storage.js':'Native Python streaming private upload/verification exists; full read/migration/retry/operator integration remains pending.',
 'scraper/src/crawler/urlSafety.js':'Native Python DNS pinning/source policy exists; whole collector integration and source regression coverage remain pending.',
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
const routes=modules.flatMap(m=>m.routes.map(r=>({legacyFile:m.file,...r,status:'pending',note:r.path===null?'Dynamic mount: manual resolution required.':'Full auth/validation/behavior port required.'})));
const ledger={schemaVersion:1,asOf:'2026-10-13',scope:'Full native-runtime rewrite; not the already-deployed TS-to-JS migration.',productionCutoverAllowed:false,
 nativeCandidate:'backend-go/cmd/continua (loopback only; readiness deliberately 503)',features,routes,
 requiredReleaseGates:['All source features ported or deliberately retained with rationale','Every route/mount resolved and tested','Native auth/ownership/entitlements parity','Signed payment/idempotency/recovery/test-mode parity','Every worker/adapter/publication/mapping ported','Financial numerical/missing-data/provenance parity','Restart/retry/queue/R2 recovery parity','Render-equivalent memory/concurrency/recovery load tests','Rollback and hosted smoke checks']};
await writeFile(new URL('../../docs/architecture/NATIVE_REWRITE_LEDGER.json',import.meta.url),JSON.stringify(ledger,null,2)+'\n');
const counts={};for(const f of features)counts[f.status]=(counts[f.status]??0)+1;
console.log(JSON.stringify({sourceFeatures:features.length,counts,routeAndMountEntries:routes.length,productionCutoverAllowed:false}));
