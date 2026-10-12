import {privateDecrypt,constants,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {env} from '../src/config/index.js';
import {query,pool} from '../src/storage/db.js';
import {initializeNativeCheckout,verifyNativeCheckout} from '../src/services/paystackNative.js';
const payload=process.argv[2],privateKey=process.argv[3];
if(!payload||!privateKey)throw new Error('Encrypted sandbox credential required');
const key=privateDecrypt({key:readFileSync(privateKey),format:'der',type:'pkcs8',padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(readFileSync(payload,'utf8').trim(),'base64')).toString('utf8');
if(!key.startsWith('sk_test_'))throw new Error('Live credentials are forbidden');
env.PAYSTACK_TEST_SECRET_KEY=key;env.PAYSTACK_NATIVE_MODE='test';env.PAYSTACK_NATIVE_ENABLED=true;env.PAYSTACK_CARD_RENEWAL_ENABLED=false;
try {
 const owners=await query("SELECT user_id,subscription_plan,subscription_expires_at FROM public.profiles WHERE handle='cypskip'");
 if(owners.rows.length!==1)throw new Error('Unique operator test account required');
 const before=owners.rows[0];
 env.PAYSTACK_TEST_USER_IDS=before.user_id;
 const input={plan:'premium_plus',cycle:'monthly',paymentMethod:'mpesa',phone:'+254710000000',intentId:randomUUID(),accepted:true,policyVersion:'2026-10-12',autoRenew:false} as const;
 const first=await initializeNativeCheckout(before.user_id,'continua-sandbox@example.com',input);
 const retry=await initializeNativeCheckout(before.user_id,'continua-sandbox@example.com',input);
 const otherTab=await initializeNativeCheckout(before.user_id,'continua-sandbox@example.com',{...input,intentId:randomUUID()});
 if(first.reference!==retry.reference||first.reference!==otherTab.reference)throw new Error('Duplicate reservation detected');
 const [verified,repeated]=await Promise.all([verifyNativeCheckout(first.reference,before.user_id),verifyNativeCheckout(first.reference,before.user_id)]);
 const after=(await query('SELECT subscription_plan,subscription_expires_at FROM public.profiles WHERE user_id=$1',[before.user_id])).rows[0];
 const unchanged=before.subscription_plan===after.subscription_plan&&String(before.subscription_expires_at)===String(after.subscription_expires_at);
 if(verified.status!=='paid'||verified.mode!=='test'||verified.membershipChanged||!unchanged||repeated.status!=='paid')throw new Error('Sandbox isolation or verification failed');
 console.log(JSON.stringify({sandboxPayment:'paid',retrySameReference:true,otherTabSameReference:true,concurrentVerification:'paid',membershipUnchanged:unchanged}));
}finally{await pool.end();}
