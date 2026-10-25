// The managed service currently leaves older sessions valid after a password
// reset. Use only documented SDK responses (never managed password columns) to
// reject sessions created before the credential account's updatedAt timestamp.
export async function readManagedSession(provider,{now=()=>Date.now()}={}){
 const live=await provider.session();if(!live?.session||!live?.user)return null;
 const createdAt=new Date(live.session.createdAt).getTime(),expiresAt=new Date(live.session.expiresAt).getTime();
 if(!Number.isFinite(createdAt)||createdAt>now()+30000||!Number.isFinite(expiresAt)||expiresAt<=now())throw Object.assign(Error('Session could not be verified'),{status:401});
 const accounts=await provider.call('listAccounts');
 if(!Array.isArray(accounts)||accounts.length>20)throw Error('Managed credential status unavailable');
 const credentials=accounts.filter(account=>account.providerId==='credential');
 if(credentials.length>1)throw Error('Ambiguous managed credential status');
 if(credentials.length){
  const account=credentials[0],changedAt=new Date(account.updatedAt).getTime();
  if(account.userId!==live.user.id||!Number.isFinite(changedAt)||changedAt>now()+30000)throw Error('Managed credential status unavailable');
  if(createdAt<changedAt){
   await provider.call('signOut',{}).catch(()=>{});
   throw Object.assign(Error('Password changed. Sign in again.'),{status:401,code:'PASSWORD_CHANGED',managedSessionId:live.session.id});
  }
 }
 return live;
}
