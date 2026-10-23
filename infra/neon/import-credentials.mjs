import {randomUUID} from 'node:crypto';

// Source must be the verified restore or a fresh, frozen source snapshot.
// The target connection must be staging-guarded by the calling operator.
export async function importLegacyCredentials(source,target) {
 const users=(await source.query(`SELECT id::text,email,email_confirmed_at IS NOT NULL AS verified,encrypted_password,raw_user_meta_data,created_at::text,updated_at::text,deleted_at IS NOT NULL AS deleted,is_anonymous,phone,banned_until>now() AS banned FROM auth.users ORDER BY id`)).rows;
 const identities=(await source.query('SELECT user_id::text,provider FROM auth.identities ORDER BY user_id')).rows;
 if(users.length>10000)throw Error('Use a reviewed paginated import for larger accounts');
 if(identities.some(i=>i.provider!=='email'))throw Error('Additional identity providers require an explicit supported migration');
 if(users.some(u=>u.deleted||u.is_anonymous||u.banned||!u.email||!u.encrypted_password||!/^\$2[aby]\$\d{2}\$/.test(u.encrypted_password)||identities.filter(i=>i.user_id===u.id&&i.provider==='email').length!==1))throw Error('Account requires a reviewed migration; refusing silent loss or activation');
 await target.query('BEGIN');
 try {
  if((await target.query('SELECT count(*)::text count FROM app_identity.continua_auth_user')).rows[0].count!=='0')throw Error('Credential target is not empty; refusing overwrite');
  for(const user of users){
   const stable=(await target.query('SELECT email FROM app_identity.users WHERE id=$1',[user.id])).rows[0];
   if(!stable||stable.email!==user.email)throw Error('Snapshot identity mismatch');
   const name=String(user.raw_user_meta_data?.full_name||user.raw_user_meta_data?.name||user.email.split('@')[0]);
   await target.query('INSERT INTO app_identity.continua_auth_user(id,name,email,"emailVerified","createdAt","updatedAt","twoFactorEnabled") VALUES($1,$2,$3,$4,$5,$6,false)',[user.id,name,user.email,user.verified,user.created_at,user.updated_at||user.created_at]);
   await target.query('INSERT INTO app_identity.continua_auth_account(id,"userId","providerId","accountId",password,"createdAt","updatedAt") VALUES($1,$2::uuid,\'credential\',$2::uuid::text,$3,$4,$5)',[randomUUID(),user.id,user.encrypted_password,user.created_at,user.updated_at||user.created_at]);
  }
  await target.query('COMMIT');
  return {users:users.length,stableIdsPreserved:true,passwordDigestsCopiedWithoutConversion:true,legacySessionsImported:false,productionChanged:false};
 }catch(error){await target.query('ROLLBACK');throw error;}
}
