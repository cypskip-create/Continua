import { Home, TrendingUp, Users, Wallet, User } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useProfile } from "@/hooks/useProfile";
import { cn } from "@/lib/utils";
import { useTouchClick } from "@/hooks/useTouchClick";
import { useAuth } from "@/hooks/useAuth";

const tabLocations = new Map<string, string>();

const navItems = [
  { id: "home", label: "Home", icon: Home, path: "/" },
  { id: "markets", label: "Markets", icon: TrendingUp, path: "/markets" },
  { id: "portfolio", label: "Portfolio", icon: Wallet, path: "/track-investments" },
  { id: "traders", label: "TradersHub", icon: Users, path: "/traders-hub" },
  { id: "account", label: "Profile", icon: User, path: "/account", isProfile: true },
];

// The bottom nav only ever shows on the 5 primary tabs. Every other screen
// (watchlist, themes, featured lists, stock detail, settings, etc.) is a
// "drill-in" surface where the nav would just compete with content.
const MAIN_ROUTES = new Set(["/", "/markets", "/track-investments", "/traders-hub", "/account"]);

export function BottomNavigation() {
  const tap = useTouchClick<HTMLAnchorElement>();
  const location = useLocation();
  const { user } = useAuth();
  const { profile } = useProfile();
  const isMainRoute = MAIN_ROUTES.has(location.pathname);

  if (!isMainRoute) return null;
  tabLocations.set(`${user?.id}:${location.pathname}`, location.pathname + location.search);

  return (
    <nav className="bottom-nav safe-area-bottom">
      <div className="grid grid-cols-5 h-full max-w-2xl mx-auto">
        {navItems.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path === "/" && location.pathname === "/");
          const Icon = item.icon;

          return (
            <NavLink
              key={item.id}
              {...tap}
              to={tabLocations.get(`${user?.id}:${item.path}`) ?? item.path}
              state={{ resumeTab: true }}
              className={cn(
                "tab-item relative flex flex-col items-center justify-center py-1.5",
                isActive ? "active" : "inactive"
              )}
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2px] rounded-full bg-primary shadow-[0_0_8px_1px_hsl(var(--primary)/0.6)]" />
              )}
              <div className="flex items-center justify-center h-6 w-6">
                {item.isProfile && profile?.avatar_url ? (
                  <Avatar className={cn(
                    "h-6 w-6 transition-all ring-offset-background",
                    isActive && "ring-2 ring-foreground ring-offset-2"
                  )}>
                    <AvatarImage src={profile.avatar_url} className="object-cover" />
                    <AvatarFallback className="text-[0.5625rem]">
                      {profile?.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "U"}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <Icon
                    className={cn(
                      "h-[19px] w-[19px] transition-all",
                      isActive ? "text-foreground" : "text-muted-foreground",
                      isActive && !item.isProfile && "stroke-[2.25]"
                    )}
                  />
                )}
              </div>
              <span
                className={cn(
                  "text-[0.59375rem] mt-1 leading-none tracking-tight",
                  isActive ? "font-semibold text-foreground" : "text-muted-foreground"
                )}
              >
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
