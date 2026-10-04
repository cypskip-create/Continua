import { useState, useEffect, useCallback } from 'react';
import { usePageRefresh } from './usePageRefresh';
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
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) { setNotifications([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('notifications' as any)
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setNotifications(await attachActors((data as any) || []));
    setLoading(false);
  }, [user]);

  usePageRefresh(fetch);
  useEffect(() => { fetch(); }, [fetch]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        async (payload) => {
          const [withActor] = await attachActors([payload.new as AppNotification]);
          setNotifications(prev => [withActor, ...prev]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markAsRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await supabase.from('notifications' as any).update({ read: true }).eq('id', id);
  };

  const markAllAsRead = async () => {
    if (!user) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await supabase.from('notifications' as any).update({ read: true }).eq('user_id', user.id).eq('read', false);
  };

  const remove = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    await supabase.from('notifications' as any).delete().eq('id', id);
  };

  const clearAll = async () => {
    if (!user) return;
    setNotifications([]);
    await supabase.from('notifications' as any).delete().eq('user_id', user.id);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, loading, unreadCount, markAsRead, markAllAsRead, remove, clearAll, refetch: fetch };
}
