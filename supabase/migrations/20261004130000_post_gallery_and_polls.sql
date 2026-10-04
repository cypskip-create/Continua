ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS poll jsonb;
ALTER TABLE public.posts ADD CONSTRAINT posts_gallery_count CHECK (cardinality(image_urls) <= 5);

CREATE OR REPLACE FUNCTION public.validate_post_attachments() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE option_count integer;
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(NEW.image_urls) u WHERE u IS NULL OR length(u) > 2500000 OR u !~ '^https://') THEN
    RAISE EXCEPTION 'Images must be uploaded HTTPS URLs';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.poll IS DISTINCT FROM NEW.poll THEN
    RAISE EXCEPTION 'A published poll cannot be changed';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.poll IS NOT NULL THEN
    IF jsonb_typeof(NEW.poll->'options') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Poll options required'; END IF;
    option_count := jsonb_array_length(NEW.poll->'options');
    IF option_count < 2 OR option_count > 4 OR length(trim(NEW.poll->>'question')) NOT BETWEEN 1 AND 180
      OR NEW.poll->>'question' IS NULL THEN RAISE EXCEPTION 'Invalid poll'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.poll->'options') o WHERE jsonb_typeof(o) <> 'string' OR length(trim(o #>> '{}')) NOT BETWEEN 1 AND 80)
      OR (SELECT count(DISTINCT lower(trim(o))) FROM jsonb_array_elements_text(NEW.poll->'options') o) <> option_count THEN
      RAISE EXCEPTION 'Poll options must be distinct and nonempty';
    END IF;
    IF coalesce((NEW.poll->>'durationHours')::integer,0) NOT IN (1,24,72,168) THEN RAISE EXCEPTION 'Invalid poll duration'; END IF;
    NEW.poll := jsonb_build_object('question',trim(NEW.poll->>'question'),'options',NEW.poll->'options',
      'endsAt',now() + make_interval(hours => (NEW.poll->>'durationHours')::integer));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_post_attachments BEFORE INSERT OR UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.validate_post_attachments();

CREATE TABLE public.post_poll_votes (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  choice integer NOT NULL CHECK(choice BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(post_id,user_id)
);
ALTER TABLE public.post_poll_votes ENABLE ROW LEVEL SECURITY;
-- Votes are written only by the validated RPC. Identities are not public.
CREATE POLICY own_poll_votes ON public.post_poll_votes FOR SELECT TO authenticated USING(user_id=auth.uid());

CREATE OR REPLACE FUNCTION public.post_poll_result(p_post_id uuid, p_choice integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE poll_data jsonb; counts jsonb; my_choice integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to vote'; END IF;
  SELECT poll INTO poll_data FROM public.posts WHERE id=p_post_id FOR UPDATE;
  IF poll_data IS NULL THEN RAISE EXCEPTION 'Poll unavailable'; END IF;
  IF p_choice IS NOT NULL THEN
    IF p_choice < 0 OR p_choice >= jsonb_array_length(poll_data->'options') THEN RAISE EXCEPTION 'Invalid option'; END IF;
    IF (poll_data->>'endsAt')::timestamptz <= now() THEN RAISE EXCEPTION 'Poll has ended'; END IF;
    INSERT INTO public.post_poll_votes(post_id,user_id,choice) VALUES(p_post_id,auth.uid(),p_choice) ON CONFLICT DO NOTHING;
  END IF;
  SELECT jsonb_agg(n ORDER BY option) INTO counts FROM (
    SELECT option, (SELECT count(*) FROM public.post_poll_votes v WHERE v.post_id=p_post_id AND v.choice=option) n
    FROM generate_series(0,jsonb_array_length(poll_data->'options')-1) option
  ) c;
  SELECT choice INTO my_choice FROM public.post_poll_votes WHERE post_id=p_post_id AND user_id=auth.uid();
  RETURN jsonb_build_object('counts',counts,'choice',my_choice);
END $$;
REVOKE ALL ON FUNCTION public.post_poll_result(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_poll_result(uuid,integer) TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('post-images','post-images',true,1800000,ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT(id) DO NOTHING;
CREATE POLICY post_image_upload ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='post-images' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY post_image_remove ON storage.objects FOR DELETE TO authenticated
USING(bucket_id='post-images' AND (storage.foldername(name))[1]=auth.uid()::text);
