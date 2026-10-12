import { createHmac } from "node:crypto";
import { expect, it } from "vitest";
import { checkoutInput,checkoutAgreementInput, prices, validWebhookSignature, validCheckoutUrl } from "../src/services/paystackCommon.js";
it('requires an explicit current checkout acknowledgement',()=>{const b={plan:'premium',cycle:'monthly'};expect(checkoutAgreementInput.safeParse(b).success).toBe(false);expect(checkoutAgreementInput.safeParse({...b,policyVersion:'2026-10-12',accepted:true}).success).toBe(true);expect(checkoutAgreementInput.safeParse({...b,policyVersion:'2026-10-12',accepted:false}).success).toBe(false);});
it("uses KES subunits and the 17% annual Plus discount",()=>{expect(prices.premium_plus.annual).toBe(1000*12*0.83*100);expect(prices.premium.annual).toBe(798000);});
it("rejects client supplied prices and unknown plans",()=>{expect(checkoutInput.safeParse({plan:"premium_plus",cycle:"annual",amount:1}).success).toBe(false);expect(checkoutInput.safeParse({plan:"admin",cycle:"annual"}).success).toBe(false);});
it("validates raw webhook bytes",()=>{const raw=Buffer.from('{"event":"charge.success"}');const signature=createHmac("sha512","fixture").update(raw).digest("hex");expect(validWebhookSignature(raw,signature,"fixture")).toBe(true);expect(validWebhookSignature(Buffer.from("{}"),signature,"fixture")).toBe(false);expect(validWebhookSignature(raw,"bad","fixture")).toBe(false);});
it.each(["https://checkout.paystack.com.evil.test/x","http://checkout.paystack.com/x","https://user@checkout.paystack.com/x","javascript:alert(1)"])("rejects untrusted redirect %s",url=>{expect(validCheckoutUrl(url)).toBe(false);});
it("allows the provider's hosted checkout",()=>{expect(validCheckoutUrl("https://checkout.paystack.com/fixture")).toBe(true);});
