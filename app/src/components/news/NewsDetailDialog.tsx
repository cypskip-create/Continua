import { RollingNumber } from "@/components/shared/RollingNumber";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Bookmark, BookmarkCheck, Share2, MessageCircle,
  Clock, Eye, X, Send, User
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface NewsComment {
  id: string;
  user: string;
  avatar: string;
  content: string;
  time: string;
}

interface NewsArticle {
  id: number;
  title: string;
  summary: string;
  source: string;
  time: string;
  category: string;
  imageUrl: string;
  readTime?: string;
  views?: number;
  comments?: number;
  hasVideo?: boolean;
  stockMentions?: string[];
  isPremium?: boolean;
  isBreaking?: boolean;
}

interface NewsDetailDialogProps {
  article: NewsArticle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savedArticles: number[];
  onToggleSave: (id: number) => void;
}


export function NewsDetailDialog({
  article,
  open,
  onOpenChange,
  savedArticles,
  onToggleSave
}: NewsDetailDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [newComment, setNewComment] = useState("");
  const [comments, setComments] = useState<NewsComment[]>([]);
  const [showComments, setShowComments] = useState(false);

  if (!article) return null;

  const allComments = comments;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: article.title,
          text: article.summary,
          url: window.location.href
        });
      } catch (err) {
        console.log("Error sharing:", err);
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link copied to clipboard" });
    }
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    if (!user) {
      toast({ title: "Sign in to comment", variant: "destructive" });
      return;
    }

    const comment: NewsComment = {
      id: Date.now().toString(),
      user: user.email?.split('@')[0] || "User",
      avatar: (user.email?.slice(0, 2) || "U").toUpperCase(),
      content: newComment.trim(),
      time: "now"
    };

    setComments(prev => [comment, ...prev]);
    setNewComment("");
    toast({ title: "Comment added for this session",description:'This legacy preview does not publish comments to the community.' });
  };

  // A summary cannot establish quotations, analyst views or market statistics.
  const fullContent = `${article.summary}\n\nOnly the supplied summary is available here. No full article, expert quotes or additional market statistics have been inferred.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0 overflow-hidden">
        <ScrollArea className="max-h-[90vh]">
          {/* Hero Image */}
          <div className="relative">
            <img
              src={article.imageUrl}
              alt={article.title}
              className="w-full h-56 object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 bg-black/30 hover:bg-black/50 text-white"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-5 w-5" />
            </Button>
            <div className="absolute bottom-4 left-4 right-4">
              <div className="flex items-center gap-2 mb-2">
                {article.isBreaking && (
                  <Badge className="bg-red-500 text-white">BREAKING</Badge>
                )}
                {article.isPremium && (
                  <Badge className="bg-accent text-accent-foreground">PRO</Badge>
                )}
                <Badge variant="secondary" className="bg-black/50 text-white">
                  {article.category}
                </Badge>
              </div>
            </div>
          </div>

          <div className="p-4">
            {/* Title */}
            <h2 className="text-xl font-bold leading-tight mb-3">
              {article.title}
            </h2>

            {/* Meta Info */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {article.source.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{article.source}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{article.time}</span>
                    {article.readTime && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {article.readTime}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Stock Mentions */}
            {article.stockMentions && article.stockMentions.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {article.stockMentions.map((stock) => (
                  <Badge
                    key={stock}
                    variant="outline"
                    className="cursor-pointer hover:bg-primary/10"
                    onClick={() => {
                      onOpenChange(false);
                      navigate(`/stock/${stock}`);
                    }}
                  >
                    ${stock}
                  </Badge>
                ))}
              </div>
            )}

            <Separator className="my-4" />

            {/* Article Content */}
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {fullContent.split('\n\n').map((paragraph, idx) => (
                <p key={idx} className="mb-4 text-sm leading-relaxed text-foreground">
                  {paragraph}
                </p>
              ))}
            </div>

            <Separator className="my-4" />

            {/* Engagement Stats */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {article.views && (
                  <span className="flex items-center gap-1">
                    <Eye className="h-4 w-4" />
                    <RollingNumber value={(article.views / 1000).toFixed(2)} />K views
                  </span>
                )}
                <button
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                  onClick={() => setShowComments(!showComments)}
                >
                  <MessageCircle className="h-4 w-4" />
                  <RollingNumber value={allComments.length} /> comments
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 mb-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onToggleSave(article.id)}
              >
                {savedArticles.includes(article.id) ? (
                  <>
                    <BookmarkCheck className="h-4 w-4 mr-2" />
                    Saved
                  </>
                ) : (
                  <>
                    <Bookmark className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
              <Button variant="outline" className="flex-1" onClick={handleShare}>
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button
                variant={showComments ? "default" : "outline"}
                className="flex-1"
                onClick={() => setShowComments(!showComments)}
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                <RollingNumber value={allComments.length} />
              </Button>
            </div>

            {/* Comments Section */}
            {showComments && (
              <div className="border-t pt-4 space-y-4">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Comments (<RollingNumber value={allComments.length} />)
                </h3>

                {/* Add Comment */}
                <div className="flex gap-2">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 flex gap-2">
                    <Textarea
                      placeholder={user ? "Add a comment..." : "Sign in to comment"}
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="min-h-[60px] resize-none text-sm"
                      disabled={!user}
                    />
                    <Button
                      size="icon"
                      className="h-[60px]"
                      onClick={handleAddComment}
                      disabled={!newComment.trim() || !user}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Comments List */}
                <div className="space-y-3">
                  {allComments.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm py-4">
                      No comments yet. Be the first to comment!
                    </p>
                  ) : (
                    allComments.map((comment) => (
                      <div key={comment.id} className="flex gap-2">
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                            {comment.avatar}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 bg-muted/30 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{comment.user}</span>
                            <span className="text-xs text-muted-foreground">{comment.time}</span>
                          </div>
                          <p className="text-sm">{comment.content}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
