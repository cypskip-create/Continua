import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Bell, Plus, Trash2, Pencil, TrendingUp, TrendingDown, Activity, X, Check } from "lucide-react";
import { usePriceAlerts, PriceAlert } from "@/hooks/usePriceAlerts";
import { useToast } from "@/hooks/use-toast";
import { useExchange } from "@/hooks/useExchange";
import { describeAlertRow } from "@/lib/alertFormat";

interface StockAlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbol: string;
  currentPrice: number;
}

type Mode = "price" | "indicator";
type Draft = {
  mode: Mode;
  alert_type: "price_above" | "price_below" | "rsi_above" | "rsi_below";
  target_value: string;
  indicator: "RSI" | "SMA_CROSS" | "EMA_CROSS";
  rsi_period: string;
  rsi_threshold: string;
  fast_period: string;
  slow_period: string;
  direction: "bullish" | "bearish";
};

const emptyDraft = (price: number): Draft => ({
  mode: "price", alert_type: "price_above", target_value: price ? price.toFixed(2) : "",
  indicator: "RSI", rsi_period: "14", rsi_threshold: "30", fast_period: "10", slow_period: "30", direction: "bullish",
});

export function StockAlertDialog({ open, onOpenChange, symbol, currentPrice }: StockAlertDialogProps) {
  const { alerts, createAlert, updateAlert, deleteAlert, toggleAlert } = usePriceAlerts();
  const { exchange, exchangeMeta } = useExchange();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft(currentPrice));

  const symbolAlerts = useMemo(
    () => alerts.filter(a => a.symbol.toUpperCase() === symbol.toUpperCase()),
    [alerts, symbol]
  );

  const startCreate = () => { setEditingId(null); setDraft(emptyDraft(currentPrice)); setCreating(true); };
  const startEdit = (alert: PriceAlert) => {
    setCreating(false);
    setEditingId(alert.id);
    if (alert.indicator) {
      setDraft({
        ...emptyDraft(currentPrice), mode: "indicator", indicator: alert.indicator,
        rsi_period: String(alert.indicator_params?.period ?? 14),
        rsi_threshold: String(alert.indicator_params?.threshold ?? 30),
        alert_type: alert.alert_type as Draft["alert_type"],
        fast_period: String(alert.indicator_params?.fastPeriod ?? 10),
        slow_period: String(alert.indicator_params?.slowPeriod ?? 30),
        direction: alert.indicator_params?.direction === -1 ? "bearish" : "bullish",
      });
    } else {
      setDraft({ ...emptyDraft(currentPrice), mode: "price", alert_type: alert.alert_type as Draft["alert_type"], target_value: String(alert.target_value ?? "") });
    }
  };
  const cancel = () => { setCreating(false); setEditingId(null); };

  const save = async () => {
    let payload: Omit<PriceAlert, "id" | "user_id" | "created_at" | "updated_at" | "triggered_at">;

    if (draft.mode === "price") {
      const target = parseFloat(draft.target_value);
      if (!target || target <= 0) {
        toast({ title: "Enter a valid target price", variant: "destructive" });
        return;
      }
      payload = {
        symbol: symbol.toUpperCase(), exchange, currency: exchangeMeta.currency,
        alert_type: draft.alert_type, target_value: target, indicator: null, indicator_params: null, is_active: true,
      };
    } else if (draft.indicator === "RSI") {
      const period = parseInt(draft.rsi_period, 10);
      const threshold = parseFloat(draft.rsi_threshold);
      if (!period || !threshold) {
        toast({ title: "Enter a valid RSI period and threshold", variant: "destructive" });
        return;
      }
      payload = {
        symbol: symbol.toUpperCase(), exchange, currency: exchangeMeta.currency,
        alert_type: draft.alert_type === "rsi_below" ? "rsi_below" : "rsi_above", target_value: threshold,
        indicator: "RSI", indicator_params: { period, threshold }, is_active: true,
      };
    } else {
      const fastPeriod = parseInt(draft.fast_period, 10);
      const slowPeriod = parseInt(draft.slow_period, 10);
      if (!fastPeriod || !slowPeriod || fastPeriod >= slowPeriod) {
        toast({ title: "Fast period must be smaller than slow period", variant: "destructive" });
        return;
      }
      payload = {
        symbol: symbol.toUpperCase(), exchange, currency: exchangeMeta.currency,
        alert_type: "price_above", // unused for crossover alerts — kept non-null to satisfy the column
        target_value: null, indicator: draft.indicator,
        indicator_params: { fastPeriod, slowPeriod, direction: draft.direction === "bullish" ? 1 : -1 }, is_active: true,
      };
    }

    if (editingId) {
      const { error } = await updateAlert(editingId, payload);
      if (!error) toast({ title: "Alert updated" });
      else toast({ title: "Couldn't update alert", variant: "destructive" });
    } else {
      const { error } = await createAlert(payload);
      if (!error) toast({ title: "Alert created", description: describeAlert(symbol, payload, exchangeMeta.currency) });
      else toast({ title: "Couldn't create alert", variant: "destructive" });
    }
    cancel();
  };

  const handleDelete = async (id: string) => {
    const { error } = await deleteAlert(id);
    toast(error ? { title: "Couldn't delete alert", variant: "destructive" } : { title: "Alert deleted" });
  };

  const renderForm = () => (
    <div className="space-y-3 rounded-xl border border-border p-3 bg-muted/20">
      <div className="grid grid-cols-2 gap-2">
        <Select value={draft.mode} onValueChange={(v: Mode) => setDraft(d => ({ ...d, mode: v }))}>
          <SelectTrigger className="h-9 text-[0.8125rem]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="price">Price alert</SelectItem>
            <SelectItem value="indicator">Indicator alert</SelectItem>
          </SelectContent>
        </Select>
        {draft.mode === "price" ? (
          <Select value={draft.alert_type} onValueChange={(v: any) => setDraft(d => ({ ...d, alert_type: v }))}>
            <SelectTrigger className="h-9 text-[0.8125rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="price_above">Above target</SelectItem>
              <SelectItem value="price_below">Below target</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Select value={draft.indicator} onValueChange={(v: any) => setDraft(d => ({ ...d, indicator: v }))}>
            <SelectTrigger className="h-9 text-[0.8125rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="RSI">RSI</SelectItem>
              <SelectItem value="SMA_CROSS">SMA Crossover</SelectItem>
              <SelectItem value="EMA_CROSS">EMA Crossover</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {draft.mode === "price" && (
        <Input
          type="number" inputMode="decimal" placeholder={`Target ${exchangeMeta.currency}`}
          value={draft.target_value} onChange={e => setDraft(d => ({ ...d, target_value: e.target.value }))}
          className="h-9 text-[0.8125rem]"
        />
      )}

      {draft.mode === "indicator" && draft.indicator === "RSI" && (
        <div className="grid grid-cols-3 gap-2">
          <Select value={draft.alert_type === "rsi_below" ? "rsi_below" : "rsi_above"} onValueChange={(v: any) => setDraft(d => ({ ...d, alert_type: v }))}>
            <SelectTrigger className="h-9 text-[0.75rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rsi_above">Above</SelectItem>
              <SelectItem value="rsi_below">Below</SelectItem>
            </SelectContent>
          </Select>
          <Input type="number" placeholder="Period" value={draft.rsi_period} onChange={e => setDraft(d => ({ ...d, rsi_period: e.target.value }))} className="h-9 text-[0.8125rem]" />
          <Input type="number" placeholder="Threshold" value={draft.rsi_threshold} onChange={e => setDraft(d => ({ ...d, rsi_threshold: e.target.value }))} className="h-9 text-[0.8125rem]" />
        </div>
      )}

      {draft.mode === "indicator" && draft.indicator !== "RSI" && (
        <div className="grid grid-cols-3 gap-2">
          <Input type="number" placeholder="Fast period" value={draft.fast_period} onChange={e => setDraft(d => ({ ...d, fast_period: e.target.value }))} className="h-9 text-[0.8125rem]" />
          <Input type="number" placeholder="Slow period" value={draft.slow_period} onChange={e => setDraft(d => ({ ...d, slow_period: e.target.value }))} className="h-9 text-[0.8125rem]" />
          <Select value={draft.direction} onValueChange={(v: any) => setDraft(d => ({ ...d, direction: v }))}>
            <SelectTrigger className="h-9 text-[0.75rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bullish">Bullish cross</SelectItem>
              <SelectItem value="bearish">Bearish cross</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" className="flex-1 h-8 text-[0.78125rem]" onClick={save}>
          <Check className="h-3.5 w-3.5 mr-1" />{editingId ? "Save changes" : "Create alert"}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-[0.78125rem]" onClick={cancel}>
          <X className="h-3.5 w-3.5 mr-1" />Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) cancel(); }}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[0.9375rem]">
            <Bell className="h-4 w-4" /> {symbol} alerts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2.5 max-h-[60vh] overflow-y-auto">
          {symbolAlerts.length === 0 && !creating && (
            <p className="text-[0.8125rem] text-muted-foreground py-2">
              No alerts set for {symbol} yet. Create one to get notified on a price target or a technical signal.
            </p>
          )}

          {symbolAlerts.map(alert => (
            editingId === alert.id ? (
              <div key={alert.id}>{renderForm()}</div>
            ) : (
              <div key={alert.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  {alert.indicator ? <Activity className="h-4 w-4 text-primary shrink-0" /> :
                    alert.alert_type === "price_above" ? <TrendingUp className="h-4 w-4 text-bull shrink-0" /> : <TrendingDown className="h-4 w-4 text-bear shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-[0.8125rem] font-semibold tabular-nums truncate">{describeAlertRow(alert)}</p>
                    {alert.triggered_at && <p className="text-[0.625rem] text-bull">Triggered</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Switch checked={alert.is_active} onCheckedChange={() => toggleAlert(alert.id, !alert.is_active)} />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(alert)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(alert.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            )
          ))}

          {creating && renderForm()}
        </div>

        {!creating && !editingId && (
          <Button variant="outline" className="w-full rounded-full mt-1" onClick={startCreate}>
            <Plus className="h-4 w-4 mr-2" />
            {symbolAlerts.length > 0 ? `Add another ${symbol} alert` : `Create ${symbol} alert`}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function describeAlert(symbol: string, payload: Omit<PriceAlert, "id" | "user_id" | "created_at" | "updated_at" | "triggered_at">, currency: string): string {
  if (payload.indicator === "RSI") {
    return `We'll notify you when ${symbol}'s RSI(${payload.indicator_params?.period}) crosses ${payload.alert_type === "rsi_below" ? "below" : "above"} ${payload.indicator_params?.threshold}.`;
  }
  if (payload.indicator === "SMA_CROSS" || payload.indicator === "EMA_CROSS") {
    return `We'll notify you on the next ${payload.indicator_params?.direction === -1 ? "bearish" : "bullish"} crossover for ${symbol}.`;
  }
  return `We'll notify you when ${symbol} ${payload.alert_type === "price_above" ? "rises above" : "falls below"} ${currency} ${payload.target_value}`;
}
