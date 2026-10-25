export async function readBrowserDataResponse(response,{method,path,headers}){
 if(method==='HEAD'||response.status===204)return null;
 const contentType=response.headers.get('Content-Type');
 const json=/^application\/json(?:;|$)/i.test(contentType??'');
 // PostgREST-compatible minimal inserts/upserts deliberately return an empty
 // 201. Accept only that exact contract, never a nonempty HTML error/challenge.
 const emptyCreated=method==='POST'&&response.status===201&&path.startsWith('data/')&&!path.startsWith('data/rpc/')&&!(headers.Prefer??'').includes('return=representation')&&!contentType;
 if(!json&&!emptyCreated)throw Object.assign(Error('Data service returned an unexpected response'),{status:response.status});
 const reader=response.body?.getReader();
 if(!reader){if(emptyCreated)return null;throw Error('Data service returned an empty response');}
 const parts=[];let size=0;
 try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>4194304)throw Error('Data response is too large');parts.push(item.value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 if(size===0&&emptyCreated)return null;
 if(!json)throw Object.assign(Error('Data service returned an unexpected response'),{status:response.status});
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
