import {APIError,getSessionFromCtx} from 'better-auth/api';

// Only owned MFA/email handlers and their MFA provider hook use this helper.
// The general access verifier and its password-only recent check are unchanged.
export async function requireAccountSecurityProof({database,sessionId,userId,credentialPasswordWillBeVerified=false,now=Date.now()}){
 const row=(await database.query(`SELECT a.password_verified_at,a.oauth_verified_at,a.mfa_verified_at,u."twoFactorEnabled" mfa_enabled,
 EXISTS(SELECT 1 FROM app_identity.continua_auth_account c WHERE c."userId"=u.id AND c."providerId"='credential' AND c.password IS NOT NULL AND c.password<>'') has_password,
 EXISTS(SELECT 1 FROM app_identity.continua_auth_account g WHERE g."userId"=u.id AND g."providerId"='google') has_google
 FROM app_identity.continua_auth_session s JOIN app_identity.continua_auth_user u ON u.id=s."userId" JOIN app_identity.users i ON i.id=u.id AND i.deleted_at IS NULL
 LEFT JOIN app_identity.session_assurance a ON a.session_id=s.id AND a.user_id=u.id
 WHERE s.id=$1 AND u.id=$2 AND s."expiresAt">now()`,[sessionId,userId])).rows[0];
 const deny=()=>{throw new APIError('FORBIDDEN',{message:'Verify a recent sign-in and any enabled authenticator before this account-security change',code:'RECENT_AUTHENTICATION_REQUIRED'});};
 if(!row||row.mfa_enabled&&!row.mfa_verified_at)deny();
 // Credential accounts still face the upstream password check for MFA.
 // Email-change operations never enter this branch.
 if(credentialPasswordWillBeVerified&&row.has_password===true)return row;
 const fresh=(value,window)=>{const at=value?new Date(value).getTime():NaN;return Number.isFinite(at)&&at<=now+30000&&now-at<=window;};
 if(row.has_password===true&&fresh(row.password_verified_at,600000))return row;
 if(row.has_password===false&&row.has_google===true&&fresh(row.oauth_verified_at,300000))return row;
 deny();
}
export async function requireMfaProviderStepUp(ctx,database){
 const current=await getSessionFromCtx(ctx);if(!current)throw new APIError('UNAUTHORIZED',{message:'Sign in first'});
 return requireAccountSecurityProof({database,sessionId:current.session.id,userId:current.user.id,credentialPasswordWillBeVerified:true});
}
