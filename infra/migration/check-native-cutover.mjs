import {readFile} from 'node:fs/promises';
const ledger=JSON.parse(await readFile(new URL('../../docs/architecture/NATIVE_REWRITE_LEDGER.json',import.meta.url),'utf8'));
const pending=ledger.features.filter(f=>!['ported','retained'].includes(f.status));
const routes=ledger.routes.filter(r=>r.status!=='verified');
const allowed=ledger.productionCutoverAllowed===true&&pending.length===0&&routes.length===0;
console.log(JSON.stringify({productionCutoverAllowed:allowed,pendingOrPartialFeatures:pending.length,unverifiedRoutesAndMounts:routes.length,
 message:allowed?'All declared gates approved.':'Native rewrite is INCOMPLETE. Keep the deployed service as reference/rollback.'}));
if(!allowed)process.exitCode=1;
