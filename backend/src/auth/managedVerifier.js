import {createRemoteJWKSet,jwtVerify} from 'jose';
import {tokenDigest} from './managedCrypto.js';
export function createManagedJwtVerifier({baseURL,now=()=>Date.now(),jwks}){
 const url=new URL(baseURL);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/auth'))throw Error('Exact HTTPS managed Auth URL required');
 const issuer=url.origin,keys=jwks??createRemoteJWKSet(new URL(baseURL+'/.well-known/jwks.json'),{timeoutDuration:5000,cooldownDuration:30000,cacheMaxAge:300000});
 return async token=>{
  if(typeof token!=='string'||token.length>16384)throw Error('Invalid user session');
  const {payload}=await jwtVerify(token,keys,{issuer,audience:issuer,algorithms:['EdDSA'],clockTolerance:30,currentDate:new Date(now())});
  if(typeof payload.sub!=='string'||payload.sub.length<1||payload.sub.length>200||payload.role!=='authenticated'||payload.banned===true||payload.emailVerified!==true||!Number.isFinite(payload.iat)||!Number.isFinite(payload.exp)||payload.exp*1000<=now()||payload.exp<=payload.iat||payload.exp-payload.iat>900||payload.iat*1000>now()+30000)throw Error('Invalid managed user token');
  return payload;
 };
}
export function createManagedAccessVerifier({database,verifyJwt,vault,readLiveSession,issuer,now=()=>Date.now()}){
 return async(token,{recent=false}={})=>{
  const payload=await verifyJwt(token),digest=tokenDigest(token);
  const row=(await database.query(`SELECT s.id::text session_id,s.issuer,s.subject,s.managed_session_id,s.user_id::text id,s.cookie_ciphertext,
   s.password_verified_at,s.oauth_verified_at,u.email,u.raw_user_meta_data,u.created_at,u.updated_at,u.email_confirmed_at
   FROM app_identity.managed_access_tokens t JOIN app_identity.managed_sessions s ON s.id=t.session_id
   JOIN app_identity.managed_identities m ON m.issuer=s.issuer AND m.subject=s.subject AND m.user_id=s.user_id AND m.state='active'
   JOIN app_identity.users u ON u.id=s.user_id AND u.source_provider='neon-managed' AND u.deleted_at IS NULL
   WHERE t.digest=$1 AND t.expires_at>now() AND s.expires_at>now() AND s.revoked_at IS NULL AND s.issuer=$2 AND s.subject=$3`,[digest,issuer,payload.sub])).rows[0];
  if(!row)throw Error('User session revoked or not bound');
  // Do not let a valid JWT or the SDK's signed cookie cache bypass revocation.
  let live;try{live=await readLiveSession(vault.open(row.cookie_ciphertext));}catch(error){
   if(error.code==='PASSWORD_CHANGED')await database.query('UPDATE app_identity.managed_sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL',[row.session_id]);
   throw error;
  }
  const liveExpiry=new Date(live?.session?.expiresAt).getTime();
  if(!live?.session||live.session.id!==row.managed_session_id||live.user?.id!==payload.sub||live.user.emailVerified!==true||live.user.banned===true||!Number.isFinite(liveExpiry)||liveExpiry<=now())throw Error('Managed session revoked');
  const passwordAt=new Date(row.password_verified_at??'').getTime();
  if(recent&&(!Number.isFinite(passwordAt)||passwordAt>now()+30000||now()-passwordAt>600000))throw Error('Recent authentication required');
  const touched=await database.query('UPDATE app_identity.managed_sessions SET last_verified_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING id',[row.session_id]);if(touched.rowCount!==1)throw Error('User session revoked');
  // These are server-internal application claims after signature AND live
  // session validation. The browser's signed Neon token remains unmodified.
  return {user:{...row,name:row.raw_user_meta_data?.full_name,twoFactorEnabled:false},claims:{...payload,sub:row.id,aud:'continua',email:row.email,role:'authenticated',session_id:row.session_id,auth_provider:'neon-managed',auth_issuer:issuer,managed_token_digest:digest,aal:'aal1',amr:Number.isFinite(passwordAt)?[{method:'password',timestamp:Math.floor(passwordAt/1000)}]:[]}};
 };
}
