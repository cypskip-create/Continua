import {randomUUID} from 'node:crypto';
export function legalAcknowledgement(value){
 if(value?.adult_self_attested!==true||value.terms_version!=='2026-10-12'||value.privacy_notice_version!=='2026-10-12')throw Object.assign(Error('Confirm age and current Terms before registering'),{status:400});
 return {adult_self_attested:true,terms_version:value.terms_version,privacy_notice_version:value.privacy_notice_version};
}
// Called only with a provider-verified user, never an email or ID from a browser.
export async function provisionManagedIdentity({database,issuer,user}){
 if(!user||typeof user.id!=='string'||user.id.length>200||user.emailVerified!==true||typeof user.email!=='string'||user.banned===true)throw Object.assign(Error('Verify your email before signing in'),{status:403,code:'EMAIL_NOT_VERIFIED'});
 const client=await database.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['managed-identity:'+issuer+'|'+user.id]);
  let mapping=(await client.query(`SELECT m.user_id::text,m.state,u.email,u.raw_user_meta_data,u.created_at,u.updated_at,u.email_confirmed_at
   FROM app_identity.managed_identities m JOIN app_identity.users u ON u.id=m.user_id
   WHERE m.issuer=$1 AND m.subject=$2 AND u.source_provider='neon-managed' AND u.deleted_at IS NULL`,[issuer,user.id])).rows[0];
  if(mapping){if(mapping.state!=='active')throw Object.assign(Error('Account access is unavailable'),{status:403});await client.query('COMMIT');return mapping;}
  const intent=(await client.query('SELECT metadata FROM app_identity.managed_registration_intents WHERE issuer=$1 AND subject=$2',[issuer,user.id])).rows[0];
  if(!intent)throw Object.assign(Error('Complete Continua registration before accessing the application'),{status:403,code:'ONBOARDING_REQUIRED'});
  const metadata={...legalAcknowledgement(intent.metadata),full_name:String(user.name??intent.metadata.full_name??'').slice(0,100)};
  const id=randomUUID();
  await client.query(`INSERT INTO app_identity.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data,created_at,updated_at,source_provider)
   VALUES($1,$2,now(),$3::jsonb,'{"provider":"neon-managed"}'::jsonb,now(),now(),'neon-managed')`,[id,user.email,JSON.stringify(metadata)]);
  await client.query(`INSERT INTO public.profiles(user_id,full_name,email,handle,subscription_plan,subscription_expires_at)
   VALUES($1,$2,$3,$4,'free',NULL)`,[id,metadata.full_name,user.email,'user_'+id.replaceAll('-','').slice(0,10)]);
  await client.query('INSERT INTO public.user_preferences(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[id]);
  await client.query('INSERT INTO app_identity.managed_identities(issuer,subject,user_id) VALUES($1,$2,$3)',[issuer,user.id,id]);
  mapping=(await client.query('SELECT id::text user_id,email,raw_user_meta_data,created_at,updated_at,email_confirmed_at FROM app_identity.users WHERE id=$1',[id])).rows[0];
  await client.query('COMMIT');return mapping;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
