import { useState, useMemo, useEffect } from "react";
import {
  Bell, Heart, MessageCircle, Repeat2, UserPlus, TrendingUp, TrendingDown,
  Trash2, Settings as SettingsIcon, ChevronRight, ArrowLeft, Newspaper,
  DollarSign, Users, Zap, Eye, Target, MoreHorizontal, CheckCheck, AtSign,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useNotifications, AppNotification } from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getInitials } from "@/lib/handle";

const featureMeta: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  tradershub: { label: "TradersHub", icon: MessageCircle, color: "text-primary", bg: "bg-primary/10" },
  social:     { label: "Social",     icon: Users,         color: "text-accent",  bg: "bg-accent/10" },
  alerts:     { label: "Price Alerts", icon: Target,      color: "text-bull",    bg: "bg-bull/10" },
  news:       { label: "News",       icon: Newspaper,     color: "text-primary", bg: "bg-primary/10" },
  portfolio:  { label: "Portfolio",  icon: DollarSign,    color: "text-bull",    bg: "bg-bull/10" },
  system:     { label: "System",     icon: Zap,           color: "text-accent",  bg: "bg-accent/10" },
};

// Types that render with the actor's avatar + a small type badge, X/Instagram
// style -- these all have a real person behind them (someone liked, followed,
// replied...). Everything else renders as an icon-tile "system" card instead.
const ACTOR_BADGE: Record<string, { icon: any; className: string }> = {
  like:    { icon: Heart,        className: "bg-rose-500 text-white" },
  comment: { icon: MessageCircle, className: "bg-primary text-primary-foreground" },
  reply:   { icon: MessageCircle, className: "bg-primary text-primary-foreground" },
  repost:  { icon: Repeat2,      className: "bg-bull text-white" },
  follow:  { icon: UserPlus,     className: "bg-primary text-primary-foreground" },
  mention: { icon: AtSign,       className: "bg-accent text-accent-foreground" },
};

const typeIcon: Record<string, any> = {
  like: Heart, comment: MessageCircle, reply: MessageCircle, repost: Repeat2,
  follow: UserPlus, mention: MessageCircle, alert: Target, news: Newspaper, system: Zap,
};

const filters = [
  { id: "all", label: "All" },
  { id: "tradershub", label: "TradersHub" },
  { id: "social", label: "Social" },
  { id: "alerts", label: "Alerts" },
  { id: "portfolio", label: "Portfolio" },
  { id: "news", label: "News" },
];

const NOTIF_PREF_ROWS = [
  { key: "notif_comments", label: "Comments & replies", desc: "When someone replies to you or your comment" },
  { key: "notif_follows", label: "New followers", desc: "When someone follows you" },
];

function formatTime(date: string) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Groups notifications the way a real inbox does -- Today / Yesterday / This
 *  week / Earlier -- rather than by feature (the filter chips already slice
 *  by feature, so grouping by the same thing again was redundant). */
function dateBucket(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This week";
  return "Earlier";
}
const BUCKET_ORDER = ["Today", "Yesterday", "This week", "Earlier"];

export default function Notifications() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const { notifications, loading, unreadCount, markAsRead, markAllAsRead, remove, clearAll } = useNotifications();
  const [activeFilter, setActiveFilter] = useState(() => searchParams.get("tab") === "alerts" ? "alerts" : "all");
  const [showSettings, setShowSettings] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    notif_comments: true, notif_follows: true,
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("user_preferences" as any).select("*").eq("user_id", user.id).maybeSingle();
      if (data) setPrefs(p => ({ ...p, ...(data as any) }));
    })();
  }, [user]);

  const togglePref = async (key: string, value: boolean) => {
    setPrefs(p => ({ ...p, [key]: value }));
    if (!user) return;
    await supabase.from("user_preferences" as any).upsert({ user_id: user.id, [key]: value }, { onConflict: "user_id" } as any);
  };

  const filtered = useMemo(() => {
    if (activeFilter === "all") return notifications;
    return notifications.filter(n => n.feature === activeFilter);
  }, [notifications, activeFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, AppNotification[]>();
    filtered.forEach(n => {
      const key = dateBucket(n.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    });
    return BUCKET_ORDER.filter(b => map.has(b)).map(b => [b, map.get(b)!] as const);
  }, [filtered]);

  const handleClick = (n: AppNotification) => {
    if (!n.read) markAsRead(n.id);
    if (n.action_url) navigate(n.action_url);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20 flex items-center justify-center px-6 text-center">
        <div>
          <Bell className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
          <h2 className="font-bold mb-1">Sign in to view notifications</h2>
          <Button className="mt-4 btn-primary" onClick={() => navigate('/auth')}>Sign in</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9 rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-base font-bold flex items-center gap-2">
              Notifications
              {unreadCount > 0 && <Badge className="h-5 min-w-5 text-[10px] bg-primary rounded-full">{unreadCount}</Badge>}
            </h1>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)} className="h-9 w-9 rounded-full">
              <SettingsIcon className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={unreadCount === 0} onClick={() => { markAllAsRead(); toast({ title: "All marked as read" }); }}>
                  <CheckCheck className="h-3.5 w-3.5 mr-2" />Mark all as read
                </DropdownMenuItem>
                <DropdownMenuItem disabled={notifications.length === 0} className="text-destructive" onClick={() => { clearAll(); toast({ title: "Cleared" }); }}>
                  <Trash2 className="h-3.5 w-3.5 mr-2" />Clear all
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex overflow-x-auto scrollbar-hide px-4 gap-1.5 pb-3">
          {filters.map(f => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              data-small-target
              className={`py-1.5 px-3.5 text-xs font-semibold whitespace-nowrap rounded-full transition-all ${
                activeFilter === f.id ? 'contrast-active' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <div className="pb-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-7 w-7 border-2 border-primary/30 border-t-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center px-6">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <Bell className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <h3 className="font-semibold text-[15px] mb-1">All caught up</h3>
            <p className="text-[13px] text-muted-foreground">Nothing here {activeFilter !== "all" ? `in ${filters.find(f => f.id === activeFilter)?.label}` : "right now"}.</p>
          </div>
        ) : (
          <div>
            {grouped.map(([bucket, items]) => (
              <div key={bucket}>
                <div className="px-4 pt-4 pb-1.5">
                  <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{bucket}</h2>
                </div>
                <div>
                  {items.map(n => {
                    const meta = featureMeta[n.feature] || featureMeta.system;
                    const badge = ACTOR_BADGE[n.type];
                    const hasActor = !!n.actor && !!badge;
                    const Icon = typeIcon[n.type] || Bell;

                    return (
                      <div
                        key={n.id}
                        onClick={() => handleClick(n)}
                        className={`relative flex items-start gap-3 py-3 pl-4 pr-2 border-b border-border/40 transition-colors cursor-pointer hover:bg-muted/25 ${
                          !n.read ? 'bg-primary/[0.04]' : ''
                        }`}
                      >
                        {!n.read && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />}

                        {hasActor ? (
                          <div className="relative shrink-0">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={n.actor?.avatar_url || ""} className="object-cover" />
                              <AvatarFallback className="text-[11px] font-bold bg-primary/10 text-primary">{getInitials(n.actor?.full_name || n.actor?.handle)}</AvatarFallback>
                            </Avatar>
                            <span className={`absolute -bottom-0.5 -right-0.5 h-4.5 w-4.5 rounded-full flex items-center justify-center ring-2 ring-background ${badge.className}`}>
                              <badge.icon className="h-2.5 w-2.5" fill={n.type === "like" ? "currentColor" : "none"} />
                            </span>
                          </div>
                        ) : (
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${meta.bg}`}>
                            <Icon className={`h-4.5 w-4.5 ${meta.color}`} />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className="font-semibold text-[13px] truncate">{n.title}</h3>
                            {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                          </div>
                          <p className="text-[12px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{n.message}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-muted-foreground tabular">{formatTime(n.created_at)}</span>
                            {n.action_url && (
                              <span className="text-[11px] text-primary font-medium inline-flex items-center gap-0.5">
                                View <ChevronRight className="h-3 w-3" />
                              </span>
                            )}
                          </div>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Notification options" className="h-7 w-7 shrink-0 mt-0.5" onClick={e => e.stopPropagation()}>
                              <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                            {!n.read && (
                              <DropdownMenuItem onClick={() => markAsRead(n.id)}>
                                <Eye className="h-3.5 w-3.5 mr-2" />Mark as read
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-destructive" onClick={() => remove(n.id)}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={showSettings} onOpenChange={setShowSettings}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[80vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="text-base flex items-center gap-2"><SettingsIcon className="h-4 w-4 text-primary" />Notification settings</SheetTitle>
          </SheetHeader>

          <div className="mt-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">TradersHub</p>
            <div className="divide-y divide-border/40">
              {NOTIF_PREF_ROWS.map(row => (
                <div key={row.key} className="flex items-center justify-between py-3.5">
                  <div className="min-w-0 pr-3">
                    <div className="text-sm font-medium">{row.label}</div>
                    <div className="text-[11px] text-muted-foreground">{row.desc}</div>
                  </div>
                  <Switch checked={prefs[row.key]} onCheckedChange={c => togglePref(row.key, c)} />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Always on</p>
            <div className="divide-y divide-border/40">
              {[
                { icon: Target, label: "Price alerts", desc: "You'll get these because you set the alert yourself" },
                { icon: DollarSign, label: "Portfolio activity", desc: "Trades and dividend events on holdings you track" },
                { icon: Newspaper, label: "News", desc: "Headlines on stocks in your portfolio or watchlist" },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-3 py-3">
                  <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0"><row.icon className="h-3.5 w-3.5 text-muted-foreground" /></div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{row.label}</div>
                    <div className="text-[11px] text-muted-foreground">{row.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">These aren't things to mute individually — remove a price alert or a stock from your watchlist/portfolio to stop getting them.</p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
