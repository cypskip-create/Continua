import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const {AdvancedResearchSchema,advancedResearch}=await import('../../backend/src/services/research/advancedResearch.js');
const {analyseMarket}=await import('../../backend/src/services/research/marketIntelligence.js');
const now='2026-10-14T12:00:00.000Z';let count=0;
function compare(a,b,path='root'){
 if(typeof a==='number'&&typeof b==='number'){assert.ok(Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b)),path);return;}
 if(Array.isArray(a)&&Array.isArray(b)){assert.equal(a.length,b.length,path);a.forEach((v,i)=>compare(v,b[i],`${path}.${i}`));return;}
 if(a&&b&&typeof a==='object'&&typeof b==='object'){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort(),path);for(const k of Object.keys(a))compare(a[k],b[k],`${path}.${k}`);return;}
 assert.deepEqual(a,b,path);
}
function check(operation,args,expected){
 const p=spawnSync(process.env.NATIVE_PYTHON_BIN??'python3',[fileURLToPath(new URL('../../engine-python/worker.py',import.meta.url)),...(operation==='run_advanced'?['--research']:[])],{input:JSON.stringify({operation,args}),encoding:'utf8',timeout:5000,maxBuffer:4194304,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PYTHONUTF8:'1'}});
 assert.equal(p.status,0,operation);compare(JSON.parse(p.stdout),JSON.parse(JSON.stringify(expected)));count++;
}
const points=Array.from({length:240},(_,i)=>({date:new Date(Date.UTC(2024,0,i+1)).toISOString().slice(0,10),close:100+Math.sin(i*.3)*5+i*.01}));
const base={points,sourceUrl:'https://fixture.example/prices',additionalSourceUrls:['https://fixture.example/prices','https://fixture.example/archive']};
const factor=points.map((p,i)=>({date:p.date,portfolioReturn:Math.sin(i*.3)*.01+Math.cos(i*.2)*.004,factors:{market:Math.sin(i*.3)*.01,rate:Math.cos(i*.2)*.01}}));
const fixtures=[
 {...base,kind:'replay',start:points[5].date,end:points[100].date},
 {...base,kind:'benchmark',basis:'price',benchmark:points.map((p,i)=>({...p,close:200+Math.cos(i*.2)*6})),benchmarkSourceUrl:'https://fixture.example/index'},
 {...base,kind:'total-return',actionCoverageConfirmed:true,actions:[{date:points[20].date,dividend:1,sourceUrl:'https://fixture.example/dividend'}]},
 {kind:'factor-risk',observations:factor,sourceUrl:'https://fixture.example/returns',basis:'price',factorSources:{market:'https://fixture.example/market',rate:'https://fixture.example/rate'}},
 {kind:'cross-asset',currency:'KES',positions:[{name:' Cash ',assetClass:'cash',value:100,asOf:'2024-01-01',sourceUrl:'https://fixture.example/a'},{name:'Equity',assetClass:'equity',value:200,asOf:'2024-01-01',sourceUrl:'https://fixture.example/b'}]},
 ...[1,123,2147483646].map(seed=>({...base,kind:'bootstrap',paths:100,horizon:30,blockSize:5,seed})),
 {...base,kind:'bootstrap',paths:1000,horizon:252,blockSize:20,seed:123},
 {...base,kind:'replay',start:'2020-01-01',end:points[100].date},
 {...base,kind:'benchmark',basis:'price',benchmark:points.slice(1),benchmarkSourceUrl:'https://fixture.example/index'},
 {kind:'factor-risk',observations:factor.map(p=>({...p,factors:{market:1,rate:1}})),sourceUrl:'https://fixture.example/a',basis:'price',factorSources:{market:'https://fixture.example/market',rate:'https://fixture.example/rate'}},
 {...base,kind:'bootstrap',paths:1001,horizon:30,blockSize:5,seed:1},
 {...base,kind:'replay',start:points[5].date,end:points[100].date,userId:'other'},
];
for(const input of fixtures){
 const parsed=AdvancedResearchSchema.safeParse(input);let expected;
 if(!parsed.success)expected={status:400,error:'Invalid advanced research input'};
 else try{expected={status:200,data:advancedResearch(parsed.data,new Date(now))};}catch(e){expected={status:422,error:e.message};}
 check('run_advanced',[input,now],expected);
}
for(const rows of [[],[-8,-7,-6,-5,-4,-3,-2,0,1,3,5,7,8,null].map((v,i)=>({symbol:'S'+i,changePercent:v,sector:i%2?'Banking':null,volume:null,timestamp:now})),Array.from({length:100},(_,i)=>({symbol:'S'+i,changePercent:Math.sin(i),sector:'Mixed',volume:0,timestamp:now}))])check('analyse_market',[rows],analyseMarket(rows));
console.log(JSON.stringify({nativeAdvancedAndMarketComparisons:count,passed:true,fixtureOnly:true,productionCutover:false}));
