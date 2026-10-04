import { useEffect, useLayoutEffect } from "react";
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
  useEffect(() => {
    const key = location.key;
    const onScroll = () => {
      scrollPositions.set(key, window.scrollY);
      tabPositions.set(location.pathname + location.search, window.scrollY);
    };

    // Only set an initial value if we don't already have a saved position.
    // This prevents overwriting a previously saved scroll position when
    // returning to a page (e.g., navigating back).
    if (!scrollPositions.has(key)) {
      onScroll(); // record the initial position (usually 0)
    }

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
    root.style.scrollBehavior = "auto";
    const restore = () => window.scrollTo({ top: target, behavior: "auto" });
    restore();
    const frame = requestAnimationFrame(restore);
    // One post-paint correction covers lazy route mounting without leaving a
    // live observer that can fight the person's first swipe or tap.
    const stop = window.setTimeout(() => { root.style.scrollBehavior = previousBehavior; }, 100);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(stop);
      root.style.scrollBehavior = previousBehavior;
    };
  }, [location.key, location.pathname, location.search, location.state, navigationType]);
}
