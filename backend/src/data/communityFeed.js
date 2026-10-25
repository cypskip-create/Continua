// One live identity verification and one RLS transaction for an entire feed.
// All relations are fixed, owner comes only from verified server claims, and
// no privileged role or SECURITY DEFINER function is used.
import {executeDataRequest} from './browserData.js';
export function communityFeedQuery(owner){
 if(typeof owner!=='string'||!owner)throw Error('Verified feed owner required');
 return {params:[owner],head:false,mutation:false,sql:`WITH visible AS MATERIALIZED (
  SELECT p.* FROM public.posts p
  WHERE NOT EXISTS(SELECT 1 FROM public.hidden_posts h WHERE h.user_id=$1 AND h.post_id=p.id)
   AND NOT EXISTS(SELECT 1 FROM public.blocked_users b WHERE b.blocker_id=$1 AND b.blocked_id=p.user_id)
   AND NOT EXISTS(SELECT 1 FROM public.muted_users m WHERE m.muter_id=$1 AND m.muted_id=p.user_id)
   AND NOT EXISTS(SELECT 1 FROM public.muted_keywords k WHERE k.user_id=$1 AND length(trim(k.keyword))>0 AND strpos(lower(p.content),lower(trim(k.keyword)))>0)
  ORDER BY p.created_at DESC,p.id DESC LIMIT 50
 ), enriched AS (
  SELECT p.*,
   (SELECT json_build_object('id',a.id,'user_id',a.user_id,'full_name',a.full_name,'handle',a.handle,'avatar_url',a.avatar_url,'bio',a.bio) FROM public.profiles_public a WHERE a.user_id=p.user_id) author,
   (SELECT count(*)::int FROM public.post_likes l WHERE l.post_id=p.id) likes_count,
   (SELECT count(*)::int FROM public.post_reposts r WHERE r.post_id=p.id) reposts_count,
   (SELECT count(*)::int FROM public.post_comments c WHERE c.post_id=p.id) comments_count,
   EXISTS(SELECT 1 FROM public.post_likes l WHERE l.post_id=p.id AND l.user_id=$1) is_liked,
   EXISTS(SELECT 1 FROM public.post_reposts r WHERE r.post_id=p.id AND r.user_id=$1) is_reposted,
   EXISTS(SELECT 1 FROM public.post_bookmarks b WHERE b.post_id=p.id AND b.user_id=$1) is_bookmarked,
   COALESCE((SELECT json_object_agg(counts.reaction,counts.n) FROM (SELECT r.reaction,count(*)::int n FROM public.post_reactions r WHERE r.post_id=p.id GROUP BY r.reaction) counts),'{}'::json) reaction_counts,
   (SELECT r.reaction FROM public.post_reactions r WHERE r.post_id=p.id AND r.user_id=$1) my_reaction,
   (SELECT row_to_json(quoted) FROM (SELECT q.*,(SELECT json_build_object('id',a.id,'user_id',a.user_id,'full_name',a.full_name,'handle',a.handle,'avatar_url',a.avatar_url,'bio',a.bio) FROM public.profiles_public a WHERE a.user_id=q.user_id) author FROM public.posts q WHERE q.id=p.quoted_post_id) quoted) quoted_post,
   COALESCE((SELECT json_agg(preview ORDER BY preview.created_at DESC,preview.id DESC) FROM (
    SELECT c.id,c.content,c.user_id,c.created_at,COALESCE(a.full_name,'Investor') author_name,COALESCE(a.handle,'') handle
    FROM public.post_comments c LEFT JOIN public.profiles_public a ON a.user_id=c.user_id WHERE c.post_id=p.id ORDER BY c.created_at DESC,c.id DESC LIMIT 2
   ) preview),'[]'::json) comment_previews
  FROM visible p
 ) SELECT row_to_json(enriched)::text payload FROM enriched ORDER BY created_at DESC,id DESC`};
}
export function readCommunityFeed(database,claims){return executeDataRequest(database,communityFeedQuery(claims.sub),claims);}
