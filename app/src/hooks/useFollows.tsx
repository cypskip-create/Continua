import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface FollowUser {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export function useFollows() {
  const { user } = useAuth();
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);

  const fetchFollowing = useCallback(async (userId?: string) => {
    const targetUserId = userId || user?.id;
    if (!targetUserId) return [];

    const { data: followsData } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', targetUserId);

    if (!followsData || followsData.length === 0) return [];

    const followingIds = followsData.map(f => f.following_id);
    
    // Use public view to exclude sensitive data like email
    const { data: profiles } = await supabase
      .from('profiles_public')
      .select('id, user_id, full_name, avatar_url, bio')
      .in('user_id', followingIds);

    return profiles || [];
  }, [user]);

  const fetchFollowers = useCallback(async (userId?: string) => {
    const targetUserId = userId || user?.id;
    if (!targetUserId) return [];

    const { data: followsData } = await supabase
      .from('user_follows')
      .select('follower_id')
      .eq('following_id', targetUserId);

    if (!followsData || followsData.length === 0) return [];

    const followerIds = followsData.map(f => f.follower_id);
    
    // Use public view to exclude sensitive data like email
    const { data: profiles } = await supabase
      .from('profiles_public')
      .select('id, user_id, full_name, avatar_url, bio')
      .in('user_id', followerIds);

    return profiles || [];
  }, [user]);

  const fetchMyFollowingIds = useCallback(async () => {
    if (!user) return new Set<string>();

    const { data, error } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', user.id);

    if (error) throw error;
    return new Set(data?.map(f => f.following_id) || []);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      if (!user) {
        setFollowers([]);
        setFollowing([]);
        setFollowingIds(new Set());
        setLoading(false);
        setResolvedUserId(null);
        return;
      }

      setLoading(true);
      try {
      const [followersData, followingData, ids] = await Promise.all([
        fetchFollowers(),
        fetchFollowing(),
        fetchMyFollowingIds()
      ]);
      
      if (cancelled) return;
      setFollowers(followersData);
      setFollowing(followingData);
      setFollowingIds(ids);
      setLoading(false);
      setResolvedUserId(user.id);
      } catch {
        // A failed lookup must not be mistaken for "follows nobody".
        if (!cancelled) setResolvedUserId(null);
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [user, fetchFollowers, fetchFollowing, fetchMyFollowingIds]);

  const followUser = async (targetUserId: string) => {
    if (!user) return { error: { message: 'Must be logged in' } };
    if (user.id === targetUserId) return { error: { message: 'Cannot follow yourself' } };

    const { error } = await supabase
      .from('user_follows')
      .insert({ follower_id: user.id, following_id: targetUserId });

    if (!error) {
      setFollowingIds(prev => new Set([...prev, targetUserId]));
    }

    return { error };
  };

  const unfollowUser = async (targetUserId: string) => {
    if (!user) return { error: { message: 'Must be logged in' } };

    const { error } = await supabase
      .from('user_follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', targetUserId);

    if (!error) {
      setFollowingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(targetUserId);
        return newSet;
      });
    }

    return { error };
  };

  const isFollowing = (userId: string) => followingIds.has(userId);
  const toggleFollow = async (targetUserId: string) => {
    if (isFollowing(targetUserId)) {
      return unfollowUser(targetUserId);
    } else {
      return followUser(targetUserId);
    }
  };

  return {
    followers,
    following,
    followingIds,
    loading: loading || (!!user && resolvedUserId !== user.id),
    followUser,
    unfollowUser,
    isFollowing,
    toggleFollow,
    fetchFollowers,
    fetchFollowing,
    refetch: async () => {
      const [followersData, followingData, ids] = await Promise.all([
        fetchFollowers(),
        fetchFollowing(),
        fetchMyFollowingIds()
      ]);
      setFollowers(followersData);
      setFollowing(followingData);
      setFollowingIds(ids);
      setResolvedUserId(user?.id ?? null);
      setLoading(false);
    }
  };
}
