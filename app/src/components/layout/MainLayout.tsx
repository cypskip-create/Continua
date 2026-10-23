import { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { PageErrorBoundary } from "./PageErrorBoundary";
import { BottomNavigation } from "./BottomNavigation";
import { ProtectedRoute } from "./ProtectedRoute";
import { RouteSeo } from "@/components/shared/RouteSeo";
import { PullToRefresh } from "./PullToRefresh";
import { useAlertsWatcher } from "@/hooks/useAlertsWatcher";

export function MainLayout({ children }: { children?: React.ReactNode }) {
  const location = useLocation();

  // App-wide: checks the person's own active price alerts against live
  // quotes so they fire the moment they're met while the app is open,
  // not just whenever the background cron sweep next runs.
  useAlertsWatcher();

  return (
    <ProtectedRoute>
      <RouteSeo />
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
