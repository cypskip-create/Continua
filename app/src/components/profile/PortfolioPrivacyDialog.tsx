import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, DollarSign, Percent, Shield, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  portfolioPublic: boolean;
  onSaved?: () => void;
}

export function PortfolioPrivacyDialog({ open, onOpenChange, portfolioPublic, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isPublic, setIsPublic] = useState(portfolioPublic);
  const [hideAmounts, setHideAmounts] = useState(false);
  const [hideGains, setHideGains] = useState(false);
  const [showOnlyTopHoldings, setShowOnlyTop] = useState(false);
  const [followersOnly, setFollowersOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setIsPublic(portfolioPublic);
      try {
        const stored = localStorage.getItem(`portfolio_privacy_${user?.id}`);
        if (stored) {
          const p = JSON.parse(stored);
          setHideAmounts(!!p.hideAmounts);
          setHideGains(!!p.hideGains);
          setShowOnlyTop(!!p.showOnlyTopHoldings);
          setFollowersOnly(!!p.followersOnly);
        }
      } catch {}
    }
  }, [open, portfolioPublic, user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({ portfolio_public: isPublic }).eq("user_id", user.id);
      if (error) throw error;
      try {
        localStorage.setItem(`portfolio_privacy_${user.id}`, JSON.stringify({ hideAmounts, hideGains, showOnlyTopHoldings, followersOnly }));
      } catch {}
      toast({ title: "Portfolio settings saved", description: isPublic ? "Your portfolio is now visible to others" : "Your portfolio is now private" });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" />Portfolio Privacy</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className={`p-3 rounded-xl border ${isPublic ? "bg-bull/5 border-bull/30" : "bg-muted/30 border-border"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isPublic ? "bg-bull/15 text-bull" : "bg-muted text-muted-foreground"}`}>
                  {isPublic ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                </div>
                <div>
                  <div className="text-sm font-bold">{isPublic ? "Public portfolio" : "Private portfolio"}</div>
                  <div className="text-[0.6875rem] text-muted-foreground">{isPublic ? "Anyone visiting your profile can see your holdings" : "Only you can see your holdings"}</div>
                </div>
              </div>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </div>
          </div>

          {isPublic && (
            <>
              <Separator />
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">What visitors see</p>
              <Row icon={<DollarSign className="h-4 w-4" />} title="Hide amounts" desc="Hide share counts and KES values" checked={hideAmounts} onChange={setHideAmounts} />
              <Row icon={<Percent className="h-4 w-4" />} title="Hide gains/losses" desc="Show holdings without P&L" checked={hideGains} onChange={setHideGains} />
              <Row icon={<Eye className="h-4 w-4" />} title="Show only top 5 holdings" desc="Limit to your largest positions" checked={showOnlyTopHoldings} onChange={setShowOnlyTop} />
              <Separator />
              <Row icon={<Shield className="h-4 w-4" />} title="Followers only" desc="Only accounts you approve can view holdings" checked={followersOnly} onChange={setFollowersOnly} />
            </>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1 rounded-full" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
