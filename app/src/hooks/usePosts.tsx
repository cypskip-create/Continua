import { useState, useEffect, useCallback } from 'react';
import { usePageRefresh } from './usePageRefresh';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export interface PostAuthor {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  handle?: string | null;
}

export type ReactionKind = import("@/components/social/CommunityReactionButton").CommunityReaction;
export type ReactionCounts = Partial<Record<ReactionKind, number>>;

export interface CommentPreview {
  id: string;
  content: string;
  author_name: string;
  handle: string;
  user_id: string;
}


export interface Post {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  stock_mentions: string[] | null;
  created_at: string;
  updated_at: string;
  edited_at?: string | null;
  author?: PostAuthor;
  likes_count: number;
  reposts_count: number;
  comments_count: number;
  is_liked: boolean;
  is_reposted: boolean;
  is_bookmarked: boolean;
  quoted_post_id?: string | null;
  quoted_post?: Post | null;
  reaction_counts: ReactionCounts;
  my_reaction: ReactionKind | null;
  comment_previews?: CommentPreview[];
}


export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  edited_at?: string | null;
  parent_comment_id?: string | null;
  author?: PostAuthor;
  replies?: Comment[];
  likes_count?: number;
  reposts_count?: number;
  is_liked?: boolean;
  is_reposted?: boolean;
  reaction_counts?: ReactionCounts;
  my_reaction?: ReactionKind | null;
}

// ── Pure helpers for working with the nested comment tree client-side ──────
// (editing/deleting a comment happens against a single comment somewhere in
// a tree of replies, so callers need to patch that tree locally rather than
// refetch the whole thread on every action).

/** 1 + every nested reply underneath this comment. */
export function countCommentSubtree(comment: Comment): number {
  return 1 + (comment.replies || []).reduce((sum, r) => sum + countCommentSubtree(r), 0);
}

/** Returns a new tree with the given comment id patched via `updater`, wherever it sits. */
export function updateCommentInTree(comments: Comment[], id: string, updater: (c: Comment) => Comment): Comment[] {
  return comments.map(c => {
    if (c.id === id) return updater(c);
    if (c.replies && c.replies.length) return { ...c, replies: updateCommentInTree(c.replies, id, updater) };
    return c;
  });
}

/** Returns a new tree with the given comment id (and all its replies) removed, plus how many nodes were removed. */
export function removeCommentFromTree(comments: Comment[], id: string): { tree: Comment[]; removedCount: number } {
  let removedCount = 0;
  const tree = comments
    .filter(c => {
      if (c.id === id) {
        removedCount = countCommentSubtree(c);
        return false;
      }
      return true;
    })
    .map(c => {
      if (removedCount > 0 || !c.replies || !c.replies.length) return c;
      const nested = removeCommentFromTree(c.replies, id);
      if (nested.removedCount > 0) {
        removedCount = nested.removedCount;
        return { ...c, replies: nested.tree };
      }
      return c;
    });
  return { tree, removedCount };
}

// Module-level cache so re-entering TradersHub is instant
let __postsCache: Post[] | null = null;
let __postsCacheKey: string | null = null;

export function usePosts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const cacheKey = user?.id || 'anon';
  const initial = __postsCache && __postsCacheKey === cacheKey ? __postsCache : [];
  const [posts, setPosts] = useState<Post[]>(initial);
  const [loading, setLoading] = useState(initial.length === 0);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    if (!__postsCache || __postsCacheKey !== cacheKey) setLoading(true);
    try {
      const { data: postsDataRaw, error: postsError } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (postsError) throw postsError;

      let postsData = postsDataRaw;
      if (user && postsData && postsData.length > 0) {
        const [hiddenRes, blockedRes, mutedRes, mutedKeywordsRes] = await Promise.all([
          supabase.from('hidden_posts' as any).select('post_id').eq('user_id', user.id),
          supabase.from('blocked_users' as any).select('blocked_id').eq('blocker_id', user.id),
          supabase.from('muted_users' as any).select('muted_id').eq('muter_id', user.id),
          supabase.from('muted_keywords' as any).select('keyword').eq('user_id', user.id),
        ]);
        const hiddenSet = new Set((hiddenRes.data as any[] | null)?.map(r => r.post_id));
        // Blocking/muting someone only meant anything if it actually kept
        // their posts out of your feed — previously these tables were
        // written to (from the post-card and profile "Block"/"Mute"
        // actions) but never read back here, so the setting did nothing.
        const excludedUserIds = new Set([
          ...((blockedRes.data as any[] | null)?.map(r => r.blocked_id) || []),
          ...((mutedRes.data as any[] | null)?.map(r => r.muted_id) || []),
        ]);
        // Same bug as above for muted keywords: Settings → TradersHub →
        // Muted let you add keywords, but nothing ever checked a post's
        // content against them, so muting a word did nothing either.
        const mutedKeywords = ((mutedKeywordsRes.data as any[] | null)?.map(r => (r.keyword || '').toLowerCase().trim()).filter(Boolean)) || [];
        if (hiddenSet.size > 0 || excludedUserIds.size > 0 || mutedKeywords.length > 0) {
          postsData = postsData.filter(p => {
            if (hiddenSet.has(p.id) || excludedUserIds.has(p.user_id)) return false;
            if (mutedKeywords.length > 0) {
              const content = (p.content || '').toLowerCase();
              if (mutedKeywords.some(kw => content.includes(kw))) return false;
            }
            return true;
          });
        }
      }

      if (!postsData || postsData.length === 0) {
        setPosts([]); setError(null); setLoading(false); return;
      }

      const postIds = postsData.map(p => p.id);
      const userIds = [...new Set(postsData.map(p => p.user_id))];

      // Bulk fetch — eliminate N+1
      const [profilesRes, likesRes, repostsRes, commentsRes, myLikesRes, myRepostsRes, myBookmarksRes, reactionsRes] = await Promise.all([
       supabase.from('profiles_public').select('id, user_id, full_name, handle, avatar_url, bio').in('user_id', userIds),
        supabase.from('post_likes').select('post_id').in('post_id', postIds),
        supabase.from('post_reposts').select('post_id').in('post_id', postIds),
        supabase.from('post_comments').select('id, post_id, content, user_id, created_at').in('post_id', postIds).order('created_at', { ascending: false }),
        user ? supabase.from('post_likes').select('post_id').eq('user_id', user.id).in('post_id', postIds) : Promise.resolve({ data: [] as any[] }),
        user ? supabase.from('post_reposts').select('post_id').eq('user_id', user.id).in('post_id', postIds) : Promise.resolve({ data: [] as any[] }),
        user ? supabase.from('post_bookmarks').select('post_id').eq('user_id', user.id).in('post_id', postIds) : Promise.resolve({ data: [] as any[] }),
        supabase.from('post_reactions' as any).select('post_id, user_id, reaction').in('post_id', postIds),
      ]);

      // If this query errors (e.g. profiles_public is missing a column a
      // pending migration hasn't added yet), every post falls back to a
      // generic author — surface it loudly instead of silently showing the
      // same placeholder name/handle for every user.
      if (profilesRes.error) {
        console.error('Failed to load post authors — profiles_public query failed:', profilesRes.error);
      }
      const profileMap = new Map(profilesRes.data?.map((p: any) => [p.user_id, p]));
      const tally = (rows: any[] | null | undefined) => {
        const m = new Map<string, number>();
        rows?.forEach(r => m.set(r.post_id, (m.get(r.post_id) || 0) + 1));
        return m;
      };
      const likeCounts = tally(likesRes.data);
      const repostCounts = tally(repostsRes.data);
      const commentCounts = tally(commentsRes.data);
      const myLikes = new Set(myLikesRes.data?.map((r: any) => r.post_id));
      const myReposts = new Set(myRepostsRes.data?.map((r: any) => r.post_id));
      const myBookmarks = new Set(myBookmarksRes.data?.map((r: any) => r.post_id));
      const reactionMap = new Map<string, ReactionCounts>();
      const myReactionMap = new Map<string, ReactionKind>();
      reactionsRes.data?.forEach((r: any) => {
        const counts = reactionMap.get(r.post_id) || {};
        counts[r.reaction as ReactionKind] = (counts[r.reaction as ReactionKind] || 0) + 1;
        reactionMap.set(r.post_id, counts);
        if (r.user_id === user?.id) myReactionMap.set(r.post_id, r.reaction as ReactionKind);
      });

      // Fetch quoted posts in bulk
      const quotedIds = postsData.map((p: any) => p.quoted_post_id).filter(Boolean);
      let quotedMap = new Map<string, any>();
      if (quotedIds.length > 0) {
        const { data: quotedPosts } = await supabase.from('posts').select('*').in('id', quotedIds);
        if (quotedPosts) {
          const qUserIds = [...new Set(quotedPosts.map((p: any) => p.user_id))];
          const { data: qProfiles } = await supabase.from('profiles_public').select('id, user_id, full_name, handle, avatar_url, bio').in('user_id', qUserIds);
          const qProfileMap = new Map(qProfiles?.map((p: any) => [p.user_id, p]));
          quotedPosts.forEach((qp: any) => quotedMap.set(qp.id, { ...qp, author: qProfileMap.get(qp.user_id) }));
        }
      }

      // Latest 2 comments per post → inline previews (Moomoo-style)
      const previewRows = (commentsRes.data || []) as any[];
      const commentAuthorIds = [...new Set(previewRows.map(c => c.user_id))].filter(id => !profileMap.has(id));
      if (commentAuthorIds.length > 0) {
        const { data: extra } = await supabase
          .from('profiles_public').select('id, user_id, full_name, handle, avatar_url, bio').in('user_id', commentAuthorIds);
        extra?.forEach((p: any) => profileMap.set(p.user_id, p));
      }
      const previewMap = new Map<string, CommentPreview[]>();
      previewRows.forEach(c => {
        const list = previewMap.get(c.post_id) || [];
        if (list.length >= 2) return;
        const author: any = profileMap.get(c.user_id);
        list.push({
          id: c.id,
          content: c.content,
          user_id: c.user_id,
          author_name: author?.full_name || 'Investor',
          handle: author?.handle || '',
        });
        previewMap.set(c.post_id, list);
      });

      const enriched = postsData.map((post: any) => ({
        ...post,
        author: profileMap.get(post.user_id),
        likes_count: likeCounts.get(post.id) || 0,
        reposts_count: repostCounts.get(post.id) || 0,
        comments_count: commentCounts.get(post.id) || 0,
        is_liked: myLikes.has(post.id),
        is_reposted: myReposts.has(post.id),
        is_bookmarked: myBookmarks.has(post.id),
        quoted_post: post.quoted_post_id ? quotedMap.get(post.quoted_post_id) || null : null,
        reaction_counts: reactionMap.get(post.id) || {},
        my_reaction: myReactionMap.get(post.id) || null,
        comment_previews: previewMap.get(post.id) || [],
      }));


      setPosts(enriched as Post[]);
      __postsCache = enriched as Post[];
      __postsCacheKey = cacheKey;
      setError(null);
    } catch (err) {
      console.error('Error fetching posts:', err);
      setError('Failed to load posts');
    } finally {
      setLoading(false);
    }
  }, [user, cacheKey]);

  usePageRefresh(fetchPosts);
  useEffect(() => { fetchPosts(); }, [fetchPosts]);
  useEffect(() => { if (posts.length > 0) { __postsCache = posts; __postsCacheKey = cacheKey; } }, [posts, cacheKey]);

  const createPost = async (content: string, imageUrl?: string, quotedPostId?: string) => {
    if (!user) return { error: { message: 'Must be logged in' } };
    const stockMentions = content.match(/\$[A-Z]+/g)?.map(s => s.slice(1)) || [];
    const { data, error } = await supabase
      .from('posts')
      .insert({ user_id: user.id, content, image_url: imageUrl || null, stock_mentions: stockMentions.length > 0 ? stockMentions : null, quoted_post_id: quotedPostId || null } as any)
      .select().single();
    if (!error) fetchPosts();
    return { data, error };
  };

  const deletePost = async (postId: string) => {
    if (!user) return { error: { message: 'Must be logged in' } };
    const { error } = await supabase.from('posts').delete().eq('id', postId).eq('user_id', user.id);
    if (!error) setPosts(prev => prev.filter(p => p.id !== postId));
    return { error };
  };

  const likePost = async (postId: string) => {
    if (!user) return { error: { message: 'Must be logged in' } };
    const post = posts.find(p => p.id === postId);
    if (!post) return { error: { message: 'Post not found' } };
    if (post.is_liked) {
      const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id);
      if (!error) setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_liked: false, likes_count: p.likes_count - 1 } : p));
      return { error };
    } else {
      const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id });
      if (!error) setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_liked: true, likes_count: p.likes_count + 1 } : p));
      return { error };
    }
  };

  const repostPost = async (postId: string) => {
    if (!user) return { error: { message: 'Must be logged in' } };
    const post = posts.find(p => p.id === postId);
    if (!post) return { error: { message: 'Post not found' } };
    if (post.is_reposted) {
      const { error } = await supabase.from('post_reposts').delete().eq('post_id', postId).eq('user_id', user.id);
      if (!error) setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_reposted: false, reposts_count: p.reposts_count - 1 } : p));
      return { error };
    } else {
      const { error } = await supabase.from('post_reposts').insert({ post_id: postId, user_id: user.id });
      if (!error) setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_reposted: true, reposts_count: p.reposts_count + 1 } : p));
      return { error };
    }
  };

  const bookmarkPost = async (postId: string, currentlyBookmarked?: boolean) => {
    if (!user) return { error: { message: 'Must be logged in' } };
    const isBookmarked = currentlyBookmarked ?? posts.find(p => p.id === postId)?.is_bookmarked ?? false;
    if (isBookmarked) {
      const { error } = await supabase.from('post_bookmarks').delete().eq('post_id', postId).eq('user_id', user.id);
      if (!error) setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_bookmarked: false } : p));
      return { error };
    } else {
      const { error } = await supabase.from('post_bookmarks').insert({ post_id: postId, user_id: user.id });
      if (!error) setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_bookmarked: true } : p));
      return { error };
    }
  };

  const reportPost = async (postId: string, reason: string = 'unspecified') => {
    if (!user) return { error: { message: 'Must be logged in' } };
    const { error } = await supabase.from('post_reports' as any).insert({ post_id: postId, reporter_id: user.id, reason });
    return { error };
  };

  const hidePost = async (postId: string) => {
    if (!user) return { error: { message: 'Must be logged in' } };
    const { error } = await supabase.from('hidden_posts' as any).insert({ post_id: postId, user_id: user.id });
    if (!error) setPosts(prev => prev.filter(p => p.id !== postId));
    return { error };
  };

  const reactToPost = async (postId: string, reaction: ReactionKind) => {
    if (!user) return { error: { message: 'Must be logged in' } };
    const current = posts.find(p => p.id === postId)?.my_reaction;
    const query = current === reaction
      ? supabase.from('post_reactions' as any).delete().eq('post_id', postId).eq('user_id', user.id)
      : supabase.from('post_reactions' as any).upsert({ post_id: postId, user_id: user.id, reaction }, { onConflict: 'post_id,user_id' });
    const { error } = await query;
    if (!error) {
      await fetchPosts();
    } else {
      toast({ title: "Couldn't save that reaction", description: error.message, variant: "destructive" });
    }
    return { error };
  };

  const reactToComment = async (commentId: string, reaction: ReactionKind, current?: ReactionKind | null) => {
    if (!user) return { error: { message: 'Must be logged in' } };
    const { error } = current === reaction
      ? await supabase.from('comment_reactions' as any).delete().eq('comment_id', commentId).eq('user_id', user.id)
      : await supabase.from('comment_reactions' as any).upsert({ comment_id: commentId, user_id: user.id, reaction }, { onConflict: 'comment_id,user_id' });
    if (error) toast({ title: "Couldn't save that reaction", description: error.message, variant: "destructive" });
    return { error };
  };

  const fetchComments = async (postId: string): Promise<Comment[]> => {
    const { data: comments } = await supabase
      .from('post_comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
    if (!comments || comments.length === 0) return [];
    const userIds = [...new Set(comments.map((c: any) => c.user_id))];
    const commentIds = comments.map((c: any) => c.id);
    const [profilesRes, likesRes, repostsRes, myLikesRes, myRepostsRes, reactionsRes] = await Promise.all([
      supabase.from('profiles_public').select('id, user_id, full_name, handle, avatar_url, bio').in('user_id', userIds),
      supabase.from('comment_likes' as any).select('comment_id').in('comment_id', commentIds),
      supabase.from('comment_reposts' as any).select('comment_id').in('comment_id', commentIds),
      user ? supabase.from('comment_likes' as any).select('comment_id').eq('user_id', user.id).in('comment_id', commentIds) : Promise.resolve({ data: [] as any[] }),
      user ? supabase.from('comment_reposts' as any).select('comment_id').eq('user_id', user.id).in('comment_id', commentIds) : Promise.resolve({ data: [] as any[] }),
      supabase.from('comment_reactions' as any).select('comment_id, user_id, reaction').in('comment_id', commentIds),
    ]);
    const profileMap = new Map(profilesRes.data?.map((p: any) => [p.user_id, p]));
    const likeCounts = new Map<string, number>();
    likesRes.data?.forEach((r: any) => likeCounts.set(r.comment_id, (likeCounts.get(r.comment_id) || 0) + 1));
    const repostCounts = new Map<string, number>();
    repostsRes.data?.forEach((r: any) => repostCounts.set(r.comment_id, (repostCounts.get(r.comment_id) || 0) + 1));
    const myLikes = new Set(myLikesRes.data?.map((r: any) => r.comment_id));
    const myReposts = new Set(myRepostsRes.data?.map((r: any) => r.comment_id));
    const reactionMap = new Map<string, ReactionCounts>();
    const myReactionMap = new Map<string, ReactionKind>();
    reactionsRes.data?.forEach((r: any) => {
      const counts = reactionMap.get(r.comment_id) || {};
      counts[r.reaction as ReactionKind] = (counts[r.reaction as ReactionKind] || 0) + 1;
      reactionMap.set(r.comment_id, counts);
      if (r.user_id === user?.id) myReactionMap.set(r.comment_id, r.reaction as ReactionKind);
    });

    const all: Comment[] = comments.map((c: any) => ({
      ...c, author: profileMap.get(c.user_id), replies: [],
      likes_count: likeCounts.get(c.id) || 0,
      reposts_count: repostCounts.get(c.id) || 0,
      is_liked: myLikes.has(c.id),
      is_reposted: myReposts.has(c.id),
      reaction_counts: reactionMap.get(c.id) || {},
      my_reaction: myReactionMap.get(c.id) || null,
    }));
    const byId = new Map(all.map(c => [c.id, c]));
    const roots: Comment[] = [];
    all.forEach(c => {
      if (c.parent_comment_id && byId.has(c.parent_comment_id)) {
        byId.get(c.parent_comment_id)!.replies!.push(c);
      } else {
        roots.push(c);
      }
    });
    return roots;
  };

  const likeComment = async (commentId: string, currentlyLiked: boolean) => {
    if (!user) return { error: { message: 'Must be logged in' } };
    if (currentlyLiked) {
      return await supabase.from('comment_likes' as any).delete().eq('comment_id', commentId).eq('user_id', user.id);
    }
    return await supabase.from('comment_likes' as any).insert({ comment_id: commentId, user_id: user.id });
  };

  const repostComment = async (commentId: string, currentlyReposted: boolean) => {
    if (!user) return { error: { message: 'Must be logged in' } };
    if (currentlyReposted) {
      return await supabase.from('comment_reposts' as any).delete().eq('comment_id', commentId).eq('user_id', user.id);
    }
    return await supabase.from('comment_reposts' as any).insert({ comment_id: commentId, user_id: user.id });
  };

  const addComment = async (postId: string, content: string, parentCommentId?: string) => {
    if (!user) return { error: { message: 'Must be logged in' } };
    const { data, error } = await supabase
      .from('post_comments')
      .insert({ post_id: postId, user_id: user.id, content, parent_comment_id: parentCommentId || null } as any)
      .select().single();
    if (!error) {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p));
    }
    return { data, error };
  };

  const editComment = async (commentId: string, newContent: string) => {
    if (!user) return { error: { message: 'Must be logged in' } };
    const editedAt = new Date().toISOString();
    const { error } = await supabase
      .from('post_comments')
      .update({ content: newContent, edited_at: editedAt } as any)
      .eq('id', commentId).eq('user_id', user.id);
    return { error, editedAt };
  };

  /** removedCount defaults to 1 but should be the full subtree size (comment + its
   *  nested replies, see countCommentSubtree) since deleting a comment cascades to
   *  its replies in the database. */
  const deleteComment = async (commentId: string, postId: string, removedCount = 1) => {
    if (!user) return { error: { message: 'Must be logged in' } };
    const { error } = await supabase.from('post_comments').delete().eq('id', commentId).eq('user_id', user.id);
    if (!error) {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments_count: Math.max(0, (p.comments_count || 0) - removedCount) } : p));
    }
    return { error };
  };

  const getUserPosts = async (userId: string) => {
    const { data, error } = await supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    return { data, error };
  };

  const editPost = async (postId: string, newContent: string) => {
    if (!user) return { error: { message: 'Must be logged in' } };
    const post = posts.find(p => p.id === postId);
    if (!post) return { error: { message: 'Post not found' } };
    const ageMinutes = (Date.now() - new Date(post.created_at).getTime()) / 60000;
    if (ageMinutes > 30) return { error: { message: 'Posts can only be edited within 30 minutes' } };
    const stockMentions = newContent.match(/\$[A-Z]+/g)?.map(s => s.slice(1)) || [];
    const { error } = await supabase
      .from('posts')
      .update({ content: newContent, stock_mentions: stockMentions.length > 0 ? stockMentions : null, edited_at: new Date().toISOString() } as any)
      .eq('id', postId).eq('user_id', user.id);
    if (!error) {
      setPosts(prev => prev.map(p => p.id === postId
        ? { ...p, content: newContent, stock_mentions: stockMentions.length > 0 ? stockMentions : null, edited_at: new Date().toISOString() } as any
        : p));
    }
    return { error };
  };

  return {
    posts, loading, error,
    fetchPosts, createPost, deletePost, editPost,
    likePost, repostPost, bookmarkPost, reactToPost, reactToComment, reportPost, hidePost,
    fetchComments, addComment, editComment, deleteComment, getUserPosts,
    likeComment, repostComment,
  };
}
