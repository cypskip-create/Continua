const checks=[['backend','https://continua-backend.onrender.com/api/v1/health/live'],['frontend','https://continua.cypriankiprop41.workers.dev/'],['market','https://continua.cypriankiprop41.workers.dev/api/v1/indices?exchange=NSE']];
let failed=false;
for(const [name,url]of checks){let ok=false,status=0;
 for(let attempt=0;attempt<3;attempt++){
  try{const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(25000),headers:{Accept:name==='frontend'?'text/html':'application/json'}});status=response.status;
   if(!response.ok){await response.body?.cancel();throw Error('http_failure');}
   if(name==='frontend'){ok=/text\/html/i.test(response.headers.get('Content-Type')??'');await response.body?.cancel();}
   else {const reader=response.body.getReader();let size=0;const parts=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>131072){await reader.cancel();throw Error('response_limit');}parts.push(value);}const data=JSON.parse(Buffer.concat(parts).toString('utf8'));ok=name==='market'?Array.isArray(data.data):data.status==='alive'||data.status==='ok'||data.status==='healthy'||data.success===true;}
   if(ok)break;
  }catch{/* No upstream bodies, credentials or personal data in public logs. */}
  if(attempt<2)await new Promise(resolve=>setTimeout(resolve,5000));
 }
 console.log(JSON.stringify({check:name,ok,status}));if(!ok)failed=true;
}
if(failed)process.exitCode=1;
