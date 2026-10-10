import { Router } from "express";
import { requireEngineUser } from "../middleware/requireSubscriber.js";
import { asyncHandler, ApiError } from "../middleware/errorHandler.js";
import { checkoutInput, validWebhookSignature } from "../../services/paystackCommon.js";
import { env } from "../../config/index.js";
import { liveCheckoutEnabled, initializeLiveCheckout, verifyLiveCheckout, liveReferencePattern } from "../../services/paystackLive.js";

export const billingRoutes = Router();
billingRoutes.get("/billing/status", (_req,res) => { res.json({ data: { enabled: liveCheckoutEnabled(), mode: "live", automaticRenewal: false } }); });
billingRoutes.post("/billing/checkout", requireEngineUser, asyncHandler(async (req,res) => {
  const input = checkoutInput.safeParse(req.body);
  if (!input.success) throw new ApiError(400, "Choose a valid plan and billing cycle.");
  res.json({ data: await initializeLiveCheckout(res.locals.engineUserId, res.locals.engineUserEmail, input.data) });
}));
billingRoutes.get("/billing/verify/:reference", requireEngineUser, asyncHandler(async (req,res) => {
  const reference = String(req.params.reference);
  res.json({ data: await verifyLiveCheckout(reference, res.locals.engineUserId) });
}));
// Mounted with express.raw BEFORE express.json and public API-key middleware.
export const paystackWebhook = asyncHandler(async (req,res) => {
  if (!liveCheckoutEnabled()) throw new ApiError(503, "Payments are disabled.");
  if (!Buffer.isBuffer(req.body) || !validWebhookSignature(req.body,req.header("x-paystack-signature"),env.PAYSTACK_SECRET_KEY!)) throw new ApiError(401, "Invalid payment signature.");
  let event: { event?: string; data?: { reference?: string } };
  try { event = JSON.parse(req.body.toString("utf8")); } catch { throw new ApiError(400, "Invalid payment event."); }
  if (event?.event === "charge.success" && typeof event.data?.reference === "string" && liveReferencePattern.test(event.data.reference)) {
    try { await verifyLiveCheckout(event.data.reference); }
    catch (error) { if (!(error instanceof ApiError && error.status === 404)) throw error; }
  }
  res.sendStatus(200);
});
