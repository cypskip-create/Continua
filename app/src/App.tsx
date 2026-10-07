import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { MainLayout } from "./components/layout/MainLayout";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { ProfileProvider } from "./hooks/useProfile";
import { ExchangeProvider } from "./hooks/useExchange";
import { Analytics } from "@vercel/analytics/react";
import { AppLockGate } from "./components/security/AppLockGate";
import { useScrollRestoration } from "./hooks/useScrollRestoration";
import { lazy, Suspense } from "react";

const Home = lazy(() => import("./pages/Home"));
const Markets = lazy(() => import("./pages/Markets"));
const Discover = lazy(() => import("./pages/Discover"));
const Account = lazy(() => import("./pages/Account"));
const Upgrade = lazy(() => import("./pages/Upgrade"));
const StockDetail = lazy(() => import("./pages/StockDetail"));
const Watchlist = lazy(() => import("./pages/Watchlist"));
const SectorDetail = lazy(() => import("./pages/SectorDetail"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Learn = lazy(() => import("./pages/Learn"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Landing = lazy(() => import("./pages/Landing"));
const SectorHeatmap = lazy(() => import("./pages/SectorHeatmap"));
const TrackInvestments = lazy(() => import("./pages/TrackInvestments"));
const TradersHub = lazy(() => import("./pages/TradersHub"));
const Rooms = lazy(() => import("./pages/Rooms"));
const StockScreener = lazy(() => import("./pages/StockScreener").then((module) => ({ default: module.StockScreener })));
const StockCompare = lazy(() => import("./pages/StockCompare"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const Settings = lazy(() => import("./pages/Settings"));
const PostDetail = lazy(() => import("./pages/PostDetail"));
const ThemeDetail = lazy(() => import("./pages/ThemeDetail"));
const FeaturedListDetail = lazy(() => import("./pages/FeaturedListDetail"));
const AdminFinancialsReview = lazy(() => import("./pages/AdminFinancialsReview"));
const Engine = lazy(() => import("./pages/Engine"));

const queryClient = new QueryClient();

function EntryPage() {
  const { user, loading } = useAuth();
  if (loading) return <div role="status" className="min-h-screen bg-background p-6">Loading…</div>;
  return user ? <MainLayout><Home /></MainLayout> : <Landing />;
}

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
                <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-muted-foreground/25 border-t-primary animate-spin" /></div>}>
                <Routes>
                  <Route path="/" element={<EntryPage />} />
                  <Route path="/landing" element={<Landing />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/admin/financials-review" element={<AdminFinancialsReview />} />
                  <Route path="/*" element={<MainLayout />}>
                    <Route index element={<Home />} />
                    <Route path="markets" element={<Markets />} />
                    <Route path="discover" element={<Discover />} />

                    <Route path="account" element={<Account />} />
                    <Route path="upgrade" element={<Upgrade />} />
                    <Route path="engine" element={<Engine />} />
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
                </Suspense>
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
