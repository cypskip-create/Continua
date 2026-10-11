import { createRoot } from 'react-dom/client';
import { MarketIndexStrip } from '../../src/components/home/MarketIndexStrip';
import '../../src/index.css';
import '../../src/styles/brand-system.css';
const indices=[{name:'NASI',value:'244.93',change:-0.1671,isUp:false},{name:'NSE20',value:'4,315.49',change:-0.1797,isUp:false},{name:'NSE25',value:'6,964.04',change:-0.0479,isUp:false},{name:'NSE10',value:'2,734.60',change:-0.0881,isUp:false}];
createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-[390px] min-h-screen p-4 bg-background"><p className="text-xs text-muted-foreground mb-6">Layout QA · sample index values, not live quotes</p><h1 className="font-semibold text-xl mb-5">Continua</h1><h2 className="text-lg mb-2">Market Snapshot</h2><MarketIndexStrip indices={indices} onSelect={()=>{}}/><p className="text-sm text-muted-foreground mt-5">Swipe left or right to see all indices.</p></main>);
