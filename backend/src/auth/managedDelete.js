import {nonCascadingOwners} from '../data/deleteAccount.js';
import {readManagedSession} from './managedSession.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rejection=(message,status=403)=>Object.assign(Error(message),{status});

// Approved for DISABLED code preparation and MOCK tests only. No migration,
// startup, maintenance task or request may enable this default-off operation.
export async function deleteManagedAccount({enabled=false,database,identity,body,issuer,vault,providerFactory,now=()=>Date.now()}){
 if(enabled!==true)throw rejection('Managed account deletion is not enabled. Your data is preserved.',503);
 const userId=identity?.user?.id,sessionId=identity?.claims?.session_id;
 if(!uuid.test(userId??'')||!uuid.test(sessionId??'')||identity?.claims?.auth_provider!=='neon-managed'||identity.claims.auth_issuer!==issuer)throw rejection('Sign in again',401);
 if(body?.confirmation!=='DELETE'||body.accountId!==userId)throw rejection('Account confirmation required',400);
 let binding,client=await database.connect();
 try{
  await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='10000ms'");
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['account-delete:'+userId]);
  binding=(await client.query(`SELECT s.subject,s.managed_session_id,s.cookie_ciphertext,s.password_verified_at,s.oauth_verified_at
   FROM app_identity.managed_sessions s JOIN app_identity.managed_identities m ON m.issuer=s.issuer AND m.subject=s.subject AND m.user_id=s.user_id
   JOIN app_identity.users u ON u.id=s.user_id AND u.source_provider='neon-managed' AND u.deleted_at IS NULL
   WHERE s.id=$1 AND s.user_id=$2 AND s.issuer=$3 AND s.revoked_at IS NULL AND s.expires_at>now() AND m.state='active' FOR UPDATE OF s,m,u`,[sessionId,userId,issuer])).rows[0];
  const fresh=value=>{const at=new Date(value??'').getTime();return Number.isFinite(at)&&at<=now()+30000&&now()-at<=600000;};
  if(!binding||!fresh(binding.password_verified_at)&&!fresh(binding.oauth_verified_at))throw rejection('Verify a recent sign-in before deleting your account');
  await client.query("UPDATE app_identity.managed_identities SET state='deleting' WHERE issuer=$1 AND subject=$2 AND user_id=$3",[issuer,binding.subject,userId]);
  await client.query("UPDATE app_identity.users SET deleted_at=now(),raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||'{\"managed_deletion_phase\":\"prepared\"}'::jsonb WHERE id=$1 AND source_provider='neon-managed'",[userId]);
  await client.query('UPDATE app_identity.managed_sessions SET revoked_at=now() WHERE issuer=$1 AND user_id=$2',[issuer,userId]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 let providerDeleted=false;
 try{
  const provider=providerFactory({cookie:vault.open(binding.cookie_ciphertext)}),live=await readManagedSession(provider,{now});
  if(live?.user?.id!==binding.subject||live?.user?.emailVerified!==true||live?.user?.banned===true||live?.session?.id!==binding.managed_session_id)throw rejection('Sign in again before deleting your account');
  const result=await provider.call('deleteUser',{});
  if(result?.success!==true||result.message!=='User deleted')throw Object.assign(rejection('Managed deletion requires additional verification. Your application data is preserved; contact support before retrying.',409),{providerPending:true});
  providerDeleted=true;
  const recorded=await database.query(`UPDATE app_identity.users SET raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||'{"managed_deletion_phase":"provider_deleted"}'::jsonb WHERE id=$1 AND source_provider='neon-managed' AND deleted_at IS NOT NULL RETURNING id`,[userId]);
  if(recorded.rowCount!==1)throw Error('Deletion receipt unavailable');
  client=await database.connect();
  try{
   await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='10000ms'");
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['account-delete:'+userId]);
   const target=(await client.query(`SELECT u.id FROM app_identity.users u JOIN app_identity.managed_identities m ON m.user_id=u.id
    WHERE u.id=$1 AND u.source_provider='neon-managed' AND u.deleted_at IS NOT NULL AND u.raw_app_meta_data->>'managed_deletion_phase'='provider_deleted'
    AND m.issuer=$2 AND m.subject=$3 AND m.state='deleting' FOR UPDATE OF u,m`,[userId,issuer,binding.subject])).rows[0];
   if(!target)throw Error('Deletion target changed');
   await client.query('INSERT INTO app_identity.account_media_cleanup(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[userId]);
   for(const [table,column]of nonCascadingOwners)await client.query(`DELETE FROM public.${table} WHERE ${column}=$1`,[userId]);
   await client.query('DELETE FROM app_identity.managed_registration_intents WHERE issuer=$1 AND subject=$2',[issuer,binding.subject]);
   const deleted=await client.query("DELETE FROM app_identity.users WHERE id=$1 AND source_provider='neon-managed' AND deleted_at IS NOT NULL RETURNING id",[userId]);
   if(deleted.rowCount!==1)throw Error('Deletion target changed');
   await client.query('COMMIT');return {success:true};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }catch(error){
  // Only definite provider rejection can restore eligibility. Sessions stay
  // revoked. Uncertain or confirmed remote deletion retains blocked local rows
  // and phase evidence for operator recovery, never a historical overwrite.
  if(!providerDeleted&&!error.providerPending&&Number.isInteger(error.status)&&error.status>=400&&error.status<500){
   const rollback=await database.connect();
   try{await rollback.query('BEGIN');await rollback.query("UPDATE app_identity.users SET deleted_at=NULL,raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)-'managed_deletion_phase' WHERE id=$1 AND source_provider='neon-managed' AND raw_app_meta_data->>'managed_deletion_phase'='prepared'",[userId]);await rollback.query("UPDATE app_identity.managed_identities SET state='active' WHERE issuer=$1 AND subject=$2 AND user_id=$3 AND state='deleting'",[issuer,binding.subject,userId]);await rollback.query('COMMIT');}catch(restoreError){await rollback.query('ROLLBACK');throw restoreError;}finally{rollback.release();}
  }
  throw error;
 }
}
