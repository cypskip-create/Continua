import { Router } from "express";
import { requireEngineUser } from "../middleware/requireSubscriber.js";
import { asyncHandler, ApiError } from "../middleware/errorHandler.js";
import { checkoutAgreementInput, CHECKOUT_POLICY_VERSION, validWebhookSignature } from "../../services/paystackCommon.js";
import { env } from "../../config/index.js";
import { liveCheckoutEnabled, initializeLiveCheckout, verifyLiveCheckout, liveReferencePattern } from "../../services/paystackLive.js";
import { nativeCheckoutForUser, nativeCheckoutInput, initializeNativeCheckout, verifyNativeCheckout, nativeSecret, nativeReferencePattern, cardRenewalEnabled } from '../../services/paystackNative.js';
import { query } from '../../storage/db.js';
export const billingRoutes = Router();
billingRoutes.get("/billing/status", (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ data: { enabled: liveCheckoutEnabled(), nativeCheckout: nativeCheckoutForUser(res.locals.engineUserId), inlineCheckout: true, nativeMode: env.PAYSTACK_NATIVE_MODE, mode: "live", automaticRenewal: cardRenewalEnabled() } }); });
billingRoutes.get('/billing/renewal', requireEngineUser, asyncHandler(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ data: (await query('SELECT enabled,plan,next_charge_at AS "nextChargeAt",active_reference IS NOT NULL AS processing FROM public.paystack_card_renewals WHERE user_id=$1 AND mode=$2', [res.locals.engineUserId, env.PAYSTACK_NATIVE_MODE])).rows[0] ?? null });
}));
billingRoutes.delete('/billing/renewal', requireEngineUser, asyncHandler(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    await query('UPDATE public.paystack_card_renewals SET enabled=false WHERE user_id=$1 AND mode=$2', [res.locals.engineUserId, env.PAYSTACK_NATIVE_MODE]);
    res.json({ data: { enabled: false } });
}));
billingRoutes.post('/billing/native-checkout', requireEngineUser, asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const input = nativeCheckoutInput.safeParse(req.body);
    if (!input.success)
        throw new ApiError(400, 'Check the payment method, phone number and billing agreement.');
    res.json({ data: await initializeNativeCheckout(res.locals.engineUserId, res.locals.engineUserEmail, input.data) });
}));
billingRoutes.get('/billing/native-verify/:reference', requireEngineUser, asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const reference = String(req.params.reference);
    try {
        res.json({ data: await verifyNativeCheckout(reference, res.locals.engineUserId) });
    }
    catch (error) {
        // Preserve payment recovery for orders created before native checkout.
        if (error instanceof ApiError && error.status === 404 && liveReferencePattern.test(reference))
            res.json({ data: await verifyLiveCheckout(reference, res.locals.engineUserId) });
        else
            throw error;
    }
}));
billingRoutes.post("/billing/checkout", requireEngineUser, asyncHandler(async (req, res) => {
    const input = checkoutAgreementInput.safeParse(req.body);
    if (!input.success)
        throw new ApiError(400, "Choose a valid plan and billing cycle, then acknowledge the current billing terms. Refresh checkout if needed.");
    res.setHeader('Cache-Control', 'no-store');
    res.json({ data: await initializeLiveCheckout(res.locals.engineUserId, res.locals.engineUserEmail, { plan: input.data.plan, cycle: input.data.cycle }, CHECKOUT_POLICY_VERSION, input.data.paymentMethod) });
}));
billingRoutes.get("/billing/verify/:reference", requireEngineUser, asyncHandler(async (req, res) => {
    const reference = String(req.params.reference);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ data: await verifyLiveCheckout(reference, res.locals.engineUserId) });
}));
// Mounted with express.raw BEFORE express.json and public API-key middleware.
export const paystackWebhook = asyncHandler(async (req, res) => {
    if (!Buffer.isBuffer(req.body))
        throw new ApiError(401, "Invalid payment signature.");
    // Accept only a valid configured signature; reference mode must also agree.
    const signature = req.header('x-paystack-signature');
    const signedMode = liveCheckoutEnabled() && validWebhookSignature(req.body, signature, env.PAYSTACK_SECRET_KEY) ? 'live'
        : nativeSecret('test')?.startsWith('sk_test_') && validWebhookSignature(req.body, signature, nativeSecret('test')) ? 'test' : null;
    if (!signedMode)
        throw new ApiError(401, 'Invalid payment signature.');
    let event;
    try {
        event = JSON.parse(req.body.toString("utf8"));
    }
    catch {
        throw new ApiError(400, "Invalid payment event.");
    }
    if (event?.event === "charge.success" && typeof event.data?.reference === "string" && nativeReferencePattern.test(event.data.reference)) {
        if (!event.data.reference.startsWith(`continua-${signedMode}-`))
            throw new ApiError(401, 'Payment signature mode mismatch.');
        try {
            await verifyNativeCheckout(event.data.reference);
        }
        catch (error) {
            if (error instanceof ApiError && error.status === 404 && signedMode === 'live' && liveReferencePattern.test(event.data.reference))
                await verifyLiveCheckout(event.data.reference);
            else if (!(error instanceof ApiError && error.status === 404))
                throw error;
        }
    }
    res.sendStatus(200);
});
