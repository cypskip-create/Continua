import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { UserPlus, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { atHandle, getInitials } from "@/lib/handle";

interface Candidate {
  user_id: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  bio: string | null;
  interests: string[] | null;
}

interface Props {
  currentUserId: string | undefined;
  myInterests: string[];
  followingIds: Set<string>;
  onFollow: (userId: string) => void | Promise<void>;
}

/**
 * "Who to follow" rail for the For You tab. Ranked by how many TradersHub
 * interests (chosen during onboarding, see TradersHubOnboarding) a candidate
 * shares with the signed-in person, falling back to follower count so the
 * rail still has something reasonable to show someone who skipped picking
 * interests.
 *
 * Reads `interests` straight off the `profiles` table rather than
 * `profiles_public` — that view's backing function doesn't project the
 * column (interests were never meant to be a public-facing profile field
 * the way bio/full_name are), but RLS on the base table already allows any
 * signed-in person to read any row, and interests were granted at the
 * column level in the same migration that added them (see
 * 20260822090000), so a direct table query is the correct, minimal-privilege
 * way to do the matching without over-exposing the column via the public view.
 */
export function SuggestedForYou({ currentUserId, myInterests, followingIds, onFollow }: Props) {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [followedJustNow, setFollowedJustNow] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentUserId) { setLoading(false); return; }
      setLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, handle, avatar_url, bio, interests, followers_count")
        .eq("tradershub_onboarded", true)
        .neq("user_id", currentUserId)
        .order("followers_count", { ascending: false })
        .limit(40);
      if (!cancelled) {
        setCandidates((data as Candidate[]) || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUserId]);

  const ranked = useMemo(() => {
    const myInterestSet = new Set(myInterests);
    return candidates
      .filter(c => !followingIds.has(c.user_id))
      .map(c => {
        const shared = (c.interests || []).filter(i => myInterestSet.has(i));
        return { ...c, sharedCount: shared.length };
      })
      .sort((a, b) => b.sharedCount - a.sharedCount)
      .slice(0, 8);
  }, [candidates, followingIds, myInterests]);

  const handleFollow = async (userId: string) => {
    setFollowedJustNow(prev => new Set(prev).add(userId));
    await onFollow(userId);
  };

  if (loading || ranked.length === 0) return null;

  return (
    <div className="border-b border-border/40 py-3">
      <p className="px-4 text-[0.75rem] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">Suggested for you</p>
      <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 pb-1">
        {ranked.map(c => {
          const justFollowed = followedJustNow.has(c.user_id);
          return (
            <div key={c.user_id} className="shrink-0 w-[132px] rounded-2xl border border-border/60 p-3 flex flex-col items-center text-center gap-1.5">
              <button onClick={() => navigate(`/profile/${c.user_id}`)}>
                <Avatar className="h-12 w-12">
                  <AvatarImage src={c.avatar_url || ""} className="object-cover" />
                  <AvatarFallback className="text-[0.8125rem] font-bold bg-primary/10 text-primary">{getInitials(c.full_name)}</AvatarFallback>
                </Avatar>
              </button>
              <div className="min-w-0 w-full">
                <p className="text-[0.75rem] font-bold truncate">{c.full_name || "Investor"}</p>
                <p className="text-[0.65625rem] text-muted-foreground truncate">{atHandle(c)}</p>
                {c.sharedCount > 0 && (
                  <p className="text-[0.59375rem] text-primary font-semibold mt-0.5">{c.sharedCount} shared interest{c.sharedCount > 1 ? "s" : ""}</p>
                )}
              </div>
              <Button
                size="sm"
                variant={justFollowed ? "secondary" : "outline"}
                className="h-7 w-full rounded-full text-[0.6875rem] font-bold mt-1"
                disabled={justFollowed}
                onClick={() => handleFollow(c.user_id)}
              >
                {justFollowed ? <><Check className="h-3 w-3 mr-1" />Following</> : <><UserPlus className="h-3 w-3 mr-1" />Follow</>}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
