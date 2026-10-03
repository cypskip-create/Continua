import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

const CACHE_PREFIX = "continua:portfolio:";
const REQUEST_TIMEOUT_MS = 8_000;

function readCachedPortfolio(userId: string): PortfolioItem[] {
  try { return JSON.parse(localStorage.getItem(`${CACHE_PREFIX}${userId}`) ?? "[]") as PortfolioItem[]; }
  catch { return []; }
}

function cachePortfolio(userId: string, value: PortfolioItem[]) {
  try { localStorage.setItem(`${CACHE_PREFIX}${userId}`, JSON.stringify(value)); } catch { /* storage may be unavailable */ }
}

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

export function usePortfolio() {
  const { user } = useAuth();
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      const cached = readCachedPortfolio(user.id);
      if (cached.length > 0) {
        setPortfolio(cached);
        setLoading(false);
      }
      void fetchPortfolio();
    } else {
      setPortfolio([]);
      setLoading(false);
    }
  }, [user]);

  const fetchPortfolio = async () => {
    if (!user) return;

    try {
      const request = supabase
        .from('portfolios')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Portfolio request timed out")), REQUEST_TIMEOUT_MS));
      const { data, error } = await Promise.race([request, timeout]);

      if (error) {
        console.error('Error fetching portfolio:', error);
      } else {
        const next = data || [];
        setPortfolio(next);
        cachePortfolio(user.id, next);
      }
    } catch (error) {
      console.error('Error fetching portfolio:', error);
    } finally {
      setLoading(false);
    }
  };

  const addToPortfolio = async (
    symbol: string,
    name: string,
    shares: number,
    avgCost: number,
    sector?: string
  ) => {
    if (!user) return { error: 'User not authenticated' };

    try {
      const { data, error } = await supabase
        .from('portfolios')
        .insert({
          user_id: user.id,
          symbol,
          name,
          shares,
          avg_cost: avgCost,
          sector,
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding to portfolio:', error);
        return { error };
      }

      setPortfolio((current) => {
        const next = [data, ...current];
        cachePortfolio(user.id, next);
        return next;
      });
      return { data };
    } catch (error) {
      console.error('Error adding to portfolio:', error);
      return { error };
    }
  };

  const removeFromPortfolio = async (id: string) => {
    if (!user) return { error: 'User not authenticated' };

    try {
      const { error } = await supabase
        .from('portfolios')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error removing from portfolio:', error);
        return { error };
      }

      setPortfolio((current) => {
        const next = current.filter((item) => item.id !== id);
        cachePortfolio(user.id, next);
        return next;
      });
      return { success: true };
    } catch (error) {
      console.error('Error removing from portfolio:', error);
      return { error };
    }
  };

  const updatePortfolioItem = async (
    id: string,
    updates: Partial<PortfolioItem>
  ) => {
    if (!user) return { error: 'User not authenticated' };

    try {
      const { data, error } = await supabase
        .from('portfolios')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating portfolio item:', error);
        return { error };
      }

      setPortfolio((current) => {
        const next = current.map((item) => (item.id === id ? data : item));
        cachePortfolio(user.id, next);
        return next;
      });
      return { data };
    } catch (error) {
      console.error('Error updating portfolio item:', error);
      return { error };
    }
  };

  return {
    portfolio,
    loading,
    addToPortfolio,
    removeFromPortfolio,
    updatePortfolioItem,
    refetch: fetchPortfolio,
  };
}
