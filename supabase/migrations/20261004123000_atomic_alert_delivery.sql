-- Service-role-only delivery. The update and inbox insert commit together;
-- concurrent app/cron checks cannot deliver the same one-shot alert twice.
CREATE OR REPLACE FUNCTION public.deliver_alert_notification(
  p_alert_id uuid, p_title text, p_message text, p_updated_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE delivered public.price_alerts%ROWTYPE;
BEGIN
  UPDATE public.price_alerts SET triggered_at = now()
    WHERE id = p_alert_id AND is_active AND triggered_at IS NULL
      AND updated_at IS NOT DISTINCT FROM p_updated_at
    RETURNING * INTO delivered;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.notifications(user_id, type, feature, title, message, action_url, entity_id, entity_type)
    VALUES(delivered.user_id, 'alert', 'alerts', p_title, p_message,
      '/stock/' || delivered.symbol, delivered.id, 'price_alert');
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.deliver_alert_notification(uuid,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_alert_notification(uuid,text,text,timestamptz) TO service_role;
