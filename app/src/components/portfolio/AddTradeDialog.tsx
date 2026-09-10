import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";

interface AddTradeDialogProps {
  onTradeAdded: (symbol: string, name: string, shares: number, avgCost: number, sector?: string) => Promise<any>;
}

export function AddTradeDialog({ onTradeAdded }: AddTradeDialogProps) {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [sector, setSector] = useState("");
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!symbol || !name || !shares || !avgCost) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const result = await onTradeAdded(
      symbol,
      name,
      parseFloat(shares),
      parseFloat(avgCost),
      sector || undefined
    );

    if (result.error) {
      toast({
        title: "Error",
        description: "Failed to add investment",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Investment Added",
      description: `Added ${shares} shares of ${symbol} to your portfolio`,
    });

    setOpen(false);
    setSymbol("");
    setName("");
    setShares("");
    setAvgCost("");
    setSector("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="btn-primary">
          <Plus className="h-4 w-4 mr-2" />
          Add Investment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px] p-0 gap-0">
        <DialogHeader className="p-5 pb-4 border-b">
          <DialogTitle className="text-lg">Add New Investment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="symbol" className="text-sm font-medium">Stock Symbol *</Label>
            <Input
              id="symbol"
              placeholder="e.g., SCOM"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="h-10"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">Company Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Safaricom"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="shares" className="text-sm font-medium">Shares *</Label>
              <Input
                id="shares"
                type="number"
                placeholder="100"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                className="h-10"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="avgCost" className="text-sm font-medium">Avg Cost (KES) *</Label>
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

          <div className="space-y-2">
            <Label htmlFor="sector" className="text-sm font-medium">Sector</Label>
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Select sector" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="Banking">Banking</SelectItem>
                <SelectItem value="Telecommunications">Telecommunications</SelectItem>
                <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                <SelectItem value="Energy">Energy</SelectItem>
                <SelectItem value="Insurance">Insurance</SelectItem>
                <SelectItem value="Investment">Investment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1 h-10">
              Cancel
            </Button>
            <Button type="submit" className="flex-1 h-10 btn-primary">
              Add Investment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}