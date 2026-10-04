import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Medal, TrendingUp, Crown, Flame, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  avatar?: string;
  winRate: number;
  totalTrades: number;
  streak: number;
  badge: string;
  percentGain: number;
}

const leaderboardData: LeaderboardEntry[] = [
  { rank: 1, userId: "1", name: "TraderKE", winRate: 78, totalTrades: 245, streak: 12, badge: "Champion", percentGain: 156.2 },
  { rank: 2, userId: "2", name: "MarketGuru", winRate: 72, totalTrades: 189, streak: 8, badge: "Expert", percentGain: 98.5 },
  { rank: 3, userId: "3", name: "EquityPro", winRate: 69, totalTrades: 312, streak: 5, badge: "Pro", percentGain: 87.3 },
  { rank: 4, userId: "4", name: "NSEWatcher", winRate: 65, totalTrades: 156, streak: 3, badge: "Rising", percentGain: 62.1 },
  { rank: 5, userId: "5", name: "InvestorJane", winRate: 63, totalTrades: 98, streak: 7, badge: "Consistent", percentGain: 54.8 },
];

export function TraderLeaderboard() {
  const navigate = useNavigate();

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />;
    return <span className="text-sm font-bold text-muted-foreground w-5 text-center">{rank}</span>;
  };

  const getBadgeColor = (badge: string) => {
    switch (badge) {
      case "Champion": return "bg-gradient-to-r from-yellow-500 to-amber-500 text-white";
      case "Expert": return "bg-gradient-to-r from-purple-500 to-violet-500 text-white";
      case "Pro": return "bg-gradient-to-r from-blue-500 to-cyan-500 text-white";
      case "Rising": return "bg-gradient-to-r from-green-500 to-emerald-500 text-white";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getInitials = (name: string) => {
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <Card className="card-gradient">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            <span>Top Traders This Week</span>
          </div>
          <Button variant="ghost" size="sm" className="text-xs h-7">
            View All
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {leaderboardData.map((entry, index) => (
          <div 
            key={entry.userId}
            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors hover:bg-muted/30 ${
              index === 0 ? 'bg-gradient-to-r from-yellow-500/10 to-transparent' : ''
            }`}
            onClick={() => navigate(`/profile/${entry.userId}`)}
          >
            <div className="flex items-center justify-center w-6">
              {getRankIcon(entry.rank)}
            </div>
            
            <Avatar className="h-10 w-10 border-2 border-background">
              <AvatarImage src={entry.avatar} />
              <AvatarFallback className={`${entry.rank === 1 ? 'bg-yellow-500' : 'bg-primary'} text-primary-foreground text-xs font-bold`}>
                {getInitials(entry.name)}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm truncate">{entry.name}</span>
                <Badge className={`text-[0.625rem] px-1.5 py-0 ${getBadgeColor(entry.badge)}`}>
                  {entry.badge}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-bull" />
                  {entry.winRate}% win
                </span>
                <span>{entry.totalTrades} trades</span>
                {entry.streak >= 5 && (
                  <span className="flex items-center gap-0.5 text-orange-500">
                    <Flame className="h-3 w-3" />
                    {entry.streak}
                  </span>
                )}
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-sm font-bold text-bull">+{entry.percentGain}%</div>
              <div className="text-[0.625rem] text-muted-foreground">MTD</div>
            </div>
          </div>
        ))}

        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground text-center">
            Rankings based on win rate, trade volume, and consistency
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
