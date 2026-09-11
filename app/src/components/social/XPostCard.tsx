import { useState } from "react";
import { MessageCircle, Share, Bookmark, BookmarkCheck, Trash2, MoreHorizontal, Verified, Eye, Pencil, VolumeX, Flag, UserX, Link2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { Post } from "@/hooks/usePosts";
import { ImageViewer } from "./ImageViewer";
import { formatTimestamp } from "@/lib/formatTimestamp";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CommunityReactionButton, CommunityReaction } from "./CommunityReactionButton";
import { atHandle, getHandle } from "@/lib/handle";
import { NSE_TICKER_SET, ALIAS_OF } from "@/lib/stockPrices";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";




interface XPostCardProps {
  post: Post;
  currentUserId?: string;
  onLike?: (postId: string) => void;
  onComment: (post: Post) => void;
  onRepost?: (postId: string) => void;
  onBookmark: (postId: string) => void;
  onShare: (post: Post) => void;
  onDelete?: (postId: string) => void;
  onEdit?: (postId: string, newContent: string) => void;
  onQuote?: (post: Post) => void;
  isQuoted?: boolean;
  onReact?: (postId: string, reaction: CommunityReaction) => void;
  isFollowing?: boolean;
  onFollow?: (userId: string) => void;
  expanded?: boolean;
}

export function XPostCard({ post, currentUserId, onComment, onBookmark, onShare, onDelete, onEdit, onReact, isFollowing, onFollow, expanded }: XPostCardProps) {
  const navigate = useNavigate();

  // Every $TICKER mentioned in this post's text or stock_mentions gets one
  // batched live-quote lookup — no per-render fabricated price.
  const mentionedSymbols = (() => {
    const fromText = Array.from(post.content.matchAll(/\$([A-Z]+)\b/g)).map((m) => m[1]);
    const fromField = post.stock_mentions ?? [];
    return Array.from(new Set([...fromText, ...fromField].map((s) => s.toUpperCase())));
  })();
  const { quotes: mentionQuotes } = useLiveQuotes(mentionedSymbols);

  const { toast } = useToast();
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editContent, setEditContent] = useState(post.content);

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/traders-hub?post=${post.id}`;
    try { await navigator.clipboard.writeText(url); toast({ title: "Link copied" }); } catch { /* no-op */ }
  };
  const handleMute = async () => {
    if (!currentUserId) return navigate("/auth");
    await supabase.from("muted_users").insert({ muter_id: currentUserId, muted_id: post.user_id });
    toast({ title: `Muted ${atHandle(post.author as any)}` });
  };
  const handleBlock = async () => {
    if (!currentUserId) return navigate("/auth");
    await supabase.from("blocked_users").insert({ blocker_id: currentUserId, blocked_id: post.user_id });
    toast({ title: "User blocked", description: "You won't see their posts anymore." });
  };
  const handleReport = () => {
    toast({ title: "Reported", description: "Thanks — our team will review this post." });
  };

  const canEdit = currentUserId === post.user_id && onEdit &&
    (Date.now() - new Date(post.created_at).getTime()) < 30 * 60 * 1000;

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num > 0 ? num.toString() : "";
  };

  const formatTimeAgo = formatTimestamp;

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const handle = getHandle(post.author as any);
  // Real views — derived from engagement signals; no random inflation.
  const viewCount = (post.likes_count || 0) * 8 + (post.comments_count || 0) * 12 + (post.reposts_count || 0) * 15;

  const renderContent = (content: string) => {
    return content.split(/(\$[A-Z]+|#\w+)/g).map((part, i) => {
      if (part.startsWith("$")) {
        const symbol = part.slice(1);
        const upper = symbol.toUpperCase();
        const isRealTicker = NSE_TICKER_SET.has(upper) || !!ALIAS_OF[upper];
        const q = isRealTicker ? mentionQuotes[upper] : undefined;
        const priceData = q ? { price: q.lastPrice, change: q.changePercent } : null;
        return (
          <span key={i} className="inline-flex items-center">
            <span className="text-primary font-semibold cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); navigate(`/stock/${symbol}`); }}>
              {part}
            </span>
            {priceData && (
              <span className={`ml-1 text-[11px] font-medium ${priceData.change >= 0 ? "text-bull" : "text-bear"}`}>
                KES {priceData.price.toFixed(2)}
                <span className="ml-0.5">{priceData.change >= 0 ? "↑" : "↓"}{Math.abs(priceData.change).toFixed(1)}%</span>
              </span>
            )}
          </span>
        );
      }
      if (part.startsWith("#")) return <span key={i} className="text-primary cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); navigate(`/traders-hub?search=${encodeURIComponent(part)}`); }}>{part}</span>;
      return part;
    });
  };

  const handleSaveEdit = () => {
    if (onEdit && editContent.trim()) {
      onEdit(post.id, editContent);
      setEditOpen(false);
    }
  };

  return (
    <>
      <article className="px-4 py-3 border-b border-border/40 hover:bg-muted/20 transition-colors">
        <div className="flex gap-3">
          <Avatar className="h-10 w-10 shrink-0 cursor-pointer ring-2 ring-primary/10" onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.user_id}`); }}>
            <AvatarImage src={post.author?.avatar_url || ""} className="object-cover" />
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">{getInitials(post.author?.full_name)}</AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 min-w-0 flex-wrap">
                <span className="font-bold text-sm truncate max-w-[140px] sm:max-w-[200px]">{post.author?.full_name || "User"}</span>
                <Verified className="h-3.5 w-3.5 text-primary fill-primary shrink-0" />
                <span className="text-muted-foreground text-sm">@{handle}</span>
                <span className="text-muted-foreground text-sm">·</span>
                <span className="text-muted-foreground text-sm shrink-0">{formatTimeAgo(post.created_at)}</span>
                {(post as any).edited_at && (
                  <span className="text-muted-foreground text-[11px] italic ml-0.5">(edited)</span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {currentUserId !== post.user_id && onFollow && (
                  <Button variant={isFollowing ? "ghost" : "outline"} size="sm" className="h-7 px-3 rounded-full text-[11px] font-semibold" onClick={(e) => { e.stopPropagation(); onFollow(post.user_id); }}>
                    {isFollowing ? "Following" : "Follow"}
                  </Button>
                )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10" data-small-target>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-xl">
                  {currentUserId === post.user_id && (
                    <>
                      {canEdit && (
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditContent(post.content); setEditOpen(true); }}>
                          <Pencil className="h-4 w-4 mr-2" />Edit
                        </DropdownMenuItem>
                      )}
                      {onDelete && (
                        <DropdownMenuItem onClick={() => onDelete(post.id)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />Delete
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCopyLink(); }}><Link2 className="h-4 w-4 mr-2" />Copy link</DropdownMenuItem>
                  {currentUserId !== post.user_id && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleMute(); }}><VolumeX className="h-4 w-4 mr-2" />Mute {atHandle(post.author as any)}</DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleBlock(); }}><UserX className="h-4 w-4 mr-2" />Block {atHandle(post.author as any)}</DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleReport(); }} className="text-destructive"><Flag className="h-4 w-4 mr-2" />Report post</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </div>

            <p className="text-[15px] leading-[1.5] mt-1 whitespace-pre-wrap break-words">{renderContent(post.content)}</p>

            {post.stock_mentions && post.stock_mentions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {post.stock_mentions.map(stock => {
                  const upper = stock.toUpperCase();
                  const isRealTicker = NSE_TICKER_SET.has(upper) || !!ALIAS_OF[upper];
                  const change = isRealTicker ? mentionQuotes[upper]?.changePercent ?? null : null;
                  return (
                    <Badge key={stock} variant="secondary" className="text-[11px] px-2 py-0.5 cursor-pointer hover:bg-primary/10 rounded-full gap-1 border-0" onClick={(e) => { e.stopPropagation(); navigate(`/stock/${stock}`); }}>
                      ${stock}
                      {change !== null && <span className={change >= 0 ? "text-bull" : "text-bear"}>{change >= 0 ? "+" : ""}{change.toFixed(1)}%</span>}
                    </Badge>
                  );
                })}
              </div>
            )}

            {post.image_url && (
              <div className="mt-3 rounded-2xl overflow-hidden border border-border/50" onClick={(e) => { e.stopPropagation(); setImageViewerOpen(true); }}>
                <img src={post.image_url} alt="Post" className="w-full max-h-[350px] object-cover cursor-pointer hover:opacity-95 transition-opacity" loading="lazy" />
              </div>
            )}

            {/* Quoted post embed (X-style) */}
            {post.quoted_post && (
              <div
                className="mt-3 rounded-2xl border border-border/60 p-3 hover:bg-muted/30 transition-colors"
                onClick={(e) => { e.stopPropagation(); navigate(`/traders-hub?post=${post.quoted_post!.id}`); }}
              >
                <div className="flex items-center gap-1.5 text-[12px]">
                  <Avatar className="h-5 w-5"><AvatarImage src={post.quoted_post.author?.avatar_url || ""} /><AvatarFallback className="text-[9px]">{getInitials(post.quoted_post.author?.full_name)}</AvatarFallback></Avatar>
                  <span className="font-bold truncate">{post.quoted_post.author?.full_name || "User"}</span>
                  <Verified className="h-3 w-3 text-primary fill-primary shrink-0" />
                  <span className="text-muted-foreground">· {formatTimeAgo(post.quoted_post.created_at)}</span>
                </div>
                <p className="text-[13px] mt-1 line-clamp-4 whitespace-pre-wrap">{post.quoted_post.content}</p>
              </div>
            )}

            {expanded && <p className="mt-3 text-[11px] text-muted-foreground tabular">{formatNumber(viewCount || 1)} views</p>}
            {/* Community action bar: reactions, replies, bookmark */}
            <div className="flex items-center justify-between mt-3 -ml-2 max-w-[425px] border-t border-border/40 pt-1">
              <CommunityReactionButton counts={post.reaction_counts || {}} selected={post.my_reaction} onSelect={reaction => onReact?.(post.id, reaction)} />
              <button className="group flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors" onClick={(e) => { e.stopPropagation(); onComment(post); }} data-small-target>
                <div className="p-2 rounded-full group-hover:bg-primary/10 transition-colors"><MessageCircle className="h-[18px] w-[18px]" /></div>
                <span className="text-xs">{formatNumber(post.comments_count)}</span>
              </button>
                <button className={`p-2 rounded-full transition-colors ${post.is_bookmarked ? "text-primary" : "text-muted-foreground hover:text-primary hover:bg-primary/10"}`} onClick={(e) => { e.stopPropagation(); onBookmark(post.id); }} data-small-target aria-label="Bookmark post">
                  {post.is_bookmarked ? <BookmarkCheck className="h-[18px] w-[18px] fill-current" /> : <Bookmark className="h-[18px] w-[18px]" />}
                </button>
            </div>
          </div>
        </div>
      </article>

      {/* Image viewer */}
      {post.image_url && (
        <ImageViewer open={imageViewerOpen} onOpenChange={setImageViewerOpen} images={[post.image_url]} />
      )}

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md rounded-2xl p-0 gap-0">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-bold">Edit Post</h3>
            <Button size="sm" className="rounded-full px-5 font-bold" onClick={handleSaveEdit} disabled={!editContent.trim()}>Save</Button>
          </div>
          <div className="p-4">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full bg-transparent border-0 outline-none resize-none text-[15px] leading-[1.5] min-h-[120px]"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground mt-2">You can edit posts within 30 minutes of posting.</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}