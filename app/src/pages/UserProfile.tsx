import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, UserPlus, MessageCircle, MoreHorizontal, Lock, Verified, Heart, Repeat2, FileText, Camera, Loader2, Share, TrendingUp, TrendingDown, Award, Target, PieChart, ChevronRight, Image as ImageIcon, MapPin, Pin, Bookmark, VolumeX, UserX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFollows } from "@/hooks/useFollows";
import { useToast } from "@/hooks/use-toast";
import { FollowersDialog } from "@/components/social/FollowersDialog";
import { EditProfileDialog } from "@/components/profile/EditProfileDialog";
import { SparklineChart } from "@/components/shared/SparklineChart";
import { HoldingsList } from "@/components/portfolio/HoldingsList";
import { XPostCard } from "@/components/social/XPostCard";
import { HubPostCard } from "@/components/social/HubPostCard";
import { usePosts, Post, Comment, ReactionKind, updateCommentInTree, removeCommentFromTree, countCommentSubtree } from "@/hooks/usePosts";
import { XCommentSheet } from "@/components/social/XCommentSheet";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { atHandle } from "@/lib/handle";
import { EXPERIENCE_LABELS } from "@/lib/tradersHubOnboarding";
import { shareLink } from "@/lib/share";
import { ImageViewer } from "@/components/social/ImageViewer";


interface UserProfileData {
  id: string; user_id: string; full_name: string | null; avatar_url: string | null;
  banner_url: string | null; bio: string | null; portfolio_public: boolean;
  portfolio_hide_amounts?: boolean | null; portfolio_hide_gains?: boolean | null;
  portfolio_top_holdings_only?: boolean | null; portfolio_followers_only?: boolean | null;
  followers_count: number; following_count: number; created_at: string;
  handle?: string | null; trading_experience?: string | null;
}

interface UserPost {
  id: string; content: string; image_url: string | null; created_at: string;
  user_id: string; stock_mentions: string[] | null; likes_count: number;
  comments_count: number; reposts_count: number; is_liked: boolean;
  is_reposted: boolean; is_bookmarked: boolean;
  author?: { id?: string; user_id?: string; full_name: string | null; avatar_url: string | null; bio?: string | null; handle?: string | null };
}

interface PortfolioHolding {
  symbol: string; name: string; shares: number; avg_cost: number; sector: string | null;
}

export default function UserProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { isFollowing, toggleFollow, fetchFollowers, fetchFollowing } = useFollows();
  const { bookmarkPost, reactToPost, reactToComment, fetchComments, addComment, editComment, deleteComment, deletePost, reportPost, hidePost } = usePosts();
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [profileData, setProfileData] = useState<UserProfileData | null>(null);
  const [userPosts, setUserPosts] = useState<UserPost[]>([]);
  const [likedPosts, setLikedPosts] = useState<UserPost[]>([]);
  const [repostedPosts, setRepostedPosts] = useState<UserPost[]>([]);
  const [bookmarkedPosts, setBookmarkedPosts] = useState<UserPost[]>([]);
  const [publicPortfolio, setPublicPortfolio] = useState<PortfolioHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followersDialogOpen, setFollowersDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState<"followers" | "following">("followers");
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [commentSheetOpen, setCommentSheetOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);
  const [followsMe, setFollowsMe] = useState(false);

  const isOwnProfile = user?.id === userId;
  const userIsFollowing = userId ? isFollowing(userId) : false;
  const performanceStats = { winRate: 73, avgReturn: 12.4, streak: 5 };

  useEffect(() => {
    if (userId) {
      fetchProfile(); fetchUserPosts(); fetchUserLikes(); fetchUserReposts();
      loadFollowCounts(); fetchPublicPortfolio();
      if (user?.id === userId) fetchBookmarks();
    }
  }, [userId, user]);

  // Does the profile being viewed already follow the current user? If so, the
  // follow button should read "Follow back" instead of a plain "Follow", the
  // way X does.
  useEffect(() => {
    const checkFollowsMe = async () => {
      if (!user || !userId || user.id === userId) { setFollowsMe(false); return; }
      const { data } = await supabase
        .from("user_follows")
        .select("id")
        .eq("follower_id", userId)
        .eq("following_id", user.id)
        .maybeSingle();
      setFollowsMe(!!data);
    };
    checkFollowsMe();
  }, [user, userId]);

  const fetchBookmarks = async () => {
    if (!user) return;
    const { data: bd } = await supabase.from("post_bookmarks").select("post_id").eq("user_id", user.id).order("created_at", { ascending: false });
    if (!bd || bd.length === 0) { setBookmarkedPosts([]); return; }
    const pids = bd.map(b => b.post_id);
    const { data: pd } = await supabase.from("posts").select("*").in("id", pids);
    if (!pd) return;
    const uids = [...new Set(pd.map(p => p.user_id))];
    const { data: profs } = await supabase.from("profiles_public").select("user_id, full_name, avatar_url, handle").in("user_id", uids);
    const pm = new Map(profs?.map(p => [p.user_id, p]));
    const enriched = await Promise.all(pd.map(async (post) => {
      const [l, c, r] = await Promise.all([
        supabase.from("post_likes").select("id", { count: "exact", head: true }).eq("post_id", post.id),
        supabase.from("post_comments").select("id", { count: "exact", head: true }).eq("post_id", post.id),
        supabase.from("post_reposts").select("id", { count: "exact", head: true }).eq("post_id", post.id),
      ]);
      const a = pm.get(post.user_id);
      return { ...post, likes_count: l.count || 0, comments_count: c.count || 0, reposts_count: r.count || 0, is_liked: false, is_reposted: false, is_bookmarked: true, author: a ? { full_name: a.full_name, avatar_url: a.avatar_url, handle: a.handle, user_id: post.user_id } : undefined };
    }));
    setBookmarkedPosts(enriched);
  };

  const fetchProfile = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // profiles_public only ever contains rows for people who have actually
      // completed TradersHub onboarding (see 20260824090000) — there is
      // deliberately no fallback to the raw `profiles` table here. Falling
      // back would resurrect a "ghost" TradersHub presence (real name,
      // photo, and a default-public portfolio) for someone who never chose
      // to create one; a null result correctly renders the "not found"
      // state below instead.
      const { data } = await supabase.from("profiles_public").select("id, user_id, full_name, avatar_url, banner_url, bio, portfolio_public, portfolio_hide_amounts, portfolio_hide_gains, portfolio_top_holdings_only, portfolio_followers_only, followers_count, following_count, created_at, handle, trading_experience").eq("user_id", userId).maybeSingle();
      if (data) setProfileData(data as UserProfileData);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const loadFollowCounts = async () => {
    if (!userId) return;
    const [f1, f2] = await Promise.all([fetchFollowers(userId), fetchFollowing(userId)]);
    setFollowersCount(f1.length); setFollowingCount(f2.length);
  };

  const fetchPublicPortfolio = async () => {
    if (!userId) return;
    const { data } = await supabase.from("portfolios").select("symbol, name, shares, avg_cost, sector").eq("user_id", userId).limit(10);
    if (data) setPublicPortfolio(data);
  };

  const fetchUserPosts = async () => {
    const { data: postsData } = await supabase.from("posts").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (postsData) {
      const withCounts = await Promise.all(postsData.map(async (post) => {
        const [l, c, r, il, ir, ib] = await Promise.all([
          supabase.from("post_likes").select("id", { count: "exact", head: true }).eq("post_id", post.id),
          supabase.from("post_comments").select("id", { count: "exact", head: true }).eq("post_id", post.id),
          supabase.from("post_reposts").select("id", { count: "exact", head: true }).eq("post_id", post.id),
          user ? supabase.from("post_likes").select("id").eq("post_id", post.id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
          user ? supabase.from("post_reposts").select("id").eq("post_id", post.id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
          user ? supabase.from("post_bookmarks").select("id").eq("post_id", post.id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        return { ...post, likes_count: l.count || 0, comments_count: c.count || 0, reposts_count: r.count || 0, is_liked: !!il.data, is_reposted: !!ir.data, is_bookmarked: !!ib.data };
      }));
      setUserPosts(withCounts);
    }
  };

  const fetchUserLikes = async () => {
    if (!userId) return;
    const { data: ld } = await supabase.from("post_likes").select("post_id").eq("user_id", userId).order("created_at", { ascending: false });
    if (ld && ld.length > 0) {
      const pids = ld.map(l => l.post_id);
      const { data: pd } = await supabase.from("posts").select("*").in("id", pids);
      if (pd) {
        const uids = [...new Set(pd.map(p => p.user_id))];
        const { data: profs } = await supabase.from("profiles_public").select("user_id, full_name, avatar_url, handle").in("user_id", uids);
        const pm = new Map(profs?.map(p => [p.user_id, p]));
        const withDetails = await Promise.all(pd.map(async (post) => {
          const [l, c, r] = await Promise.all([
            supabase.from("post_likes").select("id", { count: "exact", head: true }).eq("post_id", post.id),
            supabase.from("post_comments").select("id", { count: "exact", head: true }).eq("post_id", post.id),
            supabase.from("post_reposts").select("id", { count: "exact", head: true }).eq("post_id", post.id),
          ]);
          const a = pm.get(post.user_id);
          return { ...post, likes_count: l.count || 0, comments_count: c.count || 0, reposts_count: r.count || 0, is_liked: true, is_reposted: false, is_bookmarked: false, author: a ? { full_name: a.full_name, avatar_url: a.avatar_url, handle: a.handle, user_id: post.user_id } : undefined };
        }));
        setLikedPosts(withDetails);
      }
    }
  };

  const fetchUserReposts = async () => {
    if (!userId) return;
    const { data: rd } = await supabase.from("post_reposts").select("post_id").eq("user_id", userId).order("created_at", { ascending: false });
    if (rd && rd.length > 0) {
      const pids = rd.map(r => r.post_id);
      const { data: pd } = await supabase.from("posts").select("*").in("id", pids);
      if (pd) {
        const uids = [...new Set(pd.map(p => p.user_id))];
        const { data: profs } = await supabase.from("profiles_public").select("user_id, full_name, avatar_url, handle").in("user_id", uids);
        const pm = new Map(profs?.map(p => [p.user_id, p]));
        const withDetails = await Promise.all(pd.map(async (post) => {
          const [l, c, r] = await Promise.all([
            supabase.from("post_likes").select("id", { count: "exact", head: true }).eq("post_id", post.id),
            supabase.from("post_comments").select("id", { count: "exact", head: true }).eq("post_id", post.id),
            supabase.from("post_reposts").select("id", { count: "exact", head: true }).eq("post_id", post.id),
          ]);
          const a = pm.get(post.user_id);
          return { ...post, likes_count: l.count || 0, comments_count: c.count || 0, reposts_count: r.count || 0, is_liked: false, is_reposted: true, is_bookmarked: false, author: a ? { full_name: a.full_name, avatar_url: a.avatar_url, handle: a.handle, user_id: post.user_id } : undefined };
        }));
        setRepostedPosts(withDetails);
      }
    }
  };

  const handleFollow = async () => {
    if (!user) { navigate("/auth"); return; }
    if (!userId) return;
    const { error } = await toggleFollow(userId);
    if (!error) { toast({ title: userIsFollowing ? "Unfollowed" : "Following!" }); loadFollowCounts(); }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) { toast({ title: "Invalid file", variant: "destructive" }); return; }
    if (file.size > 5 * 1024 * 1024) { toast({ title: "Max 5MB", variant: "destructive" }); return; }
    setUploadingBanner(true);
    try {
      const ext = file.name.split(".").pop();
      const fn = `${user.id}/banner-${Date.now()}.${ext}`;
      const { error: ue } = await supabase.storage.from("banners").upload(fn, file, { upsert: true });
      if (ue) throw ue;
      const { data: { publicUrl } } = supabase.storage.from("banners").getPublicUrl(fn);
      await supabase.from("profiles").update({ banner_url: publicUrl }).eq("user_id", user.id);
      setProfileData(prev => prev ? { ...prev, banner_url: publicUrl } : null);
      toast({ title: "Banner updated!" });
    } catch { toast({ title: "Upload failed", variant: "destructive" }); }
    finally { setUploadingBanner(false); }
  };

  const handleShare = async () => {
    const result = await shareLink(window.location.href, { title: `${profileData?.full_name}'s Profile` });
    if (result.method === "clipboard") toast({ title: "Profile link copied!" });
    else if (result.method === "failed") toast({ title: "Couldn't share this profile", variant: "destructive" });
  };

  const handleMuteUser = async () => {
    if (!user || !profileData) return navigate("/auth");
    await supabase.from("muted_users").insert({ muter_id: user.id, muted_id: profileData.user_id });
    toast({ title: `Muted ${atHandle(profileData)}` });
  };
  const handleBlockUser = async () => {
    if (!user || !profileData) return navigate("/auth");
    await supabase.from("blocked_users").insert({ blocker_id: user.id, blocked_id: profileData.user_id });
    toast({ title: "User blocked", description: "You won't see their posts anymore." });
  };

  const handleReact = async (postId: string, reaction: ReactionKind) => { if (!user) { navigate("/auth"); return; } await reactToPost(postId, reaction); };
  const handleBookmark = async (postId: string) => {
    if (!user) { navigate("/auth"); return; }
    const current = [...userPosts, ...bookmarkedPosts, ...likedPosts, ...repostedPosts].find(p => p.id === postId);
    const wasBookmarked = !!current?.is_bookmarked;
    const { error } = await bookmarkPost(postId, wasBookmarked);
    if (error) return;
    const patch = (list: UserPost[]) => list.map(p => p.id === postId ? { ...p, is_bookmarked: !wasBookmarked } : p);
    setUserPosts(patch);
    setLikedPosts(patch);
    setRepostedPosts(patch);
    // Un-bookmarking removes it from this tab's list entirely instead of just flipping a flag on a post that's no longer bookmarked
    setBookmarkedPosts(prev => wasBookmarked ? prev.filter(p => p.id !== postId) : patch(prev));
    toast({ title: wasBookmarked ? "Removed from bookmarks" : "Saved to bookmarks" });
  };
  const handlePostShare = async (post: Post) => {
    const url = `${window.location.origin}/traders-hub/post/${post.id}`;
    const result = await shareLink(url, { title: "AfriFinance TradersHub", text: post.content.slice(0, 120) });
    if (result.method === "clipboard") toast({ title: "Link copied" });
    else if (result.method === "failed") toast({ title: "Couldn't share this post", variant: "destructive" });
  };
  const handleDelete = async (postId: string) => { await deletePost(postId); fetchUserPosts(); };
  const handleReport = async (postId: string) => { await reportPost(postId); };
  const handleHide = async (postId: string) => {
    await hidePost(postId);
    const drop = (list: UserPost[]) => list.filter(p => p.id !== postId);
    setUserPosts(drop); setLikedPosts(drop); setRepostedPosts(drop); setBookmarkedPosts(drop);
  };

  const openComments = async (post: Post) => {
    setSelectedPost(post); setCommentSheetOpen(true); setLoadingComments(true);
    const fetched = await fetchComments(post.id);
    setComments(fetched); setLoadingComments(false);
  };

  const handleAddComment = async (content: string) => {
    if (!selectedPost || !user) return;
    const { error } = await addComment(selectedPost.id, content);
    if (!error) { const updated = await fetchComments(selectedPost.id); setComments(updated); }
  };

  const handleEditComment = async (commentId: string, content: string) => {
    const { error, editedAt } = await editComment(commentId, content);
    if (!error) {
      setComments(prev => updateCommentInTree(prev, commentId, c => ({ ...c, content, edited_at: editedAt })));
    }
    return { error };
  };

  const handleDeleteComment = async (comment: Comment) => {
    if (!selectedPost) return;
    const removedCount = countCommentSubtree(comment);
    const { error } = await deleteComment(comment.id, selectedPost.id, removedCount);
    if (!error) {
      setComments(prev => removeCommentFromTree(prev, comment.id).tree);
      setSelectedPost(p => p ? { ...p, comments_count: Math.max(0, (p.comments_count || 0) - removedCount) } : p);
    }
  };

  const getInitials = (name: string | null) => name ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "U";
  const formatDate = (date: string) => new Date(date).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const { quotes: publicPortfolioQuotes } = useLiveQuotes(publicPortfolio.map(h => h.symbol));
  const portfolioSummary = useMemo(() => {
    if (!publicPortfolio.length) return null;
    // Same price source & maths as the Portfolio page, so both always agree
    // — including HoldingsList just below, which reads the same live quotes.
    // A holding with no live quote yet is excluded from the total rather
    // than priced from a fabricated fallback.
    const holdings = publicPortfolio
      .map(h => {
        const cp = publicPortfolioQuotes[h.symbol.toUpperCase()]?.lastPrice;
        if (cp == null) return null;
        const gain = ((cp - h.avg_cost) / h.avg_cost) * 100;
        return { ...h, currentPrice: cp, gain };
      })
      .filter((h): h is NonNullable<typeof h> => h !== null);
    const totalValue = holdings.reduce((s, h) => s + h.currentPrice * h.shares, 0);
    const totalCost = holdings.reduce((s, h) => s + h.avg_cost * h.shares, 0);
    return { totalValue, totalGain: totalValue - totalCost, gainPercent: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0, holdings };
  }, [publicPortfolio, publicPortfolioQuotes]);

  // Privacy toggles (Settings → Sharing & privacy) only ever restrict what OTHER
  // people see — the owner always sees their own full portfolio here, same as
  // the Portfolio page. "Followers only" gates the whole tab; the other three
  // control what's shown once past that gate.
  const canViewPortfolio = !!profileData?.portfolio_public && (
    isOwnProfile || !profileData?.portfolio_followers_only || userIsFollowing
  );
  const maskAmounts = !isOwnProfile && !!profileData?.portfolio_hide_amounts;
  const maskGains = !isOwnProfile && !!profileData?.portfolio_hide_gains;
  const visibleHoldings = useMemo(() => {
    const holdings = portfolioSummary?.holdings || [];
    if (isOwnProfile || !profileData?.portfolio_top_holdings_only) return holdings;
    return [...holdings]
      .sort((a, b) => (b.currentPrice * b.shares) - (a.currentPrice * a.shares))
      .slice(0, 5);
  }, [portfolioSummary, isOwnProfile, profileData?.portfolio_top_holdings_only]);


  const castToPost = (p: UserPost): Post => ({
    ...p, updated_at: p.created_at,
    reaction_counts: {}, my_reaction: null,
    author: p.author
      ? { id: p.author.id || "", user_id: p.author.user_id || p.user_id, full_name: p.author.full_name, avatar_url: p.author.avatar_url, bio: p.author.bio || null, handle: p.author.handle ?? null }
      : { id: "", user_id: p.user_id, full_name: profileData?.full_name || null, avatar_url: profileData?.avatar_url || null, bio: null, handle: profileData?.handle ?? null },
  });

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary/30 border-t-primary" /></div>;
  }

  if (!profileData) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
          <div className="flex items-center gap-3 px-4 py-3">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
            <h1 className="font-bold">User Not Found</h1>
          </div>
        </header>
        <div className="p-8 text-center text-muted-foreground">
          <p>This profile doesn't exist, or this person hasn't set up TradersHub yet.</p>
          <Button variant="outline" className="mt-4 rounded-full" onClick={() => navigate("/traders-hub")}>Back to TradersHub</Button>
        </div>
      </div>
    );
  }

  // Find first post to "pin" (most liked)
  const pinnedPost = userPosts.length > 0 ? [...userPosts].sort((a, b) => b.likes_count - a.likes_count)[0] : null;
  const regularPosts = userPosts.filter(p => p.id !== pinnedPost?.id);

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Banner — also carries the back/more controls as an overlay, so
          there's no separate header bar above it (matches X / moomoo profile layout) */}
      <div className="relative h-32 sm:h-40 bg-gradient-to-br from-primary/30 via-accent/20 to-primary/10 overflow-hidden">
        {profileData.banner_url && <img src={profileData.banner_url} alt="Banner" className="w-full h-full object-cover" />}

        {/* Top controls overlay */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
          <Button variant="secondary" size="icon" className="h-9 w-9 rounded-full bg-background/40 hover:bg-background/60 backdrop-blur-sm text-foreground" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" className="h-9 w-9 rounded-full bg-background/40 hover:bg-background/60 backdrop-blur-sm text-foreground"><MoreHorizontal className="h-5 w-5" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleShare}><Share className="h-4 w-4 mr-2" />Share Profile</DropdownMenuItem>
                {!isOwnProfile && (
                  <>
                    <DropdownMenuItem onClick={handleMuteUser}><VolumeX className="h-4 w-4 mr-2" />Mute {atHandle(profileData)}</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={handleBlockUser}><UserX className="h-4 w-4 mr-2" />Block {atHandle(profileData)}</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {isOwnProfile && (
          <>
            <input type="file" ref={bannerInputRef} className="hidden" accept="image/*" onChange={handleBannerUpload} />
            <Button size="icon" variant="secondary" className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-background/70 hover:bg-background/90 backdrop-blur-sm" onClick={() => bannerInputRef.current?.click()} disabled={uploadingBanner}>
              {uploadingBanner ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </Button>
          </>
        )}
      </div>

      {/* Avatar + actions */}
      <div className="px-4 -mt-12">
        <div className="flex justify-between items-end">
          <Avatar
            className="h-24 w-24 sm:h-28 sm:w-28 ring-4 ring-background shadow-md cursor-pointer"
            onClick={() => profileData.avatar_url && setAvatarViewerOpen(true)}
          >
            <AvatarImage src={profileData.avatar_url || ""} className="object-cover" />
            <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">{getInitials(profileData.full_name)}</AvatarFallback>
          </Avatar>
          <div className="flex gap-1.5 mb-1.5">
            {isOwnProfile ? (
              <Button variant="outline" size="sm" className="h-9 rounded-full font-semibold text-[13.5px] px-4" onClick={() => setEditProfileOpen(true)}>Edit profile</Button>
            ) : (
              <Button variant={userIsFollowing ? "outline" : "default"} size="sm" onClick={handleFollow} className="h-9 rounded-full font-semibold text-[13.5px] px-4">
                {userIsFollowing ? "Following" : followsMe ? "Follow back" : "Follow"}
              </Button>
            )}
          </div>
        </div>

        {/* Name + bio */}
        <div className="mt-2.5">
          <h2 className="text-[19px] font-extrabold leading-tight flex items-center gap-1">
            {profileData.full_name || "User"}
            <Verified className="h-4 w-4 text-primary fill-primary" />
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13.5px] text-muted-foreground leading-tight">{atHandle(profileData)}</p>
            {profileData.trading_experience && (
              <span className="text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {EXPERIENCE_LABELS[profileData.trading_experience] || profileData.trading_experience}
              </span>
            )}
          </div>

          {profileData.bio && <p className="mt-2 text-[14px] leading-snug">{profileData.bio}</p>}

          {/* Location + join date — X-sized */}
          <div className="flex items-center gap-3 mt-2 text-[13px] text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />Kenya</span>
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Joined {formatDate(profileData.created_at)}</span>
          </div>

          {/* Following/Followers */}
          <div className="flex gap-4 mt-2">
            <button className="hover:underline text-[13px]" onClick={() => { setDialogTab("following"); setFollowersDialogOpen(true); }}>
              <span className="font-bold">{followingCount}</span> <span className="text-muted-foreground">Following</span>
            </button>
            <button className="hover:underline text-[13px]" onClick={() => { setDialogTab("followers"); setFollowersDialogOpen(true); }}>
              <span className="font-bold">{followersCount}</span> <span className="text-muted-foreground">Followers</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="posts" className="mt-4">
        <TabsList className="w-full flex bg-transparent border-b border-border rounded-none h-11 p-0 gap-1 overflow-x-auto">
          {[
            { value: "posts", label: "Posts" },
            ...(isOwnProfile ? [{ value: "bookmarks", label: "Bookmarks" }] : []),
            { value: "portfolio", label: "Portfolio" },
          ].map(tab => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="flex-1 min-w-[80px] my-1.5 rounded-full data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-none text-xs sm:text-sm font-semibold text-muted-foreground"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Posts tab with pinned post */}
        <TabsContent value="posts" className="mt-0">
          {userPosts.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground"><FileText className="h-10 w-10 mx-auto mb-3 opacity-40" /><p className="text-sm">No posts yet</p></div>
          ) : (
            <div className="divide-y divide-border">
              {/* Pinned Post */}
              {pinnedPost && (
                <div>
                  <div className="flex items-center gap-1.5 px-4 pt-2 text-xs text-muted-foreground">
                    <Pin className="h-3 w-3" />
                    <span className="font-medium">Pinned</span>
                  </div>
                  <HubPostCard
                    post={castToPost(pinnedPost)}
                    currentUserId={user?.id}
                    isFollowing={userIsFollowing}
                    onFollow={() => handleFollow()}
                    onOpen={p => navigate(`/traders-hub/post/${p.id}`)}
                    onComment={p => navigate(`/traders-hub/post/${p.id}`)}
                    onBookmark={handleBookmark}
                    onShare={handlePostShare}
                    onDelete={isOwnProfile ? handleDelete : undefined}
                    onReact={handleReact}
                    onReport={handleReport}
                    onHide={handleHide}
                  />
                </div>
              )}
              {regularPosts.map(post => (
                <HubPostCard
                  key={post.id}
                  post={castToPost(post)}
                  currentUserId={user?.id}
                  isFollowing={userIsFollowing}
                  onFollow={() => handleFollow()}
                  onOpen={p => navigate(`/traders-hub/post/${p.id}`)}
                  onComment={p => navigate(`/traders-hub/post/${p.id}`)}
                  onBookmark={handleBookmark}
                  onShare={handlePostShare}
                  onDelete={isOwnProfile ? handleDelete : undefined}
                  onReact={handleReact}
                  onReport={handleReport}
                  onHide={handleHide}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Replies tab */}
        <TabsContent value="replies" className="mt-0">
          {repostedPosts.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground"><MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-40" /><p className="text-sm">No replies yet</p></div>
          ) : (
            <div className="divide-y divide-border">
              {repostedPosts.map(post => <XPostCard key={post.id} post={castToPost(post)} currentUserId={user?.id} onComment={openComments} onBookmark={handleBookmark} onShare={handlePostShare} onReact={handleReact} />)}
            </div>
          )}
        </TabsContent>

        {/* Media tab */}
        <TabsContent value="media" className="mt-0">
          {(() => {
            const mediaPosts = userPosts.filter(p => p.image_url);
            return mediaPosts.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground"><ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-40" /><p className="text-sm">No media yet</p></div>
            ) : (
              <div className="grid grid-cols-3 gap-0.5">
                {mediaPosts.map(post => (
                  <div key={post.id} className="aspect-square overflow-hidden cursor-pointer" onClick={() => openComments(castToPost(post))}>
                    <img src={post.image_url!} alt="" className="w-full h-full object-cover hover:opacity-80 transition-opacity" />
                  </div>
                ))}
              </div>
            );
          })()}
        </TabsContent>

        {/* Likes tab — private to owner */}
        <TabsContent value="likes" className="mt-0">
          {!isOwnProfile ? (
            <div className="p-12 text-center text-muted-foreground">
              <Lock className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">Likes are private</p>
              <p className="text-xs text-muted-foreground mt-1">Only visible to the account owner</p>
            </div>
          ) : likedPosts.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground"><Heart className="h-10 w-10 mx-auto mb-3 opacity-40" /><p className="text-sm">No likes yet</p></div>
          ) : (
            <div className="divide-y divide-border">
              {likedPosts.map(post => <XPostCard key={post.id} post={castToPost(post)} currentUserId={user?.id} onComment={openComments} onBookmark={handleBookmark} onShare={handlePostShare} onReact={handleReact} />)}
            </div>
          )}
        </TabsContent>

        {/* Bookmarks tab — owner only */}
        <TabsContent value="bookmarks" className="mt-0">
          {!isOwnProfile ? (
            <div className="p-12 text-center text-muted-foreground">
              <Lock className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">Bookmarks are private</p>
            </div>
          ) : bookmarkedPosts.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground"><Bookmark className="h-10 w-10 mx-auto mb-3 opacity-40" /><p className="text-sm">No bookmarks yet</p><p className="text-xs mt-1">Save posts to read them later</p></div>
          ) : (
            <div className="divide-y divide-border">
              {bookmarkedPosts.map(post => (
                <HubPostCard
                  key={post.id}
                  post={castToPost(post)}
                  currentUserId={user?.id}
                  onOpen={p => navigate(`/traders-hub/post/${p.id}`)}
                  onComment={p => navigate(`/traders-hub/post/${p.id}`)}
                  onBookmark={handleBookmark}
                  onShare={handlePostShare}
                  onReact={handleReact}
                  onReport={handleReport}
                  onHide={handleHide}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Portfolio tab */}
        <TabsContent value="portfolio" className="mt-0">
          {isOwnProfile && (
            <div className="flex items-center justify-between px-4 pt-3">
              <div className="text-xs text-muted-foreground">
                {!profileData.portfolio_public
                  ? "Only visible to you"
                  : profileData.portfolio_followers_only
                    ? "Visible to your followers"
                    : "Visible to everyone"}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-full text-xs gap-1.5"
                onClick={() => navigate("/settings", { state: { section: "th-privacy" } })}
              >
                Manage in Settings<ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          {!profileData.portfolio_public && !isOwnProfile ? (
            <div className="p-12 text-center">
              <Lock className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
              <p className="font-semibold mb-1">Portfolio is private</p>
              <p className="text-sm text-muted-foreground">This user has chosen to keep their portfolio private</p>
            </div>
          ) : !canViewPortfolio ? (
            <div className="p-12 text-center">
              <Lock className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
              <p className="font-semibold mb-1">Portfolio is for followers only</p>
              <p className="text-sm text-muted-foreground">Follow this user to see their portfolio</p>
            </div>
          ) : publicPortfolio.length === 0 ? (
            <div className="p-12 text-center">
              <PieChart className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
              <p className="font-semibold mb-1">No portfolio data</p>
              <p className="text-sm text-muted-foreground">{isOwnProfile ? "Add trades to display your portfolio here" : "This user hasn't added any trades yet"}</p>
              {isOwnProfile && <Button className="mt-4 rounded-full" onClick={() => navigate("/track-investments")}>Add Trade</Button>}
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Portfolio summary — flat on canvas */}
              {portfolioSummary && (
                <div>
                  <p className="section-eyebrow">Portfolio value</p>
                  <div className="mt-1 text-[28px] leading-none font-semibold tabular">
                    {maskAmounts ? "••••••" : `KES ${portfolioSummary.totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                  </div>
                  {!maskGains && (
                    <div className={`text-[12px] font-semibold mt-1.5 flex items-center gap-1 tabular ${portfolioSummary.totalGain >= 0 ? "text-bull" : "text-bear"}`}>
                      {portfolioSummary.totalGain >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {maskAmounts
                        ? `${portfolioSummary.totalGain >= 0 ? "+" : "−"}${Math.abs(portfolioSummary.gainPercent).toFixed(2)}%`
                        : `${portfolioSummary.totalGain >= 0 ? "+" : "−"}KES ${Math.abs(portfolioSummary.totalGain).toLocaleString('en-US', { maximumFractionDigits: 0 })} (${portfolioSummary.gainPercent.toFixed(2)}%)`}
                    </div>
                  )}
                </div>
              )}

              {/* Holdings — same institutional layout as the Portfolio page */}
              <HoldingsList
                holdings={visibleHoldings.map(h => ({
                  symbol: h.symbol,
                  name: (h as any).name || h.symbol,
                  shares: h.shares,
                  avg_cost: h.avg_cost,
                  sector: (h as any).sector ?? null,
                }))}
                showValues={!maskAmounts}
                showGains={!maskGains}
              />
              {!isOwnProfile && profileData?.portfolio_top_holdings_only && (portfolioSummary?.holdings?.length || 0) > visibleHoldings.length && (
                <p className="text-[11px] text-muted-foreground text-center">Showing top {visibleHoldings.length} holdings only</p>
              )}

              {/* Share portfolio button */}
              {isOwnProfile && (
                <Button className="w-full rounded-full h-11 font-bold btn-primary" onClick={() => toast({ title: "Portfolio shared to compose!" })}>
                  <Share className="h-4 w-4 mr-2" />Share Portfolio
                </Button>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Comment sheet */}
      <XCommentSheet open={commentSheetOpen} onOpenChange={setCommentSheetOpen} post={selectedPost} currentUserId={user?.id} comments={comments} loadingComments={loadingComments} onAddComment={handleAddComment} onBookmark={handleBookmark} onShare={handlePostShare} onDelete={isOwnProfile ? handleDelete : undefined} onReact={handleReact} onReactComment={reactToComment} onEditComment={handleEditComment} onDeleteComment={handleDeleteComment} />
      {userId && <FollowersDialog open={followersDialogOpen} onOpenChange={setFollowersDialogOpen} userId={userId} initialTab={dialogTab} />}
      <EditProfileDialog open={editProfileOpen} onOpenChange={(open) => { setEditProfileOpen(open); if (!open) fetchProfile(); }} />
      {profileData.avatar_url && (
        <ImageViewer open={avatarViewerOpen} onOpenChange={setAvatarViewerOpen} images={[profileData.avatar_url]} />
      )}
    </div>
  );
}