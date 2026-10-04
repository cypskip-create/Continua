import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, X, Users, Radio, MessageSquare, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Room } from "@/hooks/useRooms";

interface Message { id: string; user_id: string; content: string; created_at: string; author?: { full_name: string | null; avatar_url: string | null } }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  room: Room | null;
}

export function RoomChatDialog({ open, onOpenChange, room }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !room) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase.from("room_messages" as any).select("*").eq("room_id", room.id).order("created_at", { ascending: true }).limit(100);
      const msgs = (data as any[]) || [];
      const uids = [...new Set(msgs.map((m: any) => m.user_id))];
      let pmap = new Map<string, any>();
      if (uids.length) {
        const { data: profs } = await supabase.from("profiles_public").select("user_id, full_name, avatar_url").in("user_id", uids);
        pmap = new Map((profs || []).map((p: any) => [p.user_id, p]));
      }
      setMessages(msgs.map((m: any) => ({ ...m, author: pmap.get(m.user_id) })));
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
    })();

    // realtime
    const channel = supabase
      .channel(`room-${room.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_messages", filter: `room_id=eq.${room.id}` }, async (payload: any) => {
        const m = payload.new as any;
        const { data: prof } = await supabase.from("profiles_public").select("full_name, avatar_url").eq("user_id", m.user_id).maybeSingle();
        setMessages(prev => [...prev, { ...m, author: prof || undefined }]);
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, room]);

  const send = async () => {
    if (!input.trim() || !user || !room) return;
    setSending(true);
    const { error } = await supabase.from("room_messages" as any).insert({ room_id: room.id, user_id: user.id, content: input.trim() });
    setSending(false);
    if (!error) setInput("");
  };

  if (!room) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 h-[85dvh] flex flex-col rounded-2xl overflow-hidden">
        <header className="flex items-center justify-between p-3 border-b border-border bg-card/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${room.room_type === "live" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
              {room.room_type === "live" ? <Radio className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold truncate flex items-center gap-1.5">{room.name}{room.is_live && <span className="text-[0.625rem] bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded font-bold">LIVE</span>}</div>
              <div className="text-[0.6875rem] text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />{room.member_count} members</div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => onOpenChange(false)}><X className="h-4 w-4" /></Button>
        </header>

        <ScrollArea className="flex-1" ref={scrollRef as any}>
          <div className="p-3 space-y-2.5">
            {loading ? (
              <div className="text-center text-sm text-muted-foreground py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
            ) : messages.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">Be the first to start the conversation</div>
            ) : (
              messages.map(m => {
                const own = m.user_id === user?.id;
                return (
                  <div key={m.id} className={`flex gap-2 ${own ? "flex-row-reverse" : ""}`}>
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarImage src={m.author?.avatar_url || ""} />
                      <AvatarFallback className="text-[0.625rem]">{(m.author?.full_name || "U").slice(0, 1).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className={`max-w-[75%] ${own ? "items-end" : "items-start"} flex flex-col`}>
                      <div className="text-[0.625rem] text-muted-foreground px-1">{m.author?.full_name || "User"}</div>
                      <div className={`px-3 py-2 rounded-2xl text-sm ${own ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"}`}>{m.content}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-border bg-card/60 flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={user ? "Send a message..." : "Sign in to chat"} disabled={!user || sending} className="rounded-full bg-muted/50 border-0" />
          <Button size="icon" className="h-10 w-10 rounded-full shrink-0" onClick={send} disabled={!user || sending || !input.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
