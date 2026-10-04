import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserPlus, UserMinus, TrendingUp, Verified, Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface MoomooProfileCardProps {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  followersCount?: number;
  isFollowing: boolean;
  isVerified?: boolean;
  badge?: string;
  winRate?: number;
  onFollow: () => void;
}

export function MoomooProfileCard({
  userId,
  fullName,
  avatarUrl,
  bio,
  followersCount = 0,
  isFollowing,
  isVerified = false,
  badge,
  winRate,
  onFollow,
}: MoomooProfileCardProps) {
  const navigate = useNavigate();

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getBadgeStyle = (badgeType?: string) => {
    switch (badgeType) {
      case "Champion": return "bg-gradient-to-r from-yellow-500 to-amber-500 text-white border-0";
      case "Expert": return "bg-gradient-to-r from-purple-500 to-violet-500 text-white border-0";
      case "Pro": return "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground border-0";
      default: return "";
    }
  };

  return (
    <Card className="bg-gradient-to-br from-card to-muted/20 border-border/50 hover:border-primary/30 transition-all">
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          {/* Avatar with badge */}
          <div className="relative">
            <Avatar 
              className="h-12 w-12 cursor-pointer ring-2 ring-primary/20"
              onClick={() => navigate(`/profile/${userId}`)}
            >
              <AvatarImage src={avatarUrl || ""} className="object-cover" />
              <AvatarFallback className="bg-gradient-primary text-primary-foreground font-bold">
                {getInitials(fullName)}
              </AvatarFallback>
            </Avatar>
            {badge === "Champion" && (
              <div className="absolute -top-1 -right-1 bg-yellow-500 rounded-full p-0.5">
                <Crown className="h-3 w-3 text-white" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span 
                className="font-semibold text-sm truncate cursor-pointer hover:underline"
                onClick={() => navigate(`/profile/${userId}`)}
              >
                {fullName || "User"}
              </span>
              {isVerified && <Verified className="h-3.5 w-3.5 text-primary fill-primary shrink-0" />}
              {badge && (
                <Badge className={`text-[0.5625rem] px-1.5 py-0 ${getBadgeStyle(badge)}`}>
                  {badge}
                </Badge>
              )}
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
              <span>{followersCount} followers</span>
              {winRate && (
                <span className="flex items-center gap-0.5 text-bull">
                  <TrendingUp className="h-3 w-3" />
                  {winRate}% win
                </span>
              )}
            </div>

            {/* Bio */}
            {bio && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {bio}
              </p>
            )}
          </div>

          {/* Follow Button */}
          <Button
            variant={isFollowing ? "outline" : "default"}
            size="sm"
            className="shrink-0 h-8 px-3 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onFollow();
            }}
          >
            {isFollowing ? (
              <>
                <UserMinus className="h-3 w-3 mr-1" />
                Following
              </>
            ) : (
              <>
                <UserPlus className="h-3 w-3 mr-1" />
                Follow
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
