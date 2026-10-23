import type { z } from "zod/v3";
import { checkoutInput } from "./paystackCommon.js";
export declare const liveReferencePattern: RegExp;
export declare function liveCheckoutEnabled(): boolean;
interface LiveOrder {
    reference: string;
    user_id: string;
    email: string;
    amount_minor: number;
    plan: string;
    cycle: string;
    status: string;
    terms_version?: string | null;
}
export declare function validateLiveTransaction(raw: unknown, order: LiveOrder): {
    status: string;
    id: number;
    currency: "KES";
    amount: number;
    domain: "live";
    reference: string;
    customer: {
        email: string;
    };
    metadata: {
        continua_reference: string;
        continua_user: string;
        mode: "live";
    };
    authorization?: {
        authorization_code: string;
        channel: string;
        reusable: boolean;
    } | undefined;
    paid_at?: string | null | undefined;
};
export declare function initializeLiveCheckout(userId: string, email: string, input: z.infer<typeof checkoutInput>, policyVersion: string, paymentMethod?: 'card' | 'mobile_money'): Promise<{
    url: string;
    accessCode: string | null;
    reference: string;
    mode: string;
    amount: number;
    currency: string;
}>;
export declare function verifyLiveCheckout(reference: string, userId?: string): Promise<{
    expiresAt?: string | undefined;
    receiptNumber?: string | undefined;
    reference: string;
    mode: string;
    status: string;
    plan: string;
    cycle: string;
    amount: number;
    currency: string;
    policyVersion: string | null;
    membershipChanged: boolean;
}>;
export declare function expirePaidMemberships(): Promise<void>;
export {};
