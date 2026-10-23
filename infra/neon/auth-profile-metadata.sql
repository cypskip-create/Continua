-- Explicit staging update for atomic registration metadata preservation.
CREATE OR REPLACE FUNCTION app_identity.sync_auth_identity() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO app_identity.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at,source_provider)
   VALUES(NEW.id,NEW.email,CASE WHEN NEW."emailVerified" THEN now() ELSE NULL END,
    coalesce(NEW."userMetadata",'{}'::jsonb)||jsonb_build_object('full_name',NEW.name),NEW."createdAt",NEW."updatedAt",'better-auth')
   ON CONFLICT(id) DO NOTHING;
  INSERT INTO app_identity.provider_links(provider,subject,user_id,evidence)
   VALUES('better-auth',NEW.id::text,NEW.id,'Authenticated provider UUID retained by explicit migration or registration');
  INSERT INTO public.profiles(user_id,full_name,email) VALUES(NEW.id,NEW.name,NEW.email)
   ON CONFLICT(user_id) DO NOTHING;
 ELSE
  UPDATE app_identity.users SET email=NEW.email,
   email_confirmed_at=CASE WHEN NEW."emailVerified" THEN coalesce(email_confirmed_at,now()) ELSE NULL END,
   updated_at=NEW."updatedAt" WHERE id=NEW.id;
  UPDATE public.profiles SET email=NEW.email WHERE user_id=NEW.id AND email IS DISTINCT FROM NEW.email;
 END IF;
 RETURN NEW;
END $$;
