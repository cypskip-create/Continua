import {test,expect,vi} from 'vitest';import {createManagedBroker} from './managedBroker.js';
const issuer='https://managed.invalid';
test('concurrent live verification shares only in-flight work and never caches settled sessions',async()=>{
 let reads=0,release;const pending=new Promise(r=>{release=r;});
 const broker=createManagedBroker({database:{},issuer,verifyJwt:vi.fn(),vault:{},providerFactory:({cookie})=>({session:async()=>{reads++;await pending;return null;}})});
 const one=broker.readLiveSession('same-cookie'),two=broker.readLiveSession('same-cookie'),other=broker.readLiveSession('different-cookie');
 await Promise.resolve();expect(reads).toBe(2);release();await Promise.all([one,two,other]);await broker.readLiveSession('same-cookie');expect(reads).toBe(3);
});
test('direct provider cookies cannot create a local application binding without a Continua-authorized sign-in',async()=>{
 const database={query:vi.fn(async()=>({rows:[]}))},provider={session:vi.fn(async()=>({user:{id:'managed-user',emailVerified:true},session:{id:'provider-session',createdAt:new Date(Date.now()-1000),expiresAt:new Date(Date.now()+3600000)}})),call:vi.fn(async()=>[])};
 const verifyJwt=vi.fn();const broker=createManagedBroker({database,issuer,verifyJwt,vault:{},providerFactory:()=>provider});
 await expect(broker.envelope(provider)).rejects.toMatchObject({status:401,code:'CONTINUA_SIGNIN_REQUIRED'});expect(verifyJwt).not.toHaveBeenCalled();expect(database.query.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
test('a provider sign-out failure still revokes the local authorization binding and cannot claim confirmed logout',async()=>{
 const database={query:vi.fn(async()=>({rowCount:1}))},provider={session:vi.fn(async()=>({user:{id:'managed-user'},session:{id:'provider-session'}})),call:vi.fn(async()=>{throw Error('Provider unavailable');})};
 const broker=createManagedBroker({database,issuer,verifyJwt:vi.fn(),vault:{},providerFactory:()=>provider});await expect(broker.signOut(provider)).rejects.toThrow('Provider unavailable');expect(database.query.mock.calls[0][0]).toContain('revoked_at=now()');expect(database.query.mock.invocationCallOrder[0]).toBeLessThan(provider.call.mock.invocationCallOrder[0]);
});
