import { useState, useEffect, useRef } from "react";
import {
  Play, Pause, Volume2, VolumeX, Maximize2, Minimize2,
  X, Users, MessageCircle, Heart, Share2, Settings,
  Radio, PictureInPicture2, Captions, ThumbsUp, Flame,
  Send, Zap, ChevronUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface LiveConference {
  title: string;
  source: string;
  viewers: number;
  isLive: boolean;
}

interface LiveConferencePlayerProps {
  conference: LiveConference;
  open: boolean;
  onClose: () => void;
}

const initialComments = [
  { id: 1, user: "James M.", message: "Great insights on the monetary policy!", time: "2m ago" },
  { id: 2, user: "Sarah K.", message: "What about inflation rates?", time: "1m ago" },
  { id: 3, user: "Alex N.", message: "Looking forward to the Q&A 🔥", time: "30s ago" },
  { id: 4, user: "Mary W.", message: "Very informative session", time: "15s ago" },
];

const QUALITY_OPTIONS = ["Auto", "1080p", "720p", "480p", "240p"] as const;
const SPEED_OPTIONS = [0.5, 1, 1.25, 1.5, 2];

const REACTIONS = [
  { icon: Heart, label: "love", color: "text-rose-500" },
  { icon: ThumbsUp, label: "like", color: "text-blue-500" },
  { icon: Flame, label: "fire", color: "text-orange-500" },
  { icon: Zap, label: "zap", color: "text-yellow-500" },
];

interface FloatingReaction { id: number; Icon: typeof Heart; color: string; left: number; }

export function LiveConferencePlayer({ conference, open, onClose }: LiveConferencePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [volume, setVolume] = useState([75]);
  const [liked, setLiked] = useState(false);
  const [quality, setQuality] = useState<typeof QUALITY_OPTIONS[number]>("Auto");
  const [speed, setSpeed] = useState(1);
  const [captions, setCaptions] = useState(false);
  const [pip, setPip] = useState(false);
  const [comments, setComments] = useState(initialComments);
  const [chatInput, setChatInput] = useState("");
  const [floats, setFloats] = useState<FloatingReaction[]>([]);
  const [viewers, setViewers] = useState(conference.viewers);
  const [showTranscript, setShowTranscript] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Simulated viewer count fluctuation
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setViewers(v => Math.max(100, v + Math.floor(Math.random() * 11) - 5)), 3000);
    return () => clearInterval(t);
  }, [open]);

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    setComments(prev => [...prev, { id: Date.now(), user: "You", message: chatInput.trim(), time: "now" }]);
    setChatInput("");
  };

  const triggerReaction = (Icon: typeof Heart, color: string) => {
    const id = Date.now() + Math.random();
    const left = 20 + Math.random() * 60;
    setFloats(f => [...f, { id, Icon, color, left }]);
    setTimeout(() => setFloats(f => f.filter(x => x.id !== id)), 2200);
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl w-full p-0 gap-0 bg-black overflow-hidden max-h-[92vh] border-0">
        <div ref={containerRef} className="flex flex-col">
          {/* Player */}
          <div className="relative bg-black aspect-video w-full overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-black to-accent/15 flex items-center justify-center">
              <div className="text-center">
                <Radio className="h-14 w-14 text-primary mx-auto mb-3 animate-pulse" />
                <h3 className="text-white font-semibold text-base px-4">{conference.title}</h3>
                <p className="text-white/60 text-xs mt-1">{conference.source}</p>
              </div>
            </div>

            {/* Captions */}
            {captions && (
              <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-black/70 text-white text-sm px-3 py-1.5 rounded">
                ...the committee voted to maintain the policy rate at current levels.
              </div>
            )}

            {/* Floating reactions */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {floats.map(f => (
                <div key={f.id} className="absolute bottom-20 animate-[reaction-float_2.2s_ease-out_forwards]"
                     style={{ left: `${f.left}%` }}>
                  <f.Icon className={`h-7 w-7 ${f.color} fill-current drop-shadow-lg`} />
                </div>
              ))}
            </div>

            {/* Top badges */}
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <Badge className="bg-red-500 text-white text-[0.6875rem] font-bold px-2.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-white rounded-full mr-1.5 animate-pulse inline-block" />
                LIVE
              </Badge>
              <Badge variant="secondary" className="bg-black/60 text-white text-[0.6875rem] backdrop-blur-sm border-0">
                <Users className="h-3 w-3 mr-1" />
                {viewers.toLocaleString()}
              </Badge>
              <Badge variant="secondary" className="bg-black/60 text-white text-[0.625rem] backdrop-blur-sm border-0 hidden sm:flex">
                {quality} · {speed}×
              </Badge>
            </div>

            <Button variant="ghost" size="icon" className="absolute top-3 right-3 h-8 w-8 text-white hover:bg-white/20 rounded-full" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>

            {/* Reaction quick-bar (right side) */}
            <div className="absolute right-3 bottom-24 flex flex-col gap-2">
              {REACTIONS.map(r => (
                <Button key={r.label} variant="ghost" size="icon"
                        className="h-9 w-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm"
                        onClick={() => triggerReaction(r.icon, r.color)}>
                  <r.icon className={`h-4 w-4 ${r.color}`} />
                </Button>
              ))}
            </div>

            {/* Controls */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3">
              <div className="w-full h-1 bg-white/20 rounded-full mb-3 overflow-hidden">
                <div className="h-full bg-red-500 rounded-full w-full animate-pulse" />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20 rounded-full" onClick={() => setIsPlaying(!isPlaying)}>
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>

                  <div className="flex items-center gap-1.5 group">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20 rounded-full" onClick={() => setIsMuted(!isMuted)}>
                      {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                    <Slider value={isMuted ? [0] : volume} onValueChange={setVolume} max={100} step={1} className="w-16 hidden sm:flex" />
                  </div>

                  <span className="text-white text-[0.6875rem] font-medium flex items-center gap-1 ml-1">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                    LIVE
                  </span>
                </div>

                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" className={`h-8 w-8 text-white hover:bg-white/20 rounded-full ${captions ? 'bg-white/25' : ''}`} onClick={() => setCaptions(!captions)} title="Captions">
                    <Captions className="h-4 w-4" />
                  </Button>

                  <Button variant="ghost" size="icon" className={`h-8 w-8 text-white hover:bg-white/20 rounded-full ${pip ? 'bg-white/25' : ''}`} onClick={() => setPip(!pip)} title="Picture in picture">
                    <PictureInPicture2 className="h-4 w-4" />
                  </Button>

                  <Button variant="ghost" size="icon" className={`h-8 w-8 text-white hover:bg-white/20 rounded-full ${showChat ? 'bg-white/25' : ''}`} onClick={() => setShowChat(!showChat)} title="Chat">
                    <MessageCircle className="h-4 w-4" />
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20 rounded-full" title="Settings">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuLabel className="text-[0.6875rem]">Quality</DropdownMenuLabel>
                      {QUALITY_OPTIONS.map(q => (
                        <DropdownMenuItem key={q} onClick={() => setQuality(q)} className="text-xs">
                          {quality === q ? "✓ " : "  "}{q}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-[0.6875rem]">Speed</DropdownMenuLabel>
                      {SPEED_OPTIONS.map(s => (
                        <DropdownMenuItem key={s} onClick={() => setSpeed(s)} className="text-xs">
                          {speed === s ? "✓ " : "  "}{s}×
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20 rounded-full" onClick={toggleFullscreen}>
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Section */}
          <div className="bg-background flex flex-col md:flex-row">
            <div className="flex-1 p-4 border-b md:border-b-0 md:border-r border-border">
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-base mb-0.5 line-clamp-2">{conference.title}</h2>
                  <p className="text-xs text-muted-foreground">{conference.source} · {viewers.toLocaleString()} watching now</p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button variant={liked ? "default" : "outline"} size="sm" onClick={() => setLiked(!liked)}
                        className={`h-8 rounded-full text-xs ${liked ? "bg-rose-500 hover:bg-rose-600" : ""}`}>
                  <Heart className={`h-3.5 w-3.5 mr-1 ${liked ? 'fill-current' : ''}`} />
                  {liked ? 'Liked' : 'Like'}
                </Button>
                <Button variant="outline" size="sm" className="h-8 rounded-full text-xs">
                  <Share2 className="h-3.5 w-3.5 mr-1" /> Share
                </Button>
                <Button variant="outline" size="sm" className="h-8 rounded-full text-xs" onClick={() => setShowTranscript(!showTranscript)}>
                  <ChevronUp className={`h-3.5 w-3.5 mr-1 transition-transform ${showTranscript ? '' : 'rotate-180'}`} />
                  Transcript
                </Button>
              </div>

              {showTranscript ? (
                <ScrollArea className="mt-3 h-32 p-3 bg-muted/40 rounded-lg">
                  <div className="space-y-2 text-xs">
                    <p><span className="text-primary font-semibold">[00:01]</span> Welcome to the CBK monetary policy briefing.</p>
                    <p><span className="text-primary font-semibold">[00:24]</span> Inflation remains within the target band.</p>
                    <p><span className="text-primary font-semibold">[00:58]</span> The committee voted unanimously to hold rates.</p>
                    <p><span className="text-primary font-semibold">[01:32]</span> We expect stable growth in the coming quarters.</p>
                  </div>
                </ScrollArea>
              ) : (
                <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Live press conference covering monetary policy, key economic indicators,
                    interest rate decisions, and the outlook for the coming quarter.
                  </p>
                </div>
              )}
            </div>

            {showChat && (
              <div className="w-full md:w-80 flex flex-col bg-muted/30 max-h-72 md:max-h-[26rem]">
                <div className="p-3 border-b border-border flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" /> Live Chat
                  </h3>
                  <Badge variant="secondary" className="text-[0.625rem]">{viewers.toLocaleString()} viewers</Badge>
                </div>

                <ScrollArea className="flex-1 p-3">
                  <div className="space-y-3">
                    {comments.map(c => (
                      <div key={c.id} className="flex gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[0.625rem] bg-primary/20">{c.user.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">{c.user}</span>
                            <span className="text-[0.625rem] text-muted-foreground">{c.time}</span>
                          </div>
                          <p className="text-xs text-muted-foreground break-words">{c.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <div className="p-3 border-t border-border">
                  <div className="flex gap-2">
                    <Input
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSendChat()}
                      placeholder="Send a message..."
                      className="text-xs h-8 rounded-full"
                    />
                    <Button size="icon" className="h-8 w-8 rounded-full shrink-0" onClick={handleSendChat}>
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
