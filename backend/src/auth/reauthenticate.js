// A password check is bound to the exact, live, fully assured cookie session.
// Never persist the password or infer freshness from a new JWT/TOTP timestamp.
export async function reauthenticateSession({auth,database,verifyAccess},headers,password){
 if(typeof password!=='string'||!password||password.length>256)throw Error('Current password required');
 const session=await auth.api.getSession({headers});if(!session?.session?.id)throw Error('Sign in to continue');
 const {token}=await auth.api.getToken({headers});const identity=await verifyAccess(token);
 if(identity.user.id!==session.user.id||identity.user.session_id!==session.session.id)throw Error('Invalid user session');
 const result=await auth.api.verifyPassword({headers,body:{password}});if(result?.status!==true)throw Error('Password could not be verified');
 const proof=await database.query(`INSERT INTO app_identity.session_assurance(session_id,user_id,password_verified_at)
 SELECT id,"userId",now() FROM app_identity.continua_auth_session WHERE id=$1 AND "userId"=$2 AND "expiresAt">now()
 ON CONFLICT(session_id) DO UPDATE SET password_verified_at=EXCLUDED.password_verified_at RETURNING session_id`,[session.session.id,session.user.id]);
 if(proof.rowCount!==1)throw Error('User session revoked');
 return {verified:true};
}
