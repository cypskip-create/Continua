export function checkoutDestination(origin:string,plan:string,cycle:string){
 const url=new URL('/checkout',origin);
 if((url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))||url.username||url.password)throw new Error('Invalid website checkout origin');
 if(!['premium','premium_plus'].includes(plan)||!['monthly','annual'].includes(cycle))throw new Error('Invalid checkout selection');
 url.searchParams.set('plan',plan);url.searchParams.set('cycle',cycle);return url.href;
}
export const paymentReferencePattern=/^continua-(live|test)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Pop a known plans entry; direct/auth-restored checkouts replace instead of
 * pushing a new plans entry on top of checkout and creating a back-button loop. */
export function checkoutBackTarget(index:unknown,fromPlans:boolean): -1|'/upgrade' {
 return fromPlans&&typeof index==='number'&&index>0 ? -1 : '/upgrade';
}
export function validKenyanMobile(value:string) {
 const compact=value.trim().replace(/[\s()-]/g,'').replace(/^\+/,'').replace(/^0(?=[17])/,'254');
 return /^254[17]\d{8}$/.test(compact);
}
