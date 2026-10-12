-- Safety rules supplement existing owner policies; do not make reports public.
CREATE TABLE public.account_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 reported_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 reason text NOT NULL, details text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','reviewed','dismissed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(reporter_id<>reported_id), CHECK(length(details)<=1000),
 UNIQUE(reporter_id,reported_id)
);
ALTER TABLE public.account_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_reports FROM anon,authenticated;
GRANT SELECT ON public.account_reports TO authenticated;
GRANT ALL ON public.account_reports TO service_role;
CREATE POLICY own_account_reports ON public.account_reports FOR SELECT TO authenticated USING(reporter_id=auth.uid());
ALTER TABLE public.post_reports ADD COLUMN details text NOT NULL DEFAULT '',
 ADD COLUMN status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','reviewed','dismissed')),
 ADD CONSTRAINT post_report_details_bound CHECK(length(details)<=1000);

CREATE FUNCTION public.community_can_interact(p_other uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.blocked_users WHERE
   (blocker_id=auth.uid() AND blocked_id=p_other) OR (blocker_id=p_other AND blocked_id=auth.uid())
 );
$$;
REVOKE ALL ON FUNCTION public.community_can_interact(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.community_can_interact(uuid) TO authenticated;
CREATE INDEX community_blocks_reverse ON public.blocked_users(blocked_id,blocker_id);
ALTER TABLE public.blocked_users ADD CONSTRAINT no_self_block CHECK(blocker_id<>blocked_id) NOT VALID;
ALTER TABLE public.muted_users ADD CONSTRAINT no_self_mute CHECK(muter_id<>muted_id) NOT VALID;

CREATE FUNCTION public.community_set_safety(p_target uuid,p_kind text,p_enabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR actor=p_target OR p_kind IS NULL OR p_kind NOT IN('block','mute') OR p_enabled IS NULL
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_target) THEN RAISE EXCEPTION 'Invalid safety request'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,30000));
 IF p_kind='block' THEN
  IF p_enabled THEN INSERT INTO public.blocked_users(blocker_id,blocked_id) VALUES(actor,p_target) ON CONFLICT DO NOTHING;
  ELSE DELETE FROM public.blocked_users WHERE blocker_id=actor AND blocked_id=p_target; END IF;
 ELSE
  IF p_enabled THEN INSERT INTO public.muted_users(muter_id,muted_id) VALUES(actor,p_target) ON CONFLICT DO NOTHING;
  ELSE DELETE FROM public.muted_users WHERE muter_id=actor AND muted_id=p_target; END IF;
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public.community_set_safety(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.community_set_safety(uuid,text,boolean) TO authenticated;

-- Enforced even if a client writes the existing block table directly.
CREATE FUNCTION public.community_remove_blocked_follows() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 DELETE FROM public.user_follows WHERE (follower_id=NEW.blocker_id AND following_id=NEW.blocked_id)
 OR (follower_id=NEW.blocked_id AND following_id=NEW.blocker_id);
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.community_remove_blocked_follows() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER community_block_follows AFTER INSERT ON public.blocked_users FOR EACH ROW EXECUTE FUNCTION public.community_remove_blocked_follows();

CREATE FUNCTION public.community_submit_report(p_kind text,p_target uuid,p_reason text,p_details text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); target_author uuid; total integer;
BEGIN
 IF actor IS NULL OR p_kind IS NULL OR p_kind NOT IN('post','user') OR p_reason IS NULL OR p_reason NOT IN
 ('Spam or scam','Harassment or hate','Misleading financial claims','Copyright infringement','Threats or unsafe content','Other')
 OR length(coalesce(p_details,''))>1000 THEN RAISE EXCEPTION 'Invalid report'; END IF;
 IF p_kind='post' THEN SELECT user_id INTO target_author FROM public.posts WHERE id=p_target;
 ELSE SELECT id INTO target_author FROM auth.users WHERE id=p_target; END IF;
 IF target_author IS NULL OR actor=target_author THEN RAISE EXCEPTION 'Invalid report target'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,30001));
 -- Idempotent retries preserve the original evidence and don't create duplicates.
 IF p_kind='post' AND EXISTS(SELECT 1 FROM public.post_reports WHERE post_id=p_target AND reporter_id=actor) THEN RETURN; END IF;
 IF p_kind='user' AND EXISTS(SELECT 1 FROM public.account_reports WHERE reported_id=p_target AND reporter_id=actor) THEN RETURN; END IF;
 SELECT (SELECT count(*) FROM public.post_reports WHERE reporter_id=actor AND created_at>now()-interval '1 day')+
 (SELECT count(*) FROM public.account_reports WHERE reporter_id=actor AND created_at>now()-interval '1 day') INTO total;
 IF total>=30 THEN RAISE EXCEPTION 'Report limit reached. Contact support for urgent concerns.'; END IF;
 IF p_kind='post' THEN INSERT INTO public.post_reports(post_id,reporter_id,reason,details) VALUES(p_target,actor,p_reason,coalesce(p_details,''));
 ELSE INSERT INTO public.account_reports(reported_id,reporter_id,reason,details) VALUES(p_target,actor,p_reason,coalesce(p_details,'')); END IF;
END; $$;
REVOKE ALL ON FUNCTION public.community_submit_report(text,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.community_submit_report(text,uuid,text,text) TO authenticated;
-- All new reports go through validation, throttling and duplicate handling.
REVOKE INSERT ON public.post_reports FROM authenticated;

CREATE POLICY community_post_block_visibility ON public.posts AS RESTRICTIVE FOR SELECT TO authenticated USING(public.community_can_interact(user_id));
CREATE POLICY community_notification_safety ON public.notifications AS RESTRICTIVE FOR SELECT TO authenticated
 USING(actor_id IS NULL OR (public.community_can_interact(actor_id) AND NOT EXISTS(SELECT 1 FROM public.muted_users m WHERE m.muter_id=auth.uid() AND m.muted_id=actor_id)));
CREATE POLICY community_reply_block_visibility ON public.post_comments AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.community_can_interact(user_id) AND EXISTS(SELECT 1 FROM public.posts p WHERE p.id=post_id));
CREATE POLICY community_reply_block_insert ON public.post_comments AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(EXISTS(SELECT 1 FROM public.posts p WHERE p.id=post_id AND public.community_can_interact(p.user_id)));
CREATE POLICY community_follow_block_insert ON public.user_follows AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(follower_id<>following_id AND public.community_can_interact(following_id));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['post_reactions','post_likes','post_reposts','post_bookmarks'] LOOP
  EXECUTE format('CREATE POLICY community_post_block_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(EXISTS(SELECT 1 FROM public.posts p WHERE p.id=post_id AND public.community_can_interact(p.user_id)))',t);
  EXECUTE format('CREATE POLICY community_post_block_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(EXISTS(SELECT 1 FROM public.posts p WHERE p.id=post_id)) WITH CHECK(EXISTS(SELECT 1 FROM public.posts p WHERE p.id=post_id AND public.community_can_interact(p.user_id)))',t);
 END LOOP;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['comment_likes','comment_reposts'] LOOP
  EXECUTE format('CREATE POLICY community_reply_block_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(EXISTS(SELECT 1 FROM public.post_comments c WHERE c.id=comment_id AND public.community_can_interact(c.user_id)))',t);
 END LOOP;
END $$;
CREATE POLICY community_reply_reaction_insert ON public.comment_reactions AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(EXISTS(SELECT 1 FROM public.post_comments c WHERE c.id=comment_id AND public.community_can_interact(c.user_id)));
CREATE POLICY community_reply_reaction_update ON public.comment_reactions AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(EXISTS(SELECT 1 FROM public.post_comments c WHERE c.id=comment_id)) WITH CHECK(EXISTS(SELECT 1 FROM public.post_comments c WHERE c.id=comment_id AND public.community_can_interact(c.user_id)));

-- The poll RPC is SECURITY DEFINER, so add the block gate explicitly.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.post_poll_result(uuid,integer)'::regprocedure) INTO definition;
 IF position('WHERE id=p_post_id FOR UPDATE' IN definition)=0 THEN RAISE EXCEPTION 'Poll function mapping changed; review required'; END IF;
 definition:=replace(definition,'WHERE id=p_post_id FOR UPDATE','WHERE id=p_post_id AND public.community_can_interact(user_id) FOR UPDATE');
 EXECUTE definition;
END $$;
