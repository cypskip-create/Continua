import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {signupAcknowledgement,paymentLabel,LEGAL_POLICY_VERSION} from '../src/lib/legalPolicy.ts';
import {clearDeletedAccountStorage} from '../src/lib/deletedAccountStorage.ts';
test('signup requires explicit adult/terms acknowledgement without collecting date of birth',()=>{
 assert.throws(()=>signupAcknowledgement(false,true));assert.throws(()=>signupAcknowledgement(true,false));
 assert.deepEqual(signupAcknowledgement(true,true),{adult_self_attested:true,terms_version:LEGAL_POLICY_VERSION,privacy_notice_version:LEGAL_POLICY_VERSION});
});
test('saved references reject full card and phone numbers',()=>{
 assert.deepEqual(paymentLabel('card','0821'),{method_type:'card',label:'Card reference',detail:'•••• 0821'});
 assert.throws(()=>paymentLabel('card','4111111111111111'));assert.throws(()=>paymentLabel('mpesa','0712345678'));assert.equal(paymentLabel('mpesa','678').detail,'•••• 678');
});
test('fonts are bundled and optional page analytics remains absent',()=>{
 const css=readFileSync(new URL('../src/index.css',import.meta.url),'utf8'),app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
 const entry=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
 assert.ok(entry.includes('@fontsource/inter/latin-400.css'));assert.doesNotMatch(css,/@import\s+(?:url\()?['"]?https:\/\/fonts[.]googleapis[.]com\x2f/);assert.ok(!app.includes('<Analytics'));assert.ok(app.includes('path="/copyright"'));assert.ok(app.includes('path="/privacy"'));
});
test('deleted-account cleanup preserves other users and public research caches',()=>{
 const keys=new Set(['continua:journal:v1:owner:NSE:KCB','continua:journal:v1:other:NSE:KCB','continua_app_lock_owner','continua_app_lock_cred_owner','public-research']);
 const storage={get length(){return keys.size;},key:(i:number)=>[...keys][i]??null,removeItem:(key:string)=>{keys.delete(key);}};
 assert.deepEqual(clearDeletedAccountStorage('owner',storage),{removed:3,complete:true});assert.ok(keys.has('continua:journal:v1:other:NSE:KCB'));assert.ok(keys.has('public-research'));
});

test('age and terms controls only appear and gate Google in signup mode',()=>{
 const auth=readFileSync(new URL('../src/pages/Auth.tsx',import.meta.url),'utf8');
 assert.match(auth,/\{isSignUp && <div[^\n]+I confirm that I am 18 or older/);
 const googleHandler=auth.slice(auth.indexOf('const handleGoogleSignIn'),auth.indexOf('const switchMode'));
 assert.ok(googleHandler.includes('if(isSignUp&&(!adult||!acceptedTerms))'));
 assert.ok(auth.includes('disabled={googleLoading||(isSignUp&&(!adult||!acceptedTerms))}'));
 assert.ok(auth.includes('result = await signIn(email, password,captchaToken||undefined)'));
 assert.ok(auth.includes('result = await signUp(email, password, fullName,{adult,terms:acceptedTerms}'));
});
