import { PostAttachments } from "./PostAttachments";
import { Heart, MessageCircle, Repeat2, Share, Bookmark, BookmarkCheck, Trash2, MoreHorizontal, Verified } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { Post } from "@/hooks/usePosts";

interface MoomooPostCardProps {
  post: Post;
  currentUserId?: string;
  onLike: (postId: string) => void;
  onComment: (post: Post) => void;
  onRepost: (postId: string) => void;
  onBookmark: (postId: string) => void;
  onShare: (post: Post) => void;
  onDelete?: (postId: string) => void;
}

export function MoomooPostCard({
  post,
  currentUserId,
  onLike,
  onComment,
  onRepost,
  onBookmark,
  onShare,
  onDelete,
}: MoomooPostCardProps) {
  const navigate = useNavigate();

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  const formatTimeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const renderPostContent = (content: string) => {
    return content.split(/(\$[A-Z]+|#\w+)/g).map((part, i) => {
      if (part.startsWith('$')) {
        return (
          <span 
            key={i} 
            className="text-primary font-medium cursor-pointer hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/stock/${part.slice(1)}`);
            }}
          >
            {part}
          </span>
        );
      } else if (part.startsWith('#')) {
        return (
          <span 
            key={i} 
            className="text-primary cursor-pointer hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/traders-hub?search=${encodeURIComponent(part)}`);
            }}
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <Card className="border-0 border-b border-border rounded-none bg-transparent hover:bg-muted/20 transition-colors">
      <CardContent className="p-3 sm:p-4">
        <div className="flex gap-3">
          {/* Avatar */}
          <Avatar 
            className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 cursor-pointer ring-2 ring-background"
            onClick={() => navigate(`/profile/${post.user_id}`)}
          >
            <AvatarImage src={post.author?.avatar_url || ""} className="object-cover" />
            <AvatarFallback className="bg-gradient-primary text-primary-foreground text-sm font-bold">
              {getInitials(post.author?.full_name)}
            </AvatarFallback>
          </Avatar>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div 
                className="flex items-center gap-1 flex-wrap cursor-pointer min-w-0"
                onClick={() => navigate(`/profile/${post.user_id}`)}
              >
                <span className="font-semibold text-sm truncate max-w-[120px] sm:max-w-[180px]">
                  {post.author?.full_name || 'User'}
                </span>
                <Verified className="h-3.5 w-3.5 text-primary fill-primary shrink-0" />
                <span className="text-xs text-muted-foreground">· {formatTimeAgo(post.created_at)}</span>
              </div>

              {/* More Options */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {currentUserId === post.user_id && onDelete && (
                    <DropdownMenuItem 
                      onClick={() => onDelete(post.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onShare(post)}>
                    <Share className="h-4 w-4 mr-2" />
                    Share
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Post Text */}
            <p className="text-sm leading-relaxed mt-1 whitespace-pre-wrap break-words">
              {renderPostContent(post.content)}
            </p>

            {/* Stock Mentions Chips */}
            {post.stock_mentions && post.stock_mentions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {post.stock_mentions.map(stock => (
                  <Badge 
                    key={stock} 
                    variant="outline" 
                    className="text-[0.625rem] px-2 py-0.5 cursor-pointer hover:bg-primary/10 transition-colors"
                    onClick={() => navigate(`/stock/${stock}`)}
                  >
                    ${stock}
                  </Badge>
                ))}
              </div>
            )}

            {/* Image */}
            <PostAttachments post={post} />

            {/* Actions */}
            <div className="flex items-center justify-between mt-3 -ml-2">
              <Button 
                variant="ghost" 
                size="sm" 
                className={`h-8 px-2 gap-1 ${post.is_liked ? 'text-destructive' : 'text-muted-foreground'} hover:text-destructive hover:bg-destructive/10`}
                onClick={() => onLike(post.id)}
              >
                <Heart className={`h-4 w-4 ${post.is_liked ? 'fill-current' : ''}`} />
                <span className="text-xs">{formatNumber(post.likes_count)}</span>
              </Button>

              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 px-2 gap-1 text-muted-foreground hover:text-primary hover:bg-primary/10"
                onClick={() => onComment(post)}
              >
                <MessageCircle className="h-4 w-4" />
                <span className="text-xs">{formatNumber(post.comments_count)}</span>
              </Button>

              <Button 
                variant="ghost" 
                size="sm" 
                className={`h-8 px-2 gap-1 ${post.is_reposted ? 'text-bull' : 'text-muted-foreground'} hover:text-bull hover:bg-bull/10`}
                onClick={() => onRepost(post.id)}
              >
                <Repeat2 className={`h-4 w-4 ${post.is_reposted ? '' : ''}`} />
                <span className="text-xs">{formatNumber(post.reposts_count)}</span>
              </Button>

              <Button 
                variant="ghost" 
                size="sm" 
                className={`h-8 px-2 ${post.is_bookmarked ? 'text-primary' : 'text-muted-foreground'} hover:text-primary hover:bg-primary/10`}
                onClick={() => onBookmark(post.id)}
              >
                {post.is_bookmarked ? (
                  <BookmarkCheck className="h-4 w-4 fill-current" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )}
              </Button>

              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 px-2 text-muted-foreground hover:text-primary hover:bg-primary/10"
                onClick={() => onShare(post)}
              >
                <Share className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
