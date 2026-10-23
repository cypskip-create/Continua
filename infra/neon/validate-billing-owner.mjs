import assert from 'node:assert/strict';

// Run only against a synthetic fixture. All data and temporary grants roll back.
// Exercise the trigger even if a future migration accidentally grants the columns.
export async function validateBillingOwner(database,{userId,sessionClaims}){
 assert.equal(sessionClaims.sub,userId);
 assert.match(userId,/^[0-9a-f-]{36}$/i);
 const client=await database.connect();
 try{
  await client.query('BEGIN');
  await client.query("SET LOCAL statement_timeout='8000ms'");
  const fixture=await client.query(`SELECT u.id FROM app_identity.users u JOIN public.profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.email LIKE '%@example.invalid'`,[userId]);
  assert.equal(fixture.rowCount,1,'An existing synthetic staging profile is required');
  const initial=(await client.query('SELECT subscription_plan,subscription_expires_at FROM public.profiles WHERE user_id=$1',[userId])).rows[0];
  const target=initial.subscription_plan==='premium_plus'?'premium':'premium_plus';
  await client.query('UPDATE public.profiles SET subscription_plan=$2 WHERE user_id=$1',[userId,target]);
  assert.equal((await client.query('SELECT subscription_plan FROM public.profiles WHERE user_id=$1',[userId])).rows[0].subscription_plan,target);
  await client.query('GRANT UPDATE (subscription_plan,subscription_expires_at) ON public.profiles TO authenticated');
  await client.query('SET LOCAL ROLE authenticated');
  await client.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify(sessionClaims)]);
  await client.query('SELECT public.continua_session_guard()');
  for(const mutation of [
   ['UPDATE public.profiles SET subscription_plan=$2 WHERE user_id=$1',[userId,initial.subscription_plan]],
   ["UPDATE public.profiles SET subscription_expires_at=now()+interval '10 years' WHERE user_id=$1",[userId]]
  ]){
   await client.query('SAVEPOINT denied_change');
   await assert.rejects(()=>client.query(...mutation),error=>error.code==='42501'&&/billing system/.test(error.message));
   await client.query('ROLLBACK TO SAVEPOINT denied_change');
  }
  await client.query('RESET ROLE');
  await client.query('ROLLBACK');
  const final=(await client.query('SELECT subscription_plan,subscription_expires_at FROM public.profiles WHERE user_id=$1',[userId])).rows[0];
  assert.deepEqual(final,initial);
  return {ownerBillingWrite:true,browserPlanWriteRejected:true,browserExpiryWriteRejected:true,temporaryGrantsRolledBack:true};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
 finally{client.release();}
}
