// Retry one idempotent read after a transient application/network failure.
// Never repeat a write, expired identity, permission failure or bot challenge.
export async function recoverRead(url,options,fetcher=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 const read=(options.method??'GET')==='GET';let response;
 try{response=await fetcher(url,options);}catch(error){
  if(!read||options.signal?.aborted)throw error;
  await wait(500);if(options.signal?.aborted)throw options.signal.reason;
  return fetcher(url,options);
 }
 if(!read||response.headers.get('cf-mitigated')==='challenge'||!response.headers.get('content-type')?.includes('application/json'))return response;
 let delay=500;
 if(response.status===429){const seconds=Number(response.headers.get('retry-after')??NaN);if(!Number.isFinite(seconds)||seconds<0||seconds>2)return response;delay=seconds*1000;}
 else if(![502,503,504].includes(response.status))return response;
 await response.body?.cancel();await wait(delay);
 if(options.signal?.aborted)throw options.signal.reason;
 return fetcher(url,options);
}
