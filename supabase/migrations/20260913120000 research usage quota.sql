-- Free-tier research quota (Simply Wall St-style): free accounts get 5
-- distinct stocks' full research report per calendar month. Reaching a
-- stock's "1. Valuation" report section is what counts as using one of
-- those 5 — re-visiting a stock already counted this month is free again,
-- only a genuinely NEW stock consumes one. Premium is unlimited.
--
-- This has to be enforced server-side, same reasoning as the post-length
-- migration above it: a client-only counter is trivially bypassed by
-- refreshing the page or calling the API directly. record_research_view()
-- is SECURITY DEFINER so it can read the caller's own subscription_plan
-- and safely write a usage row, without granting the client direct INSERT
-- on research_usage for anything but its own rows.

CREATE TABLE IF NOT EXISTS public.research_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  -- 'YYYY-MM' in UTC — the quota resets when this rolls over, no separate
  -- reset job needed.
  month_key text NOT NULL,
  first_viewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol, month_key)
);

ALTER TABLE public.research_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select own research usage" ON public.research_usage
  FOR SELECT USING (auth.uid() = user_id);

-- No direct INSERT/UPDATE/DELETE policies — all writes go through the
-- SECURITY DEFINER function below, which is the only place quota logic
-- lives. A client that tried to INSERT directly would just be denied.

CREATE INDEX IF NOT EXISTS idx_research_usage_user_month
  ON public.research_usage (user_id, month_key);

CREATE OR REPLACE FUNCTION public.record_research_view(p_symbol text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_month text := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM');
  v_symbol text := upper(p_symbol);
  v_plan text;
  v_is_premium boolean;
  v_limit CONSTANT int := 5;
  v_already_counted boolean;
  v_count int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT subscription_plan INTO v_plan FROM public.profiles WHERE user_id = v_user_id;
  v_is_premium := v_plan IN ('premium', 'premium_plus');

  SELECT EXISTS (
    SELECT 1 FROM public.research_usage
    WHERE user_id = v_user_id AND symbol = v_symbol AND month_key = v_month
  ) INTO v_already_counted;

  -- Already used this stock's slot this month (or unlimited) — free to view,
  -- no new row needed.
  IF v_already_counted OR v_is_premium THEN
    IF NOT v_already_counted THEN
      INSERT INTO public.research_usage (user_id, symbol, month_key)
      VALUES (v_user_id, v_symbol, v_month)
      ON CONFLICT (user_id, symbol, month_key) DO NOTHING;
    END IF;
    SELECT count(*) INTO v_count FROM public.research_usage WHERE user_id = v_user_id AND month_key = v_month;
    RETURN jsonb_build_object(
      'allowed', true, 'already_counted', v_already_counted, 'is_premium', v_is_premium,
      'limit', CASE WHEN v_is_premium THEN NULL ELSE v_limit END,
      'remaining', CASE WHEN v_is_premium THEN NULL ELSE GREATEST(v_limit - v_count, 0) END
    );
  END IF;

  SELECT count(*) INTO v_count FROM public.research_usage WHERE user_id = v_user_id AND month_key = v_month;
  IF v_count >= v_limit THEN
    RETURN jsonb_build_object('allowed', false, 'already_counted', false, 'is_premium', false, 'limit', v_limit, 'remaining', 0);
  END IF;

  INSERT INTO public.research_usage (user_id, symbol, month_key)
  VALUES (v_user_id, v_symbol, v_month)
  ON CONFLICT (user_id, symbol, month_key) DO NOTHING;

  SELECT count(*) INTO v_count FROM public.research_usage WHERE user_id = v_user_id AND month_key = v_month;
  RETURN jsonb_build_object('allowed', true, 'already_counted', false, 'is_premium', false, 'limit', v_limit, 'remaining', GREATEST(v_limit - v_count, 0));
END $$;

REVOKE EXECUTE ON FUNCTION public.record_research_view(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_research_view(text) TO authenticated;

-- Read-only check (no write) — used to decide whether to even show a
-- locked stock's report on first load, before the person has scrolled
-- anywhere, without spending a slot just by looking.
CREATE OR REPLACE FUNCTION public.get_research_quota(p_symbol text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_month text := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM');
  v_symbol text := upper(p_symbol);
  v_plan text;
  v_is_premium boolean;
  v_limit CONSTANT int := 5;
  v_already_counted boolean;
  v_count int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT subscription_plan INTO v_plan FROM public.profiles WHERE user_id = v_user_id;
  v_is_premium := v_plan IN ('premium', 'premium_plus');

  SELECT EXISTS (
    SELECT 1 FROM public.research_usage
    WHERE user_id = v_user_id AND symbol = v_symbol AND month_key = v_month
  ) INTO v_already_counted;
  SELECT count(*) INTO v_count FROM public.research_usage WHERE user_id = v_user_id AND month_key = v_month;

  RETURN jsonb_build_object(
    'allowed', v_is_premium OR v_already_counted OR v_count < v_limit,
    'already_counted', v_already_counted, 'is_premium', v_is_premium,
    'limit', CASE WHEN v_is_premium THEN NULL ELSE v_limit END,
    'remaining', CASE WHEN v_is_premium THEN NULL ELSE GREATEST(v_limit - v_count, 0) END
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_research_quota(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_research_quota(text) TO authenticated;