import { Search, Settings2, Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Logo } from "./Logo";
import { useNotifications } from "@/hooks/useNotifications";
import { ExchangeSelector } from "./ExchangeSelector";

interface TopBarProps {
  title: string;
  subtitle?: string;
  showSearch?: boolean;
  showWidgetSettings?: boolean;
  showNotifications?: boolean;
  /** Shows the 🇰🇪 NSE ▾ market picker next to the title. Opt-in — only
   *  screens that actually render exchange-specific data (Markets, Home,
   *  Screener, ...) should turn this on; a stock detail page for a symbol
   *  already tied to one exchange shouldn't invite switching mid-view. */
  showExchangeSelector?: boolean;
  onWidgetSettingsClick?: () => void;
  onSearch?: (query: string) => void;
  initialSearchQuery?: string;
}

export function TopBar({ 
  title, subtitle, showSearch = true, showWidgetSettings = false, 
  showNotifications = true, showExchangeSelector = false, onWidgetSettingsClick, onSearch, initialSearchQuery = ""
}: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(!!initialSearchQuery);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const { unreadCount } = useNotifications();

  const handleSearchSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (searchQuery.trim()) {
      if (onSearch) onSearch(searchQuery.trim());
      else if (location.pathname !== '/traders-hub') navigate(`/traders-hub?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-card/90 backdrop-blur-xl border-b border-border/60">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Logo size="sm" showText={false} />
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
          </div>
          {showExchangeSelector && <ExchangeSelector className="ml-1 shrink-0" />}
        </div>
        
        <div className="flex items-center gap-1">
          {showSearch && (
            <>
              {searchOpen ? (
                <form onSubmit={handleSearchSubmit} className="flex items-center gap-1">
                  <Input 
                    placeholder="Search..." 
                    className="w-40 h-9 text-sm rounded-full bg-muted/50 border-0"
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onBlur={() => { if (!searchQuery) setSearchOpen(false); }}
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="Close search" onClick={() => { setSearchQuery(""); setSearchOpen(false); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </form>
              ) : (
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full" aria-label="Search stocks" onClick={() => setSearchOpen(true)}>
                  <Search className="h-[18px] w-[18px]" />
                </Button>
              )}
            </>
          )}
          {showWidgetSettings && onWidgetSettingsClick && (
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full" aria-label="Settings" onClick={onWidgetSettingsClick}>
              <Settings2 className="h-[18px] w-[18px]" />
            </Button>
          )}
          {showNotifications && (
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full relative" aria-label="Open notifications" onClick={() => navigate('/notifications')}>
              <Bell className="h-[18px] w-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1.5 min-w-[16px] h-[16px] px-1 bg-primary text-primary-foreground text-[0.5625rem] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
