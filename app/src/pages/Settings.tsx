import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { navigateBack } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, Check, X, AtSign, Eye, Bell, MessageCircle, UserPlus, Shield, Lock,
  Mail, KeyRound, Trash2, Download, Type, Smartphone, ChevronRight, ArrowLeft,
  CreditCard, Fingerprint, HelpCircle, FileText, Plus, Star, MessageSquare, Users,
  AlertTriangle, ShieldAlert,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { applyFontScale, getFontScale } from "@/lib/appearance";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useAppLock } from "@/hooks/useAppLock";
import { PortfolioVisibilityToggles } from "@/components/portfolio/PortfolioVisibilityToggles";

const HANDLE_REGEX = /^[a-z0-9_]{3,20}$/;

// "menu" is the top-level Settings list. "tradershub" is its own sub-menu —
// everything under it is specific to the social/community side of the app.
// Every other section here is a general account setting, not a TradersHub
// one, so it lives directly off the top-level menu instead.
type Section =
  | "menu" | "tradershub"
  | "account" | "payment" | "display" | "data" | "help" | "legal"
  | "th-privacy" | "th-notifications" | "blocked" | "muted" | "delete-account";

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth() as any;
  const { profile, updateProfile, refetch: refetchProfile } = useProfile();
  const { toast } = useToast();
  const { methods: paymentMethods, addMethod: addPaymentMethod, removeMethod: removePaymentMethod, setDefault: setDefaultPaymentMethod } = usePaymentMethods();
  const appLock = useAppLock();

  const [section, setSection] = useState<Section>((location.state as any)?.section || "menu");
  const [newMethodType, setNewMethodType] = useState<"mpesa" | "card">("mpesa");
  const [newMethodValue, setNewMethodValue] = useState("");
  const [newMethodExpiry, setNewMethodExpiry] = useState("");
  const [addingMethod, setAddingMethod] = useState(false);
  const [handle, setHandle] = useState(profile?.handle || "");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [portfolioOn, setPortfolioOn] = useState(!!profile?.portfolio_public);
  const [fontScale, setFontScale] = useState(getFontScale());
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [prefs, setPrefs] = useState<any>({ notif_comments: true, notif_follows: true });
  const [blockedKeyword, setBlockedKeyword] = useState("");
  const [mutedKeywords, setMutedKeywords] = useState<{ id: string; keyword: string }[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [mutedUsers, setMutedUsers] = useState<any[]>([]);

  useEffect(() => {
    setHandle(profile?.handle || "");
    setPortfolioOn(!!profile?.portfolio_public);
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("user_preferences" as any).select("*").eq("user_id", user.id).maybeSingle();
      if (data) setPrefs((p: any) => ({ ...p, ...(data as any) }));
      const { data: kw } = await supabase.from("muted_keywords" as any).select("*").eq("user_id", user.id);
      setMutedKeywords((kw as any[]) || []);
      const { data: bu } = await supabase.from("blocked_users" as any).select("blocked_id").eq("blocker_id", user.id);
      const { data: mu } = await supabase.from("muted_users" as any).select("muted_id").eq("muter_id", user.id);
      const blockedIds = ((bu as any[]) || []).map((b: any) => b.blocked_id);
      const mutedIds = ((mu as any[]) || []).map((m: any) => m.muted_id);
      const allIds = [...new Set([...blockedIds, ...mutedIds])];
      if (allIds.length) {
        const { data: profs } = await supabase.from("profiles_public").select("user_id, full_name, avatar_url, handle").in("user_id", allIds);
        const pmap = new Map((profs || []).map((p: any) => [p.user_id, p]));
        setBlockedUsers(blockedIds.map((id: string) => pmap.get(id)).filter(Boolean));
        setMutedUsers(mutedIds.map((id: string) => pmap.get(id)).filter(Boolean));
      }
    })();
  }, [user]);

  useEffect(() => {
    const v = handle.trim().toLowerCase();
    if (!v || v === (profile?.handle || "").toLowerCase()) { setAvailable(null); return; }
    if (!HANDLE_REGEX.test(v)) { setAvailable(false); return; }
    setChecking(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.from("profiles_public").select("user_id").eq("handle", v).maybeSingle();
      setAvailable(!data || data.user_id === user?.id);
      setChecking(false);
    }, 400);
    return () => clearTimeout(t);
  }, [handle, profile, user]);

  const handleValid = HANDLE_REGEX.test(handle.trim().toLowerCase());

  const togglePref = async (key: string, value: any) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    if (!user) return;
    await supabase.from("user_preferences" as any).upsert({ user_id: user.id, ...next }, { onConflict: "user_id" } as any);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const updates: any = {};
      const newHandle = handle.trim().toLowerCase();
      if (newHandle && newHandle !== (profile?.handle || "").toLowerCase()) {
        if (!handleValid) { toast({ title: "Invalid handle", variant: "destructive" }); setSaving(false); return; }
        if (available === false) { toast({ title: "Handle taken", variant: "destructive" }); setSaving(false); return; }
        updates.handle = newHandle;
      }
      if (Object.keys(updates).length > 0) {
        const { error } = await updateProfile(updates);
        if (error) throw error;
      }
      toast({ title: "Saved" });
      refetchProfile?.();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleChangePassword = async () => {
    if (!user?.email) return;
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      toast({ title: "Password reset email sent", description: `Check ${user.email} for a link` });
    } catch (e: any) {
      toast({ title: "Couldn't send reset email", description: e?.message, variant: "destructive" });
    } finally { setChangingPassword(false); }
  };

  const addKeyword = async () => {
    if (!user || !blockedKeyword.trim()) return;
    const { data, error } = await supabase.from("muted_keywords" as any).insert({ user_id: user.id, keyword: blockedKeyword.trim() }).select().single();
    if (!error && data) { setMutedKeywords(prev => [...prev, data as any]); setBlockedKeyword(""); }
  };
  const removeKeyword = async (id: string) => {
    await supabase.from("muted_keywords" as any).delete().eq("id", id);
    setMutedKeywords(prev => prev.filter(k => k.id !== id));
  };
  const unblock = async (uid: string) => {
    await supabase.from("blocked_users" as any).delete().eq("blocker_id", user!.id).eq("blocked_id", uid);
    setBlockedUsers(prev => prev.filter((u: any) => u.user_id !== uid));
  };
  const unmute = async (uid: string) => {
    await supabase.from("muted_users" as any).delete().eq("muter_id", user!.id).eq("muted_id", uid);
    setMutedUsers(prev => prev.filter((u: any) => u.user_id !== uid));
  };

  const handleAddPaymentMethod = async () => {
    if (!user) return;
    setAddingMethod(true);
    try {
      if (newMethodType === "mpesa") {
        const digits = newMethodValue.replace(/\s+/g, "");
        if (!/^(?:\+?254|0)[71]\d{8}$/.test(digits)) {
          toast({ title: "Enter a valid M-Pesa number", description: "e.g. 0712345678", variant: "destructive" });
          return;
        }
        const normalized = digits.replace(/^\+/, "").replace(/^0/, "254");
        const masked = `${normalized.slice(0, 6)}••••${normalized.slice(-3)}`;
        const res = await addPaymentMethod({ method_type: "mpesa", label: "M-Pesa", detail: masked });
        if (res.error) throw res.error;
      } else {
        const digits = newMethodValue.replace(/\s+/g, "");
        if (!/^\d{13,19}$/.test(digits)) {
          toast({ title: "Enter a valid card number", variant: "destructive" });
          return;
        }
        if (!/^\d{2}\/\d{2}$/.test(newMethodExpiry.trim())) {
          toast({ title: "Enter expiry as MM/YY", variant: "destructive" });
          return;
        }
        const brand = /^4/.test(digits) ? "Visa" : /^5[1-5]/.test(digits) ? "Mastercard" : "Card";
        const masked = `•••• ${digits.slice(-4)} · ${newMethodExpiry.trim()}`;
        const res = await addPaymentMethod({ method_type: "card", label: brand, detail: masked });
        if (res.error) throw res.error;
      }
      setNewMethodValue("");
      setNewMethodExpiry("");
      toast({ title: "Payment method added" });
    } catch (e: any) {
      toast({ title: "Couldn't add payment method", description: e?.message, variant: "destructive" });
    } finally {
      setAddingMethod(false);
    }
  };

  const exportData = async () => {
    if (!user) return;
    const [posts, follows, likes] = await Promise.all([
      supabase.from("posts").select("*").eq("user_id", user.id),
      supabase.from("user_follows").select("*").eq("follower_id", user.id),
      supabase.from("post_likes").select("*").eq("user_id", user.id),
    ]);
    const blob = new Blob([JSON.stringify({ posts: posts.data, follows: follows.data, likes: likes.data }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `continua-data-${user.id}.json`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Data exported" });
  };

  // Permanent, no undo — this is the real deletion path (see
  // supabase/functions/delete-account), not a "deactivate" placeholder. The
  // typed confirmation is the only thing standing between this button and
  // wiping every table the account touches, plus the auth user itself.
  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmText.trim().toUpperCase() !== "DELETE") return;
    setDeletingAccount(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account");
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message || "Deletion failed");
      toast({ title: "Account deleted", description: "Sorry to see you go." });
      await signOut?.();
      navigate("/auth");
    } catch (e: any) {
      toast({ title: "Couldn't delete account", description: e.message || "Please try again or contact support@continua.app", variant: "destructive" });
    } finally {
      setDeletingAccount(false);
    }
  };

  const topSections: { id: Section; label: string; icon: any; desc: string }[] = [
    { id: "tradershub", label: "TradersHub", icon: Users, desc: "Privacy, notifications, blocked & muted accounts" },
    { id: "account", label: "Your account", icon: AtSign, desc: "Username, email, password, app lock" },
    { id: "payment", label: "Payment methods", icon: CreditCard, desc: "M-Pesa & cards for Premium billing" },
    { id: "display", label: "Display", icon: Type, desc: "Theme, text size" },
    { id: "data", label: "Your data", icon: Download, desc: "Download or delete your data" },
    { id: "help", label: "Help & support", icon: HelpCircle, desc: "FAQs & contact us" },
    { id: "legal", label: "Terms & privacy", icon: FileText, desc: "Terms of service, privacy policy" },
  ];

  // Grouped like Moomoo's Settings — a handful of tight cards instead of one
  // long flat list, so related settings read as a unit at a glance.
  const menuGroups: { title?: string; ids: Section[] }[] = [
    { ids: ["account", "tradershub", "payment"] },
    { title: "Preferences", ids: ["display"] },
    { title: "Support", ids: ["data", "help", "legal"] },
  ];

  const tradersHubSections: { id: Section; label: string; icon: any; desc: string }[] = [
    { id: "th-privacy", label: "Privacy & safety", icon: Shield, desc: "Portfolio visibility, blocked & muted" },
    { id: "th-notifications", label: "Notifications", icon: Bell, desc: "Comments, replies & new followers" },
  ];

  const Header = ({ title, back = "menu" as Section }: { title: string; back?: Section }) => (
    <div className="flex items-center gap-2 mb-4">
      <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2" onClick={() => setSection(back)}><ArrowLeft className="h-4 w-4" /></Button>
      <h3 className="text-base font-bold">{title}</h3>
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-card/90 backdrop-blur-xl border-b border-border/60">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigateBack(navigate, "/profile")} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-foreground">Settings</h1>
        </div>
      </header>

      <div className="px-4 pt-4 max-w-lg mx-auto">
        {section === "menu" && (
          <div className="space-y-5 pb-4">
            {menuGroups.map((group, gi) => (
              <div key={gi}>
                {group.title && <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-muted-foreground px-1 mb-1.5">{group.title}</p>}
                <div className="flat-section rounded-2xl border border-border/60 bg-card overflow-hidden divide-y divide-border/50">
                  {group.ids.map(id => {
                    const s = topSections.find(t => t.id === id)!;
                    return (
                      <button key={s.id} onClick={() => setSection(s.id)} className="w-full flex items-center gap-3 px-3.5 py-3 hover:bg-muted/40 active:bg-muted/60 transition text-left">
                        <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground shrink-0"><s.icon className="h-4 w-4" /></div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold">{s.label}</div>
                          <div className="text-[0.6875rem] text-muted-foreground truncate">{s.desc}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div>
              <div className="flat-section rounded-2xl border border-border/60 bg-card overflow-hidden">
                <button onClick={async () => { await signOut?.(); navigate('/auth'); }} className="w-full flex items-center gap-3 px-3.5 py-3 hover:bg-muted/40 active:bg-muted/60 transition text-left">
                  <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0"><KeyRound className="h-4 w-4 text-muted-foreground" /></div>
                  <div className="flex-1 text-sm font-semibold">Log out</div>
                </button>
              </div>
            </div>

            <div>
              <div className="rounded-2xl border border-destructive/30 bg-destructive/[0.03] overflow-hidden">
                <button onClick={() => { setDeleteConfirmText(""); setSection("delete-account"); }} className="w-full flex items-center gap-3 px-3.5 py-3 hover:bg-destructive/10 active:bg-destructive/15 transition text-left text-destructive">
                  <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0"><Trash2 className="h-4 w-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">Delete account</div>
                    <div className="text-[0.6875rem] text-destructive/70">Permanently erase your Continua account</div>
                  </div>
                </button>
              </div>
            </div>

            <p className="text-[0.6875rem] text-muted-foreground text-center pt-1">Continua v1.0 · Nairobi, Kenya</p>
          </div>
        )}

        {section === "tradershub" && (
          <div className="space-y-1 pb-4">
            <Header title="TradersHub" />
            {tradersHubSections.map(s => (
              <button key={s.id} onClick={() => setSection(s.id)} className="flat-section w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition text-left">
                <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground"><s.icon className="h-4 w-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{s.label}</div>
                  <div className="text-[0.6875rem] text-muted-foreground truncate">{s.desc}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        {section === "th-privacy" && (
          <div className="space-y-3 pb-4">
            <Header title="Privacy & safety" back="tradershub" />
            <PortfolioVisibilityToggles
              value={{
                portfolioPublic: portfolioOn,
                hideAmounts: !!profile?.portfolio_hide_amounts,
                hideGains: !!profile?.portfolio_hide_gains,
                topHoldingsOnly: !!profile?.portfolio_top_holdings_only,
                followersOnly: !!profile?.portfolio_followers_only,
              }}
              onChange={async (next) => {
                setPortfolioOn(next.portfolioPublic);
                if (user) {
                  await updateProfile({
                    portfolio_public: next.portfolioPublic,
                    portfolio_hide_amounts: next.hideAmounts,
                    portfolio_hide_gains: next.hideGains,
                    portfolio_top_holdings_only: next.topHoldingsOnly,
                    portfolio_followers_only: next.followersOnly,
                  });
                }
                toast({ title: next.portfolioPublic ? "Portfolio settings saved" : "Portfolio private" });
              }}
            />
            <Separator />
            <button onClick={() => setSection("blocked")} className="flat-section w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted/50">
              <span className="flex items-center gap-3 text-sm font-medium">Blocked accounts</span>
              <span className="text-xs text-muted-foreground">{blockedUsers.length} <ChevronRight className="h-4 w-4 inline" /></span>
            </button>
            <button onClick={() => setSection("muted")} className="flat-section w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted/50">
              <span className="flex items-center gap-3 text-sm font-medium">Muted accounts & words</span>
              <span className="text-xs text-muted-foreground">{mutedUsers.length + mutedKeywords.length} <ChevronRight className="h-4 w-4 inline" /></span>
            </button>
            <p className="text-[0.6875rem] text-muted-foreground pt-1">Blocking or muting someone hides their posts from your TradersHub feed.</p>
          </div>
        )}

        {section === "th-notifications" && (
          <div className="space-y-3 pb-4">
            <Header title="Notifications" back="tradershub" />
            <Row icon={<MessageCircle className="h-4 w-4" />} title="Comments & replies" desc="When someone replies to you" checked={prefs.notif_comments} onChange={(v: boolean) => togglePref("notif_comments", v)} />
            <Row icon={<UserPlus className="h-4 w-4" />} title="New followers" desc="When someone follows you" checked={prefs.notif_follows} onChange={(v: boolean) => togglePref("notif_follows", v)} />
          </div>
        )}

        {section === "blocked" && (
          <div className="space-y-3 pb-4">
            <Header title="Blocked accounts" back="th-privacy" />
            {blockedUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No blocked accounts</p>
            ) : blockedUsers.map((u: any) => (
              <div key={u.user_id} className="flex items-center justify-between p-2 rounded-xl">
                <div className="text-sm"><div className="font-semibold">{u.full_name}</div><div className="text-xs text-muted-foreground">@{u.handle || "user"}</div></div>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => unblock(u.user_id)}>Unblock</Button>
              </div>
            ))}
          </div>
        )}

        {section === "muted" && (
          <div className="space-y-3 pb-4">
            <Header title="Muted" back="th-privacy" />
            <p className="text-xs font-semibold text-muted-foreground">Muted keywords</p>
            <div className="flex gap-2">
              <Input value={blockedKeyword} onChange={(e) => setBlockedKeyword(e.target.value)} placeholder="Add a word or phrase" className="h-9" />
              <Button onClick={addKeyword} size="sm" className="rounded-full">Add</Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {mutedKeywords.map(k => (
                <span key={k.id} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-muted">
                  {k.keyword}
                  <button onClick={() => removeKeyword(k.id)}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
            <Separator />
            <p className="text-xs font-semibold text-muted-foreground">Muted accounts</p>
            {mutedUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No muted accounts</p>
            ) : mutedUsers.map((u: any) => (
              <div key={u.user_id} className="flex items-center justify-between p-2 rounded-xl">
                <div className="text-sm"><div className="font-semibold">{u.full_name}</div><div className="text-xs text-muted-foreground">@{u.handle || "user"}</div></div>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => unmute(u.user_id)}>Unmute</Button>
              </div>
            ))}
          </div>
        )}

        {section === "account" && (
          <div className="space-y-4 pb-4">
            <Header title="Your account" />
            <div className="space-y-2">
              <Label className="text-xs font-semibold flex items-center gap-1.5"><AtSign className="h-3.5 w-3.5" />Username</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                <Input value={handle} onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase())} placeholder="yourhandle" maxLength={20} className="pl-7 pr-9 h-10" />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {checking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {!checking && available === true && <Check className="h-4 w-4 text-bull" />}
                  {!checking && available === false && <X className="h-4 w-4 text-destructive" />}
                </div>
              </div>
              <p className="text-[0.6875rem] text-muted-foreground">3–20 chars. Letters, numbers, underscores only.</p>
            </div>
            <div>
              <Label className="text-xs font-semibold flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />Email</Label>
              <Input value={user?.email || ""} disabled className="mt-1 h-10" />
            </div>
            <Button variant="outline" className="w-full rounded-full" onClick={handleChangePassword} disabled={changingPassword}>
              {changingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
              Email me a password reset link
            </Button>
            <Button className="w-full rounded-full" onClick={handleSave} disabled={saving || (handle !== (profile?.handle || "") && available === false)}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
            </Button>
            <Separator />
            <Row
              icon={<Fingerprint className="h-4 w-4" />}
              title="App Lock"
              desc={appLock.supported ? "Require Face ID, fingerprint, or your device PIN to open the app" : "Not supported on this device or browser"}
              checked={appLock.enabled}
              disabled={!appLock.supported}
              onChange={async (v: boolean) => {
                if (v) {
                  const res = await appLock.enable();
                  if (res.success) toast({ title: "App Lock enabled" });
                  else toast({ title: "Couldn't enable App Lock", description: res.error, variant: "destructive" });
                } else {
                  appLock.disable();
                  toast({ title: "App Lock disabled" });
                }
              }}
            />
          </div>
        )}

        {section === "display" && (
          <div className="space-y-5 pb-4">
            <Header title="Display" />
            <div>
              <p className="text-sm font-medium mb-2">Theme</p>
              <ThemeToggle />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Type className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Text size</p>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[{ label: "S", val: "0.9" }, { label: "M", val: "1" }, { label: "L", val: "1.1" }, { label: "XL", val: "1.2" }].map(opt => (
                  <button
                    key={opt.val}
                    onClick={() => { applyFontScale(opt.val); setFontScale(opt.val); }}
                    className={`h-9 rounded-lg text-xs font-semibold transition-colors ${fontScale === opt.val ? "brand-active" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {section === "data" && (
          <div className="space-y-3 pb-4">
            <Header title="Your data" />
            <Button variant="outline" className="w-full rounded-full justify-start" onClick={exportData}><Download className="h-4 w-4 mr-2" />Download your data</Button>
            <Button variant="outline" className="w-full rounded-full justify-start text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => { setDeleteConfirmText(""); setSection("delete-account"); }}>
              <Trash2 className="h-4 w-4 mr-2" />Delete account
            </Button>
          </div>
        )}

        {section === "delete-account" && (
          <div className="space-y-4 pb-4">
            <Header title="Delete account" back="data" />
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-destructive/[0.06] border border-destructive/20">
              <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-[0.78125rem] text-destructive leading-relaxed">This permanently deletes your Continua account. There's no undo, and no grace period to recover it afterward.</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">This will remove:</p>
              <ul className="space-y-1.5 text-[0.8125rem] text-muted-foreground">
                {[
                  "Your profile, handle, and TradersHub identity",
                  "Every post, comment, like, and repost you've made",
                  "Your followers, following, and blocked/muted lists",
                  "Your portfolio, watchlists, and price alerts",
                  "Your saved payment methods",
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive/70 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Type DELETE to confirm</Label>
              <Input
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className="h-11 rounded-xl font-semibold tracking-wide"
                autoCapitalize="characters"
              />
            </div>

            <Button
              variant="destructive"
              className="w-full h-12 rounded-full font-bold"
              disabled={deletingAccount || deleteConfirmText.trim().toUpperCase() !== "DELETE"}
              onClick={handleDeleteAccount}
            >
              {deletingAccount ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Permanently delete my account
            </Button>
            <p className="text-[0.6875rem] text-muted-foreground text-center">Changed your mind? Just go back — nothing happens until you tap the button above.</p>
          </div>
        )}

        {section === "payment" && (
          <div className="space-y-3 pb-4">
            <Header title="Payment methods" />
            <p className="text-xs text-muted-foreground -mt-1">Used to bill your Premium subscription. We only ever store a masked reference — never your full card number or M-Pesa PIN.</p>
            {paymentMethods.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No payment methods yet</p>
            ) : paymentMethods.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-xl border border-border">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground shrink-0"><CreditCard className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold flex items-center gap-1.5 truncate">
                      {m.label}
                      {m.is_default && <Star className="h-3 w-3 fill-current text-foreground shrink-0" />}
                    </div>
                    <div className="text-[0.6875rem] text-muted-foreground truncate">{m.detail}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!m.is_default && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={async () => {
                      const r = await setDefaultPaymentMethod(m.id);
                      if (!r.error) toast({ title: "Default updated" });
                    }}>Set default</Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={async () => {
                    const r = await removePaymentMethod(m.id);
                    if (!r.error) toast({ title: "Payment method removed" });
                  }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            <Separator />
            <p className="text-xs font-semibold text-muted-foreground">Add a method</p>
            <div className="inline-flex rounded-full bg-muted p-0.5">
              <button onClick={() => setNewMethodType("mpesa")} className={`text-xs font-semibold rounded-full px-3 py-1.5 transition-colors ${newMethodType === "mpesa" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>M-Pesa</button>
              <button onClick={() => setNewMethodType("card")} className={`text-xs font-semibold rounded-full px-3 py-1.5 transition-colors ${newMethodType === "card" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>Card</button>
            </div>
            {newMethodType === "mpesa" ? (
              <Input value={newMethodValue} onChange={(e) => setNewMethodValue(e.target.value)} placeholder="0712 345 678" className="h-10" inputMode="tel" />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Input value={newMethodValue} onChange={(e) => setNewMethodValue(e.target.value)} placeholder="Card number" className="h-10" inputMode="numeric" maxLength={19} />
                <Input value={newMethodExpiry} onChange={(e) => setNewMethodExpiry(e.target.value)} placeholder="MM/YY" className="h-10" maxLength={5} />
              </div>
            )}
            <Button className="w-full rounded-full" onClick={handleAddPaymentMethod} disabled={addingMethod || !newMethodValue.trim()}>
              {addingMethod ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" />Add method</>}
            </Button>
          </div>
        )}

        {section === "help" && (
          <div className="space-y-3 pb-4">
            <Header title="Help & support" />
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="q1">
                <AccordionTrigger className="text-sm">Are the prices real-time?</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">Free accounts see delayed NSE prices. Premium unlocks real-time pricing across every stock.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="q2">
                <AccordionTrigger className="text-sm">How do I add a stock to my portfolio?</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">Open a stock's page and tap "Add to portfolio", or use the + button on Track Investments.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="q3">
                <AccordionTrigger className="text-sm">Is my payment information secure?</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">We only ever store a masked reference to your M-Pesa number or card — never your PIN or full card number.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="q4">
                <AccordionTrigger className="text-sm">How do I cancel Premium?</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">Go to Account → Subscription and switch back to Free anytime — you'll keep Premium until the end of your billing period.</AccordionContent>
              </AccordionItem>
            </Accordion>
            <Separator />
            <Button variant="outline" className="w-full rounded-full justify-start" onClick={() => { window.location.href = "mailto:support@continua.app"; }}>
              <Mail className="h-4 w-4 mr-2" />Email support@continua.app
            </Button>
            <Button variant="outline" className="w-full rounded-full justify-start" onClick={() => window.open("https://wa.me/254700000000", "_blank", "noopener,noreferrer")}>
              <MessageSquare className="h-4 w-4 mr-2" />Chat on WhatsApp
            </Button>
          </div>
        )}

        {section === "legal" && (
          <div className="space-y-4 pb-4">
            <Header title="Terms & privacy" />
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">TERMS OF SERVICE</p>
              <p className="text-sm text-muted-foreground leading-relaxed">By using Continua you agree that market data, AI theses, and community content are for informational purposes only — nothing in the app is financial advice. You're responsible for your own trading decisions and for keeping your account credentials secure. We may suspend accounts that violate our community guidelines, including spam, harassment, or market-manipulation talk.</p>
            </div>
            <Separator />
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">PRIVACY POLICY</p>
              <p className="text-sm text-muted-foreground leading-relaxed">We collect your profile, portfolio, and activity data to run the app and personalize your feed. We never sell your data. Payment method details are stored as masked references only. You can download or delete your data anytime from Settings → Your data.</p>
            </div>
            <p className="text-[0.6875rem] text-muted-foreground">Last updated August 2026</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ icon, title, desc, checked, onChange, disabled }: any) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground shrink-0">{icon}</div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{title}</div>
          <div className="text-[0.6875rem] text-muted-foreground truncate">{desc}</div>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
