import {issueMfaChallenge} from './mfaChallenge.js';
import {APIError,createAuthEndpoint,createAuthMiddleware,getSessionFromCtx} from 'better-auth/api';

// Uses Better Auth's documented plugin context and its pinned 1.7.12 two-factor
// challenge contract. A recovery token alone never creates an authenticated session.
// Upstream still verifies TOTP, enforces account lockout, and consumes the challenge.
export function recoveryMfa({database}){
 const target=async token=>{
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{8,256}$/.test(token))return null;
  return (await database.query(`SELECT v.value user_id,v."expiresAt" expires_at,u."twoFactorEnabled" enabled FROM app_identity.continua_auth_verification v JOIN app_identity.continua_auth_user u ON u.id::text=v.value JOIN app_identity.users i ON i.id=u.id AND i.deleted_at IS NULL WHERE v.identifier=$1 AND v."expiresAt">now()`,['reset-password:'+token])).rows[0]??null;
 };
 const reject=()=>{throw new APIError('BAD_REQUEST',{message:'A valid recovery link and matching authenticator are required',code:'RECOVERY_VERIFICATION_REQUIRED'});};
 return {id:'continua-recovery-mfa',
  endpoints:{beginRecoveryMfa:createAuthEndpoint('/continua-recovery/begin',{method:'POST'},async ctx=>{
   const account=await target(ctx.body?.token);if(!account)reject();
   if(!account.enabled)return ctx.json({mfaRequired:false});
   const current=await getSessionFromCtx(ctx);if(current&&current.user.id!==account.user_id)reject();
   const expiresAt=new Date(Math.min(Date.now()+600000,new Date(account.expires_at).getTime()));
   const identifier=await issueMfaChallenge(ctx,account.user_id,expiresAt);
   await ctx.context.internalAdapter.createVerificationValue({value:'reset-password:'+ctx.body.token,identifier:'continua-recovery:'+identifier,expiresAt});
   return ctx.json({mfaRequired:true});
  })},
  hooks:{before:[{matcher:ctx=>['/two-factor/verify-totp','/two-factor/verify-backup-code'].includes(ctx.path),handler:createAuthMiddleware(async ctx=>{
   const cookie=ctx.context.createAuthCookie('two_factor');
   const challenge=await ctx.getSignedCookie(cookie.name,ctx.context.secret);if(!challenge)return;
   const marker=await ctx.context.internalAdapter.findVerificationValue('continua-recovery:'+challenge);if(!marker)return;
   // A pending recovery challenge must not survive consuming or expiring its
   // email token in another tab. Regular password-signin challenges have no marker.
   const token=marker.value.startsWith('reset-password:')?marker.value.slice(15):null;
   const account=await target(token);if(!account)reject();
   const pending=await ctx.context.internalAdapter.findVerificationValue(challenge);
   if(!pending||pending.value!==account.user_id)reject();
  })},{matcher:ctx=>ctx.path==='/reset-password',handler:createAuthMiddleware(async ctx=>{
   const account=await target(ctx.body?.token??ctx.query?.token);if(!account)reject();
   if(!account.enabled)return;
   const current=await getSessionFromCtx(ctx);if(!current||current.user.id!==account.user_id)reject();
   const proof=await database.query(`SELECT 1 FROM app_identity.session_assurance a JOIN app_identity.continua_auth_session s ON s.id=a.session_id AND s."userId"=a.user_id WHERE a.session_id=$1 AND a.user_id=$2 AND a.mfa_verified_at IS NOT NULL AND s."expiresAt">now()`,[current.session.id,account.user_id]);
   if(!proof.rowCount)reject();
  })}]},
  rateLimit:[{pathMatcher:path=>path==='/continua-recovery/begin',window:60,max:5}]
 };
}
