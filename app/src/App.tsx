import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { MainLayout } from "./components/layout/MainLayout";
import { AuthProvider } from "./hooks/useAuth";
import { ProfileProvider } from "./hooks/useProfile";
import { ExchangeProvider } from "./hooks/useExchange";
import { Analytics } from "@vercel/analytics/react";
import Home from "./pages/Home";
import Markets from "./pages/Markets";
import Discover from "./pages/Discover";

import Account from "./pages/Account";
import Upgrade from "./pages/Upgrade";
import StockDetail from "./pages/StockDetail";
import Watchlist from "./pages/Watchlist";
import SectorDetail from "./pages/SectorDetail";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Learn from "./pages/Learn";
import Notifications from "./pages/Notifications";
import Landing from "./pages/Landing";
import SectorHeatmap from "./pages/SectorHeatmap";
import TrackInvestments from "./pages/TrackInvestments";
import TradersHub from "./pages/TradersHub";
import Rooms from "./pages/Rooms";
import { StockScreener } from "./pages/StockScreener";
import StockCompare from "./pages/StockCompare";
import UserProfile from "./pages/UserProfile";
import Settings from "./pages/Settings";
import PostDetail from "./pages/PostDetail";
import ThemeDetail from "./pages/ThemeDetail";
import FeaturedListDetail from "./pages/FeaturedListDetail";
import AdminFinancialsReview from "./pages/AdminFinancialsReview";
import { AppLockGate } from "./components/security/AppLockGate";
import { useScrollRestoration } from "./hooks/useScrollRestoration";

const queryClient = new QueryClient();

// Lives inside <BrowserRouter> (needs router context) and renders nothing —
// it just keeps window scroll position in sync with navigation, app-wide.
function ScrollRestorationController() {
  useScrollRestoration();
  return null;
}

const App = () => (
  <HelmetProvider>
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="light" storageKey="kenyan-stocks-theme">
      <TooltipProvider>
        <AuthProvider>
          <ProfileProvider>
          <ExchangeProvider>
            <Toaster />
            <Sonner />
            <Analytics />
            <AppLockGate>
              <BrowserRouter>
                <ScrollRestorationController />
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/landing" element={<Landing />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/admin/financials-review" element={<AdminFinancialsReview />} />
                  <Route path="/*" element={<MainLayout />}>
                    <Route index element={<Home />} />
                    <Route path="markets" element={<Markets />} />
                    <Route path="discover" element={<Discover />} />

                    <Route path="account" element={<Account />} />
                    <Route path="upgrade" element={<Upgrade />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="stock/:symbol" element={<StockDetail />} />
                    <Route path="watchlist" element={<Watchlist />} />
                    <Route path="sector/:sector" element={<SectorDetail />} />
                    <Route path="theme/:themeId" element={<ThemeDetail />} />
                    <Route path="featured/:slug" element={<FeaturedListDetail />} />
                    <Route path="learn" element={<Learn />} />
                    <Route path="notifications" element={<Notifications />} />
                    <Route path="alerts" element={<Notifications />} />
                    <Route path="sector-heatmap" element={<SectorHeatmap />} />
                    <Route path="market-brief" element={<SectorHeatmap />} />
                    <Route path="track-investments" element={<TrackInvestments />} />
                    <Route path="traders-hub" element={<TradersHub />} />
                    <Route path="traders-hub/post/:postId" element={<PostDetail />} />
                    <Route path="rooms" element={<Rooms />} />
                    <Route path="screener" element={<StockScreener />} />
                    <Route path="compare" element={<StockCompare />} />
                    <Route path="profile/:userId" element={<UserProfile />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
              </BrowserRouter>
            </AppLockGate>
          </ExchangeProvider>
          </ProfileProvider>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
  </HelmetProvider>
);

export default App;