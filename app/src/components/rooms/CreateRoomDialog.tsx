import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, MessageSquare, Radio, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreate: (input: { name: string; description?: string; category?: string; room_type: "text" | "live" | "scheduled"; is_private?: boolean; scheduled_at?: string | null; topic?: string }) => Promise<{ error?: any; data?: any }>;
}

const CATEGORIES = ["General", "Markets", "Banking", "Telecom", "Energy", "Premium", "Beginners", "Strategy"];

export function CreateRoomDialog({ open, onOpenChange, onCreate }: Props) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState("General");
  const [roomType, setRoomType] = useState<"text" | "live" | "scheduled">("text");
  const [isPrivate, setIsPrivate] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => { setName(""); setDesc(""); setTopic(""); setCategory("General"); setRoomType("text"); setIsPrivate(false); setScheduledAt(""); };

  const submit = async () => {
    if (!name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    setBusy(true);
    const { error } = await onCreate({
      name: name.trim(),
      description: desc.trim() || undefined,
      topic: topic.trim() || undefined,
      category,
      room_type: roomType,
      is_private: isPrivate,
      scheduled_at: roomType === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
    });
    setBusy(false);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Room created!" });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl">
        <DialogHeader><DialogTitle>Create Room</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-semibold">Room type</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {[
                { id: "text", label: "Text", icon: MessageSquare },
                { id: "live", label: "Live", icon: Radio },
                { id: "scheduled", label: "Scheduled", icon: Calendar },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setRoomType(t.id as any)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border transition ${roomType === t.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/40"}`}
                >
                  <t.icon className="h-4 w-4" />
                  <span className="text-xs font-semibold">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Banking Sector Bulls" maxLength={60} className="mt-1" />
          </div>

          <div>
            <Label className="text-xs font-semibold">Description</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What's this room about?" maxLength={200} className="mt-1 min-h-[70px]" />
          </div>

          {roomType !== "text" && (
            <div>
              <Label className="text-xs font-semibold">Topic for this session</Label>
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Q3 earnings deep dive" maxLength={120} className="mt-1" />
            </div>
          )}

          {roomType === "scheduled" && (
            <div>
              <Label className="text-xs font-semibold">Start time</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="mt-1" />
            </div>
          )}

          <div>
            <Label className="text-xs font-semibold">Category</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`text-xs px-3 py-1 rounded-full border transition ${category === c ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/40"}`}
                >{c}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-border">
            <div>
              <div className="text-sm font-semibold">Private room</div>
              <div className="text-[0.6875rem] text-muted-foreground">Only invited members can join</div>
            </div>
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1 rounded-full" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Room"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
