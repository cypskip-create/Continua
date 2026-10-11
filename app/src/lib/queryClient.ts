import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query';
import { freshCacheTime, isPublishedQuery, RESEARCH_CACHE_KEY } from './researchCache';

export const queryClient = new QueryClient({ defaultOptions: { queries: {
  gcTime: 24 * 60 * 60_000, refetchOnReconnect: true,
} } });

// Hydrate synchronously before rendering: stale data remains visible while
// React Query refreshes it. Original dataUpdatedAt is retained, never reset.
try {
  const stored = JSON.parse(localStorage.getItem(RESEARCH_CACHE_KEY) ?? 'null');
  if (stored?.version === 1 && Array.isArray(stored.queries)) {
    hydrate(queryClient, { mutations: [], queries: stored.queries.filter((q: any) =>
      Array.isArray(q.queryKey) && isPublishedQuery(q.queryKey) &&
      q.state?.status === 'success' && freshCacheTime(q.state?.dataUpdatedAt)) });
  }
} catch { /* Storage disabled, quota or old malformed cache: use live queries. */ }

let saveTimer: ReturnType<typeof setTimeout> | undefined;
queryClient.getQueryCache().subscribe(() => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const state = dehydrate(queryClient, { shouldDehydrateQuery: q =>
        isPublishedQuery(q.queryKey) && q.state.data !== undefined && freshCacheTime(q.state.dataUpdatedAt) });
      // Bounded cache. Evict older entries rather than grow without limit.
      const queries = state.queries.sort((a,b) => b.state.dataUpdatedAt-a.state.dataUpdatedAt).slice(0,100)
        .map(q=>({...q,state:{...q.state,status:'success',error:null,fetchStatus:'idle'}}));
      while (queries.length && JSON.stringify(queries).length > 2_000_000) queries.pop();
      localStorage.setItem(RESEARCH_CACHE_KEY, JSON.stringify({ version:1, queries }));
    } catch { /* A full/private browser storage must never break the app. */ }
  }, 300);
});
