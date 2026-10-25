export function googleAuthorizationDestination(value,managedBaseURL){
 if(typeof value!=='string'||value.length>16384)throw Error('Google sign-in address could not be verified');
 const destination=new URL(value);
 if(destination.protocol!=='https:'||destination.username||destination.password||destination.hash)throw Error('Google sign-in address could not be verified');
 if(destination.origin==='https://accounts.google.com'&&destination.pathname==='/o/oauth2/v2/auth')return destination;
 if(managedBaseURL){
  const base=new URL(managedBaseURL);
  if(base.protocol==='https:'&&!base.username&&!base.password&&!base.search&&!base.hash&&base.pathname.endsWith('/auth')&&destination.origin===base.origin&&destination.pathname===base.pathname+'/sign-in/social/init'&&
   [...destination.searchParams.keys()].length===1&&destination.searchParams.getAll('token').length===1&&destination.searchParams.get('token'))return destination;
 }
 throw Error('Google sign-in address could not be verified');
}
