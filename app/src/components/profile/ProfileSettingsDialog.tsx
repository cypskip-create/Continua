import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Check, X, AtSign, Eye, Bell, MessageCircle, Heart, UserPlus, Shield, Lock, Globe, AlertCircle, Languages, Palette, Zap, Volume2, Database, UserX, VolumeX, Mail, KeyRound, Trash2, Download, Type, Accessibility, Smartphone, ChevronRight, ArrowLeft, CreditCard, Fingerprint, HelpCircle, FileText, Plus, Star, MessageSquare } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { applyFontSizeName, FONT_SCALES } from "@/lib/appearance";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useAppLock } from "@/hooks/useAppLock";

interface ProfileSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentHandle?: string | null;
  portfolioPublic: boolean;
  onSaved?: () => void;
  initialSection?: Section;
}

const HANDLE_REGEX = /^[a-z0-9_]{3,20}$/;

export type Section = "menu" | "account" | "privacy" | "notifications" | "content" | "display" | "language" | "accessibility" | "data" | "blocked" | "muted" | "payment" | "help" | "legal" | "about";

export function ProfileSettingsDialog({ open, onOpenChange, currentHandle, portfolioPublic, onSaved, initialSection }: ProfileSettingsDialogProps) {
  const { user, signOut } = useAuth() as any;
  const { toast } = useToast();
  const [section, setSection] = useState<Section>(initialSection || "menu");
  const { methods: paymentMethods, addMethod: addPaymentMethod, removeMethod: removePaymentMethod, setDefault: setDefaultPaymentMethod } = usePaymentMethods();
  const appLock = useAppLock();
  const [newMethodType, setNewMethodType] = useState<"mpesa" | "card">("mpesa");
  const [newMethodValue, setNewMethodValue] = useState("");
  const [newMethodExpiry, setNewMethodExpiry] = useState("");
  const [addingMethod, setAddingMethod] = useState(false);
  const [handle, setHandle] = useState(currentHandle || "");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [portfolioOn, setPortfolioOn] = useState(portfolioPublic);

  const [prefs, setPrefs] = useState<any>({
    protected_account: false, allow_dms_from: "everyone", allow_tagging: "everyone",
    show_activity_status: true, hide_likes: false,
    autoplay_videos: "wifi", data_saver: false,
    theme: "system", font_size: "default", reduce_motion: false, high_contrast: false,
    language: "en", timezone: "Africa/Nairobi",
    notif_likes: true, notif_comments: true, notif_reposts: true, notif_follows: true,
    notif_mentions: true, notif_dms: true, notif_quality: "all", email_digest: "weekly",
    discoverable_by_email: true, discoverable_by_phone: false, personalized_feed: true,
  });
  const [blockedKeyword, setBlockedKeyword] = useState("");
  const [mutedKeywords, setMutedKeywords] = useState<{ id: string; keyword: string }[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [mutedUsers, setMutedUsers] = useState<any[]>([]);

  // Reset when dialog opens
  useEffect(() => {
    if (!open) return;
    setSection(initialSection || "menu");
    setHandle(currentHandle || "");
    setPortfolioOn(portfolioPublic);
    setAvailable(null);
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("user_preferences" as any).select("*").eq("user_id", user.id).maybeSingle();
      if (data) {
        setPrefs((p: any) => ({ ...p, ...(data as any) }));
        if ((data as any).font_size) applyFontSizeName((data as any).font_size);
      }
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
  }, [open, currentHandle, portfolioPublic, user, initialSection]);

  // Handle availability check
  useEffect(() => {
    const v = handle.trim().toLowerCase();
    if (!v || v === (currentHandle || "").toLowerCase()) { setAvailable(null); return; }
    if (!HANDLE_REGEX.test(v)) { setAvailable(false); return; }
    setChecking(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.from("profiles_public").select("user_id").eq("handle", v).maybeSingle();
      setAvailable(!data || data.user_id === user?.id);
      setChecking(false);
    }, 400);
    return () => clearTimeout(t);
  }, [handle, currentHandle, user]);

  const handleValid = HANDLE_REGEX.test(handle.trim().toLowerCase());

  const updatePref = (key: string, value: any) => setPrefs((p: any) => ({ ...p, [key]: value }));

  const persistPrefs = async (next: any) => {
    if (!user) return;
    await supabase.from("user_preferences" as any).upsert({ user_id: user.id, ...next }, { onConflict: "user_id" } as any);
  };

  const togglePref = async (key: string, value: any) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    if (key === "font_size") applyFontSizeName(value);
    await persistPrefs(next);
  };


  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const updates: any = { portfolio_public: portfolioOn };
      const newHandle = handle.trim().toLowerCase();
      if (newHandle && newHandle !== (currentHandle || "").toLowerCase()) {
        if (!handleValid) { toast({ title: "Invalid handle", variant: "destructive" }); setSaving(false); return; }
        if (available === false) { toast({ title: "Handle taken", variant: "destructive" }); setSaving(false); return; }
        updates.handle = newHandle;
      }
      const { error } = await supabase.from("profiles").update(updates).eq("user_id", user.id);
      if (error) throw error;
      await persistPrefs(prefs);
      toast({ title: "Saved" });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
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
    const a = document.createElement("a"); a.href = url; a.download = `tradershub-data-${user.id}.json`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Data exported" });
  };

  const sections: { id: Section; label: string; icon: any; desc: string }[] = [
    { id: "account", label: "Your account", icon: AtSign, desc: "Username, email, password" },
    { id: "payment", label: "Payment methods", icon: CreditCard, desc: "M-Pesa & cards for Premium billing" },
    { id: "privacy", label: "Privacy & safety", icon: Shield, desc: "Audience, tagging, app lock, blocked & muted" },
    { id: "notifications", label: "Notifications", icon: Bell, desc: "What alerts you receive" },
    { id: "content", label: "Content preferences", icon: Eye, desc: "Autoplay, data saver" },
    { id: "display", label: "Display", icon: Palette, desc: "Theme, font size" },
    { id: "language", label: "Languages", icon: Languages, desc: "Display language, timezone" },
    { id: "accessibility", label: "Accessibility", icon: Accessibility, desc: "Motion, contrast" },
    { id: "data", label: "Your data", icon: Database, desc: "Download or delete your data" },
    { id: "help", label: "Help & support", icon: HelpCircle, desc: "FAQs & contact us" },
    { id: "legal", label: "Terms & privacy", icon: FileText, desc: "Terms of service, privacy policy" },
    { id: "about", label: "About", icon: Smartphone, desc: "App version" },
  ];

  const Header = ({ title }: { title: string }) => (
    <div className="flex items-center gap-2 mb-3">
      <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2" onClick={() => setSection("menu")}><ArrowLeft className="h-4 w-4" /></Button>
      <h3 className="text-base font-bold">{title}</h3>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full w-screen h-[100dvh] p-0 rounded-none border-0 overflow-hidden flex flex-col sm:max-w-full">
        <DialogHeader className="p-4 pb-2 shrink-0 border-b border-border">
          <DialogTitle className="text-base">{section === "menu" ? "Settings" : ""}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-4">
          {section === "menu" && (
            <div className="space-y-1 pb-4">
              {sections.map(s => (
                <button key={s.id} onClick={() => setSection(s.id)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition text-left">
                  <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground"><s.icon className="h-4 w-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{s.label}</div>
                    <div className="text-[0.6875rem] text-muted-foreground truncate">{s.desc}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
              <Separator className="my-2" />
              <button onClick={async () => { await signOut?.(); onOpenChange(false); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-destructive/10 transition text-left text-destructive">
                <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center"><KeyRound className="h-4 w-4" /></div>
                <div className="flex-1 text-sm font-semibold">Log out</div>
              </button>
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
              <Button variant="outline" className="w-full rounded-full" onClick={() => toast({ title: "Password reset email sent", description: "Check your inbox" })}>
                <KeyRound className="h-4 w-4 mr-2" />Change password
              </Button>
              <Button className="w-full rounded-full" onClick={handleSave} disabled={saving || (handle !== (currentHandle || "") && available === false)}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
              </Button>
            </div>
          )}

          {section === "privacy" && (
            <div className="space-y-3 pb-4">
              <Header title="Privacy & safety" />
              <Row
                icon={<Fingerprint className="h-4 w-4" />}
                title="App Lock"
                desc={appLock.supported ? "Require Face ID, fingerprint, or your device PIN to open the app" : "Not supported on this device or browser"}
                checked={appLock.enabled}
                disabled={!appLock.supported}
                onChange={async (v) => {
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
              <Separator />
              <Row icon={<Lock className="h-4 w-4" />} title="Protected account" desc="Only approved followers see your posts" checked={prefs.protected_account} onChange={(v) => togglePref("protected_account", v)} />
              <Row icon={<Eye className="h-4 w-4" />} title="Portfolio public" desc="Allow others to view your holdings" checked={portfolioOn} onChange={async (v) => { setPortfolioOn(v); if (user) await supabase.from("profiles").update({ portfolio_public: v }).eq("user_id", user.id); onSaved?.(); }} />
              <Row icon={<Heart className="h-4 w-4" />} title="Hide likes" desc="Hide your liked posts from your profile" checked={prefs.hide_likes} onChange={(v) => togglePref("hide_likes", v)} />
              <Row icon={<Globe className="h-4 w-4" />} title="Show activity status" desc="Display when you're online" checked={prefs.show_activity_status} onChange={(v) => togglePref("show_activity_status", v)} />
              <Separator />
              <SelectRow label="Direct messages from" value={prefs.allow_dms_from} options={[["everyone","Everyone"],["following","People you follow"],["nobody","No one"]]} onChange={(v) => togglePref("allow_dms_from", v)} />
              <SelectRow label="Allow tagging from" value={prefs.allow_tagging} options={[["everyone","Everyone"],["following","People you follow"],["nobody","No one"]]} onChange={(v) => togglePref("allow_tagging", v)} />
              <Separator />
              <button onClick={() => setSection("blocked")} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted/50">
                <span className="flex items-center gap-3 text-sm font-medium"><UserX className="h-4 w-4" />Blocked accounts</span>
                <span className="text-xs text-muted-foreground">{blockedUsers.length} <ChevronRight className="h-4 w-4 inline" /></span>
              </button>
              <button onClick={() => setSection("muted")} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted/50">
                <span className="flex items-center gap-3 text-sm font-medium"><VolumeX className="h-4 w-4" />Muted accounts & words</span>
                <span className="text-xs text-muted-foreground">{mutedUsers.length + mutedKeywords.length} <ChevronRight className="h-4 w-4 inline" /></span>
              </button>
              <Separator />
              <p className="text-xs font-semibold text-muted-foreground mt-2">Discoverability</p>
              <Row icon={<Mail className="h-4 w-4" />} title="Find by email" desc="Let others find you by email address" checked={prefs.discoverable_by_email} onChange={(v) => togglePref("discoverable_by_email", v)} />
              <Row icon={<Smartphone className="h-4 w-4" />} title="Find by phone" desc="Let others find you by phone number" checked={prefs.discoverable_by_phone} onChange={(v) => togglePref("discoverable_by_phone", v)} />
              <Row icon={<Zap className="h-4 w-4" />} title="Personalized feed" desc="Use your activity to rank posts" checked={prefs.personalized_feed} onChange={(v) => togglePref("personalized_feed", v)} />
            </div>
          )}

          {section === "notifications" && (
            <div className="space-y-3 pb-4">
              <Header title="Notifications" />
              <Row icon={<Heart className="h-4 w-4" />} title="Likes" desc="When someone likes your post" checked={prefs.notif_likes} onChange={(v) => togglePref("notif_likes", v)} />
              <Row icon={<MessageCircle className="h-4 w-4" />} title="Comments & replies" desc="When someone replies to you" checked={prefs.notif_comments} onChange={(v) => togglePref("notif_comments", v)} />
              <Row icon={<AlertCircle className="h-4 w-4" />} title="Reposts" desc="When someone reposts you" checked={prefs.notif_reposts} onChange={(v) => togglePref("notif_reposts", v)} />
              <Row icon={<UserPlus className="h-4 w-4" />} title="New followers" desc="When someone follows you" checked={prefs.notif_follows} onChange={(v) => togglePref("notif_follows", v)} />
              <Row icon={<AtSign className="h-4 w-4" />} title="Mentions" desc="When you're @mentioned" checked={prefs.notif_mentions} onChange={(v) => togglePref("notif_mentions", v)} />
              <Row icon={<MessageCircle className="h-4 w-4" />} title="Direct messages" desc="When you receive a DM" checked={prefs.notif_dms} onChange={(v) => togglePref("notif_dms", v)} />
              <Separator />
              <SelectRow label="Notification quality" value={prefs.notif_quality} options={[["all","All"],["filtered","Filtered (less spam)"]]} onChange={(v) => togglePref("notif_quality", v)} />
              <SelectRow label="Email digest" value={prefs.email_digest} options={[["daily","Daily"],["weekly","Weekly"],["off","Off"]]} onChange={(v) => togglePref("email_digest", v)} />
            </div>
          )}

          {section === "content" && (
            <div className="space-y-3 pb-4">
              <Header title="Content preferences" />
              
              <SelectRow label="Autoplay videos" value={prefs.autoplay_videos} options={[["always","Always"],["wifi","Wi-Fi only"],["never","Never"]]} onChange={(v) => togglePref("autoplay_videos", v)} />
              <Row icon={<Database className="h-4 w-4" />} title="Data saver" desc="Lower image quality to save data" checked={prefs.data_saver} onChange={(v) => togglePref("data_saver", v)} />
            </div>
          )}

          {section === "display" && (
            <div className="space-y-3 pb-4">
              <Header title="Display" />
              <SelectRow label="Theme" value={prefs.theme} options={[["light","Light"],["dark","Dark"],["system","Match system"]]} onChange={(v) => togglePref("theme", v)} />
              <SelectRow label="Font size" value={prefs.font_size} options={[["small","Small"],["default","Default"],["large","Large"],["xlarge","Extra large"]]} onChange={(v) => togglePref("font_size", v)} />
            </div>
          )}

          {section === "language" && (
            <div className="space-y-3 pb-4">
              <Header title="Languages & region" />
              <SelectRow label="Display language" value={prefs.language} options={[["en","English"],["sw","Kiswahili"]]} onChange={(v) => togglePref("language", v)} />
              <SelectRow label="Timezone" value={prefs.timezone} options={[["Africa/Nairobi","Africa/Nairobi (EAT)"],["UTC","UTC"]]} onChange={(v) => togglePref("timezone", v)} />
            </div>
          )}

          {section === "accessibility" && (
            <div className="space-y-3 pb-4">
              <Header title="Accessibility" />
              <Row icon={<Zap className="h-4 w-4" />} title="Reduce motion" desc="Minimize animations" checked={prefs.reduce_motion} onChange={(v) => togglePref("reduce_motion", v)} />
              <Row icon={<Palette className="h-4 w-4" />} title="High contrast" desc="Stronger color contrast for readability" checked={prefs.high_contrast} onChange={(v) => togglePref("high_contrast", v)} />
            </div>
          )}

          {section === "data" && (
            <div className="space-y-3 pb-4">
              <Header title="Your data" />
              <Button variant="outline" className="w-full rounded-full justify-start" onClick={exportData}><Download className="h-4 w-4 mr-2" />Download your data</Button>
              <Button variant="outline" className="w-full rounded-full justify-start text-destructive" onClick={() => toast({ title: "Contact support", description: "Email support@app to delete your account" })}><Trash2 className="h-4 w-4 mr-2" />Deactivate account</Button>
            </div>
          )}

          {section === "blocked" && (
            <div className="space-y-3 pb-4">
              <Header title="Blocked accounts" />
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
              <Header title="Muted" />
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

          {section === "about" && (
            <div className="space-y-3 pb-4 text-sm">
              <Header title="About" />
              <Row label="Version" value="1.0.0" />
              <Row label="Build" value="TradersHub Kenya" />
              <Separator />
              <button onClick={() => setSection("legal")} className="w-full flex items-center justify-between text-left text-sm p-3 rounded-xl hover:bg-muted/40">Terms of Service<ChevronRight className="h-4 w-4 text-muted-foreground" /></button>
              <button onClick={() => setSection("legal")} className="w-full flex items-center justify-between text-left text-sm p-3 rounded-xl hover:bg-muted/40">Privacy Policy<ChevronRight className="h-4 w-4 text-muted-foreground" /></button>
              <button onClick={() => setSection("help")} className="w-full flex items-center justify-between text-left text-sm p-3 rounded-xl hover:bg-muted/40">Help Center<ChevronRight className="h-4 w-4 text-muted-foreground" /></button>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Row(props: any) {
  if (props.label && !props.icon) {
    return <div className="flex justify-between items-center py-2"><span className="text-sm">{props.label}</span><span className="text-sm text-muted-foreground">{props.value}</span></div>;
  }
  const { icon, title, desc, checked, onChange, disabled } = props;
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

function SelectRow({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
