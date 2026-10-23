// URL fragments stay in the browser: neither Cloudflare nor Render receives
// the recovery credential in an initial GET URL or platform invocation log.
export function privateRecoveryLink(value,origin){
 const input=new URL(value),site=new URL(origin);
 const match=/^\/api\/auth\/reset-password\/([A-Za-z0-9_-]{8,256})$/.exec(input.pathname);
 if(input.origin!==site.origin||input.username||input.password||!match)throw Error('Invalid recovery link');
 const output=new URL('/auth',site);output.hash=new URLSearchParams({recovery_token:match[1]}).toString();return output.href;
}
