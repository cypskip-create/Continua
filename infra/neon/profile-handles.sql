-- Operator-only migration after the approved legacy-account removal.
BEGIN;
CREATE OR REPLACE FUNCTION public.continua_profile_handle() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.handle IS NULL OR btrim(NEW.handle)='' THEN
  NEW.handle='user_'||substr(replace(NEW.user_id::text,'-',''),1,10);
 ELSE NEW.handle=lower(btrim(NEW.handle)); END IF;
 IF NEW.handle !~ '^[a-z0-9_]{4,15}$' OR NEW.handle !~ '[a-z0-9]' OR NEW.handle ~ '(admin|continua)'
  OR NEW.handle=ANY(ARRAY['support','official','system','moderator','root','api','auth','settings','login','signup','terms','privacy','help']) THEN
  RAISE EXCEPTION 'Handle must contain 4–15 letters, numbers or underscores and cannot be reserved' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER continua_profile_handle BEFORE INSERT OR UPDATE OF handle ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION public.continua_profile_handle();
-- Only fill missing aliases and shorten the old generated 17-character aliases.
UPDATE public.profiles SET handle='user_'||substr(replace(user_id::text,'-',''),1,10)
 WHERE handle IS NULL OR btrim(handle)='' OR handle ~ '^user_[0-9a-f]{12}$';
ALTER TABLE public.profiles ADD CONSTRAINT profiles_handle_policy CHECK(
 handle IS NOT NULL AND handle=lower(handle) AND handle ~ '^[a-z0-9_]{4,15}$'
 AND handle ~ '[a-z0-9]' AND handle !~ '(admin|continua)'
 AND handle<>ALL(ARRAY['support','official','system','moderator','root','api','auth','settings','login','signup','terms','privacy','help']));
CREATE UNIQUE INDEX IF NOT EXISTS profiles_handle_lower_unique ON public.profiles(lower(handle)) WHERE handle IS NOT NULL;
COMMIT;
