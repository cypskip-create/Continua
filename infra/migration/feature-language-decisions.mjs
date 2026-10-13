/** Deterministic feature inventory; primary references and rationale accompany
 * every implementation module. Emits a reviewed documentation artifact, not code.
 */
import {readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const categories={
 api:{language:'JavaScript',runtime:'Node.js',reason:'Bounded HTTP/database I/O, supported Express/pg libraries and existing tested wire contracts. No measured gain justifies another API runtime.',references:['https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop','https://expressjs.com/']},
 billing:{language:'JavaScript',runtime:'Node.js',reason:'Server-only provider I/O and native crypto; preserve signed raw-body webhooks, integer prices, atomic PostgreSQL fulfillment and ownership. Direct card collection is not authorized.',references:['https://paystack.com/docs/payments/verify-payments/','https://paystack.com/docs/payments/webhooks/','https://paystack.com/docs/payments/charge-card/']},
 engine:{language:'JavaScript',runtime:'Node.js',reason:'Evidence assembly and data reads fit async Node. Existing bounded calculations retain proven numerical contracts; Python alternatives require comparative load/latency evidence before default activation.',references:['https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop','https://docs.python.org/3/library/subprocess.html']},
 storage:{language:'JavaScript + SQL',runtime:'Node.js + PostgreSQL',reason:'Node manages async connection I/O; SQL owns transactions, queue claims, database constraints and row-level privacy. A language change must not move integrity into client-side checks.',references:['https://node-postgres.com/features/transactions','https://www.postgresql.org/docs/current/ddl-rowsecurity.html']},
 browser:{language:'JavaScript',runtime:'Node.js + Chromium',reason:'Existing Playwright/Cheerio adapter ecosystem; changing to Python would retain Chromium cost while requiring a new unproven adapter implementation. Preserve robots, source permission and bounded navigation.',references:['https://playwright.dev/docs/library','https://cheerio.js.org/docs/intro']},
 extraction:{language:'JavaScript + Python + native C++ tools',runtime:'Node.js orchestration; Python/pdfplumber or Poppler/Tesseract',reason:'Separate document parsing from the API. Poppler remains the validated native-text default; isolated Python layout extraction is opt-in, bounded, provenance-versioned and review-required. OCR never invents table/year structure.',references:['https://github.com/jsvine/pdfplumber','https://poppler.freedesktop.org/','https://tesseract-ocr.github.io/']},
 jobs:{language:'JavaScript + SQL',runtime:'Node.js + PostgreSQL',reason:'Bounded asynchronous source I/O and durable SQL claims; preserve single-flight work, retries and scheduled ordering. Serial cold-start enrichment reduces shared-pool contention.',references:['https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop','https://www.postgresql.org/docs/current/sql-select.html']},
 edge:{language:'JavaScript',runtime:'Supabase/Deno',reason:'Officially supported JS entrypoints use the provider-native runtime. Retain explicit JWT/cron checks; no separate paid hosting or unsupported Go/Python Edge runtime.',references:['https://supabase.com/docs/guides/functions/function-configuration','https://supabase.com/docs/guides/functions/development-tips']},
 operations:{language:'JavaScript',runtime:'Node.js',reason:'Use the service-native runtime for operator scripts, input validation, adapter utilities and diagnostics; adding processes provides no demonstrated advantage for these small control-plane tasks.',references:['https://nodejs.org/en/learn/command-line/run-nodejs-scripts-from-the-command-line']},
 python:{language:'Python',runtime:'Isolated subprocess',reason:'Implemented optional document/numerical worker, no database/provider secrets inherited; bounded process and output contracts. Installation and numerical parity alone do not prove faster production performance.',references:['https://docs.python.org/3/library/subprocess.html','https://github.com/jsvine/pdfplumber']},
 sql:{language:'SQL',runtime:'PostgreSQL/Supabase',reason:'The database is the appropriate authority for integrity, RLS, atomic entitlement transitions and durable scheduling/queue structures. Retain these rather than reimplementing them in application memory.',references:['https://www.postgresql.org/docs/current/ddl-rowsecurity.html','https://www.postgresql.org/docs/current/tutorial-transactions.html']},
};
async function walk(dir){return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]))).flat();}
function category(file){
 if(file.startsWith('supabase/functions/'))return 'edge';if(file.endsWith('.sql'))return 'sql';if(file.endsWith('.py'))return 'python';
 if(/billing|paystack|cardRenewal/i.test(file))return 'billing';
 if(file.includes('/storage/')||file.includes('/streaming/'))return 'storage';
 if(file.startsWith('backend/src/services/'))return 'engine';
 if(file.includes('/api/'))return 'api';
 if(file.startsWith('scraper/src/extraction/'))return 'extraction';
 if(file.startsWith('scraper/src/crawler/')||file.startsWith('scraper/src/adapters/'))return 'browser';
 if(/\/workers\/|\/scheduler\/|\/ingestion\//.test(file))return 'jobs';return 'operations';
}
const files=[];
for(const dir of ['backend/src','backend/scripts','backend/python','scraper/src','scraper/scripts','scraper/python','supabase/functions','supabase/migrations']){
 for(const file of await walk(path.join(root,dir))) {
  if(!/\.(js|mjs|py|sql)$/.test(file)||/\.test\./.test(file))continue;
  const relative=path.relative(root,file).replaceAll('\\','/');
  const group=category(relative);const source=await readFile(file,'utf8');
  files.push({file:relative,category:group,...categories[group],classificationBasis:'workload and integration review; not an individual benchmark',...(source.trim()==='export {};'?{note:'Runtime stub for a non-executable type contract; no business logic.'}:{})});
 }
}
files.sort((a,b)=>a.file.localeCompare(b.file));
const target=path.join(root,'docs/architecture/FEATURE_LANGUAGE_DECISIONS.json');
await writeFile(target,JSON.stringify({reviewDate:'2026-10-13',scope:'Every backend/Engine/scraper runtime module, operator script, Edge entrypoint and existing SQL migration',method:'Workload-specific rationale, supported tooling and feature-preserving tests; not a universal fastest-language claim.',runtimeImplementationsUseTypeScript:false,features:files},null,2)+'\n');
console.log(JSON.stringify({featureModulesReviewed:files.length,groups:[...new Set(files.map(f=>f.category))].sort(),artifact:'docs/architecture/FEATURE_LANGUAGE_DECISIONS.json'}));
