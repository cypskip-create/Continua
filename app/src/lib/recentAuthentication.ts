// Display hint only. Sensitive operations independently validate the signed
// token and provider session on the server.
export function recentAuthentication(token:string|undefined,now=Date.now()){
 try{const raw=token?.split('.')[1];if(!raw)return false;const claims=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')));return Array.isArray(claims.amr)&&claims.amr.some((a:any)=>['password','oauth','totp','otp','recovery','webauthn','mfa/totp','mfa/phone','mfa/webauthn'].includes(a.method)&&Number.isFinite(a.timestamp)&&a.timestamp*1000<=now+30000&&now-a.timestamp*1000<=600000);}catch{return false;}
}
