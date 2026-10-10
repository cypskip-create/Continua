-- Separate real payments from the existing test ledger. No legacy memberships are changed.
ALTER TABLE public.profiles ADD COLUMN subscription_expires_at timestamptz;
GRANT SELECT (subscription_expires_at) ON public.profiles TO authenticated;

CREATE TABLE public.paystack_live_orders (
  reference text PRIMARY KEY CHECK (reference ~ '^continua-live-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  plan text NOT NULL CHECK (plan IN ('premium','premium_plus')),
  cycle text NOT NULL CHECK (cycle IN ('monthly','annual')),
  amount_minor integer NOT NULL CHECK (amount_minor = CASE WHEN plan='premium' THEN CASE WHEN cycle='monthly' THEN 80000 ELSE 798000 END ELSE CASE WHEN cycle='monthly' THEN 100000 ELSE 996000 END END),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  provider_transaction_id bigint UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  verified_at timestamptz,
  expires_at timestamptz,
  receipt_number text UNIQUE,
  CHECK (status <> 'paid' OR (provider_transaction_id IS NOT NULL AND paid_at IS NOT NULL AND expires_at IS NOT NULL AND receipt_number IS NOT NULL))
);
CREATE INDEX paystack_live_orders_owner ON public.paystack_live_orders(user_id,created_at DESC);
ALTER TABLE public.paystack_live_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paystack_live_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.paystack_live_orders TO service_role;

-- Clients cannot change either the paid tier or its expiry, even if grants later change.
CREATE OR REPLACE FUNCTION public.prevent_self_upgrade()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at)
    AND coalesce(auth.role(), current_user::text) NOT IN ('service_role','postgres') THEN
    RAISE EXCEPTION 'Subscription access can only be changed by the billing system';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.prevent_self_upgrade() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.effective_subscription_plan(p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT CASE WHEN subscription_expires_at IS NOT NULL AND subscription_expires_at <= now() THEN 'free' ELSE subscription_plan END
  FROM public.profiles WHERE user_id=p_user_id;
$$;
REVOKE ALL ON FUNCTION public.effective_subscription_plan(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.effective_subscription_plan(uuid) TO authenticated,service_role;

-- Called only AFTER server-side Paystack verification. Row locks serialize callback/webhook
-- retries and concurrent payments; entitlement and receipt commit together or not at all.
CREATE FUNCTION public.fulfill_paystack_live_order(p_reference text,p_transaction_id bigint,p_paid_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  o public.paystack_live_orders%ROWTYPE;
  p public.profiles%ROWTYPE;
  expiry timestamptz;
BEGIN
  SELECT * INTO o FROM public.paystack_live_orders WHERE reference=p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown live order'; END IF;
  IF p_transaction_id <= 0 OR p_paid_at IS NULL OR p_paid_at > now()+interval '5 minutes' THEN RAISE EXCEPTION 'Invalid verified payment'; END IF;
  IF o.status='paid' THEN
    IF o.provider_transaction_id <> p_transaction_id THEN RAISE EXCEPTION 'Transaction mismatch'; END IF;
    RETURN jsonb_build_object('expiresAt',o.expires_at,'receiptNumber',o.receipt_number);
  END IF;
  SELECT * INTO p FROM public.profiles WHERE user_id=o.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing membership profile'; END IF;
  -- Same-tier early renewal extends the remaining term. Switching tiers starts a new
  -- term without proration, disclosed before checkout. Never downgrade active Plus
  -- when an older Premium payment arrives late: retain the higher entitlement.
  expiry := (greatest(now(), CASE WHEN p.subscription_plan=o.plan THEN p.subscription_expires_at END) AT TIME ZONE 'UTC'
    + CASE WHEN o.cycle='annual' THEN interval '1 year' ELSE interval '1 month' END) AT TIME ZONE 'UTC';
  UPDATE public.paystack_live_orders SET status='paid',provider_transaction_id=p_transaction_id,
    paid_at=p_paid_at,verified_at=now(),expires_at=expiry,receipt_number='CONT-'||p_transaction_id::text
    WHERE reference=p_reference;
  IF p.subscription_plan='premium_plus' AND o.plan='premium' AND (p.subscription_expires_at IS NULL OR p.subscription_expires_at>now()) THEN
    -- Preserve Plus and give at least the purchased term instead of discarding a payment.
    UPDATE public.profiles SET subscription_expires_at=CASE WHEN p.subscription_expires_at IS NULL THEN NULL ELSE greatest(p.subscription_expires_at,expiry) END WHERE user_id=o.user_id;
  ELSE
    UPDATE public.profiles SET subscription_plan=o.plan,subscription_expires_at=expiry WHERE user_id=o.user_id;
  END IF;
  RETURN jsonb_build_object('expiresAt',expiry,'receiptNumber','CONT-'||p_transaction_id::text);
END $$;
REVOKE ALL ON FUNCTION public.fulfill_paystack_live_order(text,bigint,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_paystack_live_order(text,bigint,timestamptz) TO service_role;

CREATE FUNCTION public.expire_paid_memberships()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE expired integer;
BEGIN
  UPDATE public.profiles SET subscription_plan='free'
    WHERE subscription_plan IN ('premium','premium_plus') AND subscription_expires_at<=now();
  GET DIAGNOSTICS expired=ROW_COUNT;
  RETURN expired;
END $$;
REVOKE ALL ON FUNCTION public.expire_paid_memberships() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_paid_memberships() TO service_role;

-- Existing quota/trigger functions must use expiry-aware access immediately, not
-- depend solely on the periodic materialized profile-tier cleanup.
DO $$
DECLARE f record; definition text;
BEGIN
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('record_research_view','get_research_quota','enforce_post_length_by_plan','enforce_watchlist_folder_limit')
  LOOP
    definition := pg_get_functiondef(f.oid);
    definition := regexp_replace(definition,'coalesce\(subscription_plan IN','coalesce(public.effective_subscription_plan(user_id) IN','gi');
    definition := regexp_replace(definition,'SELECT subscription_plan INTO','SELECT public.effective_subscription_plan(user_id) INTO','gi');
    IF definition <> pg_get_functiondef(f.oid) THEN EXECUTE definition; END IF;
  END LOOP;
END $$;

-- Supabase's database scheduler handles expiry even while Render is sleeping.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('continua-membership-expiry','* * * * *','SELECT public.expire_paid_memberships()');
