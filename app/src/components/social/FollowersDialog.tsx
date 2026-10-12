import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserPlus, UserMinus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFollows, FollowUser } from "@/hooks/useFollows";
import { useAuth } from "@/hooks/useAuth";
import {useToast} from '@/hooks/use-toast';

interface FollowersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  initialTab?: "followers" | "following";
  userName?: string;
}

export function FollowersDialog({ 
  open, 
  onOpenChange, 
  userId, 
  initialTab = "followers",
  userName = "User"
}: FollowersDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {toast}=useToast();
  const [busyId,setBusyId]=useState<string|null>(null);
  const { isFollowing, toggleFollow, fetchFollowers, fetchFollowing } = useFollows();
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, userId]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const loadData = async () => {
    setLoading(true);
    const [followersData, followingData] = await Promise.all([
      fetchFollowers(userId),
      fetchFollowing(userId)
    ]);
    setFollowers(followersData);
    setFollowing(followingData);
    setLoading(false);
  };

  const handleToggleFollow = async (targetUserId: string) => {
    if(busyId)return;setBusyId(targetUserId);
    const {error}=await toggleFollow(targetUserId);
    setBusyId(null);
    if(error){toast({title:"Couldn't update following",description:error.message,variant:'destructive'});return;}
    // Refresh data after follow/unfollow
    loadData();
  };

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const renderUserList = (users: FollowUser[]) => {
    if (loading) {
      return (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary/30 border-t-primary" />
        </div>
      );
    }

    if (users.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          No users to show
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {users.map((profile) => (
          <div key={profile.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30">
            <button type="button"
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
              onClick={() => {
                onOpenChange(false);
                navigate(`/profile/${profile.user_id}`);
              }}
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={profile.avatar_url || ""} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {getInitials(profile.full_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-sm">{profile.full_name || "User"}</p>
                {profile.handle&&<p className="text-xs text-muted-foreground">@{profile.handle.replace(/^@/,'')}</p>}
                {profile.bio && (
                  <p className="text-xs text-muted-foreground line-clamp-1">{profile.bio}</p>
                )}
              </div>
            </button>
            {user && user.id !== profile.user_id && (
              <Button
                variant={isFollowing(profile.user_id) ? "outline" : "default"}
                size="sm"
                disabled={busyId===profile.user_id}
                onClick={() => handleToggleFollow(profile.user_id)}
                className="min-w-[90px]"
              >
                {isFollowing(profile.user_id) ? (
                  <>
                    <UserMinus className="h-4 w-4 mr-1" />
                    Following
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-1" />
                    Follow
                  </>
                )}
              </Button>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullScreen className="p-0 border-0 flex flex-col gap-0">
        <DialogHeader className="px-5 py-5 pr-16 border-b border-border shrink-0 text-left">
          <DialogTitle className="text-base">{userName}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "followers" | "following")} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full grid grid-cols-2 rounded-none border-b border-border bg-transparent h-11 shrink-0">
            <TabsTrigger value="followers" className="rounded-none bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Followers ({followers.length})
            </TabsTrigger>
            <TabsTrigger value="following" className="rounded-none bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Following ({following.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="followers" className="flex-1 overflow-y-auto px-4 py-3 mt-0">
            {renderUserList(followers)}
          </TabsContent>

          <TabsContent value="following" className="flex-1 overflow-y-auto px-4 py-3 mt-0">
            {renderUserList(following)}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
