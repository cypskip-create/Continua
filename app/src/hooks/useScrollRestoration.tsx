import { useEffect, useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Window-scroll positions keyed by React Router's per-entry `location.key`.
 * Module-level (not component state) so it survives the whole app tree
 * unmounting/remounting a page as you navigate — it only resets on a hard
 * page reload, which is fine since browser history resets then too.
 */
const scrollPositions = new Map<string, number>();

const RESTORE_ATTEMPTS = 30; // ~500ms at 60fps — enough for most async page content to settle in.

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
    const onScroll = () => scrollPositions.set(key, window.scrollY);

    // Only set an initial value if we don't already have a saved position.
    // This prevents overwriting a previously saved scroll position when
    // returning to a page (e.g., navigating back).
    if (!scrollPositions.has(key)) {
      onScroll(); // record the initial position (usually 0)
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [location.key]);

  // Apply the right scroll position for the page we've just landed on.
  useEffect(() => {
    const key = location.key;
    let cancelled = false;

    if (navigationType === "POP" && scrollPositions.has(key)) {
      const target = scrollPositions.get(key)!;
      const root = document.documentElement;
      const previousBehavior = root.style.scrollBehavior;
      const previousVisibility = document.body.style.visibility;
      root.style.scrollBehavior = "auto";
      // Keep async-growing pages out of sight until their saved offset is
      // reachable. The user sees the restored frame, never the retries.
      document.body.style.visibility = "hidden";
      let attempts = 0;
      const reveal = () => {
        root.style.scrollBehavior = previousBehavior;
        document.body.style.visibility = previousVisibility;
      };
      const tryRestore = () => {
        if (cancelled) { reveal(); return; }
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        attempts += 1;
        if (maxScroll < target - 2 && attempts < RESTORE_ATTEMPTS) {
          requestAnimationFrame(tryRestore);
          return;
        }
        window.scrollTo({ top: Math.min(target, Math.max(0, maxScroll)), behavior: "auto" });
        reveal();
      };
      requestAnimationFrame(tryRestore);
    } else {
      // A genuinely new page (PUSH) or an in-place update (REPLACE) — start at the top,
      // same as opening any page fresh.
      window.scrollTo(0, 0);
    }

    return () => {
      cancelled = true;
    };
  }, [location.key, navigationType]);
}
