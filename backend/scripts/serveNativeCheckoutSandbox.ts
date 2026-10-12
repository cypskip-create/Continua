/** Local, loopback-only API for browser Test Mode verification. No live billing
 * or scheduled charging runs. User identity is still verified by Supabase. */
import {privateDecrypt,constants} from 'node:crypto';
import {readFileSync} from 'node:fs';
import dotenv from 'dotenv';
dotenv.config({path:'.env.local',quiet:true});
const payload=process.argv[2],privateKey=process.argv[3];
if(!payload||!privateKey)throw new Error('Encrypted sandbox credential required');
const key=privateDecrypt({key:readFileSync(privateKey),format:'der',type:'pkcs8',padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(readFileSync(payload,'utf8').trim(),'base64')).toString('utf8');
if(!key.startsWith('sk_test_'))throw new Error('Live credentials are forbidden');
process.env.PAYSTACK_TEST_SECRET_KEY=key;process.env.PAYSTACK_NATIVE_MODE='test';process.env.PAYSTACK_NATIVE_ENABLED='true';
process.env.PAYSTACK_LIVE_CHECKOUT_ENABLED='false';process.env.PAYSTACK_CARD_RENEWAL_ENABLED='false';
process.env.API_KEY_AUTH_ENABLED='false'; // Loopback only; verified user sessions are still mandatory for billing.
process.env.ALLOWED_ORIGINS='http://127.0.0.1:8082';
process.env.NODE_ENV='test';process.env.LOG_LEVEL='warn';
const {pool,query}=await import('../src/storage/db.js');
const {env}=await import('../src/config/index.js');
const owners=await query("SELECT user_id FROM public.profiles WHERE handle='cypskip'");
if(owners.rows.length!==1){await pool.end();throw new Error('Unique operator test account required');}
env.PAYSTACK_TEST_USER_IDS=owners.rows[0].user_id;
const {createServer}=await import('../src/api/server.js');
const server=createServer().listen(4002,'127.0.0.1',()=>console.log('Loopback sandbox API ready; Test Mode only; billing still requires a verified operator session.'));
const stop=()=>server.close(()=>{void pool.end().finally(()=>process.exit(0));});
process.on('SIGINT',stop);process.on('SIGTERM',stop);
