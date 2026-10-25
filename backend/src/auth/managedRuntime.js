import {createManagedProvider} from './managedProvider.js';
import {createManagedCookieVault} from './managedCrypto.js';
import {createManagedJwtVerifier,createManagedAccessVerifier} from './managedVerifier.js';
import {createManagedBroker} from './managedBroker.js';
import {createTurnstileVerifier} from './managedRoutes.js';
import {deleteManagedAccount} from './managedDelete.js';

// Production cutover explicitly approved on 2026-10-25. Both environments
// retain exact branch, database and issuer pins; opt-in alone is insufficient.
export function validateManagedStaging(config){
 const database=new URL(config.DATABASE_URL),base=new URL(config.NEON_AUTH_BASE_URL),site=new URL(config.AUTH_PUBLIC_ORIGIN);
 const production=config.NEON_AUTH_PRODUCTION_ENABLED===true&&config.NEON_AUTH_STAGING_ENABLED!==true&&config.NEON_AUTH_BRANCH_ID==='br-noisy-block-b4z5yxup'&&
  ['ep-nameless-voice-b4ygobrp.c-6.us-east-2.aws.neon.tech','ep-nameless-voice-b4ygobrp-pooler.c-6.us-east-2.aws.neon.tech'].includes(database.hostname)&&database.pathname==='/neondb'&&
  base.href==='https://ep-nameless-voice-b4ygobrp.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth'&&site.origin==='https://continua.cypriankiprop41.workers.dev'&&site.origin===config.AUTH_PUBLIC_ORIGIN;
 const staging=config.NEON_AUTH_PRODUCTION_ENABLED!==true&&config.NEON_AUTH_STAGING_ENABLED===true&&config.NEON_AUTH_BRANCH_ID==='br-lively-paper-b4oli11a'&&
  ['ep-purple-salad-b4qr5err.c-6.us-east-2.aws.neon.tech','ep-purple-salad-b4qr5err-pooler.c-6.us-east-2.aws.neon.tech'].includes(database.hostname)&&database.pathname==='/neondb'&&
  base.href==='https://ep-purple-salad-b4qr5err.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth'&&site.protocol==='https:'&&site.origin===config.AUTH_PUBLIC_ORIGIN&&site.hostname!=='continua.cypriankiprop41.workers.dev';
 if(!production&&!staging)throw Error('Managed authentication branch, database, issuer or deployment opt-in mismatch');
 if(!['require','verify-full'].includes(database.searchParams.get('sslmode')))throw Error('TLS database connection required');
 if(typeof config.NEON_AUTH_COOKIE_SECRET!=='string'||config.NEON_AUTH_COOKIE_SECRET.length<32)throw Error('Independent managed cookie secret required');
 createManagedCookieVault(config.NEON_AUTH_SESSION_KEY,base.origin);
 return {issuer:base.origin};
}
export function createManagedRuntime({database,config}){
 const {issuer}=validateManagedStaging(config),vault=createManagedCookieVault(config.NEON_AUTH_SESSION_KEY,issuer);
 const verifyJwt=createManagedJwtVerifier({baseURL:config.NEON_AUTH_BASE_URL});
 const providerFactory=options=>createManagedProvider({...options,baseURL:config.NEON_AUTH_BASE_URL,cookieSecret:config.NEON_AUTH_COOKIE_SECRET,origin:config.AUTH_PUBLIC_ORIGIN});
 const broker=createManagedBroker({database,issuer,vault,verifyJwt,providerFactory});
 return {provider:'neon-managed',database,issuer,managedBaseURL:config.NEON_AUTH_BASE_URL,providerFactory,broker,
  deleteAccount:request=>deleteManagedAccount({...request,enabled:config.NEON_AUTH_ACCOUNT_DELETION_ENABLED===true,database,issuer,vault,providerFactory}),
  verifyAccess:createManagedAccessVerifier({database,issuer,vault,verifyJwt,readLiveSession:broker.readLiveSession}),
  verifyBot:createTurnstileVerifier({secret:config.AUTH_TURNSTILE_SECRET,origin:config.AUTH_PUBLIC_ORIGIN})};
}
