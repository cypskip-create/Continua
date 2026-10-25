import {test,expect,vi} from 'vitest';import {provisionManagedIdentity} from './managedProvisioning.js';
function fixture({mapping,intent=true}={}){
 const writes=[];let created;const client={release:vi.fn(),query:vi.fn(async(sql,params)=>{
  if(sql.startsWith('SELECT m.user_id'))return {rows:mapping?[mapping]:[]};
  if(sql.startsWith('SELECT metadata'))return {rows:intent?[{metadata:{adult_self_attested:true,terms_version:'2026-10-12',privacy_notice_version:'2026-10-12'}}]:[]};
  if(sql.includes('INSERT INTO')){writes.push({sql,params});if(sql.includes('INSERT INTO app_identity.users'))created=params[0];}
  if(sql.startsWith('SELECT id::text'))return {rows:[{user_id:created,email:'test@example.invalid'}]};return {rows:[]};
 })};return {client,writes,database:{connect:async()=>client}};
}
const user={id:'managed-subject',email:'test@example.invalid',name:'Test',emailVerified:true};
test('new verified managed subject gets a new UUID and Free entitlement without email-based owner lookup',async()=>{
 const f=fixture(),result=await provisionManagedIdentity({database:f.database,issuer:'https://stage.invalid',user});expect(result.user_id).toMatch(/^[a-f0-9-]{36}$/);expect(result.user_id).not.toBe(user.id);expect(f.writes).toHaveLength(4);expect(f.writes.find(x=>x.sql.includes('public.profiles')).sql).toContain("'free',NULL");expect(f.client.query.mock.calls.filter(([sql])=>sql.startsWith('SELECT')&&sql.includes('WHERE email='))).toHaveLength(0);expect(f.client.release).toHaveBeenCalled();
});
test('provisioning reuses only an active issuer-subject mapping and denies missing consent or unverified users',async()=>{
 const f=fixture({mapping:{user_id:'existing-canonical',state:'active'}});expect((await provisionManagedIdentity({database:f.database,issuer:'https://stage.invalid',user})).user_id).toBe('existing-canonical');expect(f.writes).toHaveLength(0);
 const missing=fixture({intent:false});await expect(provisionManagedIdentity({database:missing.database,issuer:'https://stage.invalid',user})).rejects.toMatchObject({code:'ONBOARDING_REQUIRED'});expect(missing.writes).toHaveLength(0);await expect(provisionManagedIdentity({database:f.database,issuer:'https://stage.invalid',user:{...user,emailVerified:false}})).rejects.toMatchObject({code:'EMAIL_NOT_VERIFIED'});
});
