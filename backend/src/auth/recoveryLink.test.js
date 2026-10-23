import {describe,it,expect} from 'vitest';
import {privateRecoveryLink} from './recoveryLink.js';
describe('private browser recovery links',()=>{
 it('moves the token into a browser-only fragment and removes callback parameters',()=>{
  const url=new URL(privateRecoveryLink('https://continua.invalid/api/auth/reset-password/synthetic-token?callbackURL=https%3A%2F%2Fcontinua.invalid%2Fauth','https://continua.invalid'));
  expect(url.pathname).toBe('/auth');expect(url.search).toBe('');expect(url.hash).toBe('#recovery_token=synthetic-token');
 });
 it('rejects other origins and invalid token paths',()=>{
  for(const value of ['https://other.invalid/api/auth/reset-password/synthetic-token','https://continua.invalid/api/auth/reset-password/a','https://continua.invalid/api/auth/reset-password/one/two'])expect(()=>privateRecoveryLink(value,'https://continua.invalid')).toThrow();
 });
});
