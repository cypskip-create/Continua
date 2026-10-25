import test from 'node:test';import assert from 'node:assert/strict';
import {recoverRead} from '../src/integrations/continua/readRecovery.js';
test('transient reads recover once without retrying writes, identity failures or challenges',async()=>{
 for(const status of [502,503,504,429]){let calls=0;const result=await recoverRead('/owned',{method:'GET'},async()=>++calls===1?Response.json({}, {status,headers:{'retry-after':'0'}}):Response.json({ok:true}),async()=>{});assert.equal(calls,2);assert.equal(result.status,200);}
 for(const [method,status,headers] of [['POST',503,{}],['GET',401,{}],['GET',403,{}],['GET',429,{'retry-after':'60'}],['GET',503,{'cf-mitigated':'challenge'}]] as const){let calls=0;await recoverRead('/owned',{method},async()=>{calls++;return Response.json({}, {status,headers});},async()=>{});assert.equal(calls,1);}
 let calls=0;await recoverRead('/owned',{},async()=>{calls++;throw Error('connection');},async()=>{}).catch(()=>{});assert.equal(calls,2);
});
