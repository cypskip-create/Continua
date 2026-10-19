import test from 'node:test';import assert from 'node:assert/strict';
import worker,{canonicalOrigin} from './legacy-redirect.mjs';
test('old page and public media addresses redirect only to the pinned owned origin',()=>{
 for(const path of ['/auth','/stock/CGEN?tab=overview','/media/avatars/fixture.png','//attacker.invalid/path']){
 const r=worker.fetch(new Request('https://continua-preview.cypriankiprop41.workers.dev'+path));assert.equal(r.status,307);assert.equal(new URL(r.headers.get('Location')).origin,canonicalOrigin);
 }
});
test('old API requests fail as JSON and never forward login credentials across origins',async()=>{
 const r=worker.fetch(new Request('https://continua-preview.cypriankiprop41.workers.dev/api/session/auth/v1/token',{method:'POST',body:'fixture-password'}));
 assert.equal(r.status,410);assert.equal(r.headers.get('Location'),null);assert.equal((await r.json()).error_code,'app_address_changed');assert.equal(r.headers.get('Cache-Control'),'no-store');
});
