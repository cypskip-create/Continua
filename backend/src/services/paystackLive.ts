import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../config/index.js";
import { query } from "../storage/db.js";
import { ApiError } from "../api/middleware/errorHandler.js";
import { checkoutInput, prices, validCheckoutUrl } from "./paystackCommon.js";

export const liveReferencePattern = /^continua-live-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function liveCheckoutEnabled() {
  if (!env.PAYSTACK_LIVE_CHECKOUT_ENABLED || !env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") || !env.PAYSTACK_CALLBACK_URL) return false;
  try { const u = new URL(env.PAYSTACK_CALLBACK_URL); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; }
}
function requireEnabled() { if (!liveCheckoutEnabled()) throw new ApiError(503, "Live checkout is not configured. No payment has been taken."); }
async function provider(path: string, body?: unknown) {
  requireEnabled();
  let response: Response;
  try { response = await fetch(`https://api.paystack.co${path}`, {
    method: body ? "POST" : "GET", redirect: "error",
    headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000),
  }); } catch { throw new ApiError(502, "Payment provider could not be reached. Please retry verification before paying again."); }
  if (!response.ok) throw new ApiError(502, "Payment provider could not complete this request.");
  const result = z.object({ status: z.literal(true), data: z.unknown() }).safeParse(await response.json());
  if (!result.success) throw new ApiError(502, "Payment provider returned an unexpected response.");
  return result.data.data;
}
interface LiveOrder { reference: string; user_id: string; email: string; amount_minor: number; plan: string; cycle: string; status: string; }
const transactionSchema = z.object({
  id: z.number().int().positive().safe(), domain: z.literal("live"), status: z.string(), reference: z.string(),
  amount: z.number().int().nonnegative(), currency: z.literal("KES"), paid_at: z.string().datetime({ offset: true }).nullable().optional(),
  customer: z.object({ email: z.string().email() }),
  metadata: z.object({ continua_reference: z.string(), continua_user: z.string(), mode: z.literal("live") }),
});
export function validateLiveTransaction(raw: unknown, order: LiveOrder) {
  const parsed = transactionSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(409, "This payment does not match your live checkout.");
  const t = parsed.data;
  if (t.reference !== order.reference || t.amount !== order.amount_minor || t.customer.email.toLowerCase() !== order.email.toLowerCase() || t.metadata.continua_reference !== order.reference || t.metadata.continua_user !== order.user_id || (t.status === "success" && !t.paid_at)) throw new ApiError(409, "This payment does not match your live checkout.");
  return t;
}
export async function initializeLiveCheckout(userId: string, email: string, input: z.infer<typeof checkoutInput>) {
  requireEnabled();
  if (!z.string().email().safeParse(email).success) throw new ApiError(400, "Your account needs an email address for checkout.");
  const profile = await query<{plan:string}>("SELECT public.effective_subscription_plan($1) AS plan",[userId]);
  if (!profile.rows[0]) throw new ApiError(409,"Create your membership profile before checkout.");
  if (profile.rows[0].plan==='premium_plus' && input.plan==='premium') throw new ApiError(409,"Premium is already included in your active Premium Plus membership. Renew Plus or wait until it expires to switch.");
  const reference = `continua-live-${randomUUID()}`;
  const amount = prices[input.plan][input.cycle];
  await query(`INSERT INTO public.paystack_live_orders (reference,user_id,email,plan,cycle,amount_minor) VALUES ($1,$2,$3,$4,$5,$6)`, [reference,userId,email,input.plan,input.cycle,amount]);
  const data = z.object({ authorization_url: z.string(), reference: z.literal(reference) }).safeParse(await provider("/transaction/initialize", {
    email, amount, currency: "KES", reference, callback_url: env.PAYSTACK_CALLBACK_URL,
    metadata: JSON.stringify({ continua_reference: reference, continua_user: userId, mode: "live" }),
    // One-time checkout supports M-PESA. Never save reusable card authorizations or auto-charge.
  }));
  if (!data.success || !validCheckoutUrl(data.data.authorization_url)) throw new ApiError(502, "Payment provider returned an invalid checkout link.");
  return { url: data.data.authorization_url, reference, mode: "live" };
}
export async function verifyLiveCheckout(reference: string, userId?: string) {
  requireEnabled();
  if (!liveReferencePattern.test(reference)) throw new ApiError(400, "Invalid checkout reference.");
  const found = await query<LiveOrder>(`SELECT * FROM public.paystack_live_orders WHERE reference=$1${userId ? " AND user_id=$2" : ""}`, userId ? [reference,userId] : [reference]);
  const order = found.rows[0];
  if (!order) throw new ApiError(404, "Checkout not found.");
  const t = validateLiveTransaction(await provider(`/transaction/verify/${encodeURIComponent(reference)}`), order);
  let entitlement: { expiresAt: string; receiptNumber: string } | null = null;
  if (t.status === "success") {
    const result = await query<{ receipt: { expiresAt: string; receiptNumber: string } }>("SELECT public.fulfill_paystack_live_order($1,$2,$3::timestamptz) AS receipt", [reference,t.id,t.paid_at]);
    entitlement = result.rows[0]?.receipt ?? null;
    if (!entitlement) throw new ApiError(503, "Payment verified but membership activation needs another verification attempt. Do not pay again.");
  }
  return { reference, mode: "live", status: t.status === "success" ? "paid" : ["failed","abandoned","reversed"].includes(t.status) ? t.status : "pending", plan: order.plan, cycle: order.cycle, amount: order.amount_minor / 100, currency: "KES", membershipChanged: !!entitlement, ...entitlement };
}
export async function expirePaidMemberships() { await query("SELECT public.expire_paid_memberships()"); }
