import { useState, useRef, useEffect } from "react";
import type { PostPoll } from "./PostAttachments";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Image, BarChart3, DollarSign, TrendingUp, PieChart, Globe } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { readPostImage } from "@/lib/postImage";
import { useToast } from "@/hooks/use-toast";

interface PortfolioSnapshot {
  totalValue: number;
  totalGain: number;
  gainPercent: number;
  /** Today's move only (price vs previous close) — distinct from totalGain,
   *  which is all-time unrealized P/L since purchase. */
  todayGain: number;
  todayPercent: number;
  holdings: { symbol: string; name: string; shares: number; avgCost: number; currentPrice: number; gain: number; dayChangePct: number }[];
}

interface XComposeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: string; email?: string } | null;
  profile: { avatar_url?: string | null; full_name?: string | null } | null;
  onPost: (content: string, imageUrl?: string[], quotedPostId?: string, poll?: PostPoll) => Promise<{ error?: any }>;
  portfolioSnapshot?: PortfolioSnapshot | null;
  prefillContent?: string;
  quotedPost?: { id: string; content: string; author?: { full_name: string | null; avatar_url: string | null } | null; created_at: string } | null;
  /** Free: 500 chars, a quick take. Premium: 5000 chars, room for a proper
   *  article-length post (Moomoo-style long-form). Enforced server-side too
   *  — see enforce_post_length_by_plan() — this just keeps the compose UX honest. */
  isPremium?: boolean;
  /** Carries the toggle choices made in SharePortfolioDialog when compose is
   *  opened via its "Post to TradersHub" action (deep-linked through
   *  /tradershub?compose=true&attachPortfolio=true&...) so what gets posted
   *  matches what was previewed there, not this modal's own defaults. */
  sharePreset?: { hideAmounts: boolean; hideGains: boolean; topHoldingsOnly: boolean; showDayChange: boolean };
}

const FREE_MAX_CHARS = 500;
const PREMIUM_MAX_CHARS = 5000;

export function XComposeModal({ open, onOpenChange, user, profile, onPost, portfolioSnapshot, prefillContent, quotedPost, isPremium = false, sharePreset }: XComposeModalProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollHours, setPollHours] = useState(24);
  const [viewport, setViewport] = useState({ top: window.innerHeight / 2, height: window.innerHeight - 32 });
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const view = window.visualViewport;
      setViewport({ top: (view?.offsetTop ?? 0) + (view?.height ?? window.innerHeight) / 2, height: Math.max(180, (view?.height ?? window.innerHeight) - 24) });
    };
    update();
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => { window.visualViewport?.removeEventListener('resize', update); window.visualViewport?.removeEventListener('scroll', update); };
  }, [open]);
  const pollValid = !pollOpen || (pollQuestion.trim().length > 0 && pollOptions.every(o => o.trim()) && new Set(pollOptions.map(o => o.trim().toLowerCase())).size === pollOptions.length);
  const [attachedPL, setAttachedPL] = useState(false);
  const [attachedPortfolio, setAttachedPortfolio] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  // The masked/filtered view of portfolioSnapshot actually used for the
  // "Portfolio Snapshot" attach — respects sharePreset when compose was
  // opened from Share Portfolio, otherwise shows everything (this modal's
  // own default when attaching from the composer directly).
  const displaySnapshot = (() => {
    if (!portfolioSnapshot) return null;
    const holdings = sharePreset?.topHoldingsOnly ? portfolioSnapshot.holdings.slice(0, 5) : portfolioSnapshot.holdings;
    return { ...portfolioSnapshot, holdings, hideAmounts: !!sharePreset?.hideAmounts, hideGains: !!sharePreset?.hideGains, useDayChange: sharePreset?.showDayChange ?? true };
  })();

  useEffect(() => {
    if (open) {
      if (prefillContent && !content) {
        setContent(prefillContent);
      }
      if (sharePreset) {
        setAttachedPortfolio(true);
      }
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillContent, sharePreset]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (selectedImages.length + files.length > 5) {
      toast({ title: "Choose up to five images", variant: "destructive" }); return;
    }
    const results = await Promise.all(files.map(readPostImage));
    const failure = results.find(r => r.error);
    if (failure) { toast({ title: "Could not add image", description: failure.error, variant: "destructive" }); return; }
    setSelectedImages(previous => [...previous, ...results.map(r => r.dataUrl!)].slice(0,5));
  };

  const handlePost = async () => {
    if (isPosting || !pollValid || (!content.trim() && !selectedImages.length && !attachedPL && !attachedPortfolio && !pollOpen)) return;
    if (!user) { navigate("/auth"); return; }

    setIsPosting(true);
    let finalContent = content;

    if (attachedPL && portfolioSnapshot) {
      const plText = `\n\n📊 Today's P/L: ${portfolioSnapshot.todayGain >= 0 ? "+" : ""}KES ${portfolioSnapshot.todayGain.toLocaleString()} (${portfolioSnapshot.todayGain >= 0 ? "+" : ""}${portfolioSnapshot.todayPercent.toFixed(1)}%)\nTop holdings: ${portfolioSnapshot.holdings.slice(0, 3).map(h => `$${h.symbol}`).join(", ")}`;
      finalContent += plText;
    }

    if (attachedPortfolio && displaySnapshot) {
      const gainLine = displaySnapshot.hideGains
        ? ""
        : displaySnapshot.useDayChange
          ? `\nToday: ${displaySnapshot.todayGain >= 0 ? "+" : ""}${displaySnapshot.hideAmounts ? "" : `KES ${displaySnapshot.todayGain.toLocaleString()} `}(${displaySnapshot.todayGain >= 0 ? "+" : ""}${displaySnapshot.todayPercent.toFixed(1)}%)`
          : `\nAll-time: ${displaySnapshot.totalGain >= 0 ? "+" : ""}${displaySnapshot.hideAmounts ? "" : `KES ${displaySnapshot.totalGain.toLocaleString()} `}(${displaySnapshot.gainPercent.toFixed(1)}%)`;
      const holdingsLines = displaySnapshot.holdings
        .map(h => displaySnapshot.hideGains
          ? `$${h.symbol}${displaySnapshot.hideAmounts ? "" : `: ${h.shares} shares`}`
          : `$${h.symbol}${displaySnapshot.hideAmounts ? "" : `: ${h.shares} shares`} (${(displaySnapshot.useDayChange ? h.dayChangePct : h.gain) >= 0 ? "+" : ""}${(displaySnapshot.useDayChange ? h.dayChangePct : h.gain).toFixed(1)}%)`)
        .join("\n");
      const pText = `\n\n💼 Portfolio Snapshot\nTotal Value: ${displaySnapshot.hideAmounts ? "••••••" : `KES ${displaySnapshot.totalValue.toLocaleString()}`}${gainLine}\n${holdingsLines}`;
      finalContent += pText;
    }

    try {
    const { error } = await onPost(finalContent, selectedImages, quotedPost?.id, pollOpen ? { question: pollQuestion.trim(), options: pollOptions.map(o => o.trim()), durationHours: pollHours } : undefined);
    if (!error) {
      setContent("");
      setSelectedImages([]);
      setPollOpen(false); setPollQuestion(""); setPollOptions(["",""]);
      setAttachedPL(false);
      setAttachedPortfolio(false);
      onOpenChange(false);
    }
    } catch { toast({ title: "Could not publish. Your draft is kept.", variant: "destructive" }); }
    finally { setIsPosting(false); }
  };

  const charCount = content.length;
  const maxChars = isPremium ? PREMIUM_MAX_CHARS : FREE_MAX_CHARS;
  const charPercent = (charCount / maxChars) * 100;
  const atFreeLimit = !isPremium && charCount >= FREE_MAX_CHARS;

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent centered style={{ '--composer-top': `${viewport.top}px`, '--composer-height': `${viewport.height}px` } as React.CSSProperties} className="max-w-lg p-0 gap-0 rounded-2xl border-border">
        <DialogTitle className="sr-only">Compose post</DialogTitle>
        {/* Header — Radix DialogContent renders its own close X, so we don't add one here */}
        <div className="h-3" />

        {/* Compose area */}
        <div className="flex gap-3 p-4 pb-0">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={profile?.avatar_url || ""} />
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
              {getInitials(profile?.full_name || user.email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="relative">
              <textarea
                ref={textareaRef}
                placeholder={isPremium ? "What's happening in the markets? (Premium: write a full article)" : "What's happening in the markets?"}
                value={content}
                onChange={handleContentChange}
                className={`w-full bg-transparent border-0 outline-none resize-none text-[1.0625rem] leading-[1.4] placeholder:text-muted-foreground/50 ${isPremium ? "min-h-[220px]" : "min-h-[120px]"}`}
                maxLength={maxChars}
              />
            </div>

            {!isPremium && atFreeLimit && (
              <button
                type="button"
                data-small-target
                onClick={() => { onOpenChange(false); navigate("/upgrade"); }}
                className="mt-2 w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border border-primary/25 bg-primary/5 text-left"
              >
                <span className="text-[0.6875rem] font-medium">Free posts stop at {FREE_MAX_CHARS} characters. Go Premium for {PREMIUM_MAX_CHARS.toLocaleString()}-character, article-length posts.</span>
                <span className="text-[0.6875rem] font-bold text-primary shrink-0 whitespace-nowrap">Upgrade →</span>
              </button>
            )}

            {/* Preview image */}
            {!!selectedImages.length && <div className="grid grid-cols-2 gap-2 mt-2">
              {selectedImages.map((image,index) => <div key={index} className="relative">
                <img src={image} alt={`Selected image ${index + 1}`} className="w-full h-28 object-cover rounded-lg" />
                <button aria-label={`Remove image ${index + 1}`} className="absolute top-1 right-1 bg-background rounded-full p-2" onClick={() => setSelectedImages(images => images.filter((_,i) => i !== index))}><X className="h-4 w-4" /></button>
              </div>)}
            </div>}
            {pollOpen && <div className="space-y-2 mt-3" aria-label="Create poll">
              <input aria-label="Poll question" placeholder="Ask a question" maxLength={180} value={pollQuestion} onChange={e=>setPollQuestion(e.target.value)} className="w-full border rounded-md bg-transparent p-2 text-sm" />
              {pollOptions.map((option,index) => <input key={index} aria-label={`Poll option ${index+1}`} placeholder={`Option ${index+1}`} maxLength={80} value={option} onChange={e=>setPollOptions(options=>options.map((o,i)=>i===index?e.target.value:o))} className="w-full border rounded-md bg-transparent p-2 text-sm" />)}
              <div className="flex justify-between items-center text-xs">
                {pollOptions.length < 4 && <button onClick={()=>setPollOptions(options=>[...options,""])}>Add option</button>}
                <select aria-label="Poll duration" value={pollHours} onChange={e=>setPollHours(Number(e.target.value))} className="bg-background border rounded p-2">{[1,24,72,168].map(h=><option key={h} value={h}>{h === 1 ? '1 hour' : `${h/24} days`}</option>)}</select>
                <button onClick={()=>setPollOpen(false)}>Remove poll</button>
              </div>
            </div>}

            {/* P/L Card preview */}
            {attachedPL && portfolioSnapshot && (
              <div className="mt-3 p-3 rounded-xl border border-border bg-muted/30 relative">
                <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 rounded-full" onClick={() => setAttachedPL(false)} data-small-target>
                  <X className="h-3 w-3" />
                </Button>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold">Today's P/L</span>
                </div>
                <div className={`text-xl font-bold ${portfolioSnapshot.todayGain >= 0 ? "text-bull" : "text-bear"}`}>
                  {portfolioSnapshot.todayGain >= 0 ? "+" : ""}KES {portfolioSnapshot.todayGain.toLocaleString()}
                </div>
                <div className={`text-sm ${portfolioSnapshot.todayGain >= 0 ? "text-bull" : "text-bear"}`}>
                  {portfolioSnapshot.todayGain >= 0 ? "+" : ""}{portfolioSnapshot.todayPercent.toFixed(1)}%
                </div>
              </div>
            )}

            {/* Portfolio snapshot preview */}
            {attachedPortfolio && displaySnapshot && (
              <div className="mt-3 p-3 rounded-xl border border-border bg-muted/30 relative">
                <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 rounded-full" onClick={() => setAttachedPortfolio(false)} data-small-target>
                  <X className="h-3 w-3" />
                </Button>
                <div className="flex items-center gap-2 mb-2">
                  <PieChart className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold">Portfolio Snapshot</span>
                </div>
                <div className="text-lg font-bold">{displaySnapshot.hideAmounts ? "KES ••••••" : `KES ${displaySnapshot.totalValue.toLocaleString()}`}</div>
                {!displaySnapshot.hideGains && (
                  <div className={`text-xs font-semibold mt-0.5 ${(displaySnapshot.useDayChange ? displaySnapshot.todayGain : displaySnapshot.totalGain) >= 0 ? "text-bull" : "text-bear"}`}>
                    {displaySnapshot.useDayChange ? "Today" : "All-time"} {(displaySnapshot.useDayChange ? displaySnapshot.todayGain : displaySnapshot.totalGain) >= 0 ? "+" : ""}
                    {(displaySnapshot.useDayChange ? displaySnapshot.todayPercent : displaySnapshot.gainPercent).toFixed(1)}%
                  </div>
                )}
                <div className="mt-2 space-y-1">
                  {displaySnapshot.holdings.slice(0, 3).map(h => (
                    <div key={h.symbol} className="flex items-center justify-between text-xs">
                      <span className="font-medium">${h.symbol}</span>
                      {!displaySnapshot.hideGains && (
                        <span className={(displaySnapshot.useDayChange ? h.dayChangePct : h.gain) >= 0 ? "text-bull" : "text-bear"}>
                          {(displaySnapshot.useDayChange ? h.dayChangePct : h.gain) >= 0 ? "+" : ""}{(displaySnapshot.useDayChange ? h.dayChangePct : h.gain).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quoted post preview */}
            {quotedPost && (
              <div className="mt-3 p-3 rounded-2xl border border-border bg-muted/20">
                <div className="flex items-center gap-1.5 text-[0.75rem]">
                  <Avatar className="h-5 w-5"><AvatarImage src={quotedPost.author?.avatar_url || ""} /><AvatarFallback className="text-[0.5625rem]">{getInitials(quotedPost.author?.full_name)}</AvatarFallback></Avatar>
                  <span className="font-bold truncate">{quotedPost.author?.full_name || "User"}</span>
                </div>
                <p className="text-[0.8125rem] mt-1 line-clamp-4 whitespace-pre-wrap">{quotedPost.content}</p>
              </div>
            )}
          </div>
        </div>

        {/* Visibility toggle */}
        <div className="px-4 py-2 ml-[52px]">
          <button className="flex items-center gap-1 text-primary text-sm font-semibold hover:bg-primary/10 rounded-full px-3 py-1 -ml-3 transition-colors" data-small-target>
            <Globe className="h-3.5 w-3.5" />
            Everyone can reply
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border ml-[52px]">
          <div className="flex items-center gap-0.5">
            <input type="file" multiple ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />
            <button className="p-2 rounded-full text-primary hover:bg-primary/10 transition-colors" onClick={() => fileInputRef.current?.click()} aria-label="Add images" disabled={selectedImages.length >= 5} data-small-target>
              <Image className="h-5 w-5" />
            </button>
            <button className="p-2 rounded-full text-primary hover:bg-primary/10 transition-colors" aria-label="Add poll" onClick={() => setPollOpen(v => !v)} data-small-target>
              <BarChart3 className="h-5 w-5" />
            </button>

            {portfolioSnapshot && (
              <>
                <button
                  className={`p-2 rounded-full transition-colors ${attachedPL ? "text-bull bg-bull/10" : "text-primary hover:bg-primary/10"}`}
                  onClick={() => setAttachedPL(!attachedPL)}
                  title="Attach Today's P/L"
                  data-small-target
                >
                  <TrendingUp className="h-5 w-5" />
                </button>
                <button
                  className={`p-2 rounded-full transition-colors ${attachedPortfolio ? "text-primary bg-primary/10" : "text-primary hover:bg-primary/10"}`}
                  onClick={() => setAttachedPortfolio(!attachedPortfolio)}
                  title="Attach Portfolio Snapshot"
                  data-small-target
                >
                  <PieChart className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          {/* Right side: counter + Post button */}
          <div className="flex items-center gap-2">
            {charCount > 0 && (
              <div className="relative h-5 w-5">
                <svg className="h-5 w-5 -rotate-90" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="9" fill="none" strokeWidth="2" stroke="hsl(var(--border))" />
                  <circle
                    cx="10" cy="10" r="9" fill="none" strokeWidth="2"
                    stroke={charPercent > 100 ? "hsl(var(--destructive))" : charPercent > 90 ? "hsl(var(--accent))" : "hsl(var(--primary))"}
                    strokeDasharray={`${Math.min(charPercent, 100) * 0.565} 100`}
                  />
                </svg>
                {charCount > maxChars * 0.9 && (
                  <span className={`absolute inset-0 flex items-center justify-center text-[0.5625rem] font-bold ${charCount > maxChars ? "text-destructive" : "text-muted-foreground"}`}>
                    {maxChars - charCount}
                  </span>
                )}
              </div>
            )}
            <Button
              size="sm"
              className="rounded-full px-5 h-9 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={(!content.trim() && !selectedImages.length && !attachedPL && !attachedPortfolio && !pollOpen) || !pollValid || isPosting || charCount > maxChars}
              onClick={handlePost}
            >
              {isPosting ? <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> : "Post"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
