import { useState } from "react";
import { ThumbsUp, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Continua reaction palette — finance-first, deliberately not a like button.
 * Legacy ids are kept so historical reactions still render.
 */
export type CommunityReaction =
  | "bullish" | "bearish" | "strong_hold" | "insightful" | "watch" | "fire" | "laugh" | "love"
  | "thumbs_up" | "thumbs_down" | "rocket" | "diamond_hands" | "agree" | "question" | "warning" | "thank_you" | "sad" | "angry"
  | "celebrate" | "trophy" | "heartbreak" | "shocked" | "thinking" | "cant_look" | "hopeful" | "mind_blown" | "cool" | "shark"
  // legacy
  | "cautious" | "support" | "disagree";

export interface ReactionMeta { id: CommunityReaction; emoji: string; label: string }

export const COMMUNITY_REACTIONS: ReactionMeta[] = [
  { id: "rocket", emoji: "🚀", label: "To the moon" },
  { id: "diamond_hands", emoji: "💎", label: "Diamond hands" },
  { id: "agree", emoji: "✅", label: "Agree" },
  { id: "question", emoji: "❓", label: "Question" },
  { id: "warning", emoji: "⚠️", label: "Warning" },
  { id: "thank_you", emoji: "🙌", label: "Thank you" },
  { id: "sad", emoji: "😢", label: "Sad" },
  { id: "angry", emoji: "😠", label: "Angry" },
  { id: "bullish", emoji: "📈", label: "Bullish" },
  { id: "bearish", emoji: "📉", label: "Bearish" },
  { id: "fire", emoji: "🔥", label: "Fire" },
  { id: "love", emoji: "❤️", label: "Love" },
  { id: "thumbs_up", emoji: "👍", label: "thumbs up" },
  { id: "thumbs_down", emoji: "👎", label: "thumbs down" },
  { id: "strong_hold", emoji: "🤝", label: "Strong Hold" },
  { id: "insightful", emoji: "💡", label: "Insightful" },
  { id: "watch", emoji: "👀", label: "Watch" },
  { id: "laugh", emoji: "😂", label: "Laugh" },
  // Finance-relatable additions
  { id: "celebrate", emoji: "🎉", label: "Celebrate" },
  { id: "trophy", emoji: "🏆", label: "Big Win" },
  { id: "heartbreak", emoji: "💔", label: "Heartbreak" },
  { id: "shocked", emoji: "😱", label: "Shocked" },
  { id: "thinking", emoji: "🤔", label: "Thinking" },
  { id: "cant_look", emoji: "🙈", label: "Can't Look" },
  { id: "hopeful", emoji: "🙏", label: "Hopeful" },
  { id: "mind_blown", emoji: "🤯", label: "Mind Blown" },
  { id: "cool", emoji: "😎", label: "Nailed It" },
  { id: "shark", emoji: "🦈", label: "Shark" },
];

// The compact, always-visible row on a post — the six reactions people
// reach for most on a finance feed. The rest live behind the "+" expander.
const QUICK_REACTION_IDS: CommunityReaction[] = ["bullish", "bearish", "fire", "love", "thumbs_up", "thumbs_down"];
const QUICK_REACTIONS = COMMUNITY_REACTIONS.filter(r => QUICK_REACTION_IDS.includes(r.id));

const LEGACY: ReactionMeta[] = [
  { id: "cautious", emoji: "🛡️", label: "Cautious" },
  { id: "support", emoji: "🤝", label: "Support" },
  { id: "disagree", emoji: "👎", label: "Disagree" },
];

export const ALL_REACTIONS = [...COMMUNITY_REACTIONS, ...LEGACY];

export function reactionMeta(id?: CommunityReaction | null): ReactionMeta | undefined {
  return ALL_REACTIONS.find(r => r.id === id);
}

export type ReactionCountMap = Partial<Record<CommunityReaction, number>>;

export function sortedReactions(counts: ReactionCountMap): { meta: ReactionMeta; count: number }[] {
  return ALL_REACTIONS
    .map(meta => ({ meta, count: counts[meta.id] || 0 }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

interface TrayProps {
  counts: ReactionCountMap;
  selected?: CommunityReaction | null;
  onSelect: (reaction: CommunityReaction) => void;
  compact?: boolean;
  /** Hide the aggregate count (used where chips already show totals). */
  hideTotal?: boolean;
}

/** Reaction control: shows top reactions + total, opens the tray on tap. */
export function CommunityReactionButton({ counts, selected, onSelect, compact, hideTotal }: TrayProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const ranked = sortedReactions(counts);
  const total = ranked.reduce((sum, r) => sum + r.count, 0);
  // Only the single most-used reaction is shown in the collapsed view — whichever
  // reaction has the most reactors "wins" the icon slot, like the fire emoji does today.
  const winner = ranked[0];
  const active = reactionMeta(selected);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setExpanded(false); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="React to this post"
          onClick={e => e.stopPropagation()}
          className={cn(
            "flex items-center gap-1.5 rounded-full text-muted-foreground transition-colors hover:text-foreground",
            compact ? "h-7 px-1.5" : "h-8 px-1.5",
            selected && "text-foreground"
          )}
          data-small-target
        >
          {winner ? (
            <span className="text-[0.9375rem] leading-none">{winner.meta.emoji}</span>
          ) : active ? (
            <span className="text-[0.9375rem] leading-none">{active.emoji}</span>
          ) : (
            <span className="text-lg leading-none" aria-hidden="true">🙂</span>
          )}
          {!hideTotal && <span className="text-[0.6875rem] font-medium tabular-nums">{total > 0 ? total : ""}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className={cn("p-2 rounded-2xl transition-all", expanded ? "w-[260px]" : "w-auto")}
        onClick={e => e.stopPropagation()}
      >
        {!expanded ? (
          <div className="flex items-center gap-0.5">
            {QUICK_REACTIONS.map(item => (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                onClick={() => { onSelect(item.id); setOpen(false); }}
                className={cn(
                  "flex items-center justify-center h-9 w-9 rounded-full transition-colors hover:bg-muted/60 active:scale-95",
                  selected === item.id && "bg-primary/10"
                )}
              >
                <span className="text-[1.25rem] leading-none">{item.emoji}</span>
              </button>
            ))}
            <button
              type="button"
              title="More reactions"
              aria-label="More reactions"
              onClick={() => setExpanded(true)}
              className="flex items-center justify-center h-9 w-9 rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground active:scale-95"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-0.5">
            {COMMUNITY_REACTIONS.map(item => (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                onClick={() => { onSelect(item.id); setOpen(false); }}
                className={cn(
                  "flex items-center justify-center h-9 w-9 rounded-full transition-colors hover:bg-muted/60 active:scale-95",
                  selected === item.id && "bg-primary/10"
                )}
              >
                <span className="text-[1.25rem] leading-none">{item.emoji}</span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Moomoo-style reaction chips (used in the expanded post view). */
export function ReactionChips({
  counts, selected, onSelect,
}: { counts: ReactionCountMap; selected?: CommunityReaction | null; onSelect?: (r: CommunityReaction) => void }) {
  const ranked = sortedReactions(counts);
  if (ranked.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {ranked.map(r => (
        <button
          key={r.meta.id}
          type="button"
          onClick={e => { e.stopPropagation(); onSelect?.(r.meta.id); }}
          className={cn(
            "flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-muted/50 text-[0.6875rem] font-medium tabular-nums transition-colors hover:bg-muted",
            selected === r.meta.id && "bg-primary/15 text-foreground"
          )}
          data-small-target
        >
          <span className="text-[0.8125rem] leading-none">{r.meta.emoji}</span>
          <span className="text-muted-foreground">{r.count}</span>
        </button>
      ))}
    </div>
  );
}
