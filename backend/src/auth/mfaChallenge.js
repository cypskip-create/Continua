import {requireMfaProviderStepUp} from './accountSecurityAssurance.js';
import {randomBytes} from 'node:crypto';
import {createAuthEndpoint,createAuthMiddleware} from 'better-auth/api';
import {deleteSessionCookie,expireCookie} from 'better-auth/cookies';

export async function issueMfaChallenge(ctx,userId,expiresAt=new Date(Date.now()+600000)){
 const cookie=ctx.context.createAuthCookie('two_factor',{maxAge:Math.max(1,Math.floor((expiresAt.getTime()-Date.now())/1000))});
 const identifier='2fa-'+randomBytes(32).toString('base64url');
 await ctx.context.internalAdapter.createVerificationValue({value:userId,identifier,expiresAt});
 await ctx.context.internalAdapter.createVerificationValue({value:'0',identifier:'2fa-attempts-'+identifier,expiresAt});
 await ctx.setSignedCookie(cookie.name,identifier,ctx.context.secret,cookie.attributes);
 return identifier;
}

// Better Auth's built-in 2FA hooks protect credential sign-in. Google callbacks
// must also enter its ordinary bounded challenge before any session is retained.
export function oauthMfa({database}){return {id:'continua-oauth-mfa',
 endpoints:{pendingMfa:createAuthEndpoint('/continua-mfa/pending',{method:'GET'},async ctx=>{
  const cookie=ctx.context.createAuthCookie('two_factor');const signed=await ctx.getSignedCookie(cookie.name,ctx.context.secret);
  const pending=signed?await ctx.context.internalAdapter.findVerificationValue(signed):null;
  return ctx.json({mfaRequired:!!pending&&new Date(pending.expiresAt).getTime()>Date.now()});
 })},
 hooks:{before:[{matcher:ctx=>ctx.path==='/sign-out',handler:createAuthMiddleware(async ctx=>{
  const cookie=ctx.context.createAuthCookie('two_factor');const signed=await ctx.getSignedCookie(cookie.name,ctx.context.secret);
  if(signed){await ctx.context.internalAdapter.consumeVerificationValue(signed);await ctx.context.internalAdapter.consumeVerificationValue('2fa-attempts-'+signed);await ctx.context.internalAdapter.consumeVerificationValue('continua-recovery:'+signed);await ctx.context.internalAdapter.consumeVerificationValue('continua-oauth:'+signed);}
  expireCookie(ctx,cookie);
 })},{matcher:ctx=>['/two-factor/enable','/two-factor/disable','/two-factor/get-totp-uri'].includes(ctx.path),handler:createAuthMiddleware(async ctx=>{await requireMfaProviderStepUp(ctx,database);})}],after:[{matcher:ctx=>ctx.path==='/callback/google'||ctx.path==='/callback/:id'&&ctx.params?.id==='google',handler:createAuthMiddleware(async ctx=>{
  const current=ctx.context.newSession;if(!current)return;
  if(!current.user.twoFactorEnabled){await database.query(`INSERT INTO app_identity.session_assurance(session_id,user_id,oauth_verified_at) VALUES($1,$2,now()) ON CONFLICT(session_id) DO UPDATE SET oauth_verified_at=now()`,[current.session.id,current.user.id]);return;}
  deleteSessionCookie(ctx,true);
  await ctx.context.internalAdapter.deleteSession(current.session.token);
  ctx.context.setNewSession(null);
  const authenticatedAt=Date.now(),expiresAt=new Date(authenticatedAt+600000),identifier=await issueMfaChallenge(ctx,current.user.id,expiresAt);
  await ctx.context.internalAdapter.createVerificationValue({identifier:'continua-oauth:'+identifier,value:JSON.stringify({userId:current.user.id,authenticatedAt}),expiresAt});
 })},{matcher:ctx=>['/two-factor/verify-totp','/two-factor/verify-backup-code'].includes(ctx.path),handler:createAuthMiddleware(async ctx=>{
  const result=ctx.context.returned,current=ctx.context.newSession??ctx.context.session;if(!result?.token||!current?.session?.id)return;
  const cookie=ctx.context.createAuthCookie('two_factor'),signed=await ctx.getSignedCookie(cookie.name,ctx.context.secret);if(!signed)return;
  const marker=await ctx.context.internalAdapter.consumeVerificationValue('continua-oauth:'+signed);if(!marker)return;
  const proof=JSON.parse(marker.value);if(proof.userId!==current.user.id||!Number.isFinite(proof.authenticatedAt)||proof.authenticatedAt>Date.now()+30000||Date.now()-proof.authenticatedAt>600000)throw Error('OAuth authentication proof expired');
  await database.query(`INSERT INTO app_identity.session_assurance(session_id,user_id,oauth_verified_at) VALUES($1,$2,$3) ON CONFLICT(session_id) DO UPDATE SET oauth_verified_at=EXCLUDED.oauth_verified_at`,[current.session.id,current.user.id,new Date(proof.authenticatedAt)]);
 })}]}
};}
