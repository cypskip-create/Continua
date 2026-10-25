import {provisionManagedIdentity} from './managedProvisioning.js';
import {tokenDigest} from './managedCrypto.js';
import {readManagedSession} from './managedSession.js';

export function createManagedBroker({database,issuer,verifyJwt,vault,providerFactory,now=()=>Date.now()}){
 async function envelope(provider,{passwordVerified=false,oauthVerified=false,previousSession,previousCookie}={}){
  let live;try{live=await readManagedSession(provider,{now});}catch(error){
   if(error.code==='PASSWORD_CHANGED'&&typeof error.managedSessionId==='string')await database.query('UPDATE app_identity.managed_sessions SET revoked_at=now() WHERE issuer=$1 AND managed_session_id=$2 AND revoked_at IS NULL',[issuer,error.managedSessionId]);
   throw error;
  }
  if(!live?.session||!live?.user)return null;
  if(!passwordVerified&&!oauthVerified){
   const bound=(await database.query(`SELECT id FROM app_identity.managed_sessions WHERE issuer=$1 AND subject=$2 AND managed_session_id=$3 AND revoked_at IS NULL AND expires_at>now()`,[issuer,live.user.id,live.session.id])).rows[0];
   if(!bound)throw Object.assign(Error('Sign in through Continua to continue'),{status:401,code:'CONTINUA_SIGNIN_REQUIRED'});
  }
  const expiresAt=new Date(live.session.expiresAt).getTime();
  if(!Number.isFinite(expiresAt)||expiresAt<=now()||typeof live.session.id!=='string')throw Error('Invalid managed session');
  const token=(await provider.call('token'))?.token,payload=await verifyJwt(token);
  if(payload.sub!==live.user.id)throw Error('Managed identity mismatch');
  const user=await provisionManagedIdentity({database,issuer,user:live.user});
  const cookie=provider.cookies().split(';').map(v=>v.trim()).filter(v=>/^__Secure-neon-auth\.session_token=/.test(v)).join('; ');
  if(!cookie)throw Error('Opaque managed session unavailable');
  const client=await database.connect();try{
   await client.query('BEGIN');
   const binding=(await client.query(`INSERT INTO app_identity.managed_sessions(issuer,subject,managed_session_id,user_id,cookie_ciphertext,expires_at,password_verified_at,oauth_verified_at)
    VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7 THEN now() END,CASE WHEN $8 THEN now() END)
    ON CONFLICT(issuer,managed_session_id) DO UPDATE SET cookie_ciphertext=EXCLUDED.cookie_ciphertext,expires_at=EXCLUDED.expires_at,last_verified_at=now(),
    password_verified_at=CASE WHEN $7 THEN now() ELSE app_identity.managed_sessions.password_verified_at END,
    oauth_verified_at=CASE WHEN $8 THEN now() ELSE app_identity.managed_sessions.oauth_verified_at END
    WHERE app_identity.managed_sessions.revoked_at IS NULL AND app_identity.managed_sessions.user_id=EXCLUDED.user_id AND app_identity.managed_sessions.subject=EXCLUDED.subject RETURNING id`,
    [issuer,live.user.id,live.session.id,user.user_id,vault.seal(cookie),new Date(expiresAt),passwordVerified,oauthVerified])).rows[0];
   if(!binding)throw Error('Managed session revoked');
   await client.query(`INSERT INTO app_identity.managed_access_tokens(digest,session_id,expires_at) VALUES($1,$2,$3)
    ON CONFLICT(digest) DO UPDATE SET expires_at=EXCLUDED.expires_at WHERE app_identity.managed_access_tokens.session_id=EXCLUDED.session_id`,[tokenDigest(token),binding.id,new Date(payload.exp*1000)]);
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  // Password step-up uses a fresh provider sign-in. Retire this browser's
  // previous session so its older JWT cannot survive a subsequent sign-out.
  if(passwordVerified&&previousSession?.session?.id&&previousSession?.user?.id&&previousSession.session.id!==live.session.id){
   await database.query('UPDATE app_identity.managed_sessions SET revoked_at=now() WHERE issuer=$1 AND subject=$2 AND managed_session_id=$3 AND revoked_at IS NULL',[issuer,previousSession.user.id,previousSession.session.id]);
   if(previousCookie)await providerFactory({cookie:previousCookie}).call('signOut',{}).catch(()=>{});
  }
  return {access_token:token,refresh_token:'cookie-session',token_type:'bearer',expires_in:Math.max(0,payload.exp-Math.floor(now()/1000)),expires_at:payload.exp,
   user:{id:user.user_id,email:user.email,aud:'authenticated',role:'authenticated',created_at:user.created_at,updated_at:user.updated_at,email_confirmed_at:user.email_confirmed_at,user_metadata:user.raw_user_meta_data,app_metadata:{provider:'neon-managed',providers:['neon-managed']},factors:[]}};
 }
 async function signOut(provider){
  const live=await provider.session();
  // Local authorization is revoked first, even if the remote sign-out fails.
  if(live?.session?.id&&live?.user?.id)await database.query('UPDATE app_identity.managed_sessions SET revoked_at=now() WHERE issuer=$1 AND managed_session_id=$2 AND subject=$3',[issuer,live.session.id,live.user.id]);
  await provider.call('signOut',{});
 }
 return {envelope,signOut,readLiveSession:cookie=>readManagedSession(providerFactory({cookie}),{now})};
}
