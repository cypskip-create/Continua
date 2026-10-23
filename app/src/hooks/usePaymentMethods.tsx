import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/continua/browserClient';
import { useAuth } from './useAuth';

export interface PaymentMethod {
  id: string;
  user_id: string;
  method_type: 'mpesa' | 'card';
  label: string;
  detail: string;
  is_default: boolean;
  created_at: string;
}

export function usePaymentMethods() {
  const { user } = useAuth();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMethods = useCallback(async () => {
    if (!user) { setMethods([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('payment_methods' as any)
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching payment methods:', error);
    } else {
      setMethods((data as any as PaymentMethod[]) || []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchMethods(); }, [fetchMethods]);

  const addMethod = async (input: { method_type: 'mpesa' | 'card'; label: string; detail: string }) => {
    if (!user) return { error: { message: 'Sign in required' } };
    const makeDefault = methods.length === 0;
    const { data, error } = await supabase
      .from('payment_methods' as any)
      .insert({ user_id: user.id, ...input, is_default: makeDefault } as any)
      .select()
      .single();
    if (error) return { error };
    setMethods(prev => [data as any as PaymentMethod, ...prev]);
    return { data: data as any as PaymentMethod };
  };

  const removeMethod = async (id: string) => {
    if (!user) return { error: { message: 'Sign in required' } };
    const removed = methods.find(m => m.id === id);
    const { error } = await supabase.from('payment_methods' as any).delete().eq('id', id).eq('user_id', user.id);
    if (error) return { error };
    const remaining = methods.filter(m => m.id !== id);
    // If we removed the default, promote the next one so there's always a clear default.
    if (removed?.is_default && remaining.length > 0) {
      await setDefault(remaining[0].id);
    } else {
      setMethods(remaining);
    }
    return { success: true };
  };

  const setDefault = async (id: string) => {
    if (!user) return { error: { message: 'Sign in required' } };
    await supabase.from('payment_methods' as any).update({ is_default: false } as any).eq('user_id', user.id);
    const { error } = await supabase.from('payment_methods' as any).update({ is_default: true } as any).eq('id', id).eq('user_id', user.id);
    if (error) return { error };
    setMethods(prev => prev.map(m => ({ ...m, is_default: m.id === id })));
    return { success: true };
  };

  return { methods, loading, addMethod, removeMethod, setDefault, refetch: fetchMethods };
}