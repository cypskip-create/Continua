import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface PriceAlert {
  id: string;
  user_id: string;
  symbol: string;
  exchange: string;
  currency: string;
  alert_type: 'price_above' | 'price_below' | 'volume_spike' | 'dividend' | 'news' | 'rsi_above' | 'rsi_below';
  target_value: number | null;
  /** Set only for indicator alerts (RSI/SMA_CROSS/EMA_CROSS). null for
   *  plain price alerts — see supabase/migrations/033_alerts_multi_exchange_and_indicators.sql */
  indicator: 'RSI' | 'SMA_CROSS' | 'EMA_CROSS' | null;
  /** Shape depends on `indicator`:
   *   RSI: { period, threshold }
   *   SMA_CROSS/EMA_CROSS: { fastPeriod, slowPeriod, direction: 1 | -1 } (1 = bullish, -1 = bearish) */
  indicator_params: Record<string, number> | null;
  is_active: boolean;
  triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export function usePriceAlerts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['continua', 'price-alerts', user?.id];
  const result = useQuery({
    queryKey, enabled: !!user, staleTime: 15000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('price_alerts').select('*')
        .eq('user_id', user!.id).order('created_at', { ascending: false }).abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as PriceAlert[];
    },
  });
  const alerts = user ? result.data ?? [] : [];
  const loading = !!user && result.isLoading;
  const fetchAlerts = () => result.refetch();
  const setAlerts = (update: (previous: PriceAlert[]) => PriceAlert[]) => {
    queryClient.setQueryData<PriceAlert[]>(queryKey, previous => update(previous ?? []));
    void queryClient.invalidateQueries({ queryKey });
  };

  const createAlert = async (alertData: Omit<PriceAlert, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'triggered_at'>) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const { data, error } = await supabase
        .from('price_alerts')
        .insert({
          ...alertData,
          user_id: user.id,
        } as any)
        .select()
        .single();

      if (error) {
        console.error('Error creating alert:', error);
        return { error };
      }

      setAlerts(prev => [data as PriceAlert, ...prev]);
      return { data };
    } catch (error) {
      console.error('Error creating alert:', error);
      return { error };
    }
  };

  const deleteAlert = async (id: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const { error } = await supabase
        .from('price_alerts')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error deleting alert:', error);
        return { error };
      }

      setAlerts(prev => prev.filter(alert => alert.id !== id));
      return { success: true };
    } catch (error) {
      console.error('Error deleting alert:', error);
      return { error };
    }
  };

  const updateAlert = async (id: string, changes: Partial<Pick<PriceAlert, 'alert_type' | 'target_value' | 'is_active' | 'indicator' | 'indicator_params'>>) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const { data, error } = await supabase
        .from('price_alerts')
        .update(changes as any)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating alert:', error);
        return { error };
      }

      setAlerts(prev => prev.map(alert => alert.id === id ? data as PriceAlert : alert));
      return { data };
    } catch (error) {
      console.error('Error updating alert:', error);
      return { error };
    }
  };

  const toggleAlert = async (id: string, isActive: boolean) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const { data, error } = await supabase
        .from('price_alerts')
        .update({ is_active: isActive })
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        console.error('Error toggling alert:', error);
        return { error };
      }

      setAlerts(prev => prev.map(alert => alert.id === id ? data as PriceAlert : alert));
      return { data };
    } catch (error) {
      console.error('Error toggling alert:', error);
      return { error };
    }
  };

  return {
    alerts,
    loading,
    createAlert,
    updateAlert,
    deleteAlert,
    toggleAlert,
    refetch: fetchAlerts,
  };
}
