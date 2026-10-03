import { useState, useEffect } from "react";
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
  const [showSplash, setShowSplash] = useState(!splashShown);

  // App-wide: checks the person's own active price alerts against live
  // quotes so they fire the moment they're met while the app is open,
  // not just whenever the background cron sweep next runs.
  useAlertsWatcher();

  useEffect(() => { splashShown = true; }, []);

  return (
    <ProtectedRoute>
      <RouteSeo />
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      <AppLockGate>
        <div className="min-h-screen bg-background">

          <div className="pb-20">
            <Outlet />
          </div>

          <BottomNavigation />
        </div>
      </AppLockGate>
    </ProtectedRoute>
  );
}
