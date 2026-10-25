import test from 'node:test';import assert from 'node:assert/strict';
import {readAccountSnapshot,saveAccountSnapshot} from '../src/lib/accountSnapshot.ts';
test('account display hints isolate owners, retain all plans and reject expired or future snapshots',()=>{
 const rows=new Map<string,string>(),storage={getItem:(key:string)=>rows.get(key)??null,setItem:(key:string,value:string)=>{rows.set(key,value);}};
 for(const plan of ['free','premium','premium_plus']){const profile={user_id:'owner',subscription_plan:plan} as any;saveAccountSnapshot(storage,'owner',profile,100);assert.equal(readAccountSnapshot(storage,'owner',200)?.profile.subscription_plan,plan);assert.equal(readAccountSnapshot(storage,'other',200),undefined);assert.equal(readAccountSnapshot(storage,'owner',100+24*60*60_000),undefined);assert.equal(readAccountSnapshot(storage,'owner',99),undefined);}
 saveAccountSnapshot(storage,'other',{user_id:'owner'} as any,100);assert.equal(readAccountSnapshot(storage,'other',200),undefined);
});
