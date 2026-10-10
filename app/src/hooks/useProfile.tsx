import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { usePageRefresh } from './usePageRefresh';

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
  updateProfile: (updates: Partial<Profile>) => Promise<{ data?: Profile; error?: any }>;
  refetch: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

// Shared across every screen that reads the profile (Account, TopBar, BottomNavigation,
// Home, TradersHub, EditProfileDialog, ...) so a save in one place shows up everywhere
// else immediately instead of only after a full remount.
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchProfile();
    } else {
      setProfile(null);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, avatar_url, banner_url, bio, handle, portfolio_public, portfolio_hide_amounts, portfolio_hide_gains, portfolio_top_holdings_only, portfolio_followers_only, followers_count, following_count, subscription_plan, subscription_expires_at, tradershub_onboarded, interests, trading_experience, created_at, updated_at')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
      } else {
        const next = data as unknown as Profile;
        setProfile(next?.subscription_expires_at && Date.parse(next.subscription_expires_at)<=Date.now() ? {...next,subscription_plan:'free'} : next);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

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
      setProfile(next?.subscription_expires_at && Date.parse(next.subscription_expires_at)<=Date.now() ? {...next,subscription_plan:'free'} : next);
      return { data: next };
    } catch (error) {
      console.error('Error updating profile:', error);
      return { error };
    }
  };

  const value: ProfileContextType = {
    profile,
    loading,
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
