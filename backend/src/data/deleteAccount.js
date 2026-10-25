const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const nonCascadingOwners=[
 ['comment_likes','user_id'],['comment_reactions','user_id'],['comment_reposts','user_id'],
 ['post_reactions','user_id'],['blocked_users','blocker_id'],['blocked_users','blocked_id'],
 ['muted_users','muter_id'],['muted_users','muted_id'],['muted_keywords','user_id'],
 ['notifications','user_id'],['notifications','actor_id'],['price_alerts','user_id'],
 ['portfolio_snapshots','user_id'],['ai_recommendations','user_id'],['user_preferences','user_id'],
 ['room_messages','user_id'],['room_members','user_id'],['rooms','creator_id'],
];

// Account deletion has its own legacy-compatible recent-sign-in rule. It does
// not change the general password-only recent verifier or Better Auth MFA hooks.
export async function deleteOwnedAccount({database,identity,body,now=()=>Date.now()}){
 const userId=identity?.user?.id,sessionId=identity?.user?.session_id;
 if(!uuid.test(userId??'')||!uuid.test(sessionId??''))throw Object.assign(Error('Sign in again'),{status:401});
 if(body?.confirmation!=='DELETE'||body.accountId!==userId)throw Object.assign(Error('Account confirmation required'),{status:400});
 const client=await database.connect();
 try{
  await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='10000ms'");
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['account-delete:'+userId]);
  const row=(await client.query(`SELECT a.password_verified_at,a.oauth_verified_at,a.mfa_verified_at,u."twoFactorEnabled" mfa_enabled,
   EXISTS(SELECT 1 FROM app_identity.continua_auth_account g WHERE g."userId"=u.id AND g."providerId"='google') google_linked
   FROM app_identity.continua_auth_user u JOIN app_identity.users i ON i.id=u.id AND i.deleted_at IS NULL
   JOIN app_identity.continua_auth_session s ON s."userId"=u.id
   LEFT JOIN app_identity.session_assurance a ON a.session_id=s.id AND a.user_id=u.id
   WHERE u.id=$1 AND s.id=$2 AND s."expiresAt">now() FOR UPDATE OF u,i,s`,[userId,sessionId])).rows[0];
  const fresh=value=>{const timestamp=value?new Date(value).getTime():NaN;return Number.isFinite(timestamp)&&timestamp<=now()+30000&&now()-timestamp<=600000;};
  if(!row||row.mfa_enabled&&!row.mfa_verified_at||!(fresh(row.password_verified_at)||row.google_linked&&fresh(row.oauth_verified_at)))throw Object.assign(Error('Verify a recent sign-in and any enabled authenticator before deleting your account'),{status:403});
  await client.query('INSERT INTO app_identity.account_media_cleanup(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[userId]);
  // Remove owner columns without identity FKs explicitly. The restored cascade
  // constraints clean portfolios, billing, content, follows and Engine records.
  // Any failed statement aborts the entire transaction; never partially wipe.
  for(const [table,column]of nonCascadingOwners)await client.query(`DELETE FROM public.${table} WHERE ${column}=$1`,[userId]);
  await client.query('DELETE FROM app_identity.continua_auth_verification WHERE value=$1 OR identifier=$1',[userId]);
  const deleted=await client.query('DELETE FROM app_identity.continua_auth_user WHERE id=$1 RETURNING id',[userId]);
  if(deleted.rowCount!==1)throw Error('Identity changed during deletion');
  await client.query('DELETE FROM app_identity.users WHERE id=$1',[userId]);
  await client.query('COMMIT');return {success:true};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
 finally{client.release();}
}
