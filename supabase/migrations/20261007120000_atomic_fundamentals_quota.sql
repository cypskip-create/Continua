-- Serialize spending for a user/month so simultaneous stock tabs cannot
-- consume more than five free slots. Revisited stocks remain accessible.
CREATE OR REPLACE FUNCTION public.record_research_view(p_symbol text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_month text := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM');
  v_symbol text := upper(trim(p_symbol));
  v_paid boolean := false;
  v_seen boolean;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_symbol IS NULL OR v_symbol !~ '^[A-Z0-9.:-]{1,32}$' THEN RAISE EXCEPTION 'Invalid symbol'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_month, 0));
  SELECT coalesce(subscription_plan IN ('premium', 'premium_plus'), false)
    INTO v_paid FROM public.profiles WHERE user_id = v_uid;
  v_paid := coalesce(v_paid, false);
  SELECT EXISTS(SELECT 1 FROM public.research_usage WHERE user_id=v_uid AND month_key=v_month AND symbol=v_symbol) INTO v_seen;
  SELECT count(*) INTO v_count FROM public.research_usage WHERE user_id=v_uid AND month_key=v_month;
  IF NOT v_paid AND NOT v_seen AND v_count >= 5 THEN
    RETURN jsonb_build_object('allowed',false,'already_counted',false,'is_premium',false,'limit',5,'remaining',0);
  END IF;
  IF NOT v_seen THEN
    INSERT INTO public.research_usage(user_id,symbol,month_key) VALUES(v_uid,v_symbol,v_month) ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END IF;
  RETURN jsonb_build_object('allowed',true,'already_counted',v_seen,'is_premium',v_paid,
    'limit',CASE WHEN v_paid THEN NULL ELSE 5 END,
    'remaining',CASE WHEN v_paid THEN NULL ELSE greatest(5-v_count,0) END);
END $$;

CREATE OR REPLACE FUNCTION public.get_research_quota(p_symbol text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_month text := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM');
  v_symbol text := upper(trim(p_symbol));
  v_paid boolean := false;
  v_seen boolean;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_symbol IS NULL OR v_symbol !~ '^[A-Z0-9.:-]{1,32}$' THEN RAISE EXCEPTION 'Invalid symbol'; END IF;
  SELECT coalesce(subscription_plan IN ('premium','premium_plus'),false) INTO v_paid FROM public.profiles WHERE user_id=v_uid;
  v_paid := coalesce(v_paid,false);
  SELECT EXISTS(SELECT 1 FROM public.research_usage WHERE user_id=v_uid AND month_key=v_month AND symbol=v_symbol) INTO v_seen;
  SELECT count(*) INTO v_count FROM public.research_usage WHERE user_id=v_uid AND month_key=v_month;
  RETURN jsonb_build_object('allowed',v_paid OR v_seen OR v_count<5,'already_counted',v_seen,'is_premium',v_paid,
    'limit',CASE WHEN v_paid THEN NULL ELSE 5 END,
    'remaining',CASE WHEN v_paid THEN NULL ELSE greatest(5-v_count,0) END);
END $$;
REVOKE EXECUTE ON FUNCTION public.record_research_view(text), public.get_research_quota(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_research_view(text), public.get_research_quota(text) TO authenticated;
