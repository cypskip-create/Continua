import { useIndices } from "@/hooks/useIndices";
import { MarketStatusIndicator } from "@/components/shared/MarketStatusIndicator";

export function MarketOverviewWidget() {
  const { indices, isLoading } = useIndices();
  return <section className="space-y-4">
    <div className="flex justify-between"><h3 className="font-semibold">Market Overview</h3><MarketStatusIndicator /></div>
    <div className="divide-y">
      {indices.map(index => <div key={index.id} className="flex justify-between py-3">
        <div><p className="text-sm">{index.name}</p><p className="text-xs text-muted-foreground">Published {new Date(index.timestamp).toLocaleDateString()}</p></div>
        <div className="text-right"><p className="font-semibold tabular-nums">{index.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} pts</p>
          <p className={`text-xs ${index.changePercent >= 0 ? 'text-bull' : 'text-bear'}`}>{index.changePercent >= 0 ? '+' : ''}{index.changePercent.toFixed(2)}%</p>
        </div>
      </div>)}
    </div>
    {!indices.length && <p className="text-sm text-muted-foreground">{isLoading ? 'Loading published indices…' : 'No verified index observations available yet.'}</p>}
  </section>;
}
