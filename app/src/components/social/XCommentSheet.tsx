import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Verified, Send, ArrowLeft, SlidersHorizontal, ChevronDown, MessageCircle, X, ChevronRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Post, Comment, usePosts } from "@/hooks/usePosts";
import { XPostCard } from "./XPostCard";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { CommunityReactionButton, CommunityReaction } from "./CommunityReactionButton";
import { ReactionKind } from "@/hooks/usePosts";

interface XCommentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: Post | null;
  currentUserId?: string;
  comments: Comment[];
  loadingComments: boolean;
  onAddComment: (content: string, parentCommentId?: string) => Promise<void>;
  onBookmark: (postId: string) => void;
  onShare: (post: Post) => void;
  onDelete?: (postId: string) => void;
  onQuote?: (post: Post, comment?: Comment) => void;
  onCommentsRefresh?: () => Promise<void>;
  onReact?: (postId: string, reaction: CommunityReaction) => void;
  onReactComment?: (commentId: string, reaction: ReactionKind, current?: ReactionKind | null) => Promise<any>;
  onEditComment?: (commentId: string, content: string) => Promise<{ error?: any }>;
  onDeleteComment?: (comment: Comment) => Promise<void>;
}

const getInitials = (name?: string | null) =>
  name ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "U";

const formatTimeAgo = (date: string) => {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

function CommentNode({
  comment, depth, onReply, onQuote, replyingTo, navigateTo, onRefresh, onReactComment, currentUserId, onEditComment, onDeleteComment,
}: {
  comment: Comment;
  depth: number;
  onReply: (c: Comment) => void;
  onQuote: (c: Comment) => void;
  replyingTo: string | null;
  navigateTo: (url: string) => void;
  onRefresh: () => Promise<void>;
  onReactComment?: (commentId: string, reaction: ReactionKind, current?: ReactionKind | null) => Promise<any>;
  currentUserId?: string;
  onEditComment?: (commentId: string, content: string) => Promise<{ error?: any }>;
  onDeleteComment?: (comment: Comment) => Promise<void>;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [reaction, setReaction] = useState(comment.my_reaction || null);
  const [reactionCounts, setReactionCounts] = useState(comment.reaction_counts || {});
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(comment.content);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const hasReplies = !!comment.replies && comment.replies.length > 0;
  const replyCount = comment.replies?.length || 0;
  const isOwn = !!currentUserId && currentUserId === comment.user_id;
  const editWindowExpired = Date.now() - new Date(comment.created_at).getTime() > 30 * 60 * 1000;

  const handleReaction = async (next: CommunityReaction) => {
    const previous = reaction;
    setReaction(previous === next ? null : next);
    setReactionCounts(counts => {
      const updated = { ...counts };
      if (previous) updated[previous] = Math.max(0, (updated[previous] || 0) - 1);
      if (previous !== next) updated[next] = (updated[next] || 0) + 1;
      return updated;
    });
    await onReactComment?.(comment.id, next, previous);
  };

  const saveEdit = async () => {
    if (!onEditComment || !editDraft.trim() || editDraft === comment.content) { setIsEditing(false); setEditDraft(comment.content); return; }
    setSaving(true);
    const { error } = await onEditComment(comment.id, editDraft.trim());
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save edit", description: error.message, variant: "destructive" });
    } else {
      setIsEditing(false);
      toast({ title: "Reply updated" });
    }
  };

  const confirmDeleteComment = async () => {
    if (!onDeleteComment) return;
    setDeleting(true);
    await onDeleteComment(comment);
    setDeleting(false);
    setConfirmDelete(false);
  };

  const renderContent = (content: string) =>
    content.split(/(\$[A-Z]+|@\w+)/g).map((part, i) => {
      if (part.startsWith("$")) {
        return (
          <span key={i} className="text-primary font-semibold cursor-pointer hover:underline" onClick={() => navigateTo(`/stock/${part.slice(1)}`)}>
            {part}
          </span>
        );
      }
      if (part.startsWith("@")) {
        return <span key={i} className="text-primary font-semibold">{part}</span>;
      }
      return part;
    });

  return (
    <div className="relative">
      <div
        className={`relative flex gap-3 px-4 py-3 hover:bg-muted/20 transition-colors ${
          replyingTo === comment.id ? "bg-primary/5" : ""
        }`}
      >
        {/* Avatar + thread spine */}
        <div className="relative shrink-0 flex flex-col items-center">
          <Avatar className="h-8 w-8 cursor-pointer relative z-10 bg-background" onClick={() => navigateTo(`/profile/${comment.user_id}`)}>
            <AvatarImage src={comment.author?.avatar_url || ""} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
              {getInitials(comment.author?.full_name)}
            </AvatarFallback>
          </Avatar>
          {hasReplies && expanded && (
            <div className="flex-1 w-px bg-border/70 mt-1" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 flex-wrap min-w-0">
              <span className="font-bold text-[0.8125rem] truncate">{comment.author?.full_name || "User"}</span>
              <Verified className="h-3 w-3 text-primary fill-primary shrink-0" />
              <span className="text-[0.6875rem] text-muted-foreground shrink-0">· {formatTimeAgo(comment.created_at)}{comment.edited_at ? " · edited" : ""}</span>
            </div>
            {isOwn && (onEditComment || onDeleteComment) && !isEditing && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" data-small-target className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 shrink-0" aria-label="Reply options" onClick={e => e.stopPropagation()}>
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 rounded-xl" onClick={e => e.stopPropagation()}>
                  {onEditComment && (
                    <DropdownMenuItem disabled={editWindowExpired} onClick={() => { setEditDraft(comment.content); setIsEditing(true); }}>
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      {editWindowExpired ? "Edit (expired)" : "Edit"}
                    </DropdownMenuItem>
                  )}
                  {onDeleteComment && (
                    <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(true)}>
                      <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {isEditing ? (
            <div className="mt-1.5" onClick={e => e.stopPropagation()}>
              <textarea
                autoFocus
                value={editDraft}
                onChange={e => setEditDraft(e.target.value)}
                maxLength={500}
                className="w-full min-h-[64px] text-[0.8125rem] leading-relaxed bg-muted/40 rounded-lg p-2 outline-none resize-none border border-border/60 focus:border-primary/50"
              />
              <div className="flex items-center justify-end gap-2 mt-1.5">
                <Button variant="ghost" size="sm" className="h-7 rounded-full text-[0.6875rem] px-3" onClick={() => { setIsEditing(false); setEditDraft(comment.content); }}>
                  Cancel
                </Button>
                <Button size="sm" className="h-7 rounded-full text-[0.6875rem] px-3" disabled={!editDraft.trim() || saving} onClick={saveEdit}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-[0.8125rem] mt-0.5 leading-relaxed break-words">{renderContent(comment.content)}</p>
          )}

          <div className="flex items-center gap-3 mt-1.5 -ml-1.5">
            <CommunityReactionButton compact counts={reactionCounts} selected={reaction} onSelect={handleReaction} />
            <button onClick={(e) => { e.stopPropagation(); onReply(comment); }} className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground hover:text-primary p-1 rounded-full" data-small-target>
              <MessageCircle className="h-3.5 w-3.5" />
              <span>Reply</span>
            </button>
          </div>

          {/* View / hide replies — YouTube/X-style curved connector when collapsed */}
          {hasReplies && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
              className="relative mt-3 inline-flex items-center gap-1.5 text-[0.75rem] font-bold text-primary hover:underline"
              data-small-target
            >
              {!expanded && (
                <span
                  aria-hidden
                  className="absolute pointer-events-none border-l border-b border-border/70 rounded-bl-[10px]"
                  style={{ left: -28, top: -18, width: 22, height: 24 }}
                />
              )}
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
              {expanded ? `Hide ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}` : `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}
            </button>
          )}
        </div>
      </div>

      {expanded && hasReplies && (
        <div className="pl-[28px] border-b-0">
          {comment.replies!.map(reply => (
            <CommentNode
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              onReply={onReply}
              onQuote={onQuote}
              replyingTo={replyingTo}
              navigateTo={navigateTo}
              onRefresh={onRefresh}
              onReactComment={onReactComment}
              currentUserId={currentUserId}
              onEditComment={onEditComment}
              onDeleteComment={onDeleteComment}
            />
          ))}
        </div>
      )}

      {/* Divider only at top-level between root comments */}
      {depth === 0 && <div className="border-b border-border/40" />}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent onClick={e => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this reply?</AlertDialogTitle>
            <AlertDialogDescription>
              {replyCount > 0
                ? `This will also delete ${replyCount === 1 ? "its 1 reply" : `its ${replyCount} replies`}. This can't be undone.`
                : "This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeleteComment}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function XCommentSheet({
  open, onOpenChange, post, currentUserId, comments, loadingComments,
  onAddComment, onBookmark, onShare, onDelete, onQuote, onCommentsRefresh, onReact, onReactComment,
  onEditComment, onDeleteComment,
}: XCommentSheetProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [sortBy, setSortBy] = useState<"latest" | "relevant">("relevant");

  const navigateTo = (url: string) => { onOpenChange(false); navigate(url); };

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    setSending(true);
    const isReply = !!replyingTo?.id;
    await onAddComment(newComment, replyingTo?.id);
    setNewComment("");
    setReplyingTo(null);
    setSending(false);
    toast({ title: isReply ? "Reply posted" : "Comment posted" });
  };

  const handleQuoteComment = (c: Comment) => {
    if (post && onQuote) {
      onOpenChange(false);
      onQuote(post, c);
    }
  };

  const totalCount = (() => {
    const count = (arr: Comment[]): number =>
      arr.reduce((sum, c) => sum + 1 + (c.replies ? count(c.replies) : 0), 0);
    return count(comments);
  })();

  const sorted = [...comments].sort((a, b) => {
    if (sortBy === "latest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return 0;
  });

  if (!post) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-screen sm:w-[95vw] h-[100dvh] sm:h-[95dvh] p-0 gap-0 sm:rounded-2xl rounded-none overflow-hidden border-0 sm:border border-border/60 [&>button]:hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 bg-card sticky top-0 z-10 shrink-0">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => onOpenChange(false)} data-small-target>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h2 className="font-bold text-base">Post</h2>
        </div>

        {/* Scrollable area */}
        <div className="flex-1 overflow-y-auto">
          <XPostCard
            post={post}
            currentUserId={currentUserId}
            onComment={() => {}}
            onBookmark={onBookmark}
            onShare={onShare}
            onDelete={onDelete}
            onReact={onReact}
            expanded
          />

          <div className="px-4 py-2.5 border-b border-border/60 flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur z-[5]">
            <span className="text-sm font-bold text-muted-foreground">
              {totalCount > 0 ? `${totalCount} ${totalCount === 1 ? "Reply" : "Replies"}` : "Replies"}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs rounded-full gap-1 px-2" data-small-target>
                  <SlidersHorizontal className="h-3 w-3" />
                  {sortBy === "latest" ? "Latest" : "Relevant"}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl">
                <DropdownMenuItem onClick={() => setSortBy("relevant")}>Relevant</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy("latest")}>Latest</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {loadingComments ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary/30 border-t-primary" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-muted-foreground">No replies yet. Start the conversation!</p>
            </div>
          ) : (
            <div className="pb-24">
              {sorted.map(c => (
                <CommentNode
                  key={c.id}
                  comment={c}
                  depth={0}
                  onReply={setReplyingTo}
                  onQuote={handleQuoteComment}
                  replyingTo={replyingTo?.id || null}
                  navigateTo={navigateTo}
                  onRefresh={async () => { if (onCommentsRefresh) await onCommentsRefresh(); }}
                  onReactComment={onReactComment}
                  currentUserId={currentUserId}
                  onEditComment={onEditComment}
                  onDeleteComment={onDeleteComment}
                />
              ))}
            </div>
          )}
        </div>

        {/* Composer */}
        {currentUserId && (
          <div className="border-t border-border/60 bg-card shrink-0">
            {replyingTo && (
              <div className="flex items-center justify-between px-4 py-2 bg-muted/40 text-[0.75rem]">
                <span className="text-muted-foreground">
                  Replying to <span className="text-primary font-semibold">@{replyingTo.author?.full_name || "user"}</span>
                </span>
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={() => setReplyingTo(null)} data-small-target>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <div className="flex items-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Input
                placeholder={replyingTo ? `Reply to ${replyingTo.author?.full_name || "user"}` : "Post your reply"}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="h-10 text-sm rounded-full bg-muted/40 border-0"
              />
              <Button
                size="icon"
                className="h-10 w-10 rounded-full shrink-0 bg-primary hover:bg-primary/90"
                onClick={handleSubmit}
                disabled={!newComment.trim() || sending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
