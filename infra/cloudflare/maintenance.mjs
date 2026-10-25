// Wake the existing free Render service; its in-process timer alone cannot
// guarantee schedules while Render is asleep. No customer token or admin key.
import {managedProduction} from './auth-provider.mjs';
export async function scheduledMaintenance(controller,env){
 if(!(env.AUTH_PROVIDER==='better-auth'||managedProduction(env))||env.APPLICATION_SCHEDULE_ENABLED!=='true')return;
 const origin=new URL(env.BACKEND_ORIGIN);
 if(origin.origin!=='https://continua-backend.onrender.com'||origin.href!==origin.origin+'/')throw Error('Maintenance backend is not the existing service');
 if(typeof env.AUTH_MAINTENANCE_SECRET!=='string'||env.AUTH_MAINTENANCE_SECRET.length<32||env.AUTH_MAINTENANCE_SECRET.length>512)throw Error('Maintenance key is not configured');
 const response=await fetch(new URL('/api/v1/internal/application-jobs',origin),{method:'POST',headers:{'X-Continua-Maintenance-Key':env.AUTH_MAINTENANCE_SECRET},redirect:'manual',signal:AbortSignal.timeout(55000)});
 if(!response.ok&&response.status!==409)throw Error('Scheduled application maintenance failed');
 await response.body?.cancel();
 if(!env.MEDIA_BUCKET)return;
 const headers={'X-Continua-Maintenance-Key':env.AUTH_MAINTENANCE_SECRET};
 const pending=await fetch(new URL('/api/v1/internal/media-cleanup',origin),{headers,redirect:'manual',signal:AbortSignal.timeout(10000)});
 if(!pending.ok)throw Error('Media cleanup queue unavailable');
 const length=Number(pending.headers.get('Content-Length'));
 if(length>4096){await pending.body?.cancel();throw Error('Cleanup response exceeds its limit');}
 const text=await pending.text();if(text.length>4096)throw Error('Cleanup response exceeds its limit');
 const {owners}=JSON.parse(text);
 if(!Array.isArray(owners)||owners.length>5||owners.some(owner=>typeof owner!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner)))throw Error('Invalid cleanup queue');
 for(const owner of owners){
  let complete=true;
  for(const kind of ['avatars','banners','post-images']){
   const prefix=`${kind}/${owner}/`,page=await env.MEDIA_BUCKET.list({prefix,limit:100});
   if(!Array.isArray(page.objects)||page.objects.some(object=>typeof object.key!=='string'||!object.key.startsWith(prefix)))throw Error('Cleanup object escaped owner prefix');
   if(page.objects.length)await env.MEDIA_BUCKET.delete(page.objects.map(object=>object.key));
   if(page.truncated)complete=false;
  }
  if(complete){const done=await fetch(new URL('/api/v1/internal/media-cleanup/complete',origin),{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({owner}),redirect:'manual',signal:AbortSignal.timeout(10000)});if(!done.ok)throw Error('Cleanup receipt failed');await done.body?.cancel();}
 }
}
