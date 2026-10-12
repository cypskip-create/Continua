import {useMemo} from 'react';
import type {Post} from '@/hooks/usePosts';
import {Activity,Bookmark,MessageCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '@/hooks/useAuth';
export function HubResearchTools({posts,watchlist,onTicker,onCompose}:{posts:Post[];watchlist:string[];onTicker:(symbol:string)=>void;onCompose:(draft:string)=>void}){
 const navigate=useNavigate();
 const {user}=useAuth();
 const pulse=useMemo(()=>{const counts=new Map<string,{posts:number;authors:Set<string>}>();
  for(const p of posts){if(Date.now()-Date.parse(p.created_at)>7*86400000)continue;for(const symbol of new Set(p.stock_mentions??[])){const key=symbol.toUpperCase(),row=counts.get(key)??{posts:0,authors:new Set<string>()};row.posts++;row.authors.add(p.user_id);counts.set(key,row);}}
  return [...counts].sort((a,b)=>b[1].posts-a[1].posts).slice(0,6);
 },[posts]);
 return <details className="border-b border-border px-4 py-3">
  <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-primary"/>Community research tools</summary>
  <div className="space-y-4 pt-4">
   <section aria-label="Discussion pulse"><h3 className="text-xs font-semibold">Discussion Pulse · last 7 days</h3><p className="text-xs text-muted-foreground mt-1">Counts from loaded posts visible to you—not a market forecast or all-platform activity.</p>
    <div className="flex flex-wrap gap-2 mt-2">{pulse.map(([symbol,row])=><button key={symbol} onClick={()=>onTicker(symbol)} className="rounded-xl border border-border px-3 py-2 text-left text-xs"><strong className="text-primary">${symbol}</strong><span className="block text-muted-foreground">{row.posts} posts · {row.authors.size} contributors</span></button>)}</div>{!pulse.length&&<p className="text-xs text-muted-foreground mt-2">No recent ticker discussions in the loaded feed.</p>}</section>
   <section aria-label="Watchlist discussions"><h3 className="text-xs font-semibold">Your watchlist discussions</h3><div className="flex gap-2 flex-wrap mt-2">{[...new Set(watchlist)].slice(0,12).map(symbol=><button key={symbol} onClick={()=>onTicker(symbol)} className="rounded-full bg-muted px-3 py-2 text-xs text-primary">${symbol}</button>)}</div>{!watchlist.length&&<p className="text-xs text-muted-foreground mt-1">Add stocks to your watchlist to follow their discussions here.</p>}</section>
   <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={()=>onCompose(`Research question\n\n$${watchlist[0]??'SCOM'}: What changed in the latest filing?\n\nSource and reporting period:\nMy interpretation:\nWhat would change my view:`)}><MessageCircle className="h-4 w-4 mr-2"/>Start a research question</Button>
   <Button variant="outline" size="sm" onClick={()=>navigate(user?`/profile/${user.id}?tab=bookmarks`:'/auth')}><Bookmark className="h-4 w-4 mr-2"/>Saved research</Button></div>
  </div>
 </details>;
}
