import test from 'node:test';import assert from 'node:assert/strict';
import {checkoutDestination,paymentReferencePattern,validKenyanMobile} from '../src/lib/checkout.ts';
import {readFileSync} from 'node:fs';
test('website checkout destination has only plan and cycle, never an auth token',()=>{
 assert.equal(checkoutDestination('https://continua.tools','premium_plus','monthly'),'https://continua.tools/checkout?plan=premium_plus&cycle=monthly');
 assert.throws(()=>checkoutDestination('http://evil.example','premium_plus','monthly'));
 assert.throws(()=>checkoutDestination('https://user:password@example.com','premium_plus','monthly'));
 assert.throws(()=>checkoutDestination('https://continua.tools','admin','monthly'));
});
test('checkout uses secure provider fields and server verification, not merchant card inputs',()=>{
 const ui=readFileSync(new URL('../src/pages/Checkout.tsx',import.meta.url),'utf8');
 assert.ok(ui.includes('resumeTransaction'));assert.ok(ui.includes('/billing/native-verify/'));assert.ok(ui.includes('result.mode === "live" && result.status === "paid"'));
 assert.ok(!ui.includes('name="cvv"'));assert.ok(!ui.includes('name="card_number"'));assert.ok(!ui.includes('sk_live_'));
 assert.ok(paymentReferencePattern.test('continua-live-00000000-0000-0000-0000-000000000001'));
});
test('phone validation accepts Kenyan formats without accepting foreign numbers or arbitrary text',()=>{
 for(const value of ['0712345678','+254712345678','0112345678','0712 345 678'])assert.equal(validKenyanMobile(value),true);
 for(const value of ['123','+255712345678','0712345678abc'])assert.equal(validKenyanMobile(value),false);
});
test('native options stay in-page, exclude Till and never collect raw card details',()=>{
 const ui=readFileSync(new URL('../src/pages/Checkout.tsx',import.meta.url),'utf8');
 assert.ok(ui.includes("['mpesa','airtel','card']"));assert.ok(ui.includes('payment-accordion'));assert.ok(ui.includes('/billing/native-checkout'));
 assert.ok(!ui.includes('checkout.paystack.com'));assert.ok(!ui.includes('M-PESA Till'));assert.ok(ui.includes('intentId:intent.current'));
 assert.ok(ui.includes('Sandbox only. No real charge or paid access was created.'));assert.ok(ui.includes('Turn off automatic renewal'));
});
test('market rails are contained without turning the sticky shell into a scroll container',()=>{
 const css=readFileSync(new URL('../src/index.css',import.meta.url),'utf8');
 assert.match(css,/\.app-shell\s*\{[^}]*overflow-x:\s*clip/);assert.match(css,/\.marquee-container\s*\{[^}]*contain:\s*inline-size/);
});
