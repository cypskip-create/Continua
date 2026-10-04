import { Globe, Lock, Crown, Users, MessageCircle, MoreHorizontal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface TextRoom {
  id: number;
  name: string;
  description: string;
  members: number;
  online: number;
  category: string;
  isPrivate: boolean;
  messages: number;
  lastMessage: string;
  lastMessageTime: string;
}

interface TextRoomCardProps {
  room: TextRoom;
  isJoined: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onOpen: () => void;
}

export function TextRoomCard({ room, isJoined, onJoin, onLeave, onOpen }: TextRoomCardProps) {
  return (
    <Card className="card-gradient overflow-hidden transition-all duration-200 hover:shadow-md">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              {room.isPrivate ? (
                <Lock className="h-4 w-4 text-accent shrink-0" />
              ) : (
                <Globe className="h-4 w-4 text-primary shrink-0" />
              )}
              <h4 className="font-semibold text-sm truncate">{room.name}</h4>
              {room.isPrivate && (
                <Badge className="bg-accent/20 text-accent text-[0.625rem] px-1.5 py-0 shrink-0">
                  <Crown className="h-2.5 w-2.5 mr-0.5" />
                  Premium
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
              {room.description}
            </p>
            <Badge variant="outline" className="text-[0.625rem] px-2 py-0.5">
              {room.category}
            </Badge>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 -mr-2 -mt-1">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>

        {/* Message Preview */}
        {!room.isPrivate && (
          <div className="bg-muted/40 rounded-lg p-2.5 mb-3">
            <p className="text-xs text-muted-foreground line-clamp-1">
              {room.lastMessage}
            </p>
            <span className="text-[0.625rem] text-muted-foreground/70">
              {room.lastMessageTime}
            </span>
          </div>
        )}

        {/* Stats & Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {room.members.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              {room.online}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5" />
              {room.messages.toLocaleString()}
            </span>
          </div>
          
          {isJoined ? (
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs px-3" onClick={onOpen}>
                Open
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                className="h-7 text-xs px-3"
                onClick={onLeave}
              >
                Leave
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              className={`h-7 text-xs px-4 ${room.isPrivate ? 'bg-accent hover:bg-accent/90' : ''}`}
              onClick={onJoin}
            >
              {room.isPrivate ? "Upgrade" : "Join"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
