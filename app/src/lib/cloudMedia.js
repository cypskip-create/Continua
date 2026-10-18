import {supabase} from '@/integrations/supabase/client';
const MEDIA_ORIGIN='https://continua-preview.cypriankiprop41.workers.dev';

async function mediaHeaders(){
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session?.access_token)throw Error('Sign in to upload an image');
 return {'X-User-Token':session.access_token};
}
export async function uploadCloudImage(kind,file){
 if(!['avatars','banners','post-images'].includes(kind)||!(file instanceof Blob)||file.size<1||file.size>5*1024*1024)throw Error('Choose an image smaller than 5 MB');
 const response=await fetch(MEDIA_ORIGIN+'/api/v1/media/'+kind,{method:'POST',headers:{...await mediaHeaders(),'Content-Type':file.type},body:file,signal:AbortSignal.timeout(30000)});
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
  if(url.origin!==MEDIA_ORIGIN||!url.pathname.startsWith('/media/'))return;
  const response=await fetch(MEDIA_ORIGIN+'/api/v1/media/object/'+url.pathname.slice(7),{method:'DELETE',headers,signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Image cleanup pending');
 }));
}
