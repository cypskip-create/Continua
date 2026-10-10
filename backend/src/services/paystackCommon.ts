import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const checkoutInput = z.object({ plan: z.enum(["premium", "premium_plus"]), cycle: z.enum(["monthly", "annual"]) }).strict();
export const prices = { premium: { monthly: 80000, annual: 798000 }, premium_plus: { monthly: 100000, annual: 996000 } } as const;
export function validCheckoutUrl(value: string) {
  try { const u = new URL(value); return u.origin === "https://checkout.paystack.com" && !u.username && !u.password; } catch { return false; }
}
export function validWebhookSignature(body: Buffer, signature: string | undefined, key: string) {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  return timingSafeEqual(createHmac("sha512", key).update(body).digest(), Buffer.from(signature, "hex"));
}
