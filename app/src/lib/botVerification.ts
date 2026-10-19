// A challenge may keep retrying without emitting an SDK error. Bound the wait
// and expose recovery without authorizing a request before a real token exists.
export function createVerificationCallbacks(onToken:(token:string)=>void,onIssue:(message:string)=>void,
 schedule:(fn:()=>void,ms:number)=>ReturnType<typeof setTimeout>=setTimeout,
 cancel:(id:ReturnType<typeof setTimeout>)=>void=clearTimeout){
 let active=true;
 const timer=schedule(()=>fail('Browser verification is taking too long. Tap Retry verification. If it continues, reload the page or try another connection.'),45000);
 function fail(message:string){if(!active)return;cancel(timer);onToken('');onIssue(message);}
 return {
  success:(token:string)=>{if(!active)return;cancel(timer);onIssue('');onToken(token);},
  expired:()=>fail('Verification expired. Please retry verification before signing in.'),
  timeout:()=>fail('Verification timed out. Please retry verification.'),
  unsupported:()=>fail('Browser verification is unavailable in this browser. Update your browser or try another supported browser.'),
  fail,
  dispose:()=>{active=false;cancel(timer);},
 };
}
