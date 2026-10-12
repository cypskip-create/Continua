-- Existing completed orders keep NULL policy fields; never invent acceptance.
ALTER TABLE public.paystack_live_orders ADD COLUMN IF NOT EXISTS terms_version text;
ALTER TABLE public.paystack_live_orders ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
COMMENT ON COLUMN public.paystack_live_orders.terms_accepted_at IS 'Server timestamp of explicit checkout-policy acknowledgement. NULL on orders predating this rollout.';
