// Provider-independent transport for the app's audited flat query/RPC contract.
// Authorization always comes from a live server-verified session and SQL RLS.
export function createBrowserDataClient({identity,origin,fetcher=fetch}){
 const site=new URL(origin);if(site.origin!==origin||site.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(site.hostname))throw Error('An owned HTTPS origin is required');
 async function performRequest(path,{method='GET',body,headers={},signal}={},verifiedSession){
  try{
   const session=verifiedSession??await identity.getSession();if(session.error)throw session.error;
   const token=session.data?.session?.access_token;
   const response=await fetcher(origin+'/api/v1/'+path,{method,headers:{Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-User-Token':token}:{}),...headers},body:body!==undefined?JSON.stringify(body):undefined,credentials:'same-origin',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)});
   let data=null;if(!['HEAD'].includes(method)&&response.status!==204){if(!/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type')??''))throw Error('Data service returned an unexpected response');const reader=response.body?.getReader();if(!reader)throw Error('Data service returned an empty response');let size=0;const parts=[];try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>4194304)throw Error('Data response is too large');parts.push(item.value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}data=JSON.parse(new TextDecoder().decode(bytes));}
   const range=response.headers.get('Content-Range'),total=range?.split('/')[1],count=total&&/^\d+$/.test(total)?Number(total):null;
   if(!response.ok)return {data:null,error:Object.assign(new Error(data?.message??data?.error??'Data request could not complete'),{code:data?.code,status:response.status,details:data?.details}),count,status:response.status};
   return {data,error:null,count,status:response.status};
  }catch(error){return {data:null,error:error instanceof Error?error:new Error('Data request could not complete'),count:null,status:0};}
 }
 // Share only identical in-flight reads in this client, scoped to the exact
 // current access token. Nothing is retained after settlement or shared across
 // accounts. Abortable reads and every mutation remain independent.
 const reads=new Map();
 async function request(path,options={}){
  if((options.method??'GET')!=='GET'||options.signal)return performRequest(path,options);
  const current=await identity.getSession();if(current.error)return {data:null,error:current.error,count:null,status:0};
  const key=JSON.stringify([path,options.headers??{},current.data?.session?.access_token??null]);
  if(reads.has(key))return reads.get(key);
  const job=performRequest(path,options,current);if(reads.size>=100)return job;
  reads.set(key,job);try{return await job;}finally{if(reads.get(key)===job)reads.delete(key);}
 }
 class Query {
  constructor(table){if(!/^[a-z][a-z0-9_]*$/.test(table))throw Error('Invalid table');this.table=table;this.search=new URLSearchParams();this.method='GET';this.body=undefined;this.prefer=[];this.signal=undefined;this.shape='array';this.promise=undefined;}
  mutable(){if(this.promise)throw Error('Query has already started');return this;}
  select(columns='*',options={}){this.mutable();this.search.set('select',columns.replace(/\s+/g,''));if(options.count)this.prefer.push('count='+options.count);if(options.head)this.method='HEAD';if(!['GET','HEAD'].includes(this.method))this.prefer.push('return=representation');return this;}
  filter(column,operator,value){this.mutable();this.search.append(column,operator+'.'+String(value));return this;}
  eq(column,value){return this.filter(column,'eq',value);}
  neq(column,value){return this.filter(column,'neq',value);}
  ilike(column,value){return this.filter(column,'ilike',value);}
  in(column,values){if(!Array.isArray(values)||values.length>1000)throw Error('Invalid filter list');return this.filter(column,'in','('+values.map(value=>typeof value==='string'?JSON.stringify(value):String(value)).join(',')+')');}
  or(expression){this.mutable();this.search.append('or','('+expression+')');return this;}
  order(column,{ascending=true,nullsFirst}={}){this.mutable();const term=column+'.'+(ascending?'asc':'desc')+(typeof nullsFirst==='boolean'?nullsFirst?'.nullsfirst':'.nullslast':'');this.search.set('order',[this.search.get('order'),term].filter(Boolean).join(','));return this;}
  limit(value){this.mutable();this.search.set('limit',String(value));return this;}
  abortSignal(signal){this.mutable();this.signal=signal;return this;}
  insert(value){this.mutable();this.method='POST';this.body=value;return this;}
  update(value){this.mutable();this.method='PATCH';this.body=value;return this;}
  delete(){this.mutable();this.method='DELETE';return this;}
  upsert(value,{onConflict,ignoreDuplicates=false}={}){if(!onConflict)throw Error('Explicit conflict columns are required');this.insert(value);this.search.set('on_conflict',onConflict);this.prefer.push('resolution='+(ignoreDuplicates?'ignore-duplicates':'merge-duplicates'));return this;}
  single(){this.mutable();this.shape='single';return this;}
  maybeSingle(){this.mutable();this.shape='maybe';return this;}
  execute(){return this.promise??=(async()=>{const result=await request('data/'+this.table+'?'+this.search,{method:this.method,body:this.body,signal:this.signal,headers:{...(this.prefer.length?{Prefer:[...new Set(this.prefer)].join(',')}:{}),...(this.shape==='single'?{Accept:'application/vnd.pgrst.object+json'}:{})}});if(!result.error&&this.shape==='maybe'){if(!Array.isArray(result.data))return {...result,error:new Error('Invalid data result'),data:null};if(result.data.length>1)return {...result,error:Object.assign(new Error('Expected at most one result'),{code:'PGRST116',status:406}),data:null};return {...result,data:result.data[0]??null};}return result;})();}
  then(resolve,reject){return this.execute().then(resolve,reject);}
  catch(reject){return this.execute().catch(reject);}
  finally(work){return this.execute().finally(work);}
 }
 return {from:table=>new Query(table),rpc:(name,body={})=>{if(!/^[a-z][a-z0-9_]*$/.test(name))throw Error('Invalid function');return request('data/rpc/'+name,{method:'POST',body});},functions:{invoke:(name,{body}={})=>{if(!['delete-account','check-price-alerts','stock-thesis'].includes(name))throw Error('Function unavailable');return request('functions/'+name,{method:'POST',body:body??{}});}}};
}
