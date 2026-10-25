import {supabase,OWNED_IDENTITY_ENABLED} from '@/integrations/continua/browserClient';
import {prepareImage} from './imagePreparation.js';
const MEDIA_ORIGIN=OWNED_IDENTITY_ENABLED?window.location.origin:'https://continua.cypriankiprop41.workers.dev';
const MEDIA_ORIGINS=new Set([MEDIA_ORIGIN,'https://continua-preview.cypriankiprop41.workers.dev']);

async function mediaHeaders(){
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session?.access_token)throw Error('Sign in to upload an image');
 return {'X-User-Token':session.access_token};
}
export async function uploadCloudImage(kind,file){
 if(!['avatars','banners','post-images'].includes(kind))throw Error('Invalid image category');
 file=await prepareImage(file,{kind});
 const response=await fetch(MEDIA_ORIGIN+'/api/v1/media/'+kind,{method:'POST',headers:{...await mediaHeaders(),'Content-Type':file.type},body:file,signal:AbortSignal.timeout(60000)});
 if(!/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type')??'')){await response.body?.cancel();throw Error('Image upload service is unavailable. Please retry.');}
 const data=await response.json();
 if(!response.ok)throw Error(data.error||'Image upload failed');
 const url=new URL(data.url,MEDIA_ORIGIN);
 if(url.origin!==MEDIA_ORIGIN||!url.pathname.startsWith('/media/'+kind+'/'))throw Error('Invalid image response');
 return url.href;
}
export async function removeCloudImages(urls){
 const headers=await mediaHeaders();
 await Promise.allSettled(urls.map(async value=>{
  const url=new URL(value,MEDIA_ORIGIN);
  if(!MEDIA_ORIGINS.has(url.origin)||!url.pathname.startsWith('/media/'))return;
  const response=await fetch(MEDIA_ORIGIN+'/api/v1/media/object/'+url.pathname.slice(7),{method:'DELETE',headers,signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Image cleanup pending');
 }));
}
