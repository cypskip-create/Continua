// Public compatibility address only. No credentials, storage or upstream fetch.
export const canonicalOrigin='https://continua.cypriankiprop41.workers.dev';
export default {fetch(request){
 const url=new URL(request.url),headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
 if(url.pathname.startsWith('/api/'))return new Response(JSON.stringify({error:'Continua has moved. Open '+canonicalOrigin+' and sign in there.',error_code:'app_address_changed'}),{status:410,headers:{...headers,'Content-Type':'application/json'}});
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers});
 const target=new URL(canonicalOrigin);target.pathname=url.pathname;target.search=url.search;
 return new Response(null,{status:307,headers:{...headers,Location:target.href}});
}};
