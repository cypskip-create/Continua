import pg from 'pg';
import {env} from '../config/index.js';
import {logger} from '../monitoring/logger.js';
import {createContinuaAuth} from './continuaAuth.js';
import {createAccessVerifier} from './verifyAccess.js';
import {createBrevoAuthMail} from './authMail.js';
import {observePoolErrors} from '../storage/poolErrors.js';
import {createManagedRuntime,validateManagedStaging} from './managedRuntime.js';

let runtime;
// Explicit provider selection only. Imports never connect or run migrations.
export function getIdentityRuntime(){
 if(runtime)return runtime;
 if(env.AUTH_PROVIDER==='neon-managed')validateManagedStaging(env);
 const url=new URL(env.DATABASE_URL);
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname.endsWith('.neon.tech')||url.pathname!=='/neondb'||!['require','verify-full'].includes(url.searchParams.get('sslmode')))throw Error('Better Auth requires a TLS Neon database connection');
 if(!env.AUTH_PUBLIC_ORIGIN||!env.AUTH_TURNSTILE_SECRET||env.AUTH_PROVIDER==='better-auth'&&!env.BETTER_AUTH_SECRET)throw Error('Identity provider configuration is incomplete');
 // node-postgres connection-string SSL options otherwise replace the explicit
 // TLS object. Remove them only after requiring TLS, then enforce certificates.
 for(const key of ['sslmode','sslrootcert','sslcert','sslkey'])url.searchParams.delete(key);
 const database=new pg.Pool({connectionString:url.href,ssl:{rejectUnauthorized:true},max:3,idleTimeoutMillis:30000,connectionTimeoutMillis:10000,statement_timeout:10000,options:'-c search_path=app_identity,public',types:{getTypeParser:(oid,format)=>[20,1700].includes(oid)&&format!=='binary'?value=>value:pg.types.getTypeParser(oid,format)}});
 observePoolErrors(database,{component:'identity-database',report:(fields,message)=>logger.error(fields,message)});
 if(env.AUTH_PROVIDER==='neon-managed'){runtime=createManagedRuntime({database,config:env});return runtime;}
 const mail=createBrevoAuthMail({enabled:env.AUTH_EMAIL_ENABLED,smtpUser:env.AUTH_SMTP_USER,smtpKey:env.AUTH_SMTP_KEY,sender:env.AUTH_EMAIL_SENDER,authOrigin:env.AUTH_PUBLIC_ORIGIN,database});
 const auth=createContinuaAuth({database,secret:env.BETTER_AUTH_SECRET,baseURL:env.AUTH_PUBLIC_ORIGIN,trustedOrigins:[env.AUTH_PUBLIC_ORIGIN],captchaSecret:env.AUTH_TURNSTILE_SECRET,googleClientId:env.AUTH_GOOGLE_CLIENT_ID,googleClientSecret:env.AUTH_GOOGLE_CLIENT_SECRET,sendMail:mail});
 runtime={database,auth,verifyAccess:createAccessVerifier({auth,database})};return runtime;
}
