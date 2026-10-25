import React, { createContext, useContext, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/continua/browserClient';
import { useAuth } from './useAuth';
import { usePageRefresh } from './usePageRefresh';
import {readAccountSnapshot,saveAccountSnapshot} from '@/lib/accountSnapshot';

export interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  email?: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  handle: string | null;
  portfolio_public: boolean | null;
  portfolio_hide_amounts: boolean | null;
  portfolio_hide_gains: boolean | null;
  portfolio_top_holdings_only: boolean | null;
  portfolio_followers_only: boolean | null;
  followers_count: number | null;
  following_count: number | null;
  subscription_plan: string;
  subscription_expires_at?: string | null;
  tradershub_onboarded: boolean;
  interests: string[] | null;
  trading_experience: string | null;
  created_at: string;
  updated_at: string;
}

interface ProfileContextType {
  profile: Profile | null;
  loading: boolean;
  error: unknown;
  updateProfile: (updates: Partial<Profile>) => Promise<{ data?: Profile; error?: any }>;
  refetch: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);
function cachedAccount(userId:string|undefined):{profile:Profile;updatedAt:number}|undefined {
  if(!userId)return undefined;
  try {
    return readAccountSnapshot(localStorage,userId);
  }catch{ /* Storage optional. */ }
  return undefined;
}

// Shared across every screen that reads the profile (Account, TopBar, BottomNavigation,
// Home, TradersHub, EditProfileDialog, ...) so a save in one place shows up everywhere
// else immediately instead of only after a full remount.
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const client = useQueryClient();
  const key = ['continua','profile',user?.id];
  const result = useQuery({
    queryKey: key, enabled: !!user,
    staleTime: 5 * 60_000, refetchOnMount: 'always', retry: 2,
    initialData: () => cachedAccount(user?.id)?.profile,
    initialDataUpdatedAt: () => cachedAccount(user?.id)?.updatedAt,
    // The cached plan is a UI hint, not an authorization token. Every paid
    // request remains verified by the backend. Never persist auth secrets.
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, avatar_url, banner_url, bio, handle, portfolio_public, portfolio_hide_amounts, portfolio_hide_gains, portfolio_top_holdings_only, portfolio_followers_only, followers_count, following_count, subscription_plan, subscription_expires_at, tradershub_onboarded, interests, trading_experience, created_at, updated_at')
        .eq('user_id', user!.id)
        .single();

      if (error) throw error;
      return data as unknown as Profile;
    },
  });
  const rawProfile = user ? result.data ?? null : null;
  const expired = rawProfile?.subscription_expires_at && Date.parse(rawProfile.subscription_expires_at) <= Date.now();
  const profile = expired ? { ...rawProfile!, subscription_plan:'free' } : rawProfile;
  const loading = authLoading || (!!user && result.isPending);
  const fetchProfile = useCallback(async () => { if(user) await result.refetch(); }, [user?.id,result.refetch]);
  useEffect(() => {
    if (!user || !rawProfile) return;
    try { saveAccountSnapshot(localStorage,user.id,rawProfile,result.dataUpdatedAt); } catch { /* Storage optional. */ }
  },[user?.id,rawProfile,result.dataUpdatedAt]);
  useEffect(() => {
    if (!user) return;
    const userId=user.id;
    return () => {
      // A token refresh must not reset this cache. A different account or
      // logout must not inherit any profile or paid workspace data.
      // Display hints survive an ordinary provider remount/reopen. Explicit
      // sign-out/account switch removes them through clearPrivateSessionCache.
      try { Object.keys(localStorage).filter(key=>key.startsWith(`continua:company-engine:${userId}:`)).forEach(key=>localStorage.removeItem(key)); } catch { /* Storage optional. */ }
      client.removeQueries({predicate:q=>q.queryKey.includes(userId)});
    };
  },[user?.id,client]);
  useEffect(() => {
    const expires=rawProfile?.subscription_expires_at ? Date.parse(rawProfile.subscription_expires_at) : NaN;
    if (!Number.isFinite(expires) || expires<=Date.now()) return;
    const timer=setTimeout(()=>void fetchProfile(),Math.min(expires-Date.now()+50,2_147_483_647));
    return ()=>clearTimeout(timer);
  },[rawProfile?.subscription_expires_at,fetchProfile]);
  usePageRefresh(fetchProfile);

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: 'Not signed in' };

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates as any)
        .eq('user_id', user.id)
        .select('id, user_id, full_name, avatar_url, banner_url, bio, handle, portfolio_public, portfolio_hide_amounts, portfolio_hide_gains, portfolio_top_holdings_only, portfolio_followers_only, followers_count, following_count, subscription_plan, subscription_expires_at, tradershub_onboarded, interests, trading_experience, created_at, updated_at')
        .single();

      if (error) {
        console.error('Error updating profile:', error);
        return { error };
      }

      const next = data as unknown as Profile;
      client.setQueryData(key,next);
      return { data: next };
    } catch (error) {
      console.error('Error updating profile:', error);
      return { error };
    }
  };

  const value: ProfileContextType = {
    profile,
    loading,
    error: result.error,
    updateProfile,
    refetch: fetchProfile,
  };

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}
