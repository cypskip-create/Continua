import { Bell, Users, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ScheduledRoom {
  id: number;
  title: string;
  host: string;
  time: string;
  attendees: number;
  topic: string;
}

interface ScheduledRoomCardProps {
  room: ScheduledRoom;
  onRemind: () => void;
}

export function ScheduledRoomCard({ room, onRemind }: ScheduledRoomCardProps) {
  return (
    <Card className="card-gradient overflow-hidden">
      <CardContent className="p-3">
        <div className="flex items-start gap-2 mb-2">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Calendar className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-xs line-clamp-1 mb-0.5">{room.title}</h4>
            <p className="text-[0.625rem] text-muted-foreground">{room.host}</p>
          </div>
        </div>
        
        <Badge variant="secondary" className="text-[0.625rem] mb-2 w-full justify-center py-1">
          {room.time}
        </Badge>
        
        <p className="text-[0.625rem] text-muted-foreground line-clamp-2 mb-3">
          {room.topic}
        </p>
        
        <div className="flex items-center justify-between">
          <span className="text-[0.625rem] text-muted-foreground flex items-center gap-1">
            <Users className="h-3 w-3" />
            {room.attendees} interested
          </span>
          <Button 
            size="sm" 
            variant="outline" 
            className="h-6 text-[0.625rem] px-2"
            onClick={onRemind}
          >
            <Bell className="h-2.5 w-2.5 mr-1" />
            Remind me
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
