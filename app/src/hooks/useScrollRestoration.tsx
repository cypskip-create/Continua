import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Window-scroll positions keyed by React Router's per-entry `location.key`.
 * Module-level (not component state) so it survives the whole app tree
 * unmounting/remounting a page as you navigate — it only resets on a hard
 * page reload, which is fine since browser history resets then too.
 */
const scrollPositions = new Map<string, number>();
const tabPositions = new Map<string, number>();

/**
 * Restores scroll position when navigating back (or forward) to a page you'd
 * already scrolled down on, and starts fresh at the top for any new page you
 * push onto the stack. Mount this once near the root, inside the Router.
 *
 * Native browser scroll restoration doesn't reliably handle this for a
 * client-rendered SPA: pages here often render short (loading/skeleton)
 * first and grow once data arrives, so a scroll restore attempted too early
 * gets clamped back to 0. This hook keeps retrying for a bit as content
 * grows in, instead of giving up after a single attempt.
 */
export function useScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType(); // "POP" | "PUSH" | "REPLACE"
  const restoring = useRef(false);

  // Browser-native restoration fights with ours (it can jump the scroll
  // position around mid-transition) — take manual control once, up front.
  useLayoutEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  // Continuously record the scroll position of whichever page is currently
  // active. Recording on every scroll (rather than trying to capture a single
  // snapshot on the way out) means we always have an accurate last-known
  // position, regardless of what triggered the navigation away from it.
  useLayoutEffect(() => {
    const key = location.key;
    const onScroll = () => {
      if (restoring.current) return;
      scrollPositions.set(key, window.scrollY);
      tabPositions.set(location.pathname + location.search, window.scrollY);
    };

    // Only set an initial value if we don't already have a saved position.
    // This prevents overwriting a previously saved scroll position when
    // returning to a page (e.g., navigating back).
    // Do not sample the previous route's inherited offset on mount. The
    // following layout effect restores this route before its first scroll.

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [location.key, location.pathname, location.search]);

  // Restore before paint. Re-apply while async content grows, but never hide
  // the page or use smooth scrolling: back navigation should feel instant.
  useLayoutEffect(() => {
    const target = navigationType === "POP" ? (scrollPositions.get(location.key) ?? 0)
      : location.state?.resumeTab ? (tabPositions.get(location.pathname + location.search) ?? 0) : 0;
    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    restoring.current = target > 0;
    root.style.scrollBehavior = "auto";
    const restore = () => {
      window.scrollTo({ top: target, behavior: "auto" });
      if (Math.abs(window.scrollY - target) < 1) restoring.current = false;
    };
    restore();
    const frame = requestAnimationFrame(restore);
    // Lazy routes may still be shorter than the saved offset on the first
    // frame. Retry on layout growth, but stop immediately on user input so
    // restoration never fights a deliberate scroll or tap.
    const observer = new ResizeObserver(() => { if (restoring.current) restore(); });
    observer.observe(document.body);
    const finish = () => {
      observer.disconnect();
      restoring.current = false;
      root.style.scrollBehavior = previousBehavior;
    };
    for (const event of ["touchstart", "wheel", "keydown", "pointerdown"]) window.addEventListener(event, finish, { passive: true });
    const stop = window.setTimeout(finish, 2500);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(stop);
      finish();
      for (const event of ["touchstart", "wheel", "keydown", "pointerdown"]) window.removeEventListener(event, finish);
      root.style.scrollBehavior = previousBehavior;
    };
  }, [location.key, location.pathname, location.search, location.state, navigationType]);
}
