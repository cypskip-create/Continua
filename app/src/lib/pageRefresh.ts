type Refresher = () => Promise<unknown>;
const refreshers = new Set<Refresher>();

/** Legacy local-state feeds participate alongside React Query without a page reload. */
export function registerPageRefresh(refresh: Refresher) {
  refreshers.add(refresh);
  return () => { refreshers.delete(refresh); };
}

export async function refreshPageData() {
  await Promise.all([...refreshers].map((refresh) => Promise.resolve().then(refresh)));
}
