import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare, Bookmark, BookmarkCheck, Share2, MoreHorizontal, Trash2, Pencil, Link2, Flag, EyeOff, Verified } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Post } from "@/hooks/usePosts";
import { CommunityReactionButton, CommunityReaction } from "./CommunityReactionButton";
import { atHandle, getHandle, getInitials } from "@/lib/handle";
import { formatPostDate } from "@/lib/formatTimestamp";
import { useToast } from "@/hooks/use-toast";

export interface HubPostCardProps {
  post: Post;
  currentUserId?: string;
  isFollowing?: boolean;
  onFollow?: (userId: string) => void;
  onOpen: (post: Post) => void;
  onComment: (post: Post) => void;
  onReact: (postId: string, reaction: CommunityReaction) => void;
  onBookmark: (postId: string) => void;
  onShare: (post: Post) => void;
  onDelete?: (postId: string) => void;
  onEdit?: (post: Post) => void;
  onReport?: (postId: string) => void;
  onHide?: (postId: string) => void;
}

/** Split content into a headline + body excerpt, mirroring the reference layout. */
export function splitContent(content: string) {
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length > 1 && lines[0].length <= 120) {
    return { title: lines[0], body: lines.slice(1).join("\n") };
  }
  if (content.length > 90) {
    const cut = content.slice(0, 88);
    const at = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
    if (at > 40) return { title: content.slice(0, at + 1), body: content.slice(at + 2) };
  }
  return { title: content, body: "" };
}

export function renderRichText(text: string, navigate: (url: string) => void) {
  return text.split(/(\$[A-Z]{2,8}|#\w+|@\w+)/g).map((part, i) => {
    if (/^\$[A-Z]{2,8}$/.test(part)) {
      return (
        <span key={i} className="text-primary font-semibold" onClick={e => { e.stopPropagation(); navigate(`/stock/${part.slice(1)}`); }}>
          {part}
        </span>
      );
    }
    if (part.startsWith("#")) {
      return (
        <span key={i} className="text-primary" onClick={e => { e.stopPropagation(); navigate(`/traders-hub?search=${encodeURIComponent(part)}`); }}>
          {part}
        </span>
      );
    }
    if (part.startsWith("@")) {
      return <span key={i} className="text-primary font-medium">{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}

export function HubPostCard({
  post, currentUserId, isFollowing, onFollow, onOpen, onComment,
  onReact, onBookmark, onShare, onDelete, onEdit, onReport, onHide,
}: HubPostCardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const author = post.author;
  const handle = getHandle(author ? { ...author } : { user_id: post.user_id });
  const isOwn = currentUserId === post.user_id;
  const { title, body } = splitContent(post.content);
  const topic = post.content.match(/#\w+/)?.[0] || (post.stock_mentions?.[0] ? `$${post.stock_mentions[0]}` : null);
  const canEdit = isOwn && !!onEdit && Date.now() - new Date(post.created_at).getTime() < 30 * 60 * 1000;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/traders-hub/post/${post.id}`);
      toast({ title: "Link copied" });
    } catch { /* clipboard unavailable */ }
  };

  return (
    <article
      className="px-4 pt-3.5 pb-2.5 border-b border-border/50 transition-colors"
    >
      {/* Identity row */}
      <div className="flex items-start gap-2.5">
        <Avatar
          className="h-9 w-9 shrink-0"
          onClick={e => { e.stopPropagation(); navigate(`/profile/${post.user_id}`); }}
        >
          <AvatarImage src={author?.avatar_url || ""} className="object-cover" />
          <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-bold">{getInitials(author?.full_name)}</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <span className="font-bold text-[13px] truncate max-w-[45%]">{author?.full_name || "Investor"}</span>
            <Verified className="h-3 w-3 text-primary fill-primary shrink-0" />
            <span className="text-[12px] text-muted-foreground truncate">{atHandle({ handle })}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {formatPostDate(post.created_at)}
            {post.edited_at ? " · edited" : ""}
          </p>
        </div>

        {/* Follow lives on the far right and disappears once following */}
        {!isOwn && onFollow && !isFollowing && (
          <button
            type="button"
            data-small-target
            onClick={e => { e.stopPropagation(); onFollow(post.user_id); }}
            className="shrink-0 h-7 px-2.5 rounded-full text-[12px] font-bold text-primary hover:bg-primary/10 transition-colors"
          >
            + Follow
          </button>
        )}
      </div>

      {/* Body */}
      <div className="mt-2">
        <h3 className="text-[15px] font-bold leading-snug break-words">{renderRichText(title, navigate)}</h3>
        {body && (
          <p className="mt-1 text-[13px] leading-[1.55] text-muted-foreground line-clamp-3 whitespace-pre-wrap break-words">
            {renderRichText(body, navigate)}
          </p>
        )}
      </div>

      {/* Media */}
      {post.image_url && (
        <div className="mt-2.5 rounded-xl overflow-hidden bg-muted/40">
          <img src={post.image_url} alt="Post attachment" loading="lazy" className="w-full max-h-[260px] object-cover" />
        </div>
      )}

      {/* Quoted post */}
      {post.quoted_post && (
        <div
          className="mt-2.5 rounded-xl border border-border/60 p-2.5"
          onClick={e => { e.stopPropagation(); navigate(`/traders-hub/post/${post.quoted_post!.id}`); }}
        >
          <div className="flex items-center gap-1.5 text-[11px]">
            <Avatar className="h-4 w-4"><AvatarImage src={post.quoted_post.author?.avatar_url || ""} /><AvatarFallback className="text-[8px]">{getInitials(post.quoted_post.author?.full_name)}</AvatarFallback></Avatar>
            <span className="font-bold truncate">{post.quoted_post.author?.full_name || "Investor"}</span>
            <span className="text-muted-foreground">{atHandle(post.quoted_post.author as any)}</span>
          </div>
          <p className="text-[12px] mt-1 line-clamp-3 text-muted-foreground">{post.quoted_post.content}</p>
        </div>
      )}

      {/* Topic pill */}
      {topic && (
        <button
          type="button"
          data-small-target
          onClick={e => { e.stopPropagation(); navigate(`/traders-hub?search=${encodeURIComponent(topic)}`); }}
          className="mt-2.5 w-full flex items-center gap-2 h-9 px-3 rounded-lg bg-muted/40 text-[12px] text-left"
        >
          <span className="text-primary font-bold">{topic.startsWith("#") ? "#" : "$"}</span>
          <span className="truncate text-muted-foreground">{topic.replace(/^[#$]/, "")} discussion</span>
        </button>
      )}

      {/* Action row */}
      <div className="mt-2 flex items-center justify-between">
        <CommunityReactionButton
          counts={post.reaction_counts || {}}
          selected={post.my_reaction}
          onSelect={r => onReact(post.id, r)}
        />
        <button
          type="button"
          data-small-target
          onClick={e => { e.stopPropagation(); onComment(post); }}
          className="flex items-center gap-1.5 h-8 px-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageSquare className="h-[17px] w-[17px]" />
          <span className="text-[11px] font-medium tabular-nums">{post.comments_count || 0}</span>
        </button>
        <button
          type="button"
          data-small-target
          onClick={e => { e.stopPropagation(); onShare(post); }}
          className="flex items-center gap-1.5 h-8 px-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Share2 className="h-[17px] w-[17px]" />
        </button>
        <button
          type="button"
          data-small-target
          aria-label="Bookmark post"
          onClick={e => { e.stopPropagation(); onBookmark(post.id); }}
          className={`flex items-center h-8 px-1.5 transition-colors ${post.is_bookmarked ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          {post.is_bookmarked ? <BookmarkCheck className="h-[17px] w-[17px]" /> : <Bookmark className="h-[17px] w-[17px]" />}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" data-small-target aria-label="More options">
              <MoreHorizontal className="h-[17px] w-[17px]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-xl">
            {isOwn ? (
              <>
                {canEdit && <DropdownMenuItem onClick={e => { e.stopPropagation(); onEdit?.(post); }}><Pencil className="h-4 w-4 mr-2" />Edit post</DropdownMenuItem>}
                {onDelete && <DropdownMenuItem className="text-destructive" onClick={e => { e.stopPropagation(); onDelete(post.id); }}><Trash2 className="h-4 w-4 mr-2" />Delete post</DropdownMenuItem>}
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem onClick={e => { e.stopPropagation(); copyLink(); }}><Link2 className="h-4 w-4 mr-2" />Copy link</DropdownMenuItem>
            {!isOwn && (
              <>
                <DropdownMenuItem onClick={e => { e.stopPropagation(); onHide?.(post.id); toast({ title: "Not interested", description: "You'll see fewer posts like this." }); }}>
                  <EyeOff className="h-4 w-4 mr-2" />Not interested
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={e => { e.stopPropagation(); onReport?.(post.id); toast({ title: "Reported", description: "Our team will review this post." }); }}>
                  <Flag className="h-4 w-4 mr-2" />Report post
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Comment preview */}
      {post.comment_previews && post.comment_previews.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {post.comment_previews.map(c => (
            <p key={c.id} className="text-[12px] leading-snug truncate">
              <span className="font-bold">{c.author_name}</span>
              <span className="text-muted-foreground">: {c.content}</span>
            </p>
          ))}
          {post.comments_count > post.comment_previews.length && (
            <button
              type="button"
              data-small-target
              onClick={e => { e.stopPropagation(); onComment(post); }}
              className="text-[12px] text-muted-foreground"
            >
              View more comments...
            </button>
          )}
        </div>
      )}
    </article>
  );
}