import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Search, X, Heart, TrendingUp, TrendingDown, Trash2, MoreHorizontal, Pencil, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useToast } from "@/hooks/use-toast";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useInstruments } from "@/hooks/useInstruments";
import { useSparklines } from "@/hooks/useSparklines";
import { SparklineChart } from "@/components/shared/SparklineChart";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function Watchlist() {
  const navigate = useNavigate();
  const {
    watchlist,
    loading,
    removeFromWatchlist,
    addToWatchlist,
    isInFolder,
    folders,
    foldersLoading,
    defaultFolderId,
    canCreateFolder,
    isPremium,
    createFolder,
    renameFolder,
    deleteFolder,
  } = useWatchlist();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const currentFolderId = activeFolderId || defaultFolderId || folders[0]?.id;
  const currentFolder = folders.find(f => f.id === currentFolderId);

  const folderItems = useMemo(
    () => watchlist.filter(item => item.folder_id === currentFolderId),
    [watchlist, currentFolderId]
  );

  const watchlistSymbols = useMemo(() => folderItems.map((item) => item.symbol), [folderItems]);
  const { quotes } = useLiveQuotes(watchlistSymbols);
  const { instruments } = useInstruments();
  const { getSparkline } = useSparklines(watchlistSymbols);

  const rows = useMemo(() => {
    return folderItems.map(item => {
      const quote = quotes[item.symbol.toUpperCase()];
      // No fallback: an honest empty/loading state renders when quote is
      // undefined, never a fabricated price. See useLiveQuotes.
      return {
        ...item,
        price: quote?.lastPrice ?? null,
        change: quote?.change ?? null,
        changePercent: quote?.changePercent ?? null,
        isUp: (quote?.change ?? 0) >= 0,
        isLive: !!quote,
      };
    });
  }, [folderItems, quotes]);

  const gainers = rows.filter(r => r.isUp).length;
  const losers = rows.length - gainers;

  const searchResults = useMemo(() => {
    if (!query.trim()) return instruments;
    const q = query.trim().toLowerCase();
    return instruments.filter(s => s.symbol.toLowerCase().includes(q) || s.companyName.toLowerCase().includes(q));
  }, [query, instruments]);

  const handleAdd = async (symbol: string, name: string) => {
    if (!currentFolderId) return;
    const result = await addToWatchlist(symbol, name, currentFolderId);
    if (result?.error) {
      toast({ title: "Couldn't add stock", description: result.error.message, variant: "destructive" });
    } else {
      toast({ title: `${symbol} added to ${currentFolder?.name || "watchlist"}` });
    }
  };

  const handleRemove = async (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentFolderId) return;
    const result = await removeFromWatchlist(symbol, currentFolderId);
    toast(result?.error
      ? { title: "Couldn't remove from watchlist", variant: "destructive" }
      : { title: `Removed ${symbol} from watchlist` });
  };

  const submitNewList = async () => {
    if (!newListName.trim()) return;
    const { data, error } = await createFolder(newListName.trim());
    if (error) {
      toast({ title: "Couldn't create watchlist", description: error.message, variant: "destructive" });
    } else if (data) {
      setActiveFolderId(data.id);
      toast({ title: `Created "${data.name}"` });
    }
    setNewListName("");
    setNewListOpen(false);
  };

  const submitRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    const { error } = await renameFolder(renameTarget.id, renameValue.trim());
    if (error) toast({ title: "Couldn't rename watchlist", variant: "destructive" });
    setRenameTarget(null);
  };

  const handleDeleteFolder = async (folderId: string) => {
    const { error } = await deleteFolder(folderId);
    if (error) {
      toast({ title: "Couldn't delete watchlist", description: error.message, variant: "destructive" });
      return;
    }
    if (activeFolderId === folderId) setActiveFolderId(null);
    toast({ title: "Watchlist deleted" });
  };

  if (loading || foldersLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9 rounded-full tap-scale shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-tight truncate">{currentFolder?.name || "Watchlist"}</h1>
              <p className="text-[11px] text-muted-foreground leading-tight">
                {rows.length} {rows.length === 1 ? "stock" : "stocks"}
                {rows.length > 0 && <> · <span className="text-bull font-medium">{gainers} up</span> · <span className="text-bear font-medium">{losers} down</span></>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {currentFolder && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full tap-scale">
                    <MoreHorizontal className="h-4.5 w-4.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => { setRenameTarget(currentFolder); setRenameValue(currentFolder.name); }}>
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Rename list
                  </DropdownMenuItem>
                  {!currentFolder.is_default && (
                    <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteFolder(currentFolder.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete list
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button size="icon" className="h-9 w-9 rounded-full" onClick={() => setAddOpen(true)}>
              <Plus className="h-4.5 w-4.5" />
            </Button>
          </div>
        </div>

        {/* Named-watchlist tabs — moomoo-style. Free accounts see just one
            pill (their single list); Premium can flick between several and
            spin up more. */}
        {(folders.length > 1 || isPremium) && (
          <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
            {folders.map(folder => (
              <button
                key={folder.id}
                onClick={() => setActiveFolderId(folder.id)}
                className={cn(
                  "shrink-0 px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors",
                  currentFolderId === folder.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted/70"
                )}
              >
                {folder.name}
              </button>
            ))}
            {canCreateFolder ? (
              <button
                onClick={() => setNewListOpen(true)}
                className="shrink-0 flex items-center gap-1 px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold border border-dashed border-border text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                <Plus className="h-3 w-3" /> New list
              </button>
            ) : (
              <button
                onClick={() => navigate("/upgrade")}
                className="shrink-0 flex items-center gap-1 px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold border border-dashed border-border text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                <Lock className="h-3 w-3" /> Upgrade for more
              </button>
            )}
          </div>
        )}
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center px-8 py-24">
          <Heart className="h-11 w-11 mb-4 text-muted-foreground/40" />
          <h3 className="font-semibold text-[15px] mb-1">
            {currentFolder?.name ? `"${currentFolder.name}" is empty` : "Your watchlist is empty"}
          </h3>
          <p className="text-[13px] text-muted-foreground mb-5 max-w-[240px]">Add stocks you're tracking to keep an eye on their price right here.</p>
          <Button className="rounded-full" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />Add a stock
          </Button>
        </div>
      ) : (
        <div>
          {rows.map(stock => (
            <button
              key={stock.symbol}
              onClick={() => navigate(`/stock/${stock.symbol}`)}
              data-small-target
              className="w-full flex items-center gap-3 px-4 py-3 border-b border-border/40 text-left active:bg-muted/30 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-bold leading-tight">{stock.symbol}</p>
                <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">{stock.name}</p>
              </div>

              <SparklineChart width={52} height={22} isPositive={stock.isUp} data={getSparkline(stock.symbol)} isLoading={!stock.isLive} />

              <div className="text-right shrink-0 w-[92px]">
                {stock.isLive ? (
                  <>
                    <p className="text-[13.5px] font-bold tabular-nums leading-tight">KES {stock.price!.toFixed(2)}</p>
                    <div className={`flex items-center justify-end gap-0.5 mt-0.5 ${stock.isUp ? "text-bull" : "text-bear"}`}>
                      {stock.isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      <span className="text-[11px] font-semibold tabular-nums">{stock.isUp ? "+" : ""}{stock.changePercent!.toFixed(2)}%</span>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-end gap-1">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                )}
              </div>

              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={e => handleRemove(stock.symbol, e)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </button>
          ))}
        </div>
      )}

      {/* Add to watchlist */}
      <Dialog open={addOpen} onOpenChange={v => { setAddOpen(v); if (!v) setQuery(""); }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Add to {currentFolder?.name || "watchlist"}</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search ticker or company name"
              className="h-10 pl-10 pr-9 rounded-full text-[13.5px]"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1">
            {searchResults.length === 0 ? (
              <p className="text-[13px] text-muted-foreground text-center py-8">No matching stocks</p>
            ) : searchResults.map(s => {
              const already = currentFolderId ? isInFolder(s.symbol, currentFolderId) : false;
              return (
                <div key={s.symbol} className="flex items-center justify-between gap-3 py-2.5 border-b border-border/40 last:border-0">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold">{s.symbol}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{s.companyName}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={already ? "outline" : "default"}
                    className="h-8 rounded-full text-[12px] shrink-0"
                    disabled={already}
                    onClick={() => handleAdd(s.symbol, s.companyName)}
                  >
                    {already ? "Added" : "Add"}
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* New named watchlist */}
      <Dialog open={newListOpen} onOpenChange={v => { setNewListOpen(v); if (!v) setNewListName(""); }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-[15px]">New watchlist</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newListName}
            maxLength={40}
            onChange={e => setNewListName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submitNewList()}
            placeholder="e.g. Banking, Dividend Picks…"
            className="h-10 rounded-full text-[13.5px]"
          />
          <Button className="rounded-full w-full mt-1" disabled={!newListName.trim()} onClick={submitNewList}>
            Create list
          </Button>
        </DialogContent>
      </Dialog>

      {/* Rename watchlist */}
      <Dialog open={!!renameTarget} onOpenChange={v => !v && setRenameTarget(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Rename watchlist</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            maxLength={40}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submitRename()}
            className="h-10 rounded-full text-[13.5px]"
          />
          <Button className="rounded-full w-full mt-1" disabled={!renameValue.trim()} onClick={submitRename}>
            Save
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}