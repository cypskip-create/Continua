import test from 'node:test';import assert from 'node:assert/strict';
import {managedProduction,ownedProvider,identityCookieName} from './auth-provider.mjs';
import {scheduledMaintenance} from './maintenance.mjs';
const env={AUTH_PROVIDER:'neon-managed',NEON_AUTH_PRODUCTION_ENABLED:'true',NEON_AUTH_BRANCH_ID:'br-noisy-block-b4z5yxup'};
test('production managed edge requires production opt-in and branch; accepts only provider cookies',()=>{
 assert.equal(managedProduction(env),true);assert.equal(ownedProvider(env),true);
 for(const patch of [{NEON_AUTH_PRODUCTION_ENABLED:'false'},{NEON_AUTH_BRANCH_ID:'br-lively-paper-b4oli11a'},{NEON_AUTH_STAGING_ENABLED:'true'}])assert.equal(managedProduction({...env,...patch}),false);
 assert.equal(identityCookieName('__Secure-neon-auth.session_token',env),true);assert.equal(identityCookieName('__Secure-continua.session_token',env),false);
});
test('managed production preserves scheduled maintenance while staging cannot run it',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({});};
 const schedule={APPLICATION_SCHEDULE_ENABLED:'true',BACKEND_ORIGIN:'https://continua-backend.onrender.com',AUTH_MAINTENANCE_SECRET:'s'.repeat(40)};
 try{await scheduledMaintenance({},{...env,...schedule});assert.equal(calls,1);await scheduledMaintenance({},{...schedule,AUTH_PROVIDER:'neon-managed',NEON_AUTH_STAGING_ENABLED:'true',NEON_AUTH_BRANCH_ID:'br-lively-paper-b4oli11a'});assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
