import { useState, useEffect, useCallback, Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { PageErrorBoundary } from "./PageErrorBoundary";
import { BottomNavigation } from "./BottomNavigation";
import { ProtectedRoute } from "./ProtectedRoute";
import { SplashScreen } from "@/components/shared/SplashScreen";
import { RouteSeo } from "@/components/shared/RouteSeo";
import { PullToRefresh } from "./PullToRefresh";
import { useAlertsWatcher } from "@/hooks/useAlertsWatcher";

// Session-scoped: splash only shows once per app open, not on every re-mount.
let splashShown = false;

export function MainLayout({ children }: { children?: React.ReactNode }) {
  const location = useLocation();
  const [showSplash, setShowSplash] = useState(!splashShown);
  const dismissSplash = useCallback(() => setShowSplash(false), []);

  // App-wide: checks the person's own active price alerts against live
  // quotes so they fire the moment they're met while the app is open,
  // not just whenever the background cron sweep next runs.
  useAlertsWatcher();

  useEffect(() => {
    splashShown = true;
  }, []);

  return (
    <ProtectedRoute>
      <RouteSeo />
      {showSplash && <SplashScreen onDone={dismissSplash} />}
      <div className="app-shell page-canvas min-h-screen bg-background">
        <PullToRefresh>
          <div className="pb-20">
            <PageErrorBoundary resetKey={location.pathname}>
              <Suspense
                fallback={
                  <div
                    role="status"
                    className="px-4 py-8 text-sm text-muted-foreground"
                  >
                    Loading your workspace…
                  </div>
                }
              >
                {children ?? <Outlet />}
              </Suspense>
            </PageErrorBoundary>
          </div>
        </PullToRefresh>
        <BottomNavigation />
      </div>
    </ProtectedRoute>
  );
}
