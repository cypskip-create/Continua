import { useLayoutEffect, useRef } from "react";
/** Observe actual rendered heights, including changes to the global text scale. */
export function useStickyHeights() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    let header = root.querySelector<HTMLElement>("[data-sticky-header]");
    let nav = root.querySelector<HTMLElement>("[data-sticky-nav]");
    const update = () => {
      root.style.setProperty("--sticky-header-height", (header?.getBoundingClientRect().height ?? 0) + "px");
      root.style.setProperty("--sticky-nav-height", (nav?.getBoundingClientRect().height ?? 0) + "px");
    };
    const observer = new ResizeObserver(update);
    if (header) observer.observe(header);
    if (nav) observer.observe(nav);
    const mutations = new MutationObserver(() => {
      const nextHeader = root.querySelector<HTMLElement>("[data-sticky-header]");
      const nextNav = root.querySelector<HTMLElement>("[data-sticky-nav]");
      if (nextHeader !== header || nextNav !== nav) {
        observer.disconnect(); header = nextHeader; nav = nextNav;
        if (header) observer.observe(header);
        if (nav) observer.observe(nav);
        update();
      }
    });
    mutations.observe(root, { childList: true, subtree: true });
    update();
    return () => { observer.disconnect(); mutations.disconnect(); };
  }, []);
  return ref;
}
