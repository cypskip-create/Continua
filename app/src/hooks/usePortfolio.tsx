import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

const CACHE_PREFIX = 'continua:portfolio:';
export interface PortfolioItem {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  shares: number;
  avg_cost: number;
  sector: string | null;
  created_at: string;
  updated_at: string;
}

function readCache(userId: string): PortfolioItem[] | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CACHE_PREFIX + userId) ?? 'null');
    if (!Array.isArray(value)) return undefined;
    return value.filter((item): item is PortfolioItem => item?.user_id === userId &&
      typeof item.symbol === 'string' && Number.isFinite(item.shares) && Number.isFinite(item.avg_cost));
  } catch { return undefined; }
}
function persist(userId: string, value: PortfolioItem[]) {
  try { localStorage.setItem(CACHE_PREFIX + userId, JSON.stringify(value)); } catch { /* private browsing / quota */ }
}

/** One user-scoped cache for Home, portfolio, stock details and pull-to-refresh. */
export function usePortfolio() {
  const { user } = useAuth();
  const client = useQueryClient();
  const key = ['continua', 'portfolio', user?.id];
  const query = useQuery({
    queryKey: key,
    enabled: !!user,
    initialData: () => user ? readCache(user.id) : undefined,
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
    retry: 1,
    queryFn: async ({ signal }) => {
      if (!user) return [];
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) controller.abort();
      const timer = setTimeout(abort, 8_000);
      try {
        const { data, error } = await supabase.from('portfolios').select('*')
          .eq('user_id', user.id).order('created_at', { ascending: false }).abortSignal(controller.signal);
        if (error) throw error;
        if (controller.signal.aborted) throw new Error('Portfolio request cancelled or timed out');
        persist(user.id, data ?? []);
        return (data ?? []) as PortfolioItem[];
      } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
    },
  });

  const publish = async (update: (items: PortfolioItem[]) => PortfolioItem[]) => {
    if (!user) return;
    await client.cancelQueries({ queryKey: key });
    client.setQueryData<PortfolioItem[]>(key, (current) => {
      const next = update(current ?? []);
      persist(user.id, next);
      return next;
    });
  };

  const addToPortfolio = async (symbol: string, name: string, shares: number, avgCost: number, sector?: string) => {
    if (!user) return { error: 'User not authenticated' };
    if (!symbol.trim() || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgCost) || avgCost < 0)
      return { error: 'Enter a valid symbol, positive share count and non-negative cost' };
    try {
      const { data, error } = await supabase.from('portfolios')
        .insert({ user_id: user.id, symbol: symbol.trim().toUpperCase(), name, shares, avg_cost: avgCost, sector })
        .select().single();
      if (error) return { error };
      await publish((items) => [data, ...items]);
      return { data };
    } catch (error) { return { error }; }
  };
  const removeFromPortfolio = async (id: string) => {
    if (!user) return { error: 'User not authenticated' };
    try {
      const { error } = await supabase.from('portfolios').delete().eq('id', id).eq('user_id', user.id);
      if (error) return { error };
      await publish((items) => items.filter((item) => item.id !== id));
      return { success: true };
    } catch (error) { return { error }; }
  };
  const updatePortfolioItem = async (id: string, updates: Partial<PortfolioItem>) => {
    if (!user) return { error: 'User not authenticated' };
    if ((updates.shares != null && (!Number.isFinite(updates.shares) || updates.shares <= 0)) ||
        (updates.avg_cost != null && (!Number.isFinite(updates.avg_cost) || updates.avg_cost < 0)))
      return { error: 'Enter a positive share count and non-negative cost' };
    // Ownership/audit fields cannot be reassigned through this API.
    const { shares, avg_cost, symbol, name, sector } = updates;
    try {
      const { data, error } = await supabase.from('portfolios').update({ shares, avg_cost, symbol, name, sector })
        .eq('id', id).eq('user_id', user.id).select().single();
      if (error) return { error };
      await publish((items) => items.map((item) => item.id === id ? data : item));
      return { data };
    } catch (error) { return { error }; }
  };
  return {
    portfolio: user ? query.data ?? [] : [], loading: !!user && query.isLoading,
    error: query.error, addToPortfolio, removeFromPortfolio, updatePortfolioItem, refetch: query.refetch,
  };
}
