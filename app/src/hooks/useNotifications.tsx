import { useEffect, useId } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface NotificationActor {
  user_id: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
}

export interface AppNotification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: string; // like, comment, reply, repost, follow, mention, alert, news, system
  feature: string; // tradershub, social, alerts, news, portfolio, system
  title: string;
  message: string;
  action_url: string | null;
  entity_id: string | null;
  entity_type: string | null;
  read: boolean;
  created_at: string;
  actor?: NotificationActor | null;
}

// Notifications carry an actor_id (who liked/followed/replied) but not the
// actor's name/avatar -- that has to be joined in separately, from
// profiles_public so it's automatically limited to people with a real
// TradersHub presence (see migration 20260824090000).
async function attachActors(rows: AppNotification[]): Promise<AppNotification[]> {
  const actorIds = [...new Set(rows.map(r => r.actor_id).filter((id): id is string => !!id))];
  if (actorIds.length === 0) return rows;
  const { data } = await supabase
    .from('profiles_public')
    .select('user_id, full_name, handle, avatar_url')
    .in('user_id', actorIds);
  const byId = new Map((data || []).map((p: any) => [p.user_id, p as NotificationActor]));
  return rows.map(r => ({ ...r, actor: r.actor_id ? byId.get(r.actor_id) || null : null }));
}

export function useNotifications() {
  const { user } = useAuth();
  const client = useQueryClient();
  const instanceId = useId();
  const key = ['continua', 'notifications', user?.id];
  const result = useQuery({
    queryKey: key, enabled: !!user, staleTime: 30000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('notifications' as any).select('*')
        .eq('user_id', user!.id).order('created_at', { ascending: false }).limit(100).abortSignal(signal);
      if (error) throw error;
      return attachActors((data ?? []) as unknown as AppNotification[]);
    },
  });
  const notifications = user ? result.data ?? [] : [];
  const loading = !!user && result.isLoading;
  const fetch = () => result.refetch();
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`notifications-${user.id}-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => { void client.invalidateQueries({ queryKey: ['continua', 'notifications', user.id] }); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user?.id, instanceId, client]);

  // Update every mounted inbox/badge together, only after persistence succeeds.
  const persist = async (request: PromiseLike<{ error: unknown }>, update: (rows: AppNotification[]) => AppNotification[]) => {
    try {
      const { error } = await request;
      if (error) throw error;
      await client.cancelQueries({ queryKey: key });
      client.setQueryData<AppNotification[]>(key, rows => update(rows ?? []));
      void client.invalidateQueries({ queryKey: key });
    } catch {
      toast.error("Couldn't update notifications. Please try again.");
    }
  };
  const markAsRead = async (id: string) => {
    if (!user) return;
    await persist(supabase.from('notifications' as any).update({ read: true }).eq('id', id).eq('user_id', user.id),
      rows => rows.map(n => n.id === id ? { ...n, read: true } : n));
  };
  const markAllAsRead = async () => {
    if (!user) return;
    await persist(supabase.from('notifications' as any).update({ read: true }).eq('user_id', user.id).eq('read', false),
      rows => rows.map(n => ({ ...n, read: true })));
  };
  const remove = async (id: string) => {
    if (!user) return;
    await persist(supabase.from('notifications' as any).delete().eq('id', id).eq('user_id', user.id),
      rows => rows.filter(n => n.id !== id));
  };
  const clearAll = async () => {
    if (!user) return;
    await persist(supabase.from('notifications' as any).delete().eq('user_id', user.id), () => []);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, loading, unreadCount, markAsRead, markAllAsRead, remove, clearAll, refetch: fetch };
}
