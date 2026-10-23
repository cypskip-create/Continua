import type { z } from "zod/v3";
export declare const checkoutInput: z.ZodObject<{
    plan: z.ZodEnum<["premium", "premium_plus"]>;
    cycle: z.ZodEnum<["monthly", "annual"]>;
}, "strict", z.ZodTypeAny, {
    plan: "premium" | "premium_plus";
    cycle: "annual" | "monthly";
}, {
    plan: "premium" | "premium_plus";
    cycle: "annual" | "monthly";
}>;
export declare const CHECKOUT_POLICY_VERSION = "2026-10-12";
export declare const checkoutAgreementInput: z.ZodObject<{
    plan: z.ZodEnum<["premium", "premium_plus"]>;
    cycle: z.ZodEnum<["monthly", "annual"]>;
} & {
    policyVersion: z.ZodLiteral<"2026-10-12">;
    accepted: z.ZodLiteral<true>;
    paymentMethod: z.ZodOptional<z.ZodEnum<["card", "mobile_money"]>>;
}, "strict", z.ZodTypeAny, {
    plan: "premium" | "premium_plus";
    cycle: "annual" | "monthly";
    policyVersion: "2026-10-12";
    accepted: true;
    paymentMethod?: "card" | "mobile_money" | undefined;
}, {
    plan: "premium" | "premium_plus";
    cycle: "annual" | "monthly";
    policyVersion: "2026-10-12";
    accepted: true;
    paymentMethod?: "card" | "mobile_money" | undefined;
}>;
export declare const prices: {
    readonly premium: {
        readonly monthly: 80000;
        readonly annual: 798000;
    };
    readonly premium_plus: {
        readonly monthly: 100000;
        readonly annual: 996000;
    };
};
export declare function validCheckoutUrl(value: string): boolean;
export declare function validWebhookSignature(body: Buffer, signature: string | undefined, key: string): boolean;
