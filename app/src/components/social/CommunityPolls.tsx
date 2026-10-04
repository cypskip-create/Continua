import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BarChart2, Clock, Users, Check, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface PollOption {
  id: string;
  text: string;
  votes: number;
}

interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  endsIn: string;
  stockMention?: string;
  voted?: string;
}

const pollsData: Poll[] = [
  {
    id: "1",
    question: "Where do you see SCOM stock by end of Q1 2025?",
    options: [
      { id: "1a", text: "Above KES 15", votes: 342 },
      { id: "1b", text: "KES 12-15", votes: 456 },
      { id: "1c", text: "Below KES 12", votes: 123 },
    ],
    totalVotes: 921,
    endsIn: "2 days",
    stockMention: "SCOM",
  },
  {
    id: "2",
    question: "Best sector to invest in for 2025?",
    options: [
      { id: "2a", text: "Banking", votes: 567 },
      { id: "2b", text: "Telecom", votes: 423 },
      { id: "2c", text: "Energy", votes: 234 },
      { id: "2d", text: "Manufacturing", votes: 189 },
    ],
    totalVotes: 1413,
    endsIn: "5 days",
  },
  {
    id: "3",
    question: "NSE 20 will end 2025...",
    options: [
      { id: "3a", text: "Above 2,000", votes: 234 },
      { id: "3b", text: "1,800 - 2,000", votes: 456 },
      { id: "3c", text: "Below 1,800", votes: 178 },
    ],
    totalVotes: 868,
    endsIn: "1 week",
  },
];

export function CommunityPolls() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [polls, setPolls] = useState<Poll[]>(pollsData);
  const [votingPoll, setVotingPoll] = useState<string | null>(null);

  const handleVote = (pollId: string, optionId: string) => {
    if (!user) {
      toast({ title: "Sign in to vote", variant: "destructive" });
      return;
    }

    setVotingPoll(pollId);
    
    setTimeout(() => {
      setPolls(prevPolls => 
        prevPolls.map(poll => {
          if (poll.id === pollId) {
            return {
              ...poll,
              voted: optionId,
              totalVotes: poll.totalVotes + 1,
              options: poll.options.map(opt => 
                opt.id === optionId ? { ...opt, votes: opt.votes + 1 } : opt
              ),
            };
          }
          return poll;
        })
      );
      setVotingPoll(null);
      toast({ title: "Vote recorded!" });
    }, 500);
  };

  const getVotePercentage = (votes: number, total: number) => {
    return total > 0 ? Math.round((votes / total) * 100) : 0;
  };

  return (
    <Card className="card-gradient">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-primary" />
            <span>Community Polls</span>
          </div>
          <Button variant="ghost" size="sm" className="text-xs h-7">
            Create Poll
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {polls.map((poll) => (
          <div key={poll.id} className="p-3 rounded-lg bg-muted/20 space-y-3">
            {/* Question */}
            <div>
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4 className="text-sm font-medium leading-tight">{poll.question}</h4>
                {poll.stockMention && (
                  <Badge variant="outline" className="text-[0.625rem] shrink-0">
                    ${poll.stockMention}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {poll.totalVotes} votes
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {poll.endsIn} left
                </span>
              </div>
            </div>

            {/* Options */}
            <div className="space-y-2">
              {poll.options.map((option) => {
                const percentage = getVotePercentage(option.votes, poll.totalVotes);
                const isVoted = poll.voted === option.id;
                const hasVoted = !!poll.voted;

                return (
                  <button
                    key={option.id}
                    onClick={() => !hasVoted && handleVote(poll.id, option.id)}
                    disabled={hasVoted || votingPoll === poll.id}
                    className={`w-full text-left transition-all ${
                      hasVoted ? 'cursor-default' : 'hover:bg-muted/30 cursor-pointer'
                    }`}
                  >
                    <div className="relative rounded-lg overflow-hidden border border-border/50">
                      {/* Background progress bar (only show after voting) */}
                      {hasVoted && (
                        <div 
                          className={`absolute inset-0 transition-all duration-500 ${
                            isVoted ? 'bg-primary/20' : 'bg-muted/30'
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      )}
                      
                      {/* Content */}
                      <div className="relative flex items-center justify-between p-2.5">
                        <div className="flex items-center gap-2">
                          {hasVoted ? (
                            isVoted ? (
                              <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                                <Check className="h-2.5 w-2.5 text-primary-foreground" />
                              </div>
                            ) : (
                              <div className="w-4 h-4 rounded-full border border-muted-foreground/30" />
                            )
                          ) : (
                            <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/50" />
                          )}
                          <span className={`text-sm ${isVoted ? 'font-medium' : ''}`}>
                            {option.text}
                          </span>
                        </div>
                        {hasVoted && (
                          <span className={`text-sm font-semibold ${isVoted ? 'text-primary' : 'text-muted-foreground'}`}>
                            {percentage}%
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Loading state */}
            {votingPoll === poll.id && (
              <div className="flex justify-center py-2">
                <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            )}
          </div>
        ))}

        <Button variant="outline" className="w-full" size="sm">
          View All Polls
          <ChevronRight className="h-3 w-3 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}
