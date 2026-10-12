import test from 'node:test';import assert from 'node:assert/strict';
import {checkoutDestination,paymentReferencePattern} from '../src/lib/checkout.ts';
import {readFileSync} from 'node:fs';
test('website checkout destination has only plan and cycle, never an auth token',()=>{
 assert.equal(checkoutDestination('https://continua.tools','premium_plus','monthly'),'https://continua.tools/checkout?plan=premium_plus&cycle=monthly');
 assert.throws(()=>checkoutDestination('http://evil.example','premium_plus','monthly'));
 assert.throws(()=>checkoutDestination('https://user:password@example.com','premium_plus','monthly'));
 assert.throws(()=>checkoutDestination('https://continua.tools','admin','monthly'));
});
test('checkout uses secure provider fields and server verification, not merchant card inputs',()=>{
 const ui=readFileSync(new URL('../src/pages/Checkout.tsx',import.meta.url),'utf8');
 assert.ok(ui.includes('resumeTransaction'));assert.ok(ui.includes('/billing/verify/'));assert.match(ui,/receipt\?\.mode\s*===\s*["']live["']\s*&&\s*receipt.status\s*===\s*["']paid["']/);
 assert.ok(!ui.includes('name="cvv"'));assert.ok(!ui.includes('name="card_number"'));assert.ok(!ui.includes('sk_live_'));
 assert.ok(paymentReferencePattern.test('continua-live-00000000-0000-0000-0000-000000000001'));
});
