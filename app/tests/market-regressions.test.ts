import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sectorKey,sectorMembers} from '../src/lib/sectors.ts';
import {NSE_SECURITIES} from '../src/data/nseSecurities.ts';
import {checkoutBackTarget} from '../src/lib/checkout.ts';
test('every catalogue sector and official alias resolves to members',()=>{
 const directory=NSE_SECURITIES.map(stock=>({symbol:stock.ticker,sector:stock.sector}));
 for(const sector of new Set(directory.map(stock=>stock.sector)))assert.ok(sectorMembers(directory,sector).length,sector);
 for(const [official,short] of [['Energy & Petroleum','Energy'],['Manufacturing & Allied','Manufacturing'],['Construction and Allied','Construction'],['Agricultural','Agriculture'],['Investment Services','Financial Services'],['Real Estate Investment Trusts','Real Estate']]){
  assert.equal(sectorKey(official),sectorKey(short));
  assert.deepEqual(sectorMembers(directory,official),sectorMembers(directory,short));
 }
 assert.deepEqual(sectorMembers(directory,'invented sector'),[]);
});
test('checkout back pops known plans history and replaces direct entries',()=>{
 assert.equal(checkoutBackTarget(2,true),-1);
 assert.equal(checkoutBackTarget(undefined,true),'/upgrade');
 assert.equal(checkoutBackTarget(0,true),'/upgrade');
 assert.equal(checkoutBackTarget(5,false),'/upgrade');
 const stack=['/account','/upgrade','/checkout'];
 if(checkoutBackTarget(2,true)===-1)stack.pop();
 stack.pop();assert.equal(stack.at(-1),'/account');assert.ok(!stack.includes('/checkout'));
});
test('viewport clips overflow at the document, leaving body sticky ownership intact',()=>{
 const css=readFileSync(new URL('../src/index.css',import.meta.url),'utf8');
 assert.match(css,/html\s*\{\s*overflow-x:\s*hidden/);
 assert.match(css,/body\s*\{\s*overflow-x:\s*clip/);
 const checkout=readFileSync(new URL('../src/pages/Checkout.tsx',import.meta.url),'utf8');
 assert.ok(checkout.includes('onClick={backToPlans}'));assert.ok(checkout.includes('replace:true,state:{fromCheckout:true}'));
});
