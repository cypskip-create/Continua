import {betterAuth} from 'better-auth';
import {twoFactor,jwt,captcha} from 'better-auth/plugins';
import {APIError,createAuthMiddleware,getOAuthState} from 'better-auth/api';
import bcrypt from 'bcrypt';
import {recoveryMfa} from './recoveryMfa.js';
import {oauthMfa} from './mfaChallenge.js';
import {privateRecoveryLink} from './recoveryLink.js';

// Explicit opt-in factory. Importing this module never connects, migrates,
// mounts a route, sends mail, or changes the production provider.
export function createContinuaAuth({database,secret,baseURL,trustedOrigins,sendMail,captchaSecret,googleClientId,googleClientSecret,testOnly=false}) {
 if(!database || typeof database.query!=='function') throw Error('A dedicated PostgreSQL auth pool is required');
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32) throw Error('An independent auth secret of at least 32 bytes is required');
 const origin=new URL(baseURL);
 const local=testOnly&&['localhost','127.0.0.1'].includes(origin.hostname);
 if(testOnly&&!local&&!origin.hostname.endsWith('.invalid'))throw Error('Test mode requires an isolated invalid or loopback origin');
 if(!testOnly&&(typeof captchaSecret!=='string'||captchaSecret.length<20))throw Error('Server-side bot verification must be configured');
 if(origin.username||origin.password||origin.search||origin.hash||(!local&&origin.protocol!=='https:')) throw Error('An HTTPS authentication URL is required');
 if(!Array.isArray(trustedOrigins)||!trustedOrigins.length||trustedOrigins.some(value=>{const u=new URL(value);return u.origin!==value||(!local&&u.protocol!=='https:');})) throw Error('Exact trusted browser origins are required');
 if(typeof sendMail!=='function') throw Error('Verified email delivery must be configured explicitly');
 const deliver=(kind,to,url)=>sendMail({kind,to,url:kind==='password-recovery'?privateRecoveryLink(url,origin):url});
 if(!!googleClientId!==!!googleClientSecret)throw Error('Google OAuth configuration is incomplete');
 const validLegal=value=>value?.adult_self_attested===true&&value.terms_version==='2026-10-12'&&value.privacy_notice_version==='2026-10-12';
 return betterAuth({
  appName:'Continua',database,secret,baseURL,basePath:'/api/auth',trustedOrigins,
  advanced:{ipAddress:{ipAddressHeaders:['x-continua-verified-ip']},useSecureCookies:origin.protocol==='https:',cookiePrefix:'continua',defaultCookieAttributes:{httpOnly:true,secure:origin.protocol==='https:',sameSite:'lax',path:'/'},database:{generateId:'uuid'}},
  user:{modelName:'continua_auth_user',additionalFields:{userMetadata:{type:'json',required:false,input:true,returned:false}},changeEmail:{enabled:true,updateEmailWithoutVerification:false,
   sendChangeEmailConfirmation:({user,url})=>deliver('confirm-email-change',user.email,url)}},
  account:{modelName:'continua_auth_account',encryptOAuthTokens:true,accountLinking:{enabled:true,trustedProviders:[],requireLocalEmailVerified:true,allowDifferentEmails:false,updateUserInfoOnLink:false}},
  socialProviders:googleClientId?{google:{clientId:googleClientId,clientSecret:googleClientSecret,disableImplicitSignUp:true,scope:['openid','email','profile'],mapProfileToUser:profile=>{if(profile.email_verified!==true)throw new APIError('FORBIDDEN',{message:'A verified Google email is required'});return {emailVerified:true};}}}:undefined,
  databaseHooks:{user:{create:{before:async(user,ctx)=>{
   const state=await getOAuthState();
   if(state){
    const legal=state.continuaLegal;
    if(!validLegal(legal))throw new APIError('BAD_REQUEST',{message:'Confirm age and current Terms before registering'});
    return {data:{...user,userMetadata:{full_name:user.name,adult_self_attested:true,terms_version:legal.terms_version,privacy_notice_version:legal.privacy_notice_version}}};
   }
  }}}},
  session:{modelName:'continua_auth_session',expiresIn:604800,updateAge:86400,freshAge:300,cookieCache:{enabled:false}},
  verification:{modelName:'continua_auth_verification'},
  emailAndPassword:{enabled:true,requireEmailVerification:true,minPasswordLength:12,maxPasswordLength:72,
   // Supported Supabase migration: preserve bcrypt digests without conversion.
   password:{hash:password=>{if(Buffer.byteLength(password,'utf8')>72)throw Error('Password exceeds bcrypt byte limit');return bcrypt.hash(password,12);},verify:({hash,password})=>bcrypt.compare(password,hash)},
   sendResetPassword:({user,url})=>deliver('password-recovery',user.email,url),revokeSessionsOnPasswordReset:true},
  emailVerification:{sendOnSignUp:true,sendOnSignIn:false,autoSignInAfterVerification:false,
   sendVerificationEmail:({user,url})=>deliver('verify-email',user.email,url)},
  rateLimit:{enabled:true,storage:'database',modelName:'continua_auth_rate_limit',window:60,max:30},
  hooks:{before:createAuthMiddleware(async ctx=>{if(ctx.path==='/sign-in/social'&&ctx.body?.requestSignUp&&!validLegal(ctx.body.additionalData?.continuaLegal))throw new APIError('BAD_REQUEST',{message:'Confirm age and current Terms before registering'});}),after:createAuthMiddleware(async ctx=>{
   const result=ctx.context.returned;
   if(!['/sign-in/email','/two-factor/verify-totp','/two-factor/verify-backup-code'].includes(ctx.path)||!result?.token||!result?.user)return;
   const current=ctx.context.newSession??ctx.context.session;
   if(!current?.session?.id||current.user.id!==result.user.id)return;
   const mfa=ctx.path.startsWith('/two-factor/');
   await database.query(`INSERT INTO app_identity.session_assurance(session_id,user_id,password_verified_at,mfa_verified_at) VALUES($1,$2,CASE WHEN $3 THEN NULL ELSE now() END,CASE WHEN $3 THEN now() ELSE NULL END) ON CONFLICT(session_id) DO UPDATE SET mfa_verified_at=CASE WHEN $3 THEN now() ELSE app_identity.session_assurance.mfa_verified_at END`,[current.session.id,current.user.id,mfa]);
  })},
  plugins:[recoveryMfa({database}),oauthMfa({database}),...(!testOnly?[captcha({provider:'cloudflare-turnstile',secretKey:captchaSecret,allowedHostnames:trustedOrigins.map(value=>new URL(value).hostname),expectedAction:'continua-auth',endpoints:['/sign-up/email','/sign-in/email','/request-password-reset','/sign-in/social','/verify-password']})]:[]),jwt({schema:{jwks:{modelName:'continua_auth_jwks'}},disableSettingJwtHeader:true,jwt:{issuer:origin.origin,audience:'continua',expirationTime:'5m',definePayload:async ({user,session})=>{
   const proof=(await database.query('SELECT extract(epoch from password_verified_at)::float8 password_at,extract(epoch from mfa_verified_at)::float8 mfa_at,extract(epoch from oauth_verified_at)::float8 oauth_at FROM app_identity.session_assurance WHERE session_id=$1 AND user_id=$2',[session.id,user.id])).rows[0];
   return {email:user.email,role:'authenticated',session_id:session.id,aal:proof?.mfa_at?'aal2':'aal1',amr:[...(proof?.password_at?[{method:'password',timestamp:proof.password_at}]:[]),...(proof?.oauth_at?[{method:'oauth',timestamp:proof.oauth_at}]:[])]};
  }}}),twoFactor({issuer:'Continua',twoFactorTable:'continua_auth_two_factor',skipVerificationOnEnable:false,allowPasswordless:true,accountLockout:{enabled:true,maxFailedAttempts:5,durationSeconds:900}})],
  // Never write provider errors containing request payloads or credentials to logs.
  logger:{disabled:true},
 });
}
