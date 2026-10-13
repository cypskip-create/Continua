/** Read-only hosted checks. No credentials, writes or payment initiation. */
const expected=process.argv[2];
if(expected&&!/^[0-9a-f]{7,40}$/.test(expected))throw new Error('Expected commit must be a Git SHA');
const checks=[
 ['backend-live','https://continua-backend.onrender.com/api/v1/health/live',200,true],
 ['backend-readiness','https://continua-backend.onrender.com/api/v1/health',200,false],
 ['scraper-live','https://continua-scraper.onrender.com/health/live',200,true],
 ['scraper-readiness','https://continua-scraper.onrender.com/health',200,false],
 ['scraper-private-origin','https://continua-scraper.onrender.com/sources',401,false],
 ['preview-quotes','https://continua-preview.cypriankiprop41.workers.dev/api/v1/quotes?exchange=NSE&symbols=SCOM,KCB,EQTY',200,false],
 ['preview-billing-ownership','https://continua-preview.cypriankiprop41.workers.dev/api/v1/billing/renewal',401,false],
];
const results=await Promise.all(checks.map(async([name,url,status,revision])=>{
 const start=Date.now();
 try{
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(65000)});
  const body=await response.json();
  const correctRevision=!revision||!expected||typeof body.revision==='string'&&body.revision.startsWith(expected);
  return {name,httpStatus:response.status,ok:response.status===status&&correctRevision,ms:Date.now()-start,
   ...(revision?{revision:body.revision??null,runtime:body.runtime??null}:{}),
   ...(name==='preview-quotes'?{records:Array.isArray(body.data)?body.data.length:null}:{}),
   ...(name.includes('readiness')?{status:body.status??null}:{}),
  };
 }catch{return {name,ok:false,error:'request_failed_or_timeout',ms:Date.now()-start};}
}));
console.log(JSON.stringify({expectedRevision:expected??null,results},null,2));
if(results.some(result=>!result.ok))process.exitCode=1;
