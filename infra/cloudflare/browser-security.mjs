// Start restrictive script policy in report-only mode to observe checkout,
// authentication and chart dependencies without breaking working sessions.
export const reportPolicy=["default-src 'self'","base-uri 'self'","object-src 'none'","frame-ancestors 'none'","script-src 'self' https://js.paystack.co https://challenges.cloudflare.com","style-src 'self' 'unsafe-inline'","img-src 'self' data: blob: https:","font-src 'self' data:","connect-src 'self' https://continua-backend.onrender.com wss://continua-backend.onrender.com https://api.paystack.co","frame-src https://checkout.paystack.com https://js.paystack.co https://challenges.cloudflare.com","form-action 'self'","report-uri /api/security/csp-report"].join('; ');
export async function cspReport(request,env){
 if(new URL(request.url).pathname!=='/api/security/csp-report')return null;
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(request.method!=='POST')return new Response(null,{status:405,headers});
 if(env.EDGE_RATE_LIMIT){const ip=request.headers.get('CF-Connecting-IP');if(!ip||!(await env.EDGE_RATE_LIMIT.limit({key:'csp:'+ip})).success)return new Response(null,{status:429,headers});}
 const reader=request.body?.getReader();let size=0;const chunks=[];
 if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();return new Response(null,{status:413,headers});}chunks.push(value);}
 // Reports can contain sensitive page URLs and script samples. Deliberately
 // retain neither bodies nor user identifiers; only a bounded directive count.
 try{const b=new Uint8Array(size);let p=0;for(const x of chunks){b.set(x,p);p+=x.length;}const report=JSON.parse(new TextDecoder().decode(b))['csp-report'];const directive=String(report?.['effective-directive']??'');if(/^[a-z-]{1,40}$/.test(directive))console.warn(JSON.stringify({event:'csp_violation',directive}));}catch{/* Untrusted reports are never echoed or logged. */}
 return new Response(null,{status:204,headers});
}
