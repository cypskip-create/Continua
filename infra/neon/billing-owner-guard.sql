-- Apply only after the target's owner/role inventory has been verified.
-- Neon uses neondb_owner where the source uses postgres. Browser requests
-- explicitly SET LOCAL ROLE authenticated and cannot inherit owner authority.
-- Do not use request.jwt.claims to decide who may write paid entitlements.
CREATE OR REPLACE FUNCTION public.prevent_self_upgrade()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $guard$
BEGIN
 IF (NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan
     OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at)
    AND current_user::text NOT IN ('service_role','neondb_owner','postgres') THEN
  RAISE EXCEPTION 'Subscription access can only be changed by the billing system'
    USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END
$guard$;
REVOKE EXECUTE ON FUNCTION public.prevent_self_upgrade() FROM PUBLIC, anon, authenticated;
