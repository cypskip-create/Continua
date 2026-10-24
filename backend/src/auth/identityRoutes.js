import {requireAccountSecurityProof} from './accountSecurityAssurance.js';
import express from 'express';
import {rateLimit,ipKeyGenerator} from 'express-rate-limit';
import {BoundedMemoryRateStore} from '../api/middleware/sharedRateStore.js';
import {rateLimitClientIP} from '../api/middleware/edgeClientIdentity.js';
import QRCode from 'qrcode';
import {reauthenticateSession} from './reauthenticate.js';

// Owned browser transport. Better Auth's opaque session token stays in its
// host-only HttpOnly cookie; only a short-lived JWT is returned to JavaScript.
export function createIdentityRouter({auth,database,verifyAccess,publicOrigin}){
 const origin=new URL(publicOrigin).origin,router=express.Router();
 router.use(rateLimit({windowMs:60000,limit:120,standardHeaders:false,legacyHeaders:false,store:new BoundedMemoryRateStore(),keyGenerator:(req,res)=>{const ip=ipKeyGenerator(rateLimitClientIP(req,res));return req.method==='POST'&&req.path==='/signout'?`signout:${ip}`:ip;}}));
 const methods=new Set(['signin','google','signup','signout','recover','verify-password','mfa-enable','mfa-verify','mfa-disable','email','recovery-begin','reset-password']);
 router.use(express.json({limit:'64kb'}));
 router.use((req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('Pragma','no-cache');res.set('Referrer-Policy','no-referrer');next();});
 function context(req,res){
  const cookies=new Map((req.header('cookie')??'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const at=v.indexOf('=');return [v.slice(0,at),v.slice(at+1)];}));
  const headers=()=>new Headers({'Content-Type':'application/json',origin,cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),'user-agent':req.header('user-agent')??'Continua','x-continua-verified-ip':res.locals.trustedEdgeClientIP??req.ip??'127.0.0.1',...(req.body?.captchaToken?{'x-captcha-response':String(req.body.captchaToken)}:{})});
  async function call(endpoint,body,method=body?'POST':'GET'){
   const response=await auth.handler(new Request(origin+'/api/auth/'+endpoint,{method,headers:headers(),body:body?JSON.stringify(body):undefined}));
   for(const cookie of response.headers.getSetCookie()){
    if(!/^__Secure-continua\.[a-z0-9_.-]+=/i.test(cookie)||/;\s*Domain=/i.test(cookie)||!/;\s*HttpOnly(?:;|$)/i.test(cookie)||!/;\s*Secure(?:;|$)/i.test(cookie))throw Error('Unsafe authentication cookie');
    res.append('Set-Cookie',cookie);const pair=cookie.split(';')[0],at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1));
   }
   const text=await response.text();if(Buffer.byteLength(text)>131072)throw Error('Authentication response too large');let data=null;try{data=text?JSON.parse(text):null;}catch{}
   if(response.status>=400){const error=new Error(data?.message??'Authentication request failed');error.status=response.status;error.code=data?.code;throw error;}
   return {data,status:response.status,location:response.headers.get('location')};
  }
  async function envelope(){
   const current=(await call('get-session')).data;if(!current?.session||!current?.user)return null;
   // These reads depend on the live provider session, but not on one another.
   // No session/security result is cached between requests.
   const [tokenResult,identityResult,factorResult]=await Promise.all([
    call('token'),
    database.query('SELECT raw_user_meta_data,created_at::text,updated_at::text,email_confirmed_at::text FROM app_identity.users WHERE id=$1 AND deleted_at IS NULL',[current.user.id]),
    database.query('SELECT id::text,verified FROM app_identity.continua_auth_two_factor WHERE "userId"=$1',[current.user.id])
   ]);
   const access=tokenResult.data?.token;if(typeof access!=='string')throw Error('Access token unavailable');
   const claims=JSON.parse(Buffer.from(access.split('.')[1],'base64url').toString('utf8'));
   const identity=identityResult.rows[0];if(!identity)throw Error('Application identity unavailable');
   const factors=factorResult.rows.map(f=>({id:f.id,factor_type:'totp',status:f.verified?'verified':'unverified',friendly_name:'Continua authenticator'}));
   return {access_token:access,refresh_token:'cookie-session',token_type:'bearer',expires_in:Math.max(0,claims.exp-Math.floor(Date.now()/1000)),expires_at:claims.exp,user:{id:current.user.id,email:current.user.email,aud:'authenticated',role:'authenticated',created_at:identity.created_at,updated_at:identity.updated_at,email_confirmed_at:identity.email_confirmed_at,user_metadata:identity.raw_user_meta_data,app_metadata:{provider:'email',providers:['email']},factors}};
  }
  async function assured(recent=false){const access=(await call('token')).data?.token;const identity=await verifyAccess(access);if(recent)await requireAccountSecurityProof({database,sessionId:identity.claims.session_id,userId:identity.user.id});return identity;}
  return {call,envelope,assured,headers};
 }
 const sameOrigin=req=>req.header('origin')===origin||(!req.header('origin')&&req.header('sec-fetch-site')==='same-origin');
 router.get('/provider/*path',async(req,res)=>{try{const path=(Array.isArray(req.params.path)?req.params.path:[req.params.path]).join('/');if(!/^(?:verify-email|reset-password\/[A-Za-z0-9_-]{8,256}|callback\/google)$/.test(path))return res.status(404).json({error:'Callback unavailable'});const query=new URL(req.originalUrl,origin).search;const result=await context(req,res).call(path+query);if(result.location){const location=new URL(result.location,origin);if(location.origin!==origin)throw Error('Unexpected authentication redirect');return res.redirect(302,location.href);}return res.status(result.status).json({verified:true});}catch{return res.status(400).json({error:'Verification could not complete. Request a fresh link.'});}});
 router.use((req,res,next)=>{if(!sameOrigin(req)||req.header('x-continua-session')!=='1')return res.status(403).json({error:'Origin not allowed'});next();});
 router.get('/session',async(req,res)=>{try{const ctx=context(req,res),session=await ctx.envelope();const pending=session?false:(await ctx.call('continua-mfa/pending')).data?.mfaRequired===true;res.json({session,mfaRequired:pending});}catch(error){const status=[401,403].includes(error.status)?401:503;res.status(status).json({error:status===503?'Session verification is temporarily unavailable':'Session could not be verified'});}});
 router.get('/verify',async(req,res)=>{try{const token=req.header('x-user-token')??req.header('authorization')?.replace(/^Bearer /,'');const identity=await verifyAccess(token,{recent:req.query.recent==='true'});res.json({user:{id:identity.user.id,email:identity.user.email},claims:identity.claims});}catch{res.status(401).json({error:'Session could not be verified'});}});
 router.get('/factors',async(req,res)=>{try{const ctx=context(req,res),session=await ctx.envelope();if(!session)return res.status(401).json({error:'Sign in first'});res.json({factors:session.user.factors});}catch{res.status(401).json({error:'Security settings unavailable'});}});
 router.post('/:operation',async(req,res)=>{const operation=req.params.operation;if(!methods.has(operation))return res.status(404).json({error:'Identity operation unavailable'});const body=req.body;if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>65536)return res.status(400).json({error:'Invalid identity request'});const ctx=context(req,res);
  try{
   if(operation==='signup'){
    const legal=body.acknowledgement;if(legal?.adult_self_attested!==true||legal.terms_version!=='2026-10-12'||legal.privacy_notice_version!=='2026-10-12')return res.status(400).json({error:'Confirm age and current Terms before registering'});
    await ctx.call('sign-up/email',{name:body.name,email:body.email,password:body.password,userMetadata:{full_name:body.name,adult_self_attested:true,terms_version:legal.terms_version,privacy_notice_version:legal.privacy_notice_version}});return res.json({session:await ctx.envelope()});
   }
   if(operation==='google'){
    if(!auth.options.socialProviders?.google)return res.status(503).json({error:'Google sign-in is not configured'});
    const legal=body.acknowledgement;
    if(body.signup&&(legal?.adult_self_attested!==true||legal.terms_version!=='2026-10-12'||legal.privacy_notice_version!=='2026-10-12'))return res.status(400).json({error:'Confirm age and current Terms before registering'});
    const result=await ctx.call('sign-in/social',{provider:'google',callbackURL:origin+'/auth',errorCallbackURL:origin+'/auth',disableRedirect:true,requestSignUp:body.signup===true,...(body.signup?{additionalData:{continuaLegal:{adult_self_attested:true,terms_version:legal.terms_version,privacy_notice_version:legal.privacy_notice_version}}}:{})});
    const destination=new URL(result.data?.url);if(destination.origin!=='https://accounts.google.com'||destination.pathname!=='/o/oauth2/v2/auth')throw Error('Invalid Google authorization address');return res.json({url:destination.href});
   }
   if(operation==='signin'){
    const current=await auth.api.getSession({headers:ctx.headers()});if(current?.user?.email===body.email){await reauthenticateSession({auth,database,verifyAccess},ctx.headers(),body.password);return res.json({session:await ctx.envelope()});}
    const result=await ctx.call('sign-in/email',{email:body.email,password:body.password});if(result.data?.twoFactorRedirect)return res.json({session:null,mfaRequired:true});return res.json({session:await ctx.envelope()});
   }
   if(operation==='signout'){await ctx.call('sign-out',{});return res.json({signedOut:true});}
   if(operation==='recover'){await ctx.call('request-password-reset',{email:body.email,redirectTo:origin+'/auth'});return res.json({requested:true});}
   if(operation==='verify-password'){await reauthenticateSession({auth,database,verifyAccess},ctx.headers(),body.password);return res.json({session:await ctx.envelope()});}
   if(operation==='mfa-verify'){if(!/^\d{6}$/.test(body.code??''))return res.status(400).json({error:'Enter the six-digit authenticator code'});await ctx.call('two-factor/verify-totp',{code:body.code,trustDevice:false});return res.json({session:await ctx.envelope()});}
   if(operation==='mfa-enable'){await ctx.assured(true);const result=(await ctx.call('two-factor/enable',{password:body.password,method:'totp',issuer:'Continua'})).data;const uri=new URL(result.totpURI);if(uri.protocol!=='otpauth:')throw Error('Invalid enrollment response');const factor=(await database.query('SELECT id::text FROM app_identity.continua_auth_two_factor WHERE "userId"=$1',[(await auth.api.getSession({headers:ctx.headers()})).user.id])).rows[0];const svg=await QRCode.toString(result.totpURI,{type:'svg',errorCorrectionLevel:'M'});return res.json({id:factor.id,totp:{secret:uri.searchParams.get('secret'),qr_code:'data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64')}});}
   if(operation==='mfa-disable'){await ctx.assured(true);await ctx.call('two-factor/disable',{password:body.password});return res.json({removed:true,session:await ctx.envelope()});}
   if(operation==='email'){await ctx.assured(true);await ctx.call('change-email',{newEmail:body.email,callbackURL:origin+'/auth'});return res.json({requested:true});}
   if(operation==='recovery-begin'){const result=await ctx.call('continua-recovery/begin',{token:body.token});return res.json(result.data);}
   if(operation==='reset-password'){
    if(typeof body.token!=='string'||body.token.length>256)return res.status(400).json({error:'A valid recovery link is required'});
    const target=(await database.query(`SELECT v.value::uuid user_id,u."twoFactorEnabled" enabled FROM app_identity.continua_auth_verification v JOIN app_identity.continua_auth_user u ON u.id::text=v.value WHERE v.identifier=$1 AND v."expiresAt">now()`,['reset-password:'+body.token])).rows[0];
    if(target?.enabled){const identity=await ctx.assured();if(identity.user.id!==target.user_id)throw Error('Verify the matching authenticator first');}
    await ctx.call('reset-password',{token:body.token,newPassword:body.password});return res.json({updated:true});
   }
  }catch(error){const status=Number.isInteger(error.status)&&error.status>=400&&error.status<=599?error.status:403;res.status(status).json({error:status>=500?'Authentication is temporarily unavailable':error.message??'Authentication could not complete',code:error.code??'IDENTITY_REJECTED'});}
 });
 return router;
}
