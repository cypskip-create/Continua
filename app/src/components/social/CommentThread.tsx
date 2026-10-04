import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare, ChevronRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Comment } from "@/hooks/usePosts";
import { CommunityReactionButton, CommunityReaction, ReactionChips } from "./CommunityReactionButton";
import { atHandle, getInitials } from "@/lib/handle";
import { formatTimestamp } from "@/lib/formatTimestamp";
import { renderRichText } from "./HubPostCard";
import { useToast } from "@/hooks/use-toast";

interface NodeProps {
  comment: Comment;
  depth: number;
  onReply: (c: Comment) => void;
  onReactComment?: (commentId: string, reaction: CommunityReaction, current?: CommunityReaction | null) => Promise<any>;
  replyingToId?: string | null;
  currentUserId?: string;
  onEditSave?: (commentId: string, content: string) => Promise<{ error?: any }>;
  onDeleteComment?: (comment: Comment) => Promise<void>;
}

function CommentNode({ comment, depth, onReply, onReactComment, replyingToId, currentUserId, onEditSave, onDeleteComment }: NodeProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(depth < 1);
  const [reaction, setReaction] = useState<CommunityReaction | null>(comment.my_reaction || null);
  const [counts, setCounts] = useState(comment.reaction_counts || {});
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(comment.content);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const replies = comment.replies || [];
  const isOwn = !!currentUserId && currentUserId === comment.user_id;
  const editWindowExpired = Date.now() - new Date(comment.created_at).getTime() > 30 * 60 * 1000;

  const react = async (next: CommunityReaction) => {
    const prev = reaction;
    setReaction(prev === next ? null : next);
    setCounts(current => {
      const updated = { ...current };
      if (prev) updated[prev] = Math.max(0, (updated[prev] || 0) - 1);
      if (prev !== next) updated[next] = (updated[next] || 0) + 1;
      return updated;
    });
    await onReactComment?.(comment.id, next, prev);
  };

  const saveEdit = async () => {
    if (!onEditSave || !editDraft.trim() || editDraft === comment.content) { setIsEditing(false); setEditDraft(comment.content); return; }
    setSaving(true);
    const { error } = await onEditSave(comment.id, editDraft.trim());
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

  return (
    <div className="relative">
      <div className={`flex gap-2.5 px-4 py-3 ${replyingToId === comment.id ? "bg-primary/5" : ""}`}>
        <div className="relative shrink-0 flex flex-col items-center">
          <Avatar className="h-7 w-7 z-10 bg-background" onClick={() => navigate(`/profile/${comment.user_id}`)}>
            <AvatarImage src={comment.author?.avatar_url || ""} />
            <AvatarFallback className="bg-primary/10 text-primary text-[0.625rem] font-bold">{getInitials(comment.author?.full_name)}</AvatarFallback>
          </Avatar>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-bold text-[0.78125rem] truncate">{comment.author?.full_name || "Investor"}</span>
              <span className="text-[0.6875rem] text-muted-foreground truncate">{atHandle(comment.author as any)}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[0.6875rem] text-muted-foreground">
                {formatTimestamp(comment.created_at)}{comment.edited_at ? " · edited" : ""}
              </span>
              {isOwn && (onEditSave || onDeleteComment) && !isEditing && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" data-small-target className="p-1 -mr-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60" aria-label="Reply options">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40 rounded-xl">
                    {onEditSave && (
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
          </div>

          {isEditing ? (
            <div className="mt-1.5">
              <textarea
                autoFocus
                value={editDraft}
                onChange={e => setEditDraft(e.target.value)}
                maxLength={500}
                className="w-full min-h-[64px] text-[0.8125rem] leading-[1.55] bg-muted/40 rounded-lg p-2 outline-none resize-none border border-border/60 focus:border-primary/50"
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
            <p className="text-[0.8125rem] mt-1 leading-[1.55] break-words whitespace-pre-wrap">{renderRichText(comment.content, navigate)}</p>
          )}

          <div className="mt-1.5">
            <ReactionChips counts={counts} selected={reaction} onSelect={react} />
          </div>

          <div className="flex items-center gap-3 mt-1 -ml-1.5">
            <CommunityReactionButton compact counts={counts} selected={reaction} onSelect={react} hideTotal />
            <button
              type="button"
              data-small-target
              onClick={() => onReply(comment)}
              className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground hover:text-foreground"
            >
              <MessageSquare className="h-3.5 w-3.5" />Reply
            </button>
          </div>

          {replies.length > 0 && (
            <button
              type="button"
              data-small-target
              onClick={() => setExpanded(v => !v)}
              className="mt-2 inline-flex items-center gap-1 text-[0.75rem] font-bold text-primary"
            >
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
              {expanded ? `Hide ${replies.length} ${replies.length === 1 ? "reply" : "replies"}` : `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
            </button>
          )}
        </div>
      </div>

      {expanded && replies.length > 0 && (
        <div
          className="ml-[10px] pl-[10px] border-l"
          style={{ borderColor: `hsl(var(--foreground) / 0.13)` }}
        >
          {replies.map(r => (
            <CommentNode
              key={r.id} comment={r} depth={depth + 1} onReply={onReply} onReactComment={onReactComment}
              replyingToId={replyingToId} currentUserId={currentUserId} onEditSave={onEditSave} onDeleteComment={onDeleteComment}
            />
          ))}
        </div>
      )}

      {depth === 0 && <div className="border-b border-border/40" />}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this reply?</AlertDialogTitle>
            <AlertDialogDescription>
              {replies.length > 0
                ? `This will also delete ${replies.length === 1 ? "its 1 reply" : `its ${replies.length} replies`}. This can't be undone.`
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

export function CommentThread({
  comments, onReply, onReactComment, replyingToId, currentUserId, onEditSave, onDeleteComment,
}: {
  comments: Comment[];
  onReply: (c: Comment) => void;
  onReactComment?: (commentId: string, reaction: CommunityReaction, current?: CommunityReaction | null) => Promise<any>;
  replyingToId?: string | null;
  currentUserId?: string;
  onEditSave?: (commentId: string, content: string) => Promise<{ error?: any }>;
  onDeleteComment?: (comment: Comment) => Promise<void>;
}) {
  return (
    <div>
      {comments.map(c => (
        <CommentNode
          key={c.id} comment={c} depth={0} onReply={onReply} onReactComment={onReactComment}
          replyingToId={replyingToId} currentUserId={currentUserId} onEditSave={onEditSave} onDeleteComment={onDeleteComment}
        />
      ))}
    </div>
  );
}
