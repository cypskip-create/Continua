import { useState, useEffect, useCallback } from "react";
import { usePageRefresh } from './usePageRefresh';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Room {
  id: string;
  creator_id: string;
  name: string;
  description: string | null;
  category: string;
  room_type: "text" | "live" | "scheduled";
  is_private: boolean;
  is_live: boolean;
  scheduled_at: string | null;
  topic: string | null;
  cover_url: string | null;
  member_count: number;
  online_count: number;
  created_at: string;
  is_member?: boolean;
}

let __roomsCache: Room[] | null = null;

export function useRooms() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>(__roomsCache || []);
  const [loading, setLoading] = useState(!__roomsCache);

  const fetch = useCallback(async () => {
    if (!__roomsCache) setLoading(true);
    const [{ data: roomData }, memberRes] = await Promise.all([
      supabase.from("rooms" as any).select("*").order("created_at", { ascending: false }).limit(100),
      user
        ? supabase.from("room_members" as any).select("room_id").eq("user_id", user.id)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const memberSet = new Set((memberRes.data as any[] || []).map((m: any) => m.room_id));
    const enriched = ((roomData as any[]) || []).map((r: any) => ({ ...r, is_member: memberSet.has(r.id) })) as Room[];
    setRooms(enriched);
    __roomsCache = enriched;
    setLoading(false);
  }, [user]);

  usePageRefresh(fetch);
  useEffect(() => { fetch(); }, [fetch]);

  const createRoom = async (input: {
    name: string;
    description?: string;
    category?: string;
    room_type?: "text" | "live" | "scheduled";
    is_private?: boolean;
    scheduled_at?: string | null;
    topic?: string;
  }) => {
    if (!user) return { error: { message: "Sign in required" } };
    const { data, error } = await supabase
      .from("rooms" as any)
      .insert({
        creator_id: user.id,
        name: input.name,
        description: input.description || null,
        category: input.category || "General",
        room_type: input.room_type || "text",
        is_private: !!input.is_private,
        scheduled_at: input.scheduled_at || null,
        topic: input.topic || null,
        is_live: input.room_type === "live",
      } as any)
      .select()
      .single();
    if (error) return { error };
    // creator auto-joins as host
    await supabase.from("room_members" as any).insert({ room_id: (data as any).id, user_id: user.id, role: "host" });
    await fetch();
    return { data };
  };

  const joinRoom = async (roomId: string) => {
    if (!user) return { error: { message: "Sign in required" } };
    const { error } = await supabase.from("room_members" as any).insert({ room_id: roomId, user_id: user.id });
    if (!error) {
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, is_member: true, member_count: r.member_count + 1 } : r));
    }
    return { error };
  };

  const leaveRoom = async (roomId: string) => {
    if (!user) return { error: { message: "Sign in required" } };
    const { error } = await supabase.from("room_members" as any).delete().eq("room_id", roomId).eq("user_id", user.id);
    if (!error) {
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, is_member: false, member_count: Math.max(0, r.member_count - 1) } : r));
    }
    return { error };
  };

  return { rooms, loading, refetch: fetch, createRoom, joinRoom, leaveRoom };
}
