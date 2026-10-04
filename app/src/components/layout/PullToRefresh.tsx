import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { pullDistance, REFRESH_THRESHOLD } from "@/lib/pullGesture";
import { refreshPageData } from "@/lib/pageRefresh";
import { runRefreshTasks } from "@/lib/refreshTasks";

/** DOM-scoped (not React bubbling): portal dialogs and bottom navigation are excluded. */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let start: { x: number; y: number } | null = null;
    let pulled = 0;
    let disposed = false;
    const reset = () => { start = null; pulled = 0; if (!disposed) setDistance(0); };
    const onStart = (event: TouchEvent) => {
      reset();
      if (busy.current || event.touches.length !== 1 || window.scrollY > 0) return;
      const target = event.target;
      if (!(target instanceof Element) || !element.contains(target)) return;
      if (target.closest('button,a,input,textarea,select,[role="button"],[role="slider"],[data-no-refresh]')) return;
      // Nested scrollers (charts, horizontal strips, articles) own their gestures.
      for (let node: Element | null = target; node && node !== element; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY + style.overflowX) &&
            (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth)) return;
      }
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const onMove = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1 || window.scrollY > 0) { reset(); return; }
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (dy < -8 || (Math.abs(dx) > 12 && Math.abs(dx) > dy)) { reset(); return; }
      pulled = pullDistance(dx, dy);
      if (!pulled) { setDistance(0); return; }
      if (!event.cancelable) { reset(); return; }
      event.preventDefault(); // Only a deliberate downward pull is intercepted.
      setDistance(pulled);
    };
    const onEnd = () => {
      const commit = pulled >= REFRESH_THRESHOLD;
      reset();
      if (!commit || busy.current) return;
      busy.current = true;
      setRefreshing(true);
      // Invalidate active shared queries, including portfolio. Never reload the page
      // or clear existing data; slow/offline requests must not lock navigation.
      const queries = queryClient.getQueryCache().findAll({ type: 'active' }).filter((query) => !query.isDisabled());
      void runRefreshTasks([
        ...queries.map((query) => ({
          label: String(query.queryKey[1] ?? query.queryKey[0] ?? 'Data'),
          // No background retry chain outlasting the refresh indicator. Existing
          // in-flight requests are shared instead of cancelled and restarted.
          run: () => queryClient.fetchQuery({ ...query.options, queryKey: query.queryKey, staleTime: 0, retry: false }),
        })),
        { label: 'Social and account feeds', run: refreshPageData },
      ]).then((results) => {
        if (disposed) return;
        const failed = [...new Set(results.filter((r) => r.status === 'failed').map((r) => r.label))];
        const updated = results.filter((r) => r.status === 'updated').length;
        if (failed.length) toast.warning(`${updated} sections refreshed. Couldn't update: ${failed.join(', ')}.`, {
          description: 'Previously loaded data is kept. Check your connection or try again.',
        });
      }).finally(() => { busy.current = false; if (!disposed) setRefreshing(false); });
    };
    element.addEventListener("touchstart", onStart, { passive: true });
    element.addEventListener("touchmove", onMove, { passive: false });
    element.addEventListener("touchend", onEnd, { passive: true });
    element.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      disposed = true;
      element.removeEventListener("touchstart", onStart);
      element.removeEventListener("touchmove", onMove);
      element.removeEventListener("touchend", onEnd);
      element.removeEventListener("touchcancel", reset);
    };
  }, [queryClient]);

  return <div ref={root}>
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center">
      {(distance > 0 || refreshing) && <div className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-xs shadow-lg" style={{ transform: `translateY(${refreshing ? 16 : distance / 2}px)` }}>
        <RefreshCw className={`h-4 w-4 text-primary ${refreshing ? "animate-spin" : ""}`} />
        {refreshing ? "Refreshing…" : distance >= REFRESH_THRESHOLD ? "Release to refresh" : "Pull to refresh"}
      </div>}
    </div>
    {children}
  </div>;
}
