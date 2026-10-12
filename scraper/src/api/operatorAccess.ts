import {createHash,timingSafeEqual} from 'node:crypto';
export function validOperatorKey(provided:string|undefined,configured:string|undefined) {
 if(!configured||configured.length<32||!provided||provided.length>512)return false;
 return timingSafeEqual(createHash('sha256').update(provided).digest(),createHash('sha256').update(configured).digest());
}
export function publicCollectorRoute(method:string,path:string) {
 return (method==='GET'&&['/health','/news/status'].includes(path))||
   (method==='POST'&&['/indices/refresh','/news/refresh','/documents/refresh'].includes(path));
}
