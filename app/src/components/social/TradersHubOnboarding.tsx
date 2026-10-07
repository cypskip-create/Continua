import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ShieldAlert, Check, Loader2, AtSign, Sparkles, ChevronLeft, Camera,
  User, PenLine, Users, ShieldCheck, UserPlus, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeHandle, fallbackHandle, atHandle, getInitials } from "@/lib/handle";
import { EXPERIENCE_OPTIONS, GENDER_OPTIONS } from "@/lib/tradersHubOnboarding";
import { PortfolioVisibilityToggles, type PortfolioVisibilitySettings } from "@/components/portfolio/PortfolioVisibilityToggles";
import type { Profile } from "@/hooks/useProfile";

interface Props {
  userId: string | undefined;
  profile: Profile | null;
  updateProfile: (updates: Partial<Profile>) => Promise<{ data?: Profile; error?: unknown }>;
  onDone: () => void;
}

const INTEREST_OPTIONS = [
  { id: "banking", label: "Banking", tickers: ["EQTY", "KCB", "COOP", "SCBK", "ABSA", "NCBA", "DTK"] },
  { id: "telecoms", label: "Telecoms", tickers: ["SCOM"] },
  { id: "manufacturing", label: "Manufacturing", tickers: ["PORT", "BAT"] },
  { id: "consumer", label: "Consumer & drinks", tickers: ["EABL"] },
  { id: "energy", label: "Energy & utilities", tickers: ["KEGN", "KPLC"] },
  { id: "insurance", label: "Insurance", tickers: ["JUB", "BRIT"] },
  { id: "dividends", label: "Dividend investing" },
  { id: "day-trading", label: "Day trading" },
  { id: "long-term", label: "Long-term holding" },
  { id: "ipos", label: "New listings & IPOs" },
];

const CREATING_MESSAGES = [
  "Reserving your handle…",
  "Setting up your TradersHub profile…",
  "Applying your privacy settings…",
  "Personalizing your feed…",
];

// Minimum time the "creating" step stays on screen, regardless of how fast
// the network call actually finishes — the point (per Cyprian) is that this
// reads as a real account being created, not an instant flag flip.
const MIN_CREATING_MS = 2600;

interface SuggestedPerson {
  user_id: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number | null;
}

type Step =
  | "welcome"
  | "handle"
  | "photo"
  | "bio"
  | "about"
  | "interests"
  | "privacy"
  | "people"
  | "creating";

// Steps that count toward the progress dots — welcome is a cover screen,
// creating is the outcome, neither is a "step" the person fills in.
const PROGRESS_STEPS: Step[] = ["handle", "photo", "bio", "about", "interests", "privacy", "people"];

const DEFAULT_PRIVACY: PortfolioVisibilitySettings = {
  portfolioPublic: true,
  hideAmounts: false,
  hideGains: false,
  topHoldingsOnly: false,
  followersOnly: false,
};

/**
 * First-time-only TradersHub account setup. This is the ONLY place a
 * TradersHub identity is ever created — `finish()` below is the single
 * write that flips `tradershub_onboarded` to true, and until it succeeds,
 * nothing about this person is visible anywhere TradersHub-facing (see
 * migration 20260824090000: every public profile surface requires
 * tradershub_onboarded = true). Gated by profiles.tradershub_onboarded,
 * with a localStorage mirror so it never re-flashes on a slow network
 * re-check.
 */
export function TradersHubOnboarding({ userId, profile, updateProfile, onDone }: Props) {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<Step>("welcome");
  const stepHistory = useRef<Step[]>([]);

  // Step: handle
  const [handle, setHandle] = useState("");
  const [handleTouched, setHandleTouched] = useState(false);
  const [handleStatus, setHandleStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");

  // Step: photo
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Step: bio
  const [bio, setBio] = useState("");

  // Step: about (experience + gender)
  const [experience, setExperience] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);

  // Step: interests
  const [interests, setInterests] = useState<Set<string>>(new Set());

  // Step: privacy
  const [privacy, setPrivacy] = useState<PortfolioVisibilitySettings>(DEFAULT_PRIVACY);

  // Step: people
  const [suggested, setSuggested] = useState<SuggestedPerson[]>([]);
  const [suggestedLoading, setSuggestedLoading] = useState(false);
  const [toFollow, setToFollow] = useState<Set<string>>(new Set());

  // Step: creating
  const [creatingMessageIdx, setCreatingMessageIdx] = useState(0);
  const [creatingDone, setCreatingDone] = useState(false);
  const [creatingError, setCreatingError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) return;
      const lsKey = `tradershub_disclaimer_${userId}`;
      try { if (localStorage.getItem(lsKey)) { onDone(); return; } } catch { /* Storage can be blocked on mobile. */ }
      const { data } = await supabase
        .from("profiles")
        .select("tradershub_onboarded")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (data?.tradershub_onboarded) {
        try { localStorage.setItem(lsKey, "true"); } catch { /* Database remains authoritative. */ }
        onDone();
      } else {
        setShow(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, onDone]);

  // Prefill with a suggested handle and any existing avatar once we know the
  // profile, so neither field is ever empty to start — just easy to change.
  useEffect(() => {
    if (!profile) return;
    if (!handleTouched) setHandle(profile.handle || fallbackHandle(profile));
    if (!avatarUrl && profile.avatar_url) setAvatarUrl(profile.avatar_url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.handle, profile?.full_name, profile?.avatar_url]);

  // Live availability check as the person types their handle.
  useEffect(() => {
    if (step !== "handle") return;
    const clean = normalizeHandle(handle);
    if (clean.length < 3) { setHandleStatus("invalid"); return; }
    setHandleStatus("checking");
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles_public")
        .select("user_id")
        .ilike("handle", clean)
        .neq("user_id", userId || "")
        .maybeSingle();
      setHandleStatus(data ? "taken" : "available");
    }, 350);
    return () => clearTimeout(timer);
  }, [handle, step, userId]);

  const cleanHandle = useMemo(() => normalizeHandle(handle), [handle]);
  const canContinueFromHandle = handleStatus === "available" && cleanHandle.length >= 3;

  const goTo = (next: Step) => {
    stepHistory.current.push(step);
    setStep(next);
  };
  const goBack = () => {
    const prev = stepHistory.current.pop();
    if (prev) setStep(prev);
  };

  const toggleInterest = (id: string) => {
    setInterests(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleFollowCandidate = (id: string) => {
    setToFollow(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) return;

    setAvatarUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${userId}/avatar-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(fileName);
      setAvatarUrl(publicUrl);
    } catch {
      // Non-fatal — the person can just try again or skip the step entirely.
    } finally {
      setAvatarUploading(false);
    }
  };

  // Entering the "people" step: pull a handful of already-onboarded traders,
  // ranked by follower count. Queries profiles_public, which (as of
  // migration 20260824090000) only ever contains people who have themselves
  // completed this same onboarding flow.
  const enterPeopleStep = async () => {
    goTo("people");
    if (suggested.length > 0 || !userId) return;
    setSuggestedLoading(true);
    const { data } = await supabase
      .from("profiles_public")
      .select("user_id, full_name, handle, avatar_url, bio, followers_count")
      .neq("user_id", userId)
      .order("followers_count", { ascending: false })
      .limit(20);
    setSuggested((data as SuggestedPerson[]) || []);
    setSuggestedLoading(false);
  };

  const finish = async () => {
    goTo("creating");
    setCreatingDone(false);
    setCreatingError(false);
    setCreatingMessageIdx(0);

    const messageTimer = setInterval(() => {
      setCreatingMessageIdx(i => Math.min(i + 1, CREATING_MESSAGES.length - 1));
    }, MIN_CREATING_MS / CREATING_MESSAGES.length);

    const minDelay = new Promise(resolve => setTimeout(resolve, MIN_CREATING_MS));

    const createAccount = (async () => {
      const { error } = await updateProfile({
        handle: cleanHandle,
        avatar_url: avatarUrl || null,
        bio: bio.trim() || null,
        trading_experience: experience,
        gender,
        interests: [...interests],
        portfolio_public: privacy.portfolioPublic,
        portfolio_hide_amounts: privacy.hideAmounts,
        portfolio_hide_gains: privacy.hideGains,
        portfolio_top_holdings_only: privacy.topHoldingsOnly,
        portfolio_followers_only: privacy.followersOnly,
        tradershub_onboarded: true,
      } as Partial<Profile>);
      if (error) throw error;

      if (userId && toFollow.size > 0) {
        await supabase.from("user_follows").insert(
          [...toFollow].map(following_id => ({ follower_id: userId, following_id }))
        );
      }
    })();

    try {
      await Promise.all([createAccount, minDelay]);
      clearInterval(messageTimer);
      setCreatingDone(true);
      try { if (userId) localStorage.setItem(`tradershub_disclaimer_${userId}`, "true"); } catch { /* Profile was saved on the server. */ }
      setTimeout(() => {
        setShow(false);
        onDone();
      }, 700);
    } catch {
      clearInterval(messageTimer);
      setCreatingError(true);
    }
  };

  const currentProgressIdx = PROGRESS_STEPS.indexOf(step);

  // Full-screen, not a modal card -- avoids the old dialog's fixed max-width
  // clipping content on narrower phones, and matches how X/Instagram-style
  // account setup actually looks. Renders nothing at all until `show` flips
  // true, same as before.
  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-background flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {currentProgressIdx >= 0 && (
        <div className="flex items-center gap-1.5 px-6 pt-4 shrink-0">
          {PROGRESS_STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= currentProgressIdx ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
       <div className="max-w-md mx-auto w-full min-h-full">
        {step === "welcome" && (
          <div className="p-8 text-center space-y-5 min-h-full flex flex-col justify-center">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto">
              <ShieldAlert className="h-8 w-8 text-accent" />
            </div>
            <h2 className="text-xl font-extrabold">Welcome to TradersHub</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Posts here are personal opinions, not financial advice. Always do your own research before making investment decisions.
            </p>
            <p className="text-[0.75rem] text-muted-foreground">
              Next, let's set up your TradersHub identity — it takes about a minute.
            </p>
            <Button className="w-full h-12 rounded-full font-bold text-base" onClick={() => goTo("handle")}>
              Get Started
            </Button>
          </div>
        )}

        {step === "handle" && (
          <div className="p-8 space-y-5">
            <button onClick={goBack} className="text-muted-foreground -ml-1.5 flex items-center gap-0.5 text-xs">
              <ChevronLeft className="h-3.5 w-3.5" />Back
            </button>
            <div className="text-center space-y-1.5">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <AtSign className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-lg font-extrabold">Choose your handle</h2>
              <p className="text-[0.78125rem] text-muted-foreground">This is how other investors will find and mention you.</p>
            </div>
            <div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-semibold">@</span>
                <Input
                  autoFocus
                  value={handle}
                  onChange={e => { setHandleTouched(true); setHandle(e.target.value); }}
                  className="h-12 pl-8 rounded-2xl text-[0.9375rem] font-semibold"
                  maxLength={20}
                  placeholder="yourhandle"
                />
              </div>
              <div className="h-5 mt-1.5 px-1 flex items-center gap-1 text-[0.71875rem]">
                {handleStatus === "checking" && <><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Checking availability…</span></>}
                {handleStatus === "available" && <><Check className="h-3 w-3 text-bull" /><span className="text-bull font-medium">@{cleanHandle} is available</span></>}
                {handleStatus === "taken" && <span className="text-destructive font-medium">@{cleanHandle} is already taken</span>}
                {handleStatus === "invalid" && cleanHandle.length > 0 && <span className="text-muted-foreground">At least 3 characters — letters, numbers, underscores</span>}
              </div>
            </div>
            <Button className="w-full h-12 rounded-full font-bold text-base" disabled={!canContinueFromHandle} onClick={() => goTo("photo")}>
              Continue
            </Button>
          </div>
        )}

        {step === "photo" && (
          <div className="p-8 space-y-5">
            <button onClick={goBack} className="text-muted-foreground -ml-1.5 flex items-center gap-0.5 text-xs">
              <ChevronLeft className="h-3.5 w-3.5" />Back
            </button>
            <div className="text-center space-y-1.5">
              <h2 className="text-lg font-extrabold">Add a profile photo</h2>
              <p className="text-[0.78125rem] text-muted-foreground">Posts with a real photo get more trust — and more replies.</p>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="relative group">
                <Avatar className="h-28 w-28 ring-4 ring-primary/15">
                  <AvatarImage src={avatarUrl} className="object-cover" />
                  <AvatarFallback className="bg-gradient-primary text-primary-foreground text-3xl font-bold">
                    {handle ? getInitials(handle) : <User className="h-12 w-12" />}
                  </AvatarFallback>
                </Avatar>
                <label
                  htmlFor="onboarding-avatar-input"
                  className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {avatarUploading ? <Loader2 className="h-8 w-8 text-white animate-spin" /> : <Camera className="h-8 w-8 text-white" />}
                </label>
                <input id="onboarding-avatar-input" type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
              </div>
              <label htmlFor="onboarding-avatar-input">
                <Button variant="outline" size="sm" className="gap-2" disabled={avatarUploading} asChild>
                  <span>{avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}{avatarUrl ? "Change photo" : "Upload photo"}</span>
                </Button>
              </label>
            </div>
            <Button className="w-full h-12 rounded-full font-bold text-base" disabled={avatarUploading} onClick={() => goTo("bio")}>
              {avatarUrl ? "Continue" : "Skip for now"}
            </Button>
          </div>
        )}

        {step === "bio" && (
          <div className="p-8 space-y-5">
            <button onClick={goBack} className="text-muted-foreground -ml-1.5 flex items-center gap-0.5 text-xs">
              <ChevronLeft className="h-3.5 w-3.5" />Back
            </button>
            <div className="text-center space-y-1.5">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <PenLine className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-lg font-extrabold">Tell people about you</h2>
              <p className="text-[0.78125rem] text-muted-foreground">A short bio helps other traders know who they're following.</p>
            </div>
            <div>
              <Textarea
                autoFocus
                value={bio}
                onChange={e => setBio(e.target.value.slice(0, 160))}
                placeholder="e.g. Long-term NSE investor, banking & telco sector watcher"
                className="min-h-[90px] resize-none rounded-2xl"
                maxLength={160}
              />
              <p className="text-[0.6875rem] text-muted-foreground text-right mt-1">{bio.length}/160</p>
            </div>
            <Button className="w-full h-12 rounded-full font-bold text-base" onClick={() => goTo("about")}>
              {bio.trim() ? "Continue" : "Skip for now"}
            </Button>
          </div>
        )}

        {step === "about" && (
          <div className="p-8 space-y-5">
            <button onClick={goBack} className="text-muted-foreground -ml-1.5 flex items-center gap-0.5 text-xs">
              <ChevronLeft className="h-3.5 w-3.5" />Back
            </button>
            <div className="text-center space-y-1.5">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-lg font-extrabold">A couple quick questions</h2>
              <p className="text-[0.78125rem] text-muted-foreground">Both optional — this just helps us tailor TradersHub.</p>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Trading experience</p>
              <p className="text-[0.6875rem] text-muted-foreground -mt-1.5">Shown on your profile as a badge.</p>
              <div className="flex flex-wrap gap-2">
                {EXPERIENCE_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setExperience(prev => prev === opt.id ? null : opt.id)}
                    className={`h-9 px-3.5 rounded-full text-[0.8125rem] font-semibold border transition-colors ${
                      experience === opt.id ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 text-foreground border-border"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Gender</p>
              <p className="text-[0.6875rem] text-muted-foreground -mt-1.5">Used only for aggregate analysis of the TradersHub community — never shown on your profile or to other users.</p>
              <div className="flex flex-wrap gap-2">
                {GENDER_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setGender(prev => prev === opt.id ? null : opt.id)}
                    className={`h-9 px-3.5 rounded-full text-[0.8125rem] font-semibold border transition-colors ${
                      gender === opt.id ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 text-foreground border-border"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <Button className="w-full h-12 rounded-full font-bold text-base" onClick={() => goTo("interests")}>
              {experience || gender ? "Continue" : "Skip for now"}
            </Button>
          </div>
        )}

        {step === "interests" && (
          <div className="p-8 space-y-5">
            <button onClick={goBack} className="text-muted-foreground -ml-1.5 flex items-center gap-0.5 text-xs">
              <ChevronLeft className="h-3.5 w-3.5" />Back
            </button>
            <div className="text-center space-y-1.5">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-lg font-extrabold">What are you into?</h2>
              <p className="text-[0.78125rem] text-muted-foreground">Pick a few — this shapes your For You feed and who we suggest you follow. You can change these later in Settings.</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {INTEREST_OPTIONS.map(opt => {
                const active = interests.has(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => toggleInterest(opt.id)}
                    className={`h-9 px-3.5 rounded-full text-[0.8125rem] font-semibold border transition-colors ${
                      active ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 text-foreground border-border"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <Button className="w-full h-12 rounded-full font-bold text-base" onClick={() => goTo("privacy")}>
              {interests.size > 0 ? "Continue" : "Skip for now"}
            </Button>
          </div>
        )}

        {step === "privacy" && (
          <div className="p-8 space-y-5">
            <button onClick={goBack} className="text-muted-foreground -ml-1.5 flex items-center gap-0.5 text-xs">
              <ChevronLeft className="h-3.5 w-3.5" />Back
            </button>
            <div className="text-center space-y-1.5">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <ShieldCheck className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-lg font-extrabold">Your portfolio, your call</h2>
              <p className="text-[0.78125rem] text-muted-foreground">Choose who can see your holdings. You can change this anytime in Settings.</p>
            </div>
            <div className="max-h-[280px] overflow-y-auto pr-0.5">
              <PortfolioVisibilityToggles value={privacy} onChange={setPrivacy} />
            </div>
            <Button className="w-full h-12 rounded-full font-bold text-base" onClick={enterPeopleStep}>
              Continue
            </Button>
          </div>
        )}

        {step === "people" && (
          <div className="p-8 space-y-5">
            <button onClick={goBack} className="text-muted-foreground -ml-1.5 flex items-center gap-0.5 text-xs">
              <ChevronLeft className="h-3.5 w-3.5" />Back
            </button>
            <div className="text-center space-y-1.5">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <UserPlus className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-lg font-extrabold">Follow a few traders</h2>
              <p className="text-[0.78125rem] text-muted-foreground">Your feed works better once you're following someone. Optional.</p>
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-1 -mx-2 px-2">
              {suggestedLoading && (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              )}
              {!suggestedLoading && suggested.length === 0 && (
                <p className="text-center text-[0.78125rem] text-muted-foreground py-6">No one to suggest yet — you can find people from Discover later.</p>
              )}
              {!suggestedLoading && suggested.slice(0, 8).map(p => {
                const selected = toFollow.has(p.user_id);
                return (
                  <div key={p.user_id} className="flex items-center gap-2.5 py-2">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={p.avatar_url || ""} className="object-cover" />
                      <AvatarFallback className="text-[0.75rem] font-bold bg-primary/10 text-primary">{getInitials(p.full_name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.84375rem] font-bold truncate">{p.full_name || atHandle(p)}</p>
                      <p className="text-[0.75rem] text-muted-foreground truncate">{atHandle(p)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={selected ? "outline" : "default"}
                      className="h-8 rounded-full text-xs font-bold shrink-0"
                      onClick={() => toggleFollowCandidate(p.user_id)}
                    >
                      {selected ? <><Check className="h-3.5 w-3.5 mr-1" />Following</> : "Follow"}
                    </Button>
                  </div>
                );
              })}
            </div>

            <Button className="w-full h-12 rounded-full font-bold text-base" onClick={finish}>
              {toFollow.size > 0 ? "Finish setup" : "Skip for now"}
            </Button>
          </div>
        )}

        {step === "creating" && (
          <div className="p-10 text-center space-y-6 min-h-full flex flex-col items-center justify-center">
            {!creatingDone && !creatingError && (
              <>
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
                <div className="space-y-1.5">
                  <h2 className="text-lg font-extrabold">Setting up your TradersHub account…</h2>
                  <p className="text-[0.78125rem] text-muted-foreground min-h-[16px]">{CREATING_MESSAGES[creatingMessageIdx]}</p>
                </div>
              </>
            )}
            {creatingDone && (
              <>
                <div className="w-16 h-16 rounded-full bg-bull/10 flex items-center justify-center">
                  <CheckCircle2 className="h-9 w-9 text-bull" />
                </div>
                <h2 className="text-lg font-extrabold">You're all set, {atHandle({ handle: cleanHandle })}!</h2>
              </>
            )}
            {creatingError && (
              <>
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                  <ShieldAlert className="h-9 w-9 text-destructive" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-extrabold">Something went wrong</h2>
                  <p className="text-[0.78125rem] text-muted-foreground">We couldn't finish setting up your account. Please try again.</p>
                </div>
                <Button className="w-full h-12 rounded-full font-bold text-base" onClick={finish}>
                  Try again
                </Button>
              </>
            )}
          </div>
        )}
       </div>
      </div>
    </div>
  );
}

/** Sector → member tickers, exported so the feed-ranking algorithm can score
 *  a post's $TICKER mentions against a person's chosen sector interests. */
export const INTEREST_SECTOR_TICKERS: Record<string, string[]> = Object.fromEntries(
  INTEREST_OPTIONS.filter(o => o.tickers).map(o => [o.id, o.tickers as string[]])
);
