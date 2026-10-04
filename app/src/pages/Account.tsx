import { useState, useEffect } from "react";
import { User, LogOut, Eye, EyeOff, Type, Sparkles, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { TopBar } from "@/components/shared/TopBar";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useNavigate } from "react-router-dom";
import { EditProfileDialog } from "@/components/profile/EditProfileDialog";
import { useToast } from "@/hooks/use-toast";
import { applyFontScale, getFontScale } from "@/lib/appearance";

export default function Account() {
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { profile, updateProfile } = useProfile();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [portfolioPublic, setPortfolioPublic] = useState(true);
  const [fontScale, setFontScale] = useState<string>(getFontScale);

  useEffect(() => {
    applyFontScale(fontScale);
  }, [fontScale]);

  useEffect(() => {
    const pp = profile?.portfolio_public;
    if (pp !== undefined && pp !== null) setPortfolioPublic(!!pp);
  }, [profile]);

  const handleSignOut = async () => { await signOut(); navigate('/auth'); };
  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const isPremium = profile?.subscription_plan === 'premium' || profile?.subscription_plan === 'premium_plus';

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar
        title="Profile"
        showSearch={false}
        showNotifications
        showWidgetSettings
        onWidgetSettingsClick={() => navigate('/settings')}
      />

      <div className="px-4 pt-6 space-y-8">
        {/* ── IDENTITY — canvas ── */}
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={profile?.avatar_url || ""} className="object-cover" />
            <AvatarFallback className="bg-muted text-foreground text-lg font-semibold">
              {profile?.full_name ? getInitials(profile.full_name) : <User className="h-6 w-6" />}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="text-lg font-semibold truncate">{profile?.full_name || user?.email?.split('@')[0] || 'Guest'}</h2>
              {isPremium && <Badge className="h-4 px-1.5 text-[0.5625rem] brand-active border-0"><Crown className="h-2.5 w-2.5 mr-0.5" />Premium</Badge>}
            </div>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            <button
              onClick={() => setEditProfileOpen(true)}
              className="mt-1.5 text-xs font-medium text-foreground underline underline-offset-2 decoration-border hover:decoration-foreground"
              data-small-target
            >
              Edit profile
            </button>
          </div>
        </div>

        <EditProfileDialog open={editProfileOpen} onOpenChange={setEditProfileOpen} />

        {/* ── SUBSCRIPTION — compact status, detail lives on /upgrade ── */}
        <section>
          <p className="section-eyebrow mb-3">Subscription</p>
          <button
            data-small-target
            onClick={() => navigate('/upgrade')}
            className="flat-section w-full flex items-center justify-between gap-3 p-4 rounded-xl border border-border/60 text-left hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${isPremium ? 'brand-active' : 'bg-muted'}`}>
                {isPremium ? <Crown className="h-4 w-4" /> : <Sparkles className="h-4 w-4 text-muted-foreground" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{isPremium ? 'Premium' : 'Free plan'}</p>
                <p className="text-[0.6875rem] text-muted-foreground truncate">
                  {isPremium ? 'Real-time prices, unlimited AI, long-form posts' : 'Upgrade for real-time prices & more'}
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-primary shrink-0 whitespace-nowrap">
              {isPremium ? 'Manage →' : 'Upgrade →'}
            </span>
          </button>
        </section>

        {/* ── APPEARANCE ── */}
        <section>
          <p className="section-eyebrow mb-3">Appearance</p>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Theme</p>
                <p className="text-[0.6875rem] text-muted-foreground">Light, Dark, or AMOLED for OLED screens</p>
              </div>
              <ThemeToggle />
            </div>
            <div className="hairline-t pt-4">
              <div className="flex items-center gap-3 mb-3">
                <Type className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Text size</p>
                  <p className="text-[0.6875rem] text-muted-foreground">Global scale</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[{ label: "S", val: "0.9" }, { label: "M", val: "1" }, { label: "L", val: "1.1" }, { label: "XL", val: "1.2" }].map(opt => (
                  <button
                    key={opt.val}
                    onClick={() => setFontScale(opt.val)}
                    data-small-target
                    className={`h-9 rounded-lg text-xs font-semibold transition-colors ${
                      fontScale === opt.val ? "contrast-active" : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── PRIVACY ── */}
        <section>
          <p className="section-eyebrow mb-3">Privacy</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {portfolioPublic ? <Eye className="h-4 w-4 text-muted-foreground" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
              <div>
                <p className="text-sm font-medium">Portfolio visibility</p>
                <p className="text-[0.6875rem] text-muted-foreground">{portfolioPublic ? "Public — visible on your profile" : "Private — only you"}</p>
              </div>
            </div>
            <Switch checked={portfolioPublic} onCheckedChange={async (checked) => {
              setPortfolioPublic(checked);
              await updateProfile({ portfolio_public: checked });
              toast({ title: checked ? "Portfolio public" : "Portfolio private" });
            }} />
          </div>
        </section>

        <Button variant="ghost" className="w-full h-11 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleSignOut}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>

        <p className="text-center text-[0.625rem] text-muted-foreground pb-4">Continua · v1.0</p>
      </div>
    </div>
  );
}
