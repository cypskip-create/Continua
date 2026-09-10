import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil } from "lucide-react";
import { usePortfolio, PortfolioItem } from "@/hooks/usePortfolio";

interface Props {
  /** When provided, the dialog is locked to this stock (Stock Detail page mode). */
  lockedSymbol?: string;
  lockedName?: string;
  lockedSector?: string;
  /** Custom trigger. If omitted a default button is rendered. */
  trigger?: React.ReactNode;
  /** Visual size of the default trigger button. */
  size?: "default" | "sm";
}

/**
 * Single dialog used everywhere the user wants to log an investment they
 * already own. Replaces the old Trade flow.
 *
 * - On the portfolio page (no lockedSymbol): user picks the stock + shares + avg price.
 * - On a stock page (lockedSymbol set): symbol/name are fixed. If the user
 *   already holds the stock, the dialog switches to "Update holding" mode
 *   and weighted-averages the new shares/price into the existing position.
 */
export function AddInvestmentDialog({
  lockedSymbol, lockedName, lockedSector, trigger, size = "default",
}: Props) {
  const { portfolio, addToPortfolio, updatePortfolioItem } = usePortfolio();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const existing: PortfolioItem | undefined = lockedSymbol
    ? portfolio.find(p => p.symbol.toUpperCase() === lockedSymbol.toUpperCase())
    : undefined;

  const [symbol, setSymbol] = useState(lockedSymbol ?? "");
  const [name, setName] = useState(lockedName ?? "");
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [sector, setSector] = useState(lockedSector ?? "");
  const [mode, setMode] = useState<"add" | "replace">("add");

  useEffect(() => {
    if (open) {
      setSymbol(lockedSymbol ?? "");
      setName(lockedName ?? existing?.name ?? "");
      setShares("");
      setAvgCost("");
      setSector(lockedSector ?? existing?.sector ?? "");
      setMode("add");
    }
  }, [open, lockedSymbol, lockedName, lockedSector, existing?.name, existing?.sector]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sharesNum = parseFloat(shares);
    const costNum = parseFloat(avgCost);

    if (!symbol || !name || !sharesNum || !costNum) {
      toast({ title: "Missing info", description: "Fill all required fields", variant: "destructive" });
      return;
    }

    if (existing) {
      let newShares = sharesNum;
      let newAvg = costNum;
      if (mode === "add") {
        const totalShares = existing.shares + sharesNum;
        newShares = totalShares;
        newAvg = ((existing.shares * existing.avg_cost) + (sharesNum * costNum)) / totalShares;
      }
      const result = await updatePortfolioItem(existing.id, {
        shares: newShares,
        avg_cost: parseFloat(newAvg.toFixed(4)),
        sector: sector || existing.sector,
      });
      if (result.error) {
        toast({ title: "Error", description: "Failed to update holding", variant: "destructive" });
        return;
      }
      toast({
        title: "Holding updated",
        description: `${symbol} now ${newShares} shares · avg KES ${newAvg.toFixed(2)}`,
      });
    } else {
      const result = await addToPortfolio(symbol.toUpperCase(), name, sharesNum, costNum, sector || undefined);
      if (result.error) {
        toast({ title: "Error", description: "Failed to add investment", variant: "destructive" });
        return;
      }
      toast({ title: "Investment added", description: `${sharesNum} shares of ${symbol.toUpperCase()}` });
    }

    setOpen(false);
  };

  const defaultTrigger = (
    <Button size={size === "sm" ? "sm" : "default"} className={size === "sm" ? "h-7 px-2.5 rounded-full text-[11px] font-semibold gap-1" : "btn-primary"}>
      {existing ? <Pencil className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
      <span>{existing ? "Update" : "Add"}</span>
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[400px] p-0 gap-0 rounded-2xl">
        <DialogHeader className="p-5 pb-3 border-b">
          <DialogTitle className="text-base">
            {existing ? `Update ${existing.symbol} Holding` : "Add Investment"}
          </DialogTitle>
          {existing && (
            <p className="text-xs text-muted-foreground mt-1">
              You hold {existing.shares} shares · avg KES {existing.avg_cost.toFixed(2)}
            </p>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {/* Mode toggle when updating */}
          {existing && (
            <div className="flex items-center bg-muted/40 rounded-full p-0.5">
              <button
                type="button"
                onClick={() => setMode("add")}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-full transition-colors ${mode === "add" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                Add more shares
              </button>
              <button
                type="button"
                onClick={() => setMode("replace")}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-full transition-colors ${mode === "replace" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                Replace position
              </button>
            </div>
          )}

          {!lockedSymbol && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="symbol" className="text-xs font-medium">Stock Symbol *</Label>
                <Input
                  id="symbol"
                  placeholder="e.g., SCOM"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  className="h-10"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-medium">Company Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Safaricom PLC"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-10"
                  required
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="shares" className="text-xs font-medium">
                {existing && mode === "add" ? "Additional Shares *" : "Shares *"}
              </Label>
              <Input
                id="shares"
                type="number"
                step="any"
                placeholder="100"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                className="h-10"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="avgCost" className="text-xs font-medium">Avg Price (KES) *</Label>
              <Input
                id="avgCost"
                type="number"
                step="0.01"
                placeholder="12.50"
                value={avgCost}
                onChange={(e) => setAvgCost(e.target.value)}
                className="h-10"
                required
              />
            </div>
          </div>

          {!lockedSymbol && (
            <div className="space-y-1.5">
              <Label htmlFor="sector" className="text-xs font-medium">Sector</Label>
              <Select value={sector} onValueChange={setSector}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Select sector" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="Banking">Banking</SelectItem>
                  <SelectItem value="Telecommunications">Telecommunications</SelectItem>
                  <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="Energy">Energy</SelectItem>
                  <SelectItem value="Insurance">Insurance</SelectItem>
                  <SelectItem value="Investment">Investment</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex gap-2.5 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1 h-10">Cancel</Button>
            <Button type="submit" className="flex-1 h-10 btn-primary">
              {existing ? "Save Changes" : "Add Investment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
