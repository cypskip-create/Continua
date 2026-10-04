import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, User, Loader2, Upload, X, Check, AlertCircle } from "lucide-react";

import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProfileDialog({ open, onOpenChange }: EditProfileDialogProps) {
  const { profile, updateProfile, refetch } = useProfile();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle availability state
  type HandleState = "idle" | "checking" | "available" | "taken" | "invalid" | "current";
  const [handleState, setHandleState] = useState<HandleState>("idle");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const originalHandle = (profile?.handle || "").toLowerCase();

  useEffect(() => {
    if (open && profile) {
      setFullName(profile.full_name || "");
      setHandle(profile.handle || "");
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatar_url || "");
      setPreviewUrl(profile.avatar_url || "");
      setHandleState("idle");
      setSuggestions([]);
    }
  }, [open, profile]);

  // Debounced live handle check
  useEffect(() => {
    if (!open) return;
    const clean = handle.replace(/^@/, "").toLowerCase();
    if (!clean) { setHandleState("idle"); setSuggestions([]); return; }
    if (clean === originalHandle) { setHandleState("current"); setSuggestions([]); return; }
    if (clean.length < 3 || clean.length > 30 || !/^[a-z0-9_]+$/.test(clean)) {
      setHandleState("invalid"); setSuggestions([]); return;
    }
    setHandleState("checking");
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from("profiles_public")
        .select("handle")
        .ilike("handle", clean)
        .maybeSingle();
      if (error) { setHandleState("idle"); return; }
      if (!data) { setHandleState("available"); setSuggestions([]); return; }
      setHandleState("taken");
      // Generate suggestions
      const bases = [clean, clean.slice(0, 20)];
      const suffixes = ["_ke", "01", "_trader", "invest", "_nse", "254"];
      const candidates = Array.from(new Set(bases.flatMap(b => suffixes.map(s => `${b}${s}`.slice(0, 30)))));
      const { data: taken } = await supabase
        .from("profiles_public")
        .select("handle")
        .in("handle", candidates);
      const takenSet = new Set((taken || []).map(t => (t.handle || "").toLowerCase()));
      setSuggestions(candidates.filter(c => !takenSet.has(c)).slice(0, 3));
    }, 450);
    return () => clearTimeout(t);
  }, [handle, open, originalHandle]);


  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      // Create a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/avatar-${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      setAvatarUrl(publicUrl);
      setPreviewUrl(publicUrl);

      toast({
        title: "Photo uploaded",
        description: "Your profile photo has been uploaded",
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = () => {
    setAvatarUrl("");
    setPreviewUrl("");
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const result = await updateProfile({
        full_name: fullName,
        bio: bio,
        avatar_url: avatarUrl,
        handle: handle.replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_]/g, '') || null,
      } as any);
      
      if (result?.error) {
        toast({
          title: "Error",
          description: "Failed to update profile",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Profile updated successfully",
        });
        await refetch();
        onOpenChange(false);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md h-[100dvh] sm:h-auto sm:max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden rounded-none sm:rounded-lg">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle className="text-center text-xl">Edit Profile</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6">
        <div className="space-y-6 py-4">
          {/* Avatar Section */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              <Avatar className="h-28 w-28 ring-4 ring-primary/20">
                <AvatarImage src={previewUrl} className="object-cover" />
                <AvatarFallback className="bg-gradient-primary text-primary-foreground text-3xl font-bold">
                  {fullName ? getInitials(fullName) : <User className="h-12 w-12" />}
                </AvatarFallback>
              </Avatar>
              
              {/* Upload overlay */}
              <div 
                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                ) : (
                  <Camera className="h-8 w-8 text-white" />
                )}
              </div>
              
              {/* Remove button */}
              {previewUrl && (
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-7 w-7 rounded-full"
                  onClick={handleRemovePhoto}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleFileUpload}
            />
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Upload Photo
                </>
              )}
            </Button>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-sm font-medium">
                Name
              </Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="handle" className="text-sm font-medium">Handle</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                <Input
                  id="handle"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="cypskip"
                  className="h-11 pl-8 pr-9"
                  maxLength={30}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {handleState === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {handleState === "available" && <Check className="h-4 w-4 text-bull" />}
                  {(handleState === "taken" || handleState === "invalid") && <AlertCircle className="h-4 w-4 text-bear" />}
                </span>
              </div>
              {handleState === "available" && <p className="text-xs text-bull">✓ Available</p>}
              {handleState === "current" && <p className="text-xs text-muted-foreground">Your current handle</p>}
              {handleState === "invalid" && <p className="text-xs text-bear">Use 3–30 letters, numbers, or underscores</p>}
              {handleState === "taken" && (
                <div className="space-y-1.5">
                  <p className="text-xs text-bear">Already taken</p>
                  {suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map(s => (
                        <button key={s} type="button" onClick={() => setHandle(s)}
                          className="text-[0.6875rem] px-2 py-1 rounded-full bg-muted hover:bg-muted/70 font-medium">
                          @{s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {handleState === "idle" && <p className="text-xs text-muted-foreground">Letters, numbers, and underscores only</p>}
            </div>


            <div className="space-y-2">
              <Label htmlFor="bio" className="text-sm font-medium">
                Bio
              </Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us about yourself..."
                className="min-h-[80px] resize-none"
                maxLength={160}
              />
              <p className="text-xs text-muted-foreground text-right">
                {bio.length}/160
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="avatarUrl" className="text-sm font-medium">
                Avatar URL (optional)
              </Label>
              <Input
                id="avatarUrl"
                value={avatarUrl}
                onChange={(e) => {
                  setAvatarUrl(e.target.value);
                  setPreviewUrl(e.target.value);
                }}
                placeholder="https://example.com/avatar.jpg"
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                Or paste a direct link to your profile picture
              </p>
            </div>
          </div>
        </div>
        </div>

        {/* Actions — pinned outside the scroll area so they're always reachable, even on short phone screens */}
        <div className="shrink-0 flex gap-3 px-6 py-4 border-t border-border bg-background pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button 
            variant="outline" 
            className="flex-1 h-11"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button 
            className="flex-1 h-11 btn-primary"
            onClick={handleSave}
            disabled={loading || uploading || handleState === "checking" || handleState === "taken" || handleState === "invalid"}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
