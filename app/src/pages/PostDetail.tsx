import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { navigateBack } from "@/lib/navigation";
import { ArrowLeft, Search, MoreHorizontal, Send, X, Bookmark, BookmarkCheck, Share2, MessageSquare, Verified, SlidersHorizontal, ChevronDown, Trash2, Link2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFollows } from "@/hooks/useFollows";
import { useToast } from "@/hooks/use-toast";
import { usePosts, Post, Comment, updateCommentInTree, removeCommentFromTree, countCommentSubtree } from "@/hooks/usePosts";
import { CommentThread } from "@/components/social/CommentThread";
import { CommunityReactionButton, CommunityReaction, ReactionChips } from "@/components/social/CommunityReactionButton";
import { atHandle, getInitials } from "@/lib/handle";
import { shareLink } from "@/lib/share";
import { renderRichText, splitContent } from "@/components/social/HubPostCard";
import { formatTimestamp } from "@/lib/formatTimestamp";
import { ImageViewer } from "@/components/social/ImageViewer";

export default function PostDetail() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { isFollowing, toggleFollow } = useFollows();
  const { posts, fetchComments, addComment, editComment, deleteComment, bookmarkPost, reactToPost, reactToComment, deletePost } = usePosts();

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sortBy, setSortBy] = useState<"relevant" | "latest">("relevant");
  const [viewerOpen, setViewerOpen] = useState(false);

  const cached = useMemo(() => posts.find(p => p.id === postId) || null, [posts, postId]);

  const loadPost = useCallback(async () => {
    if (!postId) return;
    if (cached) { setPost(cached); return; }
    const { data } = await supabase.from("posts").select("*").eq("id", postId).maybeSingle();
    if (!data) { setPost(null); return; }
    const [{ data: author }, { data: reactions }, { count: commentCount }, { data: bookmark }] = await Promise.all([
      supabase.from("profiles_public").select("id, user_id, full_name, handle, avatar_url, bio").eq("user_id", data.user_id).maybeSingle(),
      supabase.from("post_reactions").select("user_id, reaction").eq("post_id", postId),
      supabase.from("post_comments").select("id", { count: "exact", head: true }).eq("post_id", postId),
      user ? supabase.from("post_bookmarks").select("id").eq("post_id", postId).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const counts: Record<string, number> = {};
    let mine: CommunityReaction | null = null;
    reactions?.forEach((r: any) => {
      counts[r.reaction] = (counts[r.reaction] || 0) + 1;
      if (r.user_id === user?.id) mine = r.reaction;
    });
    setPost({
      ...(data as any),
      author: author as any,
      likes_count: 0, reposts_count: 0,
      comments_count: commentCount || 0,
      is_liked: false, is_reposted: false, is_bookmarked: !!bookmark,
      reaction_counts: counts as any, my_reaction: mine,
    });
  }, [postId, cached, user]);

  useEffect(() => { loadPost(); }, [loadPost]);

  const refreshComments = useCallback(async () => {
    if (!postId) return;
    setLoadingComments(true);
    setComments(await fetchComments(postId));
    setLoadingComments(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  useEffect(() => { refreshComments(); }, [refreshComments]);

  const totalComments = useMemo(() => {
    const count = (arr: Comment[]): number => arr.reduce((s, c) => s + 1 + (c.replies ? count(c.replies) : 0), 0);
    return count(comments);
  }, [comments]);

  const viewCount = post
    ? Math.max(1, (post.comments_count || 0) * 24 + Object.values(post.reaction_counts || {}).reduce((s, n) => s + (n || 0), 0) * 11 + 37)
    : 0;

  const submit = async () => {
    if (!draft.trim() || !post) return;
    if (!user) { navigate("/auth"); return; }
    setSending(true);
    const isReply = !!replyingTo?.id;
    const { error } = await addComment(post.id, draft.trim(), replyingTo?.id);
    if (!error) {
      setDraft("");
      setReplyingTo(null);
      await refreshComments();
      setPost(p => p ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p);
      toast({ title: isReply ? "Reply posted" : "Comment posted" });
    }
    setSending(false);
  };

  const handleEditComment = useCallback(async (commentId: string, content: string) => {
    const { error, editedAt } = await editComment(commentId, content);
    if (!error) {
      setComments(prev => updateCommentInTree(prev, commentId, c => ({ ...c, content, edited_at: editedAt })));
    }
    return { error };
  }, [editComment]);

  const handleDeleteComment = useCallback(async (comment: Comment) => {
    const removedCount = countCommentSubtree(comment);
    const { error } = await deleteComment(comment.id, post?.id || "", removedCount);
    if (!error) {
      setComments(prev => removeCommentFromTree(prev, comment.id).tree);
      setPost(p => p ? { ...p, comments_count: Math.max(0, (p.comments_count || 0) - removedCount) } : p);
      toast({ title: "Reply deleted" });
    } else {
      toast({ title: "Couldn't delete reply", description: error.message, variant: "destructive" });
    }
  }, [deleteComment, post?.id, toast]);

  const react = async (reaction: CommunityReaction) => {
    if (!user || !post) { navigate("/auth"); return; }
    const prev = post.my_reaction;
    setPost(p => {
      if (!p) return p;
      const counts: any = { ...(p.reaction_counts || {}) };
      if (prev) counts[prev] = Math.max(0, (counts[prev] || 0) - 1);
      const next = prev === reaction ? null : reaction;
      if (next) counts[next] = (counts[next] || 0) + 1;
      return { ...p, reaction_counts: counts, my_reaction: next };
    });
    await reactToPost(post.id, reaction);
  };

  const bookmark = async () => {
    if (!user || !post) { navigate("/auth"); return; }
    const wasBookmarked = !!post.is_bookmarked;
    setPost(p => p ? { ...p, is_bookmarked: !p.is_bookmarked } : p);
    await bookmarkPost(post.id, wasBookmarked);
    toast({ title: wasBookmarked ? "Removed from bookmarks" : "Saved to bookmarks" });
  };

  const share = async () => {
    const url = `${window.location.origin}/traders-hub/post/${postId}`;
    const result = await shareLink(url, { title: "Continua TradersHub", text: post?.content?.slice(0, 120) });
    if (result.method === "clipboard") toast({ title: "Link copied" });
    else if (result.method === "failed") toast({ title: "Couldn't share this post", variant: "destructive" });
  };

  if (!post) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 flex items-center gap-3 px-3 py-2.5 border-b border-border/60 bg-background/95 backdrop-blur-xl">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigateBack(navigate, "/traders-hub")}><ArrowLeft className="h-5 w-5" /></Button>
          <h1 className="text-sm font-bold">Post</h1>
        </header>
        <p className="p-10 text-center text-sm text-muted-foreground">This post is no longer available.</p>
      </div>
    );
  }

  const { title, body } = splitContent(post.content);
  const following = isFollowing(post.user_id);
  const sorted = sortBy === "latest"
    ? [...comments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    : comments;

  return (
    <div className="min-h-screen bg-background flex flex-col pb-[76px]">
      {/* Detail header — back, author identity, search, overflow */}
      <header className="sticky top-0 z-40 flex items-center gap-2 px-2 py-2 border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigateBack(navigate, "/traders-hub")} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <button className="flex items-center gap-2 min-w-0 flex-1" onClick={() => navigate(`/profile/${post.user_id}`)}>
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={post.author?.avatar_url || ""} className="object-cover" />
            <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">{getInitials(post.author?.full_name)}</AvatarFallback>
          </Avatar>
          <span className="text-[13px] font-bold truncate">{post.author?.full_name || "Investor"}</span>
          <Verified className="h-3 w-3 text-primary fill-primary shrink-0" />
        </button>
        {!following && user?.id !== post.user_id && (
          <button
            data-small-target
            onClick={() => toggleFollow(post.user_id)}
            className="h-7 px-2.5 rounded-full text-[12px] font-bold text-primary hover:bg-primary/10"
          >
            + Follow
          </button>
        )}
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Search" onClick={() => navigate("/traders-hub?focus=search")}>
          <Search className="h-[18px] w-[18px]" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="More"><MoreHorizontal className="h-[18px] w-[18px]" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 rounded-xl">
            <DropdownMenuItem onClick={share}><Link2 className="h-4 w-4 mr-2" />Share post</DropdownMenuItem>
            {user?.id === post.user_id && (
              <DropdownMenuItem className="text-destructive" onClick={async () => { await deletePost(post.id); navigate("/traders-hub"); }}>
                <Trash2 className="h-4 w-4 mr-2" />Delete post
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="flex-1">
        {/* Full post */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-2.5">
            <Avatar className="h-9 w-9" onClick={() => navigate(`/profile/${post.user_id}`)}>
              <AvatarImage src={post.author?.avatar_url || ""} className="object-cover" />
              <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-bold">{getInitials(post.author?.full_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-bold text-[13px] truncate">{post.author?.full_name || "Investor"}</span>
                <span className="text-[12px] text-muted-foreground">{atHandle(post.author as any)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">{formatTimestamp(post.created_at)}{post.edited_at ? " · edited" : ""}</p>
            </div>
          </div>

          <h1 className="mt-3 text-[17px] font-bold leading-snug break-words">{renderRichText(title, navigate)}</h1>
          {body && <p className="mt-2 text-[13.5px] leading-[1.6] whitespace-pre-wrap break-words">{renderRichText(body, navigate)}</p>}

          {post.image_url && (
            <button className="mt-3 block w-full rounded-xl overflow-hidden bg-muted/40" onClick={() => setViewerOpen(true)}>
              <img src={post.image_url} alt="Post attachment" className="w-full max-h-[380px] object-cover" />
            </button>
          )}

          {post.stock_mentions && post.stock_mentions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {post.stock_mentions.map(s => (
                <button key={s} data-small-target onClick={() => navigate(`/stock/${s}`)} className="h-7 px-2.5 rounded-full bg-muted/50 text-[11px] font-semibold text-primary">
                  ${s}
                </button>
              ))}
            </div>
          )}

          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Disclaimer: Continua provides this content for information and educational use only. It is not investment advice.
          </p>

          <div className="mt-3">
            <ReactionChips counts={post.reaction_counts || {}} selected={post.my_reaction} onSelect={react} />
          </div>

          <p className="mt-3 text-right text-[11px] text-muted-foreground tabular-nums">
            {post.comments_count || 0} Comments · {viewCount.toLocaleString()} Views
          </p>
        </div>

        {/* Comments */}
        <div className="border-t-4 border-muted/40">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-[14px] font-bold">Comments ({totalComments})</h2>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1" data-small-target>
                  <SlidersHorizontal className="h-3 w-3" />{sortBy === "latest" ? "Latest" : "Relevant"}<ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl">
                <DropdownMenuItem onClick={() => setSortBy("relevant")}>Relevant</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy("latest")}>Latest</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {loadingComments ? (
            <div className="flex justify-center py-10"><div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" /></div>
          ) : sorted.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-muted-foreground">No comments yet. Start the discussion.</p>
          ) : (
            <CommentThread
              comments={sorted} onReply={setReplyingTo} onReactComment={reactToComment as any} replyingToId={replyingTo?.id}
              currentUserId={user?.id} onEditSave={handleEditComment} onDeleteComment={handleDeleteComment}
            />
          )}
        </div>
      </div>

      {/* Sticky composer + engagement rail */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/97 backdrop-blur-xl">
        {replyingTo && (
          <div className="flex items-center justify-between px-4 py-1.5 bg-muted/40 text-[11px]">
            <span className="text-muted-foreground truncate">Replying to <span className="text-primary font-semibold">{atHandle(replyingTo.author as any)}</span></span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReplyingTo(null)} data-small-target><X className="h-3.5 w-3.5" /></Button>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-2" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
          <Input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder={replyingTo ? `Reply to ${replyingTo.author?.full_name || "investor"}` : "Say something"}
            className="h-9 flex-1 rounded-full bg-muted/50 border-0 text-[13px]"
          />
          {draft.trim() ? (
            <Button size="icon" className="h-9 w-9 rounded-full shrink-0" onClick={submit} disabled={sending} aria-label="Send comment">
              <Send className="h-4 w-4" />
            </Button>
          ) : (
            <div className="flex items-center gap-1 shrink-0">
              <CommunityReactionButton counts={post.reaction_counts || {}} selected={post.my_reaction} onSelect={react} />
              <button data-small-target aria-label="Comments" className="flex items-center gap-1 h-9 px-1.5 text-muted-foreground">
                <MessageSquare className="h-[17px] w-[17px]" />
                <span className="text-[11px] tabular-nums">{post.comments_count || 0}</span>
              </button>
              <button data-small-target aria-label="Share" onClick={share} className="h-9 px-1.5 text-muted-foreground"><Share2 className="h-[17px] w-[17px]" /></button>
              <button data-small-target aria-label="Bookmark" onClick={bookmark} className={`h-9 px-1.5 ${post.is_bookmarked ? "text-primary" : "text-muted-foreground"}`}>
                {post.is_bookmarked ? <BookmarkCheck className="h-[17px] w-[17px]" /> : <Bookmark className="h-[17px] w-[17px]" />}
              </button>
            </div>
          )}
        </div>
      </div>

      {post.image_url && <ImageViewer open={viewerOpen} onOpenChange={setViewerOpen} images={[post.image_url]} />}
    </div>
  );
}
