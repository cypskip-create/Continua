import type { Post } from '../hooks/usePosts';
const prefix = 'continua:private-snapshot:feed:';
const fields = ['id','user_id','content','image_url','image_urls','poll','stock_mentions','created_at','updated_at','edited_at','likes_count','reposts_count','comments_count','is_liked','is_reposted','is_bookmarked','quoted_post_id','reaction_counts','my_reaction','comment_previews'] as const;
export function feedDisplayRows(posts: Post[]): Post[] {
  return posts.slice(0,30).map(post => ({...Object.fromEntries(fields.map(key => [key,post[key]])),
    author: post.author ? Object.fromEntries(['id','user_id','full_name','avatar_url','bio','handle'].map(key => [key,post.author?.[key as keyof typeof post.author]])) : undefined,
    quoted_post: null,
  })) as unknown as Post[];
}
export function readFeedSnapshot(owner: string): Post[] | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(prefix+owner) || 'null');
    if (!value || Date.now()-value.savedAt>300000 || value.savedAt>Date.now() || !Array.isArray(value.rows) || value.rows.some((row: Post)=>!row || typeof row.id!=='string' || typeof row.user_id!=='string' || typeof row.content!=='string')) return null;
    return feedDisplayRows(value.rows);
  } catch { return null; }
}
export function saveFeedSnapshot(owner: string, rows: Post[]) {
  try { sessionStorage.setItem(prefix+owner,JSON.stringify({savedAt:Date.now(),rows:feedDisplayRows(rows)})); } catch { /* Optional session cache. */ }
}
export function clearFeedSnapshot(owner: string) { try { sessionStorage.removeItem(prefix+owner); } catch { /* Optional session cache. */ } }
