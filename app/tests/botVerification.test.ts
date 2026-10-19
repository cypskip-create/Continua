import test from 'node:test';import assert from 'node:assert/strict';
import {createVerificationCallbacks} from '../src/lib/botVerification.ts';
test('verification cannot wait forever and never invents a token',()=>{
 const tokens:string[]=[],issues:string[]=[];let fire:()=>void=()=>{};let delay=0;
 const callbacks=createVerificationCallbacks(t=>tokens.push(t),m=>issues.push(m),(fn,ms)=>{fire=fn;delay=ms;return 1 as any;},()=>{});
 assert.equal(delay,45000);fire();assert.equal(tokens.at(-1),'');assert.match(issues.at(-1)!,/taking too long/);
 callbacks.success('real-provider-fixture-token');assert.equal(tokens.at(-1),'real-provider-fixture-token');assert.equal(issues.at(-1),'');
});
test('expiry clears tokens and disposed challenges cannot change the next attempt',()=>{
 const tokens:string[]=[],issues:string[]=[];let cancelled=0;
 const callbacks=createVerificationCallbacks(t=>tokens.push(t),m=>issues.push(m),()=>1 as any,()=>{cancelled++;});
 callbacks.success('provider-fixture');callbacks.expired();assert.equal(tokens.at(-1),'');assert.match(issues.at(-1)!,/expired/);
 callbacks.dispose();const count=tokens.length;callbacks.success('stale-attempt');callbacks.timeout();assert.equal(tokens.length,count);assert.ok(cancelled>=2);
});
