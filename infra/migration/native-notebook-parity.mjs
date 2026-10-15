import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const {ForecastCreateSchema,ForecastRevisionSchema,ForecastResolutionSchema,privateCalibration}=await import('../../backend/src/services/research/forecastNotebook.js');
const now='2026-10-14T12:00:00.000Z',RealDate=Date;
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return RealDate.parse(now);}};
let count=0;
function check(operation,args,expected){
 const p=spawnSync(process.env.NATIVE_PYTHON_BIN??'python3',[fileURLToPath(new URL('../../engine-python/worker.py',import.meta.url))],{input:JSON.stringify({operation,args}),encoding:'utf8',timeout:5000,maxBuffer:4194304,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PYTHONUTF8:'1'}});
 assert.equal(p.status,0,operation);assert.deepEqual(JSON.parse(p.stdout),JSON.parse(JSON.stringify(expected)));count++;
}
try{
 const input={symbol:' kcb ',question:'Will reported earnings increase?',rules:'Resolve using the audited annual issuer filing.',deadline:'2027-01-01T00:00:00Z',probability:.6,rationale:'Literal evidence from the filing.'};
 for(const value of [input,{...input,probability:0},{...input,probability:1},{...input,probability:true},{...input,probability:-1},{...input,deadline:now},{...input,deadline:'2027-02-30T00:00:00Z'},{...input,userId:'other'},{...input,rules:'short'}]){
  const result=ForecastCreateSchema.safeParse(value);check('validate_forecast',['create',value,now],result.success?{valid:true,data:result.data}:{valid:false});
 }
 for(const [action,schema,values]of [['revise',ForecastRevisionSchema,[{probability:.5,rationale:'Observed new evidence.'},{probability:1,rationale:'short'},{probability:0,rationale:'Observed data',extra:1}]],['resolve',ForecastResolutionSchema,[{outcome:'yes',sourceUrl:'https://fixture.example/filing',note:'Observed audited result.'},{outcome:'void',sourceUrl:'https://fixture.example/filing',note:'Evidence is ambiguous.'},{outcome:'no',sourceUrl:'http://fixture.example/filing',note:'Observed audited result.'}]]])for(const value of values){const r=schema.safeParse(value);check('validate_forecast',[action,value,now],r.success?{valid:true,data:r.data}:{valid:false});}
 const row={status:'resolved',outcome:true,deadline:'2026-10-01T00:00:00Z',resolved_at:'2026-10-02T00:00:00Z',revisions:[{at:'2026-09-01T00:00:00Z',probability:.5},{at:'2026-09-30T00:00:00Z',probability:.8}]};
 for(const rows of [[],[row],[row,{...row,outcome:false}],[{...row,status:'void'}],[{...row,resolved_at:'2026-09-01T00:00:00Z'}],[{...row,revisions:[]}],[{...row,revisions:[{at:'2026-10-02T00:00:00Z',probability:1}]}],Array.from({length:20},(_,i)=>({...row,outcome:i%2===0}))])check('private_calibration',[rows],privateCalibration(rows));
 console.log(JSON.stringify({nativeNotebookComparisons:count,passed:true,fixtureOnly:true,productionCutover:false}));
}finally{globalThis.Date=RealDate;}
