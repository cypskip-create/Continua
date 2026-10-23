export function createAccessVerifier({auth,database,now=()=>Date.now()}) {
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 return async function verifyAccess(token,{recent=false}={}) {
  if(typeof token!=='string'||token.length>16384)throw Error('Invalid user session');
  const {payload}=await auth.api.verifyJWT({body:{token}});
  if(!payload||!uuid.test(payload.sub??'')||!uuid.test(payload.session_id??'')||payload.role!=='authenticated'||!Number.isFinite(payload.iat)||!Number.isFinite(payload.exp)||payload.iat*1000>now()+30000||payload.exp-payload.iat>300)throw Error('Invalid user session');
  const row=(await database.query(`SELECT u.id::text,u.email,u.name,u."emailVerified",u."createdAt",u."updatedAt",u."twoFactorEnabled",s.id::text session_id,a.password_verified_at,a.mfa_verified_at
   FROM app_identity.continua_auth_session s JOIN app_identity.continua_auth_user u ON u.id=s."userId"
   JOIN app_identity.users i ON i.id=u.id AND i.deleted_at IS NULL
   LEFT JOIN app_identity.session_assurance a ON a.session_id=s.id AND a.user_id=u.id
   WHERE s.id=$1 AND s."userId"=$2 AND s."expiresAt">now()`,[payload.session_id,payload.sub])).rows[0];
  if(!row)throw Error('User session revoked');
  if(row.twoFactorEnabled&&!row.mfa_verified_at)throw Error('Complete two-step verification to continue');
  const passwordAt=row.password_verified_at?new Date(row.password_verified_at).getTime():NaN;
  if(recent&&(!Number.isFinite(passwordAt)||passwordAt>now()+30000||now()-passwordAt>600000))throw Error('Recent authentication required');
  return {user:row,claims:{...payload,email:row.email,role:'authenticated',aal:row.mfa_verified_at?'aal2':'aal1',amr:Number.isFinite(passwordAt)?[{method:'password',timestamp:Math.floor(passwordAt/1000)}]:[]}};
 };
}
