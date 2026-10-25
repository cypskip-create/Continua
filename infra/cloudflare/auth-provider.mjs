export const managedStaging=env=>env.AUTH_PROVIDER==='neon-managed'&&env.NEON_AUTH_STAGING_ENABLED==='true'&&env.NEON_AUTH_BRANCH_ID==='br-lively-paper-b4oli11a';
export const managedProduction=env=>env.AUTH_PROVIDER==='neon-managed'&&env.NEON_AUTH_PRODUCTION_ENABLED==='true'&&env.NEON_AUTH_STAGING_ENABLED!=='true'&&env.NEON_AUTH_BRANCH_ID==='br-noisy-block-b4z5yxup';
export const ownedProvider=env=>env.AUTH_PROVIDER==='better-auth'||managedStaging(env)||managedProduction(env);
export function identityCookieName(name,env){return env.AUTH_PROVIDER==='better-auth'?/^__Secure-continua\.[a-z0-9_.-]+$/i.test(name):(managedStaging(env)||managedProduction(env))&&(/^__Secure-neon-auth\.[a-z0-9_.-]+$/i.test(name)||name==='__Secure-continua.managed_registration');}
