import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('auth has visible field labels, Google only and signup-only acknowledgements',()=>{
 const source=readFileSync(new URL('../src/pages/Auth.tsx',import.meta.url),'utf8');
 for(const field of ['name','email','password']){assert.ok(source.includes(`htmlFor="auth-${field}"`));assert.ok(source.includes(`id="auth-${field}"`));}
 assert.ok(source.indexOf('Continue with Google')>source.indexOf('</form>'));
 assert.ok(!source.includes('grid grid-cols-2 p-1.5'));
 assert.ok(source.indexOf("Don't have an account?")>source.indexOf('Continue with Google'));
 assert.ok(!source.includes('Continue with Apple'));assert.ok(!source.includes('Continue with Facebook'));
 assert.ok(source.includes('{isSignUp && <div'));assert.ok(source.includes("autoComplete={isSignUp ? 'new-password' : 'current-password'}"));
 assert.ok(source.includes('fill="#4285F4"'));assert.ok(source.includes('prefers')===false);
 const css=readFileSync(new URL('../src/pages/auth.css',import.meta.url),'utf8');assert.ok(css.includes('prefers-reduced-motion'));assert.ok(css.includes('border-bottom-right-radius'));
});
