import { Eye, EyeOff, DollarSign, Percent, Shield } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

export interface PortfolioVisibilitySettings {
  portfolioPublic: boolean;
  hideAmounts: boolean;
  hideGains: boolean;
  topHoldingsOnly: boolean;
  followersOnly: boolean;
}

interface Props {
  value: PortfolioVisibilitySettings;
  onChange: (next: PortfolioVisibilitySettings) => void;
  /** Compact drops the outer "public/private" hero row — used when the page
   *  already shows that state elsewhere (e.g. Track Investments already has
   *  its own privacy summary above the holdings list). */
  compact?: boolean;
}

/**
 * The single source of truth for what "who can see what" means for a
 * portfolio. Used by Settings (Privacy & safety) and by the Portfolio page
 * itself — both read/write the exact same profiles columns, so a change in
 * either place is reflected in the other immediately (via useProfile's
 * shared context, not local state).
 */
export function PortfolioVisibilityToggles({ value, onChange, compact = false }: Props) {
  const set = (patch: Partial<PortfolioVisibilitySettings>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3">
      {!compact && (
        <div className={`p-3 rounded-xl border ${value.portfolioPublic ? "bg-bull/5 border-bull/30" : "bg-muted/30 border-border"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${value.portfolioPublic ? "bg-bull/15 text-bull" : "bg-muted text-muted-foreground"}`}>
                {value.portfolioPublic ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
              </div>
              <div>
                <div className="text-sm font-bold">{value.portfolioPublic ? "Public portfolio" : "Private portfolio"}</div>
                <div className="text-[0.6875rem] text-muted-foreground">{value.portfolioPublic ? "Anyone visiting your profile can see your holdings" : "Only you can see your holdings"}</div>
              </div>
            </div>
            <Switch checked={value.portfolioPublic} onCheckedChange={(v) => set({ portfolioPublic: v })} />
          </div>
        </div>
      )}

      {value.portfolioPublic && (
        <>
          {!compact && <Separator />}
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">What visitors see</p>
          <Row icon={<DollarSign className="h-4 w-4" />} title="Hide amounts" desc="Hide share counts and KES values — percentages still show" checked={value.hideAmounts} onChange={(v) => set({ hideAmounts: v })} />
          <Row icon={<Percent className="h-4 w-4" />} title="Hide gains/losses" desc="Show holdings without any P&L at all" checked={value.hideGains} onChange={(v) => set({ hideGains: v })} />
          <Row icon={<Eye className="h-4 w-4" />} title="Show only top 5 holdings" desc="Limit visitors to your largest positions" checked={value.topHoldingsOnly} onChange={(v) => set({ topHoldingsOnly: v })} />
          <Separator />
          <Row icon={<Shield className="h-4 w-4" />} title="Followers only" desc="Only accounts that follow you can view your holdings" checked={value.followersOnly} onChange={(v) => set({ followersOnly: v })} />
        </>
      )}
    </div>
  );
}

function Row({ icon, title, desc, checked, onChange }: { icon: React.ReactNode; title: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground shrink-0">{icon}</div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{title}</div>
          <div className="text-[0.6875rem] text-muted-foreground truncate">{desc}</div>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
