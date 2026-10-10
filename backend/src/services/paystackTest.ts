import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "../config/index.js";
import { query } from "../storage/db.js";
import { ApiError } from "../api/middleware/errorHandler.js";

export const checkoutInput = z.object({ plan: z.enum(["premium", "premium_plus"]), cycle: z.enum(["monthly", "annual"]) }).strict();
export const referencePattern = /^continua-test-[0-9a-f-]{36}$/;
export const prices = { premium: { monthly: 80000, annual: 798000 }, premium_plus: { monthly: 100000, annual: 996000 } } as const;
export function testCheckoutEnabled() {
  if (!env.PAYSTACK_TEST_CHECKOUT_ENABLED || !env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_") || !env.PAYSTACK_CALLBACK_URL) return false;
  try {
    const callback = new URL(env.PAYSTACK_CALLBACK_URL);
    return !callback.username && !callback.password && (callback.protocol === "https:" || (env.NODE_ENV !== "production" && callback.protocol === "http:" && ["localhost", "127.0.0.1"].includes(callback.hostname)));
  } catch { return false; }
}
function requireEnabled() {
  if (!testCheckoutEnabled()) throw new ApiError(503, "Test checkout is not configured. No payment has been taken.");
}
export function validCheckoutUrl(value: string) {
  try { const u = new URL(value); return u.origin === "https://checkout.paystack.com" && !u.username && !u.password; } catch { return false; }
}
export function validWebhookSignature(body: Buffer, signature: string | undefined, key: string) {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  return timingSafeEqual(createHmac("sha512", key).update(body).digest(), Buffer.from(signature, "hex"));
}
async function provider(path: string, body?: unknown): Promise<unknown> {
  requireEnabled();
  let response: Response;
  try {
    response = await fetch(`https://api.paystack.co${path}`, {
      method: body ? "POST" : "GET", redirect: "error",
      headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new ApiError(502, "Payment provider could not be reached. Please retry."); }
  if (!response.ok) throw new ApiError(502, "Payment provider could not complete this request.");
  const result = z.object({ status: z.literal(true), data: z.unknown() }).safeParse(await response.json());
  if (!result.success) throw new ApiError(502, "Payment provider returned an unexpected response.");
  return result.data.data;
}
interface Order { reference: string; user_id: string; email: string; amount_minor: number; plan: string; cycle: string; status: string; }
export async function initializeTestCheckout(userId: string, email: string, input: z.infer<typeof checkoutInput>) {
  requireEnabled();
  if (!z.string().email().safeParse(email).success) throw new ApiError(400, "Your account needs a verified email address for checkout.");
  const reference = `continua-test-${randomUUID()}`;
  const amount = prices[input.plan][input.cycle];
  // Persist before calling the provider: callbacks always have a known owner and price.
  await query(`INSERT INTO public.paystack_test_orders (reference,user_id,email,plan,cycle,amount_minor) VALUES ($1,$2,$3,$4,$5,$6)`, [reference,userId,email,input.plan,input.cycle,amount]);
  const data = z.object({ authorization_url: z.string(), reference: z.literal(reference) }).safeParse(await provider("/transaction/initialize", {
    email, amount, currency: "KES", reference, callback_url: env.PAYSTACK_CALLBACK_URL,
    metadata: JSON.stringify({ continua_reference: reference, continua_user: userId, mode: "test" }),
    // No plan parameter: this is customer-authorised one-time test checkout, not auto-renewal.
  }));
  if (!data.success || !validCheckoutUrl(data.data.authorization_url)) throw new ApiError(502, "Payment provider returned an invalid checkout link.");
  return { url: data.data.authorization_url, reference, mode: "test" };
}
const verifiedTransaction = z.object({
  id: z.number().int().positive(), domain: z.literal("test"), status: z.string(), reference: z.string(),
  amount: z.number().int().nonnegative(), currency: z.literal("KES"),
  customer: z.object({ email: z.string().email() }),
  metadata: z.object({ continua_reference: z.string(), continua_user: z.string(), mode: z.literal("test") }),
});
export function validateTransaction(raw: unknown, order: Order) {
  const result = verifiedTransaction.safeParse(raw);
  if (!result.success) throw new ApiError(409, "This payment does not match the test checkout.");
  const t = result.data;
  if (t.reference !== order.reference || t.amount !== order.amount_minor || t.customer.email.toLowerCase() !== order.email.toLowerCase() || t.metadata.continua_reference !== order.reference || t.metadata.continua_user !== order.user_id) throw new ApiError(409, "This payment does not match the test checkout.");
  return t;
}
export async function verifyTestCheckout(reference: string, userId?: string) {
  requireEnabled();
  if (!referencePattern.test(reference)) throw new ApiError(400, "Invalid checkout reference.");
  const found = await query<Order>(`SELECT * FROM public.paystack_test_orders WHERE reference=$1${userId ? " AND user_id=$2" : ""}`, userId ? [reference,userId] : [reference]);
  const order = found.rows[0];
  if (!order) throw new ApiError(404, "Checkout not found.");
  const t = validateTransaction(await provider(`/transaction/verify/${encodeURIComponent(reference)}`), order);
  if (t.status === "success") {
    // Idempotent and test-only. Never updates profiles or real subscription entitlements.
    await query(`UPDATE public.paystack_test_orders SET status='paid', provider_transaction_id=$2, verified_at=COALESCE(verified_at,now()) WHERE reference=$1 AND status <> 'paid'`, [reference,t.id]);
  }
  return { reference, mode: "test", status: t.status === "success" ? "paid" : "pending", plan: order.plan, cycle: order.cycle, amount: order.amount_minor / 100, currency: "KES", membershipChanged: false };
}
