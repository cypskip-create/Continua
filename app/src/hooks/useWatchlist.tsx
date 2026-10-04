import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePageRefresh } from './usePageRefresh';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';

export interface WatchlistFolder {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface WatchlistItem {
  id: string;
  user_id: string;
  folder_id: string;
  symbol: string;
  name: string;
  created_at: string;
}

// Moomoo-style tiering: free accounts get exactly one watchlist (they can
// still rename it); Premium/Premium+ can create more. Keep this in sync with
// enforce_watchlist_folder_limit() in the DB -- the server enforces the real
// limit, this is just so the UI can show the upgrade prompt before hitting it.
const FREE_FOLDER_LIMIT = 1;
const PREMIUM_FOLDER_LIMIT = 20;

export function useWatchlist() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [folders, setFolders] = useState<WatchlistFolder[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [foldersLoading, setFoldersLoading] = useState(true);

  const isPremium = profile?.subscription_plan === 'premium' || profile?.subscription_plan === 'premium_plus';
  const folderLimit = isPremium ? PREMIUM_FOLDER_LIMIT : FREE_FOLDER_LIMIT;
  const canCreateFolder = folders.length < folderLimit;

  const fetchFolders = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('watchlist_folders')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching watchlist folders:', error);
        return;
      }

      let list = data || [];

      // Lazily create the default folder for brand-new users so there's
      // always at least one place to add a stock.
      if (list.length === 0) {
        const { data: created, error: createErr } = await supabase
          .from('watchlist_folders')
          .insert({ user_id: user.id, name: 'My Watchlist', is_default: true, sort_order: 0 })
          .select()
          .single();
        if (!createErr && created) list = [created];
      }

      setFolders(list);
    } catch (error) {
      console.error('Error fetching watchlist folders:', error);
    } finally {
      setFoldersLoading(false);
    }
  }, [user]);

  const fetchWatchlist = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('watchlists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching watchlist:', error);
      } else {
        setWatchlist(data || []);
      }
    } catch (error) {
      console.error('Error fetching watchlist:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  usePageRefresh(fetchWatchlist);
  useEffect(() => {
    if (user) {
      fetchFolders();
      fetchWatchlist();
    } else {
      setFolders([]);
      setWatchlist([]);
      setLoading(false);
      setFoldersLoading(false);
    }
  }, [user, fetchFolders, fetchWatchlist]);

  const defaultFolderId = useMemo(
    () => folders.find(f => f.is_default)?.id || folders[0]?.id,
    [folders]
  );

  const createFolder = async (name: string) => {
    if (!user) return { error: { message: 'Not signed in' } };
    if (!canCreateFolder) {
      return { error: { message: isPremium ? `You've reached the ${folderLimit}-watchlist limit` : 'Free plan is limited to 1 watchlist -- upgrade to Premium to create more' } };
    }
    try {
      const { data, error } = await supabase
        .from('watchlist_folders')
        .insert({ user_id: user.id, name: name.trim(), is_default: false, sort_order: folders.length })
        .select()
        .single();

      if (error) {
        console.error('Error creating watchlist folder:', error);
        return { error };
      }

      setFolders(prev => [...prev, data]);
      return { data };
    } catch (error) {
      console.error('Error creating watchlist folder:', error);
      return { error };
    }
  };

  const renameFolder = async (folderId: string, name: string) => {
    try {
      const { data, error } = await supabase
        .from('watchlist_folders')
        .update({ name: name.trim() })
        .eq('id', folderId)
        .select()
        .single();

      if (error) {
        console.error('Error renaming watchlist folder:', error);
        return { error };
      }

      setFolders(prev => prev.map(f => (f.id === folderId ? data : f)));
      return { data };
    } catch (error) {
      console.error('Error renaming watchlist folder:', error);
      return { error };
    }
  };

  const deleteFolder = async (folderId: string) => {
    try {
      const { error } = await supabase
        .from('watchlist_folders')
        .delete()
        .eq('id', folderId);

      if (error) {
        console.error('Error deleting watchlist folder:', error);
        return { error };
      }

      setFolders(prev => prev.filter(f => f.id !== folderId));
      setWatchlist(prev => prev.filter(item => item.folder_id !== folderId));
      return { success: true };
    } catch (error) {
      console.error('Error deleting watchlist folder:', error);
      return { error };
    }
  };

  /** Add a stock to a specific folder (defaults to the user's default folder). */
  const addToWatchlist = async (symbol: string, name: string, folderId?: string) => {
    if (!user) return;
    const targetFolder = folderId || defaultFolderId;
    if (!targetFolder) return { error: { message: 'No watchlist to add to yet' } };

    try {
      const { data, error } = await supabase
        .from('watchlists')
        .insert({ symbol, name, user_id: user.id, folder_id: targetFolder })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return { error: { message: 'Already in this watchlist' } };
        }
        console.error('Error adding to watchlist:', error);
        return { error };
      }

      setWatchlist(prev => [data, ...prev]);
      return { data };
    } catch (error) {
      console.error('Error adding to watchlist:', error);
      return { error };
    }
  };

  /** Remove a stock from one folder, or from every folder if folderId is omitted. */
  const removeFromWatchlist = async (symbol: string, folderId?: string) => {
    if (!user) return;
    try {
      let query = supabase.from('watchlists').delete().eq('symbol', symbol).eq('user_id', user.id);
      if (folderId) query = query.eq('folder_id', folderId);
      const { error } = await query;

      if (error) {
        console.error('Error removing from watchlist:', error);
        return { error };
      }

      setWatchlist(prev => prev.filter(item => !(item.symbol === symbol && (!folderId || item.folder_id === folderId))));
      return { success: true };
    } catch (error) {
      console.error('Error removing from watchlist:', error);
      return { error };
    }
  };

  /** True if the stock is saved in ANY of the user's watchlists. */
  const isInWatchlist = (symbol: string) => watchlist.some(item => item.symbol === symbol);

  /** True if the stock is saved in this specific folder. */
  const isInFolder = (symbol: string, folderId: string) =>
    watchlist.some(item => item.symbol === symbol && item.folder_id === folderId);

  /** All folder ids a given stock currently sits in. */
  const foldersForSymbol = (symbol: string) =>
    watchlist.filter(item => item.symbol === symbol).map(item => item.folder_id);

  return {
    // Flat, cross-folder view -- unchanged shape for existing callers.
    watchlist,
    loading,
    addToWatchlist,
    removeFromWatchlist,
    isInWatchlist,
    refetch: fetchWatchlist,

    // Folder management.
    folders,
    foldersLoading,
    defaultFolderId,
    isPremium,
    canCreateFolder,
    folderLimit,
    createFolder,
    renameFolder,
    deleteFolder,
    isInFolder,
    foldersForSymbol,
    refetchFolders: fetchFolders,
  };
}
