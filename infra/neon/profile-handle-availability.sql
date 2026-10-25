BEGIN;
CREATE OR REPLACE FUNCTION public.continua_handle_available(p_handle text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate text=lower(btrim(p_handle));
BEGIN
 PERFORM public.continua_session_guard();
 IF auth.uid() IS NULL OR candidate IS NULL OR candidate !~ '^[a-z0-9_]{4,15}$'
  OR candidate !~ '[a-z0-9]' OR candidate ~ '(admin|continua)'
  OR candidate=ANY(ARRAY['support','official','system','moderator','root','api','auth','settings','login','signup','terms','privacy','help']) THEN RETURN false; END IF;
 RETURN NOT EXISTS(SELECT 1 FROM public.profiles WHERE lower(handle)=candidate AND user_id<>auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.continua_handle_available(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.continua_handle_available(text) TO authenticated;
COMMIT;
