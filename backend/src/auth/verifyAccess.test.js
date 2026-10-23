import {describe,it,expect,vi} from 'vitest';
import {createAccessVerifier} from './verifyAccess.js';
const sub='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',time=1800000000000;
function setup({payload={},row={}}={}){const database={query:vi.fn().mockResolvedValue({rows:row===null?[]:[{id:sub,session_id:sid,email:'fixture@example.invalid',...row}]})};const auth={api:{verifyJWT:vi.fn().mockResolvedValue({payload:payload===null?null:{sub,session_id:sid,iat:time/1000,exp:time/1000+300,role:'authenticated',...payload}})}};return {database,verify:createAccessVerifier({auth,database,now:()=>time})};}
describe('session-bound Better Auth access verification',()=>{
 it('rejects invalid signatures before querying private data',async()=>{const s=setup({payload:null});await expect(s.verify('synthetic')).rejects.toThrow('Invalid');expect(s.database.query).not.toHaveBeenCalled();});
 it('rejects role substitution, missing session binding and longer token lifetimes',async()=>{for(const payload of [{role:'service_role'},{session_id:'invalid'},{exp:time/1000+301},{iat:time/1000+60}])await expect(setup({payload}).verify('synthetic')).rejects.toThrow('Invalid');});
 it('rejects a signed but revoked session',async()=>{await expect(setup({row:null}).verify('synthetic')).rejects.toThrow('revoked');});
 it('requires server-recorded MFA proof even if a signed token claims aal2',async()=>{await expect(setup({payload:{aal:'aal2'},row:{twoFactorEnabled:true}}).verify('synthetic')).rejects.toThrow('two-step');});
 it('does not treat freshly issued JWTs as recent password authentication',async()=>{await expect(setup({row:{password_verified_at:new Date(time-601000)}}).verify('synthetic',{recent:true})).rejects.toThrow('Recent');});
 it('takes email and MFA assurance from the live provider records',async()=>{const s=setup({payload:{email:'untrusted@example.invalid',aal:'aal1'},row:{twoFactorEnabled:true,mfa_verified_at:new Date(time),password_verified_at:new Date(time-1000)}});const result=await s.verify('synthetic',{recent:true});expect(result.claims.email).toBe('fixture@example.invalid');expect(result.claims.aal).toBe('aal2');expect(s.database.query.mock.calls[0][1]).toEqual([sid,sub]);});
});
