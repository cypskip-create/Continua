export function checkoutDestination(origin:string,plan:string,cycle:string){
 const url=new URL('/checkout',origin);
 if((url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))||url.username||url.password)throw new Error('Invalid website checkout origin');
 if(!['premium','premium_plus'].includes(plan)||!['monthly','annual'].includes(cycle))throw new Error('Invalid checkout selection');
 url.searchParams.set('plan',plan);url.searchParams.set('cycle',cycle);return url.href;
}
export const paymentReferencePattern=/^continua-live-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
