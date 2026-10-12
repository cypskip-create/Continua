import test from 'node:test';
import assert from 'node:assert/strict';
import {stockDirectory} from '../src/lib/stockDirectory.ts';
import {readFileSync} from 'node:fs';
test('live directory retains new listings without relying on the fixed metadata list',()=>{
 const stocks=stockDirectory([
  {symbol:'NEW',companyName:'New Issuer',sector:'Energy',status:'active'},
  {symbol:'DTB',companyName:'DTB',sector:'Unknown',status:'active'},
  {symbol:'OLD',companyName:'Old Issuer',sector:null,status:'delisted'},
 ] as any);
 assert.deepEqual(stocks.map(s=>s.symbol),['NEW','DTB']);
 assert.equal(stocks[0].name,'New Issuer');assert.equal(stocks[1].name,'Diamond Trust Bank Kenya Ltd');
 assert.equal(stocks[1].sector,'Banking');
 assert.deepEqual(stocks[1].aliases,['DTK']);
});
test('directory fallback includes KPC distinctly from KPLC',()=>{
 const stocks=stockDirectory([]);
 assert.equal(stocks.find(s=>s.symbol==='KPC')?.name,'Kenya Pipeline Company PLC');
 assert.equal(stocks.find(s=>s.symbol==='KPLC')?.name,'Kenya Power & Lighting Company');
});
test('rolling feedback preserves actual values and reduced-motion accessibility',()=>{
 const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
 const ui=read('../src/components/shared/RollingNumber.tsx');
 assert.ok(ui.includes('const from = previous.current'));assert.ok(ui.includes('aria-hidden="true"'));assert.ok(ui.includes('sr-only'));
 assert.ok(read('../src/index.css').includes('prefers-reduced-motion: reduce'));
 const haptics=read('../src/lib/haptics.ts');assert.ok(haptics.includes('typeof navigator.vibrate'));assert.ok(haptics.includes('hasBeenActive'));assert.ok(haptics.includes('visibilityState'));
});
