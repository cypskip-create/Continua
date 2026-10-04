import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toPng, toBlob } from "html-to-image";
import { Sheet, SheetContent, SheetClose, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { MessageSquare, Download, Share2, Loader2, DollarSign, Percent, Eye, Calendar, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { shareImageBlob } from "@/lib/share";
import { PortfolioShareCard, type ShareableHolding } from "@/components/portfolio/PortfolioShareCard";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  holdings: ShareableHolding[];
  totalValue: number;
  totalGain: number;
  gainPercent: number;
  todayGain: number;
  todayPercent: number;
  /** Pre-fills the customization toggles from the owner's saved privacy
   *  defaults (Settings → Privacy & safety) — still freely adjustable here
   *  for this one share without changing those saved defaults. */
  defaults: { hideAmounts: boolean; hideGains: boolean; topHoldingsOnly: boolean };
}

/**
 * "Different ways to share" = post to TradersHub, download an image card, or
 * hand it to the OS share sheet — all three render from the exact same
 * PortfolioShareCard + toggle state, so whichever way someone shares, what
 * they share matches what they saw in the preview.
 */
export function SharePortfolioDialog({ open, onOpenChange, holdings, totalValue, totalGain, gainPercent, todayGain, todayPercent, defaults }: Props) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { toast } = useToast();
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);

  const [hideAmounts, setHideAmounts] = useState(defaults.hideAmounts);
  const [hideGains, setHideGains] = useState(defaults.hideGains);
  const [topHoldingsOnly, setTopHoldingsOnly] = useState(defaults.topHoldingsOnly);
  const [showDayChange, setShowDayChange] = useState(true);
  const [working, setWorking] = useState<"post" | "download" | "share" | null>(null);

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "My";

  const cardProps = useMemo(() => ({
    displayName,
    totalValue, totalGain, gainPercent, todayGain, todayPercent,
    holdings, hideAmounts, hideGains, topHoldingsOnly, showDayChange,
  }), [displayName, totalValue, totalGain, gainPercent, todayGain, todayPercent, holdings, hideAmounts, hideGains, topHoldingsOnly, showDayChange]);

  const renderToBlob = async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    // Two passes: html-to-image's font/layout measurement is occasionally
    // off on the very first render of a node that just became visible
    // (dialog open transition) — a quick throwaway render warms it up.
    await toPng(cardRef.current, { pixelRatio: 2 });
    return toBlob(cardRef.current, { pixelRatio: 2 });
  };

  const handlePostToTradersHub = () => {
    const params = new URLSearchParams({
      compose: "true",
      attachPortfolio: "true",
      hideAmounts: String(hideAmounts),
      hideGains: String(hideGains),
      topOnly: String(topHoldingsOnly),
      dayChange: String(showDayChange),
    });
    onOpenChange(false);
    navigate(`/traders-hub?${params.toString()}`);
  };

  const handleDownload = async () => {
    setWorking("download");
    try {
      const blob = await renderToBlob();
      if (!blob) throw new Error("Couldn't render the card");
      const result = await shareImageBlob(blob, "continua-portfolio.png", { title: "My Continua portfolio" });
      if (result.method === "download") toast({ title: "Image saved" });
      else if (!result.ok) toast({ title: "Couldn't save image", variant: "destructive" });
    } catch {
      toast({ title: "Couldn't generate the image", variant: "destructive" });
    } finally {
      setWorking(null);
    }
  };

  const handleNativeShare = async () => {
    setWorking("share");
    try {
      const blob = await renderToBlob();
      if (!blob) throw new Error("Couldn't render the card");
      const result = await shareImageBlob(blob, "continua-portfolio.png", { title: "My Continua portfolio", text: "Check out my portfolio on Continua" });
      if (result.method === "clipboard") toast({ title: "Image copied to clipboard" });
      else if (result.method === "download") toast({ title: "Sharing isn't available here — image downloaded instead" });
      else if (!result.ok && result.method !== "cancelled") toast({ title: "Couldn't share", variant: "destructive" });
    } catch {
      toast({ title: "Couldn't generate the image", variant: "destructive" });
    } finally {
      setWorking(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Full-screen bottom sheet — slides up from the bottom at the same speed as the
       *  Chart Indicators sheet (both share the same Sheet primitive/timing), instead of
       *  the old center-dialog motion. Header and the action buttons are pinned in
       *  place; only the middle (preview + toggles) area scrolls, and only if a given
       *  screen is too short to show everything at once. */}
      <SheetContent
        side="bottom"
        hideClose
        className="max-w-none w-screen h-[100dvh] max-h-[100dvh] inset-x-0 bottom-0 top-auto rounded-none border-0 border-t-0 p-0 gap-0 flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
          <SheetTitle className="text-base">Share Portfolio</SheetTitle>
          <SheetClose className="rounded-full p-1.5 opacity-70 hover:opacity-100 hover:bg-muted transition">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetClose>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex justify-center py-3">
            <PortfolioShareCard ref={cardRef} {...cardProps} />
          </div>

          <Separator />

          <div className="space-y-3 px-4 py-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Customize this share</p>
            <ToggleRow icon={<DollarSign className="h-4 w-4" />} title="Hide amounts" desc="Show percentages only, no KES values" checked={hideAmounts} onChange={setHideAmounts} />
            <ToggleRow icon={<Percent className="h-4 w-4" />} title="Hide gains/losses" desc="Just show holdings, no P&L" checked={hideGains} onChange={setHideGains} />
            <ToggleRow icon={<Eye className="h-4 w-4" />} title="Top 5 holdings only" desc="Leave out smaller positions" checked={topHoldingsOnly} onChange={setTopHoldingsOnly} />
            <ToggleRow icon={<Calendar className="h-4 w-4" />} title="Show today's change" desc="Off shows all-time gain instead" checked={showDayChange} onChange={setShowDayChange} />
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-background px-4 py-3 space-y-2" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <Button className="w-full rounded-full h-11 font-semibold" onClick={handlePostToTradersHub}>
            <MessageSquare className="h-4 w-4 mr-2" />Post to TradersHub
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="rounded-full h-11 font-semibold" onClick={handleDownload} disabled={working !== null}>
              {working === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Download className="h-4 w-4 mr-2" />Download</>}
            </Button>
            <Button variant="outline" className="rounded-full h-11 font-semibold" onClick={handleNativeShare} disabled={working !== null}>
              {working === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Share2 className="h-4 w-4 mr-2" />Share via…</>}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ToggleRow({ icon, title, desc, checked, onChange }: { icon: React.ReactNode; title: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
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
