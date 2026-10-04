import { Mic, MicOff, Headphones, Verified, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Host {
  name: string;
  avatar: string;
  verified: boolean;
}

interface LiveRoom {
  id: number;
  name: string;
  hosts: Host[];
  listeners: number;
  speakers: number;
  topic: string;
  isLive: boolean;
  category: string;
}

interface LiveRoomCardProps {
  room: LiveRoom;
  onJoin: () => void;
}

export function LiveRoomCard({ room, onJoin }: LiveRoomCardProps) {
  return (
    <Card className="overflow-hidden bg-gradient-to-br from-red-500/5 via-background to-primary/5 border-red-500/20 hover:border-red-500/40 transition-all duration-300">
      <CardContent className="p-4">
        {/* Live Badge Row */}
        <div className="flex items-center gap-2 mb-3">
          <Badge className="bg-red-500 text-white text-[0.625rem] font-bold px-2.5 py-0.5">
            <span className="w-1.5 h-1.5 bg-white rounded-full mr-1.5 animate-pulse" />
            LIVE
          </Badge>
          <Badge variant="secondary" className="text-[0.625rem] px-2 py-0.5">
            {room.category}
          </Badge>
        </div>

        {/* Room Info */}
        <h3 className="font-semibold text-sm mb-1.5 line-clamp-1">{room.name}</h3>
        <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{room.topic}</p>

        {/* Hosts */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex -space-x-2">
            {room.hosts.slice(0, 3).map((host, idx) => (
              <Avatar 
                key={idx} 
                className="h-9 w-9 border-2 border-background ring-2 ring-primary/20"
              >
                <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-primary/30 to-accent/30">
                  {host.avatar}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium truncate">{room.hosts[0].name}</span>
              {room.hosts[0].verified && (
                <Verified className="h-3 w-3 text-primary fill-primary shrink-0" />
              )}
            </div>
            {room.hosts.length > 1 && (
              <span className="text-[0.625rem] text-muted-foreground">
                +{room.hosts.length - 1} more speaking
              </span>
            )}
          </div>
        </div>

        {/* Stats & Join Button */}
        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Headphones className="h-3.5 w-3.5" />
              <span className="font-medium">{room.listeners}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Mic className="h-3.5 w-3.5 text-red-500" />
              <span className="font-medium">{room.speakers}</span>
            </span>
          </div>
          <Button 
            size="sm" 
            className="h-8 px-4 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
            onClick={onJoin}
          >
            <Headphones className="h-3.5 w-3.5 mr-1.5" />
            Listen In
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
