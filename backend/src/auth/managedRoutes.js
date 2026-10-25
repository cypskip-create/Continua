import express from 'express';
import {randomBytes} from 'node:crypto';
import {rateLimit,ipKeyGenerator} from 'express-rate-limit';
import {BoundedMemoryRateStore} from '../api/middleware/sharedRateStore.js';
import {rateLimitClientIP} from '../api/middleware/edgeClientIdentity.js';
import {legalAcknowledgement} from './managedProvisioning.js';
import {tokenDigest} from './managedCrypto.js';

export function createTurnstileVerifier({secret,origin,fetcher=fetch}){
 if(typeof secret!=='string'||secret.length<20)throw Error('Server-side bot verification required');
 return async(token,ip)=>{
  if(typeof token!=='string'||token.length<1||token.length>4096)throw Object.assign(Error('Complete bot verification'),{status:400});
  const response=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret,response:token,remoteip:ip}),signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)throw Object.assign(Error('Bot verification unavailable'),{status:503});
  const result=await response.json();if(result.success!==true||result.hostname!==new URL(origin).hostname||result.action!=='continua-auth')throw Object.assign(Error('Complete a fresh bot verification'),{status:403});
 };
}
export function createManagedIdentityRouter({database,verifyAccess,providerFactory,broker,publicOrigin,verifyBot,issuer,managedBaseURL}){
 const origin=new URL(publicOrigin).origin,router=express.Router();
 router.use(rateLimit({windowMs:60000,limit:120,standardHeaders:false,legacyHeaders:false,store:new BoundedMemoryRateStore(),keyGenerator:(req,res)=>{const ip=ipKeyGenerator(rateLimitClientIP(req,res));return req.method==='POST'&&req.path==='/signout'?'signout:'+ip:ip;}}));
 router.use(express.json({limit:'64kb'}));
 router.use((req,res,next)=>{res.set({'Cache-Control':'private, no-store',Pragma:'no-cache','Referrer-Policy':'no-referrer'});if((req.header('origin')!==origin&&!(req.header('origin')===undefined&&req.header('sec-fetch-site')==='same-origin'))||req.header('x-continua-session')!=='1')return res.status(403).json({error:'Origin not allowed'});next();});
 const provider=(req,res)=>providerFactory({cookie:req.header('cookie')??'',onCookie:value=>res.append('Set-Cookie',value)});
 const failure=(res,error)=>{const status=Number.isInteger(error.status)&&error.status>=400&&error.status<=599?error.status:503;return res.status(status).json({error:status>=500?'Authentication is temporarily unavailable':error.message,code:error.code??'MANAGED_AUTH_REJECTED'});};
 router.get('/session',async(req,res)=>{try{return res.json({session:await broker.envelope(provider(req,res)),mfaRequired:false});}catch(error){return failure(res,error);}});
 router.get('/verify',async(req,res)=>{try{const identity=await verifyAccess(req.header('x-user-token')??req.header('authorization')?.replace(/^Bearer /,''),{recent:req.query.recent==='true'});return res.json({user:{id:identity.user.id,email:identity.user.email},claims:identity.claims});}catch{return res.status(401).json({error:'Session could not be verified'});}});
 router.get('/factors',async(req,res)=>{try{if(!await broker.envelope(provider(req,res)))return res.status(401).json({error:'Sign in first'});return res.json({factors:[],capabilities:{mfa:false,emailChange:false,requireEmailVerification:true}});}catch(error){return failure(res,error);}});
 const operations=new Set(['signup','signin','signout','recover','reset-password','recovery-begin','google','oauth-complete','verify-password','email','mfa-enable','mfa-verify','mfa-disable']);
 router.post('/:operation',async(req,res)=>{
  const operation=req.params.operation,body=req.body;if(!operations.has(operation))return res.status(404).json({error:'Identity operation unavailable'});
  if(!body||typeof body!=='object'||Array.isArray(body))return res.status(400).json({error:'Invalid identity request'});
  const ctx=provider(req,res);
  try{
   if(operation==='email'||operation.startsWith('mfa-'))return res.status(409).json({error:operation==='email'?'Email changes are unavailable with managed authentication':'Authenticator MFA is unavailable with managed authentication',code:'MANAGED_FEATURE_UNAVAILABLE'});
   if(['signup','signin','recover','google','verify-password'].includes(operation))await verifyBot(body.captchaToken,rateLimitClientIP(req,res));
   if(['signup','signin','recover'].includes(operation)&&(typeof body.email!=='string'||body.email.length>254||!/^\S+@\S+\.\S+$/.test(body.email)))return res.status(400).json({error:'Enter a valid email address'});
   if(['signup','signin','verify-password','reset-password'].includes(operation)&&(typeof body.password!=='string'||body.password.length<12||body.password.length>72))return res.status(400).json({error:'Use a password between 12 and 72 characters'});
   if(operation==='signup'){
    const metadata={...legalAcknowledgement(body.acknowledgement),full_name:String(body.name??'').trim().slice(0,100)};
    const result=await ctx.call('signUp.email',{email:body.email,password:body.password,name:metadata.full_name||'Continua user',callbackURL:origin+'/auth'});
    if(typeof result?.user?.id!=='string')throw Error('Managed registration did not return an identity');
    await database.query(`INSERT INTO app_identity.managed_registration_intents(issuer,subject,metadata) VALUES($1,$2,$3::jsonb) ON CONFLICT(issuer,subject) DO NOTHING`,[issuer,result.user.id,JSON.stringify(metadata)]);
    return res.json({session:null,verificationRequired:true});
   }
   if(operation==='signin'||operation==='verify-password'){
    const previous=operation==='verify-password'||ctx.cookies().includes('__Secure-neon-auth.session_token=')?await ctx.session():null;
    const previousCookie=previous?ctx.cookies():undefined;
    if(operation==='verify-password'&&!previous?.user)return res.status(401).json({error:'Sign in first'});
    const result=await ctx.call('signIn.email',{email:previous?.user.email??body.email,password:body.password});
    if(previous&&result?.user?.id!==previous.user.id)throw Error('Reauthentication identity mismatch');
    return res.json({session:await broker.envelope(ctx,{passwordVerified:true,previousSession:previous,previousCookie}),mfaRequired:false});
   }
   if(operation==='signout'){await broker.signOut(ctx);return res.json({signedOut:true});}
   if(operation==='recover'){await ctx.call('requestPasswordReset',{email:body.email,redirectTo:origin+'/auth'});return res.json({requested:true});}
   if(operation==='recovery-begin')return res.json({mfaRequired:false});
   if(operation==='reset-password'){
    if(!/^[A-Za-z0-9_-]{8,256}$/.test(body.token??''))return res.status(400).json({error:'A valid recovery link is required'});
    await ctx.call('resetPassword',{token:body.token,newPassword:body.password});
    // The live SDK credential-timestamp guard rejects pre-reset sessions even
    // when the managed service itself leaves them active.
    return res.json({updated:true});
   }
   if(operation==='google'){
    const metadata={signup:body.signup===true,...(body.signup===true?legalAcknowledgement(body.acknowledgement):{})},nonce=randomBytes(32).toString('base64url');
    await database.query(`INSERT INTO app_identity.managed_oauth_intents(digest,metadata,expires_at) VALUES($1,$2::jsonb,now()+interval '10 minutes')`,[tokenDigest(nonce),JSON.stringify(metadata)]);
    res.append('Set-Cookie','__Secure-continua.managed_registration='+nonce+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
    const result=await ctx.call('signIn.social',{provider:'google',callbackURL:origin+'/auth',errorCallbackURL:origin+'/auth',disableRedirect:true,requestSignUp:body.signup===true});
    const destination=new URL(result?.url),base=new URL(managedBaseURL);
    const directGoogle=destination.origin==='https://accounts.google.com'&&destination.pathname==='/o/oauth2/v2/auth';
    const managedInit=destination.origin===issuer&&destination.origin===base.origin&&destination.pathname===base.pathname+'/sign-in/social/init'&&[...destination.searchParams.keys()].length===1&&destination.searchParams.getAll('token').length===1&&!!destination.searchParams.get('token');
    if(destination.protocol!=='https:'||destination.username||destination.password||destination.hash||!directGoogle&&!managedInit)throw Error('Invalid Google authorization address');return res.json({url:destination.href});
   }
   if(operation==='oauth-complete'){
    const nonce=(req.header('cookie')??'').split(';').map(v=>v.trim()).find(v=>v.startsWith('__Secure-continua.managed_registration='))?.split('=')[1];
    if(!nonce||!/^[A-Za-z0-9_-]{43}$/.test(nonce))return res.status(401).json({error:'Start Google sign-in through Continua'});
    const pending=(await database.query('SELECT metadata FROM app_identity.managed_oauth_intents WHERE digest=$1 AND expires_at>now()',[tokenDigest(nonce)])).rows[0];
    if(!pending)return res.status(401).json({error:'Start a fresh Google sign-in through Continua'});
    await ctx.completeOAuth(body.verifier);const live=await ctx.session();if(!live?.user?.id||live.user.emailVerified!==true)throw Error('Verified OAuth session required');
    if(pending.metadata.signup===true){
     // Consume nonce and bind legal acknowledgement atomically to the subject
     // proven by the SDK's verifier exchange, never to a browser-supplied ID.
     const consumed=await database.query(`WITH intent AS(DELETE FROM app_identity.managed_oauth_intents WHERE digest=$1 AND expires_at>now() RETURNING metadata),
      saved AS(INSERT INTO app_identity.managed_registration_intents(issuer,subject,metadata) SELECT $2,$3,metadata FROM intent ON CONFLICT(issuer,subject) DO NOTHING RETURNING subject)
      SELECT count(*)::int consumed FROM intent`,[tokenDigest(nonce),issuer,live.user.id]);
     if(consumed.rows[0]?.consumed!==1)return res.status(401).json({error:'Start a fresh Google sign-in through Continua'});
     res.append('Set-Cookie','__Secure-continua.managed_registration=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    }else{
     const consumed=await database.query('DELETE FROM app_identity.managed_oauth_intents WHERE digest=$1 AND expires_at>now() RETURNING digest',[tokenDigest(nonce)]);
     if(consumed.rowCount!==1)return res.status(401).json({error:'Start a fresh Google sign-in through Continua'});
     res.append('Set-Cookie','__Secure-continua.managed_registration=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    }
    return res.json({session:await broker.envelope(ctx,{oauthVerified:true})});
   }
  }catch(error){return failure(res,error);}
 });
 return router;
}
