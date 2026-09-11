import { useState, useRef, useCallback, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { BottomNavigation } from "./BottomNavigation";
import { ProtectedRoute } from "./ProtectedRoute";
import { SplashScreen } from "@/components/shared/SplashScreen";
import { RouteSeo } from "@/components/shared/RouteSeo";
import { AppLockGate } from "@/components/security/AppLockGate";
import { useAlertsWatcher } from "@/hooks/useAlertsWatcher";


// Session-scoped: splash only shows once per app open, not on every re-mount.
let splashShown = false;

export function MainLayout() {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [showSplash, setShowSplash] = useState(!splashShown);
  const startY = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // App-wide: checks the person's own active price alerts against live
  // quotes so they fire the moment they're met while the app is open,
  // not just whenever the background cron sweep next runs.
  useAlertsWatcher();

  useEffect(() => { splashShown = true; }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY <= 0) {
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling || refreshing) return;
    const diff = e.touches[0].clientY - startY.current;
    // Rubber-band: significant dead zone, then heavy resistance so casual
    // scrolls never trip refresh. Feels closer to Robinhood / X.
    if (diff > 40 && window.scrollY <= 0) {
      const stretched = (diff - 40) * 0.28;
      setPullDistance(Math.min(stretched, 96));
    } else if (diff <= 40) {
      setPullDistance(0);
    }
  }, [pulling, refreshing]);

  const handleTouchEnd = useCallback(() => {
    // Commit only past a firm threshold — Fidelity-like resistance.
    if (pullDistance > 78 && !refreshing) {
      setRefreshing(true);
      setPullDistance(56);
      setTimeout(() => window.location.reload(), 650);
    } else {
      setPullDistance(0);
    }
    setPulling(false);
  }, [pullDistance, refreshing]);

  return (
    <ProtectedRoute>
      <RouteSeo />
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      <AppLockGate>
        <div className="min-h-screen bg-background">

          {/* Plain pull-to-refresh indicator — a normal loading spinner, not
              the branded logo mark. Scales in with pull distance, then just
              spins continuously (no glow/scale animation) once committed. */}
          <div
            className="flex items-center justify-center overflow-hidden transition-all duration-200 ease-out"
            style={{ height: pullDistance > 0 ? pullDistance : 0 }}
          >
            <div
              style={{
                opacity: refreshing ? 1 : Math.max(0.35, Math.min(1, pullDistance / 78)),
                transform: refreshing ? undefined : `scale(${0.75 + Math.min(1, pullDistance / 78) * 0.3})`,
              }}
              className={`h-7 w-7 rounded-full border-2 border-muted-foreground/25 border-t-primary ${refreshing ? "animate-spin" : ""}`}
            />
          </div>

          <div
            ref={scrollRef}
            className="pb-20"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <Outlet />
          </div>

          <BottomNavigation />
        </div>
      </AppLockGate>
    </ProtectedRoute>
  );
}