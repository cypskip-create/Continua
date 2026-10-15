import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {BondLabSchema,FuturesLabSchema} from '../../backend/src/services/research/engineLabSchemas.js';
import {bondRisk,futuresRisk} from '../../backend/src/services/research/engineRiskLab.js';
const now='2026-10-14T12:00:00.000Z';let count=0;
function compare(a,b){
 if(typeof a==='number'&&typeof b==='number'){assert.ok(Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b)));return;}
 if(Array.isArray(a)&&Array.isArray(b)){assert.equal(a.length,b.length);a.forEach((v,i)=>compare(v,b[i]));return;}
 if(a&&b&&typeof a==='object'&&typeof b==='object'){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());for(const k of Object.keys(a))compare(a[k],b[k]);return;}
 assert.deepEqual(a,b);
}
const bond={settlement:'2026-03-01',previousCoupon:'2026-01-01',nextCoupon:'2026-07-01',couponPerPeriod:5,yieldPercent:10,frequency:2,cashFlows:[{date:'2026-07-01',amount:5},{date:'2027-01-01',amount:105}],shockBps:100};
const futures={entry:100,settlement:105,multiplier:10,contracts:2,side:'long',margin:1000,expiry:'2026-12-01',asOf:'2026-10-14',shockPercent:-10};
for(const [kind,schema,calc,fixtures]of [['bond',BondLabSchema,bondRisk,[bond,{...bond,yieldPercent:0,shockBps:0},{...bond,nextCoupon:'2026-03-02'},{...bond,cashFlows:[{date:'2026-02-01',amount:105}]},{...bond,shockBps:-1000},{...bond,frequency:true}]],['futures',FuturesLabSchema,futuresRisk,[futures,{...futures,side:'short'},{...futures,expiry:'2026-01-01'},{...futures,contracts:true},{...futures,contracts:0},{...futures,extra:1}]]])for(const input of fixtures){
 const parsed=schema.safeParse(input),expected=parsed.success?{status:200,data:{...calc(parsed.data),assumptions:parsed.data,generatedAt:now}}:{status:400,error:'Invalid Engine lab assumptions'};
 const p=spawnSync(process.env.NATIVE_PYTHON_BIN??'python3',[fileURLToPath(new URL('../../engine-python/worker.py',import.meta.url))],{input:JSON.stringify({operation:'lab_calculation',args:[kind,input,now]}),encoding:'utf8',timeout:5000,maxBuffer:4194304,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PYTHONUTF8:'1'}});
 assert.equal(p.status,0);compare(JSON.parse(p.stdout),JSON.parse(JSON.stringify(expected)));count++;
}
console.log(JSON.stringify({nativeRiskLabComparisons:count,passed:true,fixtureOnly:true,productionCutover:false}));
