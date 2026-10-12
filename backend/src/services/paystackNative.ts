import { createHash, randomUUID, createCipheriv,createDecipheriv,randomBytes } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/index.js';
import { query, withTransaction } from '../storage/db.js';
import { ApiError } from '../api/middleware/errorHandler.js';
import {logger} from '../monitoring/logger.js';
import { CHECKOUT_POLICY_VERSION, prices } from './paystackCommon.js';
import { liveCheckoutEnabled, verifyLiveCheckout } from './paystackLive.js';

export const nativeReferencePattern = /^continua-(live|test)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function normalizeKenyanPhone(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, '');
  const digits = compact.replace(/^\+/, '').replace(/^0(?=[17])/, '254');
  if (!/^254[17]\d{8}$/.test(digits)) throw new ApiError(400, 'Enter a valid Kenyan mobile number, such as 0712 345 678.');
  return `+${digits}`;
}
export const nativeCheckoutInput = z.object({
  plan: z.enum(['premium', 'premium_plus']), cycle: z.enum(['monthly', 'annual']),
  policyVersion: z.literal(CHECKOUT_POLICY_VERSION), accepted: z.literal(true),
  paymentMethod: z.enum(['mpesa', 'airtel', 'card']), phone: z.string().max(40).optional(),
  intentId: z.string().uuid(),
  autoRenew:z.boolean().default(false),
}).strict().superRefine((input, ctx) => {
  if(input.autoRenew&&(input.paymentMethod!=='card'||input.cycle!=='monthly'))ctx.addIssue({code:'custom',message:'Automatic renewal is available only for monthly card payments.'});
  if (input.paymentMethod !== 'card') {
    try { normalizeKenyanPhone(input.phone ?? ''); }
    catch { ctx.addIssue({code: 'custom', path: ['phone'], message: 'A valid Kenyan mobile number is required.'}); }
  } else if (input.phone !== undefined) ctx.addIssue({code:'custom',path:['phone'],message:'Card checkout must not include phone or card details.'});
});
export function nativeCheckoutEnabled() {
  return env.PAYSTACK_NATIVE_ENABLED && (env.PAYSTACK_NATIVE_MODE === 'test'
    ? !!env.PAYSTACK_TEST_SECRET_KEY?.startsWith('sk_test_')
    : liveCheckoutEnabled());
}
export function nativeSecret(mode: 'live'|'test') {
  return mode === 'test' ? env.PAYSTACK_TEST_SECRET_KEY : env.PAYSTACK_SECRET_KEY;
}
export function nativeCheckoutForUser(userId:string) {
  return nativeCheckoutEnabled()&&(env.PAYSTACK_NATIVE_MODE==='live'||(env.PAYSTACK_TEST_USER_IDS??'').split(',').map(v=>v.trim()).includes(userId));
}
export async function nativeProvider(mode: 'live'|'test', path: string, body?: unknown) {
  const key = nativeSecret(mode);
  if (!key?.startsWith(`sk_${mode}_`)) throw new ApiError(503,'Payment mode is not configured.');
  const response = await fetch(`https://api.paystack.co${path}`, {
    method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: {Authorization:`Bearer ${key}`, 'Content-Type':'application/json'},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new ApiError(502,'Payment provider is unavailable. Check payment status before trying again.');
  const result = z.object({status:z.literal(true),data:z.unknown()}).safeParse(await response.json());
  if (!result.success) throw new ApiError(502,'Payment provider returned an unexpected response.');
  return result.data.data;
}
interface Attempt {
  reference:string; user_id:string; email:string; mode:'live'|'test'; plan:'premium'|'premium_plus';
  cycle:'monthly'|'annual'; method:'mpesa'|'airtel'|'card'; amount_minor:number;
  intent_id:string; request_hash:string; state:string; access_code:string|null; created_at:Date|string; auto_renew?:boolean; enrollment_processed?:boolean;
}
function publicAttempt(o:Attempt) {
  return {reference:o.reference,mode:o.mode,plan:o.plan,cycle:o.cycle,amount:o.amount_minor/100,currency:'KES',
    accessCode:o.access_code,paymentMethod:o.method,status:o.state,
    authorizationDeadline:o.method==='card'?null:new Date(new Date(o.created_at).getTime()+180_000).toISOString()};
}
export async function initializeNativeCheckout(userId:string,email:string,input:z.infer<typeof nativeCheckoutInput>) {
  if (!nativeCheckoutForUser(userId)) throw new ApiError(503,'Native checkout is not enabled for this account. No payment has been initiated.');
  if (!z.string().email().safeParse(email).success) throw new ApiError(400,'An account email is required.');
  const mode=env.PAYSTACK_NATIVE_MODE;
  if(input.autoRenew&&!cardRenewalEnabled())throw new ApiError(503,'Card renewal is not enabled. Use a one-time payment.');
  const phone=input.paymentMethod==='card'?null:normalizeKenyanPhone(input.phone!);
  const fingerprint=createHash('sha256').update(JSON.stringify([input.plan,input.cycle,input.paymentMethod,phone,input.autoRenew])).digest('hex');
  // A durable account lock serializes different tabs, retries and different intents.
  // Never issue a second charge while the first initiation has an unknown outcome.
  const reserved=await withTransaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`billing:${mode}:${userId}`]);
    const same=await client.query<Attempt>('SELECT * FROM public.paystack_native_attempts WHERE user_id=$1 AND mode=$2 AND intent_id=$3',[userId,mode,input.intentId]);
    if(same.rows[0]) {
      if(same.rows[0].request_hash!==fingerprint)throw new ApiError(409,'This payment attempt has different details.');
      return {order:same.rows[0],created:false};
    }
    const active=await client.query<Attempt>("SELECT * FROM public.paystack_native_attempts WHERE user_id=$1 AND mode=$2 AND state IN ('creating','pending','unknown')",[userId,mode]);
    if(active.rows[0])return {order:active.rows[0],created:false};
    const profile=await client.query<{plan:string}>('SELECT public.effective_subscription_plan($1) AS plan',[userId]);
    if(!profile.rows[0]?.plan)throw new ApiError(409,'Create your membership profile before checkout.');
    if(profile.rows[0].plan==='premium_plus'&&input.plan==='premium')throw new ApiError(409,'Premium is already included in your active Premium Plus membership.');
    const reference=`continua-${mode}-${randomUUID()}`, amount=prices[input.plan][input.cycle];
    const result=await client.query<Attempt>(`INSERT INTO public.paystack_native_attempts
      (reference,user_id,email,mode,plan,cycle,method,amount_minor,intent_id,request_hash,auto_renew)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[reference,userId,email,mode,input.plan,input.cycle,input.paymentMethod,amount,input.intentId,fingerprint,input.autoRenew]);
    if(mode==='live')await client.query(`INSERT INTO public.paystack_live_orders (reference,user_id,email,plan,cycle,amount_minor,terms_version,terms_accepted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,[reference,userId,email,input.plan,input.cycle,amount,CHECKOUT_POLICY_VERSION]);
    else await client.query(`INSERT INTO public.paystack_test_orders (reference,user_id,email,plan,cycle,amount_minor) VALUES ($1,$2,$3,$4,$5,$6)`,[reference,userId,email,input.plan,input.cycle,amount]);
    return {order:result.rows[0]!,created:true};
  });
  const o=reserved.order;
  if(!reserved.created)return publicAttempt(o);
  try {
    const common={email,amount:o.amount_minor,currency:'KES',reference:o.reference,
      metadata:JSON.stringify({continua_reference:o.reference,continua_user:userId,mode,terms_version:CHECKOUT_POLICY_VERSION})};
    const raw=await nativeProvider(mode,input.paymentMethod==='card'?'/transaction/initialize':'/charge',{
      ...common,...(input.paymentMethod==='card'?{channels:['card'],callback_url:env.PAYSTACK_CALLBACK_URL}
        :{mobile_money:{phone,provider:input.paymentMethod==='mpesa'?'mpesa':'atl'}}),
    });
    const parsed=z.object({reference:z.literal(o.reference),status:z.string().optional(),access_code:z.string().min(1).max(200).optional()}).safeParse(raw);
    if(!parsed.success || (o.method==='card'&&!parsed.data.access_code))throw new Error('Unexpected payment initiation');
    o.state='pending';o.access_code=parsed.data.access_code??null;
    await query("UPDATE public.paystack_native_attempts SET state=CASE WHEN state='creating' THEN 'pending' ELSE state END,access_code=$2 WHERE reference=$1",[o.reference,o.access_code]);
  } catch {
    o.state='unknown';
    await query("UPDATE public.paystack_native_attempts SET state='unknown' WHERE reference=$1 AND state='creating'",[o.reference]);
    // Return a recovery reference even on timeouts: the upstream may have charged.
  }
  return publicAttempt(o);
}
export async function verifyNativeCheckout(reference:string,userId?:string) {
  if(!nativeReferencePattern.test(reference))throw new ApiError(400,'Invalid checkout reference.');
  const result=await query<Attempt>(`SELECT * FROM public.paystack_native_attempts WHERE reference=$1${userId?' AND user_id=$2':''}`,userId?[reference,userId]:[reference]);
  const o=result.rows[0];
  if(!o)throw new ApiError(404,'Checkout not found.');
  let receipt;
  if(o.mode==='live') receipt=await verifyLiveCheckout(reference,userId);
  else {
    const t=z.object({id:z.number().int().positive().safe(),domain:z.literal('test'),status:z.string(),reference:z.literal(reference),
      amount:z.literal(o.amount_minor),currency:z.literal('KES'),paid_at:z.string().datetime({offset:true}).nullable().optional(),
      customer:z.object({email:z.string().email()}),metadata:z.object({continua_reference:z.literal(reference),continua_user:z.literal(o.user_id),mode:z.literal('test')})
    }).safeParse(await nativeProvider('test',`/transaction/verify/${encodeURIComponent(reference)}`));
    if(!t.success||t.data.customer.email.toLowerCase()!==o.email.toLowerCase()||(t.data.status==='success'&&!t.data.paid_at))throw new ApiError(409,'Payment does not match this test checkout.');
    const status=t.data.status==='success'?'paid':['failed','abandoned','reversed'].includes(t.data.status)?t.data.status:'pending';
    if(status==='paid')await query("UPDATE public.paystack_test_orders SET status='paid',provider_transaction_id=$2,verified_at=now() WHERE reference=$1 AND (provider_transaction_id IS NULL OR provider_transaction_id=$2)",[reference,t.data.id]);
    receipt={...publicAttempt(o),status,plan:o.plan,cycle:o.cycle,membershipChanged:false};
  }
  // Inline sessions can be abandoned before collection starts or retried after
  // a decline. Retain their reservation; recurring charges have no access code
  // and must still resolve failed payments normally.
  if(o.method==='card'&&o.access_code&&['abandoned','failed'].includes(receipt.status)) {
    receipt={...receipt,status:'pending'};
  }
  if(receipt.status==='paid'&&o.auto_renew&&!o.enrollment_processed&&cardRenewalEnabled()) {
    try {
    // Independently retrieve only the provider token, never card numbers/CVV.
    const verified=z.object({domain:z.literal(o.mode),reference:z.literal(reference),amount:z.literal(o.amount_minor),currency:z.literal('KES'),status:z.literal('success'),
      customer:z.object({email:z.string().email()}),authorization:z.object({authorization_code:z.string().min(1),channel:z.literal('card'),reusable:z.literal(true)})
    }).safeParse(await nativeProvider(o.mode,`/transaction/verify/${encodeURIComponent(reference)}`));
    if(verified.success&&verified.data.customer.email.toLowerCase()===o.email.toLowerCase()) {
      const expiry='expiresAt' in receipt&&receipt.expiresAt?receipt.expiresAt:nextMonth(new Date()).toISOString();
      await withTransaction(async db=>{
      const locked=(await db.query('SELECT enrollment_processed FROM public.paystack_native_attempts WHERE reference=$1 FOR UPDATE',[reference])).rows[0];
      if(!locked||locked.enrollment_processed)return;
      await db.query(`INSERT INTO public.paystack_card_renewals(user_id,mode,email,plan,authorization_cipher,consent_reference,next_charge_at)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,mode) DO UPDATE SET
        email=EXCLUDED.email,plan=EXCLUDED.plan,authorization_cipher=EXCLUDED.authorization_cipher,
        consent_reference=EXCLUDED.consent_reference,next_charge_at=EXCLUDED.next_charge_at,enabled=true
        WHERE (SELECT created_at FROM public.paystack_native_attempts WHERE reference=paystack_card_renewals.consent_reference) <= $8`,
        [o.user_id,o.mode,o.email,o.plan,encryptAuthorization(verified.data.authorization.authorization_code),reference,expiry,o.created_at]);
      await db.query('UPDATE public.paystack_native_attempts SET enrollment_processed=true WHERE reference=$1',[reference]);
      });
    }
    } catch {logger.warn('Verified payment retained; optional card renewal enrollment needs reconciliation');}
  }
  // A manually purchased annual term or tier switch must not leave an older
  // monthly mandate charging unexpectedly. Same-tier early payments postpone it.
  if(receipt.status==='paid'&&!o.auto_renew&&o.mode==='live'&&'expiresAt' in receipt&&receipt.expiresAt) {
    await query(`UPDATE public.paystack_card_renewals SET
      enabled=CASE WHEN $3='annual' OR plan<>$4 THEN false ELSE enabled END,
      next_charge_at=greatest(next_charge_at,$5::timestamptz)
      WHERE user_id=$1 AND mode=$2 AND active_reference IS DISTINCT FROM $6`,[o.user_id,o.mode,o.cycle,o.plan,receipt.expiresAt,reference]);
  }
  if(receipt.status==='paid')await query(`UPDATE public.paystack_card_renewals SET active_reference=NULL,next_charge_at=$2 WHERE active_reference=$1`,
    [reference,'expiresAt' in receipt&&receipt.expiresAt?receipt.expiresAt:nextMonth(new Date()).toISOString()]);
  else if(['failed','abandoned','reversed'].includes(receipt.status))await query('UPDATE public.paystack_card_renewals SET active_reference=NULL,enabled=false WHERE active_reference=$1',[reference]);
  if(['paid','failed','abandoned','reversed'].includes(receipt.status))await query('UPDATE public.paystack_native_attempts SET state=$2 WHERE reference=$1',[reference,receipt.status]);
  return {...receipt,paymentMethod:o.method,...(userId?{accessCode:o.access_code}: {})};
}

export function cardRenewalEnabled(){return env.PAYSTACK_CARD_RENEWAL_ENABLED&&!!env.PAYSTACK_RENEWAL_ENCRYPTION_KEY&&nativeCheckoutEnabled();}
export function nextMonth(date:Date) {
  const next=new Date(date);const day=next.getUTCDate();next.setUTCDate(1);next.setUTCMonth(next.getUTCMonth()+1);
  next.setUTCDate(Math.min(day,new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate()));return next;
}
export function encryptAuthorization(value:string) {
  if(!env.PAYSTACK_RENEWAL_ENCRYPTION_KEY)throw new ApiError(503,'Renewal encryption is not configured.');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(env.PAYSTACK_RENEWAL_ENCRYPTION_KEY,'hex'),iv);
  const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),ciphertext].map(v=>v.toString('base64')).join('.');
}
export function decryptAuthorization(value:string) {
  if(!env.PAYSTACK_RENEWAL_ENCRYPTION_KEY)throw new Error('Renewal encryption unavailable');
  const [iv,tag,ciphertext]=value.split('.').map(v=>Buffer.from(v,'base64'));
  if(!iv||!tag||!ciphertext)throw new Error('Invalid renewal token');
  const decipher=createDecipheriv('aes-256-gcm',Buffer.from(env.PAYSTACK_RENEWAL_ENCRYPTION_KEY,'hex'),iv);decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8');
}
