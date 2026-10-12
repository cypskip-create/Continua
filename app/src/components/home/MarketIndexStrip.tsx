import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { formatIndexChange } from '@/lib/researchCache';
import { RollingNumber } from '@/components/shared/RollingNumber';
import { feedback } from '@/lib/haptics';
export function MarketIndexStrip({indices,onSelect}:{indices:{name:string;value:string;change:number;isUp:boolean}[];onSelect:()=>void}) {
  return <div role="region" aria-label="NSE indices, scroll horizontally" className="flex gap-3 overflow-x-auto overscroll-x-contain snap-x snap-proximity border-t border-border/60 pt-3 pb-2">
    {indices.map(idx=><button type="button" key={idx.name} className="min-w-[138px] shrink-0 snap-start text-left cursor-pointer" onClick={()=>{feedback('selection');onSelect();}}>
      <p className="text-[0.625rem] text-muted-foreground">{idx.name}</p>
      <p className="text-sm font-semibold tabular mt-0.5"><RollingNumber value={idx.value} /></p>
      <p className={`text-[0.625rem] font-semibold flex items-center gap-0.5 tabular ${idx.isUp?'text-bull':'text-bear'}`}>
        {idx.isUp?<ArrowUpRight className="h-2.5 w-2.5"/>:<ArrowDownRight className="h-2.5 w-2.5"/>}<RollingNumber value={formatIndexChange(idx.change)} />
      </p>
    </button>)}
  </div>;
}
