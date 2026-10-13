import cron from 'node-cron';
import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../storage/db.js';
import { env } from '../config/index.js';
import { logger } from '../monitoring/logger.js';
import { cardRenewalEnabled, decryptAuthorization, nativeProvider, verifyNativeCheckout } from '../services/paystackNative.js';
import { prices, CHECKOUT_POLICY_VERSION } from '../services/paystackCommon.js';
let running = false;
/** Provider requests happen after a durable reservation, and are never retried
 * after ambiguous failure. Subsequent ticks only verify the existing reference. */
export async function runCardRenewals() {
    if (running || !cardRenewalEnabled())
        return;
    running = true;
    try {
        const due = await query(`SELECT user_id,mode FROM public.paystack_card_renewals WHERE mode=$1
    AND (active_reference IS NOT NULL OR (enabled AND next_charge_at<=now())) LIMIT 20`, [env.PAYSTACK_NATIVE_MODE]);
        for (const candidate of due.rows) {
            try {
                const reserved = await withTransaction(async (db) => {
                    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`billing:${candidate.mode}:${candidate.user_id}`]);
                    const r = (await db.query('SELECT * FROM public.paystack_card_renewals WHERE user_id=$1 AND mode=$2 FOR UPDATE', [candidate.user_id, candidate.mode])).rows[0];
                    if (!r)
                        return null;
                    if (r.active_reference)
                        return { reference: r.active_reference, initiate: false, renewal: r };
                    if (!r.enabled || new Date(r.next_charge_at).getTime() > Date.now())
                        return null;
                    const tier = (await db.query('SELECT public.effective_subscription_plan($1) AS plan', [r.user_id])).rows[0]?.plan;
                    if (tier === 'premium_plus' && r.plan === 'premium') {
                        await db.query('UPDATE public.paystack_card_renewals SET enabled=false WHERE user_id=$1 AND mode=$2', [r.user_id, r.mode]);
                        return null;
                    }
                    if ((await db.query("SELECT 1 FROM public.paystack_native_attempts WHERE user_id=$1 AND mode=$2 AND state IN ('creating','pending','unknown')", [r.user_id, r.mode])).rowCount)
                        return null;
                    if (!['premium', 'premium_plus'].includes(r.plan))
                        throw new Error('Invalid renewal plan');
                    const amount = prices[r.plan].monthly, reference = `continua-${r.mode}-${randomUUID()}`;
                    await db.query(`INSERT INTO public.paystack_native_attempts(reference,user_id,email,mode,plan,cycle,method,amount_minor,intent_id,request_hash)
      VALUES($1,$2,$3,$4,$5,'monthly','card',$6,$7,$8)`, [reference, r.user_id, r.email, r.mode, r.plan, amount, randomUUID(), 'renewal:' + r.consent_reference]);
                    if (r.mode === 'live')
                        await db.query(`INSERT INTO public.paystack_live_orders(reference,user_id,email,plan,cycle,amount_minor,terms_version,terms_accepted_at)
      VALUES($1,$2,$3,$4,'monthly',$5,$6,now())`, [reference, r.user_id, r.email, r.plan, amount, CHECKOUT_POLICY_VERSION]);
                    else
                        await db.query(`INSERT INTO public.paystack_test_orders(reference,user_id,email,plan,cycle,amount_minor) VALUES($1,$2,$3,$4,'monthly',$5)`, [reference, r.user_id, r.email, r.plan, amount]);
                    await db.query('UPDATE public.paystack_card_renewals SET active_reference=$3 WHERE user_id=$1 AND mode=$2', [r.user_id, r.mode, reference]);
                    return { reference, initiate: true, renewal: r, amount };
                });
                if (!reserved)
                    continue;
                if (reserved.initiate) {
                    try {
                        await nativeProvider(reserved.renewal.mode, '/transaction/charge_authorization', {
                            email: reserved.renewal.email, amount: reserved.amount, currency: 'KES', reference: reserved.reference,
                            authorization_code: decryptAuthorization(reserved.renewal.authorization_cipher),
                            metadata: JSON.stringify({ continua_reference: reserved.reference, continua_user: reserved.renewal.user_id, mode: reserved.renewal.mode }),
                        });
                        await query("UPDATE public.paystack_native_attempts SET state='pending' WHERE reference=$1 AND state='creating'", [reserved.reference]);
                    }
                    catch {
                        await query("UPDATE public.paystack_native_attempts SET state='unknown' WHERE reference=$1 AND state='creating'", [reserved.reference]);
                    }
                }
                await verifyNativeCheckout(reserved.reference);
            }
            catch {
                logger.warn('Card renewal needs another verification attempt; no automatic charge retry');
            }
        }
    }
    finally {
        running = false;
    }
}
export function startCardRenewalWorker() { return cron.schedule('*/10 * * * *', () => { void runCardRenewals().catch(() => logger.warn('Card renewal worker unavailable')); }); }
