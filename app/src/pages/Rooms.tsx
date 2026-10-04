import { useState, useMemo } from "react";
import { TopBar } from "@/components/shared/TopBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Plus, Radio, Calendar, ChevronRight, MessageSquare, Users, Lock, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useRooms, type Room } from "@/hooks/useRooms";
import { CreateRoomDialog } from "@/components/rooms/CreateRoomDialog";
import { RoomChatDialog } from "@/components/rooms/RoomChatDialog";

const CATEGORIES = ["All", "General", "Markets", "Banking", "Telecom", "Energy", "Premium", "Beginners", "Strategy"];

export default function Rooms() {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { rooms, loading, createRoom, joinRoom, leaveRoom } = useRooms();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);
  const [openRoom, setOpenRoom] = useState<Room | null>(null);

  const liveRooms = useMemo(() => rooms.filter(r => r.room_type === "live" && r.is_live), [rooms]);
  const scheduledRooms = useMemo(() => rooms.filter(r => r.room_type === "scheduled"), [rooms]);
  const textRooms = useMemo(() => rooms.filter(r => r.room_type === "text"), [rooms]);

  const filteredText = textRooms.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === "All" || r.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleJoin = async (room: Room) => {
    if (!user) { navigate("/auth"); return; }
    if (room.is_private && room.creator_id !== user.id) { toast({ title: "Private room", description: "You need an invite", variant: "destructive" }); return; }
    if (room.is_member) { setOpenRoom(room); return; }
    const { error } = await joinRoom(room.id);
    if (!error) { toast({ title: `Joined ${room.name}` }); setOpenRoom({ ...room, is_member: true }); }
  };

  const handleLeave = async (room: Room) => {
    const { error } = await leaveRoom(room.id);
    if (!error) toast({ title: "Left room" });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar title="Rooms" subtitle="Live discussions & communities" showSearch={false} />

      <div className="p-4 space-y-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search rooms..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 rounded-full" />
        </div>

        {loading && rooms.length === 0 ? (
          <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : rooms.length === 0 ? (
          <Card className="bg-gradient-to-br from-primary/10 via-background to-accent/5 border-primary/20">
            <CardContent className="p-8 text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No rooms yet</h3>
              <p className="text-sm text-muted-foreground mb-4">Be the first to create a community room.</p>
              <Button className="rounded-full" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Create Room</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {liveRooms.length > 0 && (
              <Section title="Live Now" icon={<Radio className="h-4 w-4 text-destructive animate-pulse" />}>
                <div className="space-y-2.5">
                  {liveRooms.map(r => (
                    <RoomRow key={r.id} room={r} onJoin={() => handleJoin(r)} onLeave={() => handleLeave(r)} />
                  ))}
                </div>
              </Section>
            )}

            {scheduledRooms.length > 0 && (
              <Section title="Upcoming" icon={<Calendar className="h-4 w-4 text-accent" />}>
                <ScrollArea className="w-full whitespace-nowrap">
                  <div className="flex gap-3">
                    {scheduledRooms.map(r => (
                      <Card key={r.id} className="w-[230px] shrink-0 cursor-pointer hover:border-primary/40 transition" onClick={() => handleJoin(r)}>
                        <CardContent className="p-3">
                          <Badge variant="outline" className="text-[0.625rem] mb-2">{r.category}</Badge>
                          <div className="font-bold text-sm mb-1 truncate">{r.name}</div>
                          {r.scheduled_at && <div className="text-[0.6875rem] text-muted-foreground">{new Date(r.scheduled_at).toLocaleString()}</div>}
                          {r.topic && <div className="text-xs mt-2 line-clamp-2 text-muted-foreground">{r.topic}</div>}
                          <Button size="sm" variant="outline" className="w-full rounded-full mt-3 h-8 text-xs">{r.is_member ? "Reminder set" : "Set reminder"}</Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </Section>
            )}

            <Section
              title="Communities"
              icon={<MessageSquare className="h-4 w-4 text-primary" />}
              right={<Button size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={() => setCreateOpen(true)}><Plus className="h-3 w-3 mr-1" />Create</Button>}
            >
              <ScrollArea className="w-full whitespace-nowrap mb-3">
                <div className="flex gap-2">
                  {CATEGORIES.map(c => (
                    <Badge key={c} variant={selectedCategory === c ? "default" : "outline"} className="cursor-pointer whitespace-nowrap py-1.5 px-3 rounded-full" onClick={() => setSelectedCategory(c)}>{c}</Badge>
                  ))}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>

              <div className="space-y-2.5">
                {filteredText.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No rooms in this category yet.</p>
                ) : filteredText.map(r => (
                  <RoomRow key={r.id} room={r} onJoin={() => handleJoin(r)} onLeave={() => handleLeave(r)} />
                ))}
              </div>
            </Section>
          </>
        )}

        <Card className="bg-gradient-to-br from-primary/10 via-background to-accent/5 border-primary/20">
          <CardContent className="p-5 text-center">
            <h3 className="text-base font-bold mb-1">Start your own community</h3>
            <p className="text-xs text-muted-foreground mb-3">Create a room around your investment interests.</p>
            <Button size="sm" className="rounded-full" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Create Room</Button>
          </CardContent>
        </Card>
      </div>

      <CreateRoomDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={createRoom} />
      <RoomChatDialog open={!!openRoom} onOpenChange={(o) => !o && setOpenRoom(null)} room={openRoom} />
    </div>
  );
}

function Section({ title, icon, right, children }: { title: string; icon: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm flex items-center gap-2">{icon}{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function RoomRow({ room, onJoin, onLeave }: { room: Room; onJoin: () => void; onLeave: () => void }) {
  return (
    <Card className="hover:border-primary/30 transition cursor-pointer" onClick={onJoin}>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${room.room_type === "live" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          {room.room_type === "live" ? <Radio className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-bold text-sm truncate">{room.name}</span>
            {room.is_private && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
          </div>
          {room.description && <div className="text-xs text-muted-foreground truncate">{room.description}</div>}
          <div className="text-[0.6875rem] text-muted-foreground flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-[0.5625rem] px-1.5 py-0">{room.category}</Badge>
            <span className="flex items-center gap-0.5"><Users className="h-3 w-3" />{room.member_count}</span>
            {room.is_live && <span className="text-destructive font-bold flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />LIVE</span>}
          </div>
        </div>
        <Button size="sm" variant={room.is_member ? "outline" : "default"} className="rounded-full h-8 text-xs shrink-0" onClick={(e) => { e.stopPropagation(); room.is_member ? onLeave() : onJoin(); }}>
          {room.is_member ? "Joined" : "Join"}
        </Button>
      </CardContent>
    </Card>
  );
}
