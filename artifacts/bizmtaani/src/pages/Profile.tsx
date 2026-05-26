import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { signOut, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { uploadImage } from "@/lib/uploadImage";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Package, MessageCircle, Camera, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { BottomNav } from "@/components/BottomNav";

export default function Profile() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Maximum 10 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const photoURL = await uploadImage(file, "avatar");
      await updateProfile(user, { photoURL });
      window.location.reload();
    } catch {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
      setUploading(false);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    toast({ title: "Signed out" });
    setLocation("/");
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20 flex flex-col items-center justify-center gap-4 px-6">
        <div className="text-center">
          <h2 className="font-black text-2xl">Your Profile</h2>
          <p className="text-muted-foreground mt-1">Sign in to manage your account</p>
        </div>
        <Button data-testid="button-signin" onClick={() => setLocation("/login")} className="w-full max-w-xs">
          Sign In
        </Button>
        <BottomNav />
      </div>
    );
  }

  const initials = user.displayName
    ? user.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : user.email?.[0]?.toUpperCase() ?? "U";

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-card border-b border-border px-4 h-14 flex items-center">
        <h1 className="font-black text-lg">Profile</h1>
      </header>

      <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-4">
          {/* Tappable avatar */}
          <button
            type="button"
            onClick={() => !uploading && setShowAvatarMenu(true)}
            disabled={uploading}
            className="relative w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 focus:outline-none"
            aria-label="Change profile picture"
          >
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName ?? ""}
                className="w-full h-full object-cover"
                data-testid="img-avatar"
              />
            ) : (
              <div
                data-testid="avatar-initials"
                className="w-full h-full bg-primary flex items-center justify-center"
              >
                <span className="text-white text-2xl font-black">{initials}</span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              {uploading
                ? <Loader2 size={18} className="text-white animate-spin" />
                : <Camera size={18} className="text-white" />}
            </div>
          </button>

          {/* Hidden inputs — one for gallery, one for camera */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleAvatarChange}
          />

          <div>
            <p data-testid="text-display-name" className="font-black text-xl">
              {user.displayName || "Seller"}
            </p>
            <p data-testid="text-email" className="text-muted-foreground text-sm">{user.email}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Tap photo to change</p>
          </div>
        </div>

        {/* Avatar action sheet */}
        {showAvatarMenu && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-50 bg-black/40"
              onClick={() => setShowAvatarMenu(false)}
            />
            {/* Sheet */}
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl border-t border-border px-4 pb-8 pt-4"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}
            >
              <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-5" />
              <p className="font-bold text-sm text-center mb-4">Change profile photo</p>
              <div className="space-y-2">
                <button
                  onClick={() => { setShowAvatarMenu(false); cameraRef.current?.click(); }}
                  className="w-full h-13 flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-muted font-semibold text-sm"
                >
                  <Camera size={20} className="text-primary" />
                  Take a photo
                </button>
                <button
                  onClick={() => { setShowAvatarMenu(false); fileRef.current?.click(); }}
                  className="w-full h-13 flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-muted font-semibold text-sm"
                >
                  <Package size={20} className="text-primary" />
                  Choose from gallery
                </button>
                <button
                  onClick={() => setShowAvatarMenu(false)}
                  className="w-full h-13 flex items-center justify-center px-4 py-3.5 rounded-2xl font-semibold text-sm text-muted-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/my-listings"
            data-testid="link-my-listings"
            className="flex flex-col items-center gap-2 p-4 bg-card rounded-2xl border border-border hover:border-primary transition-colors"
          >
            <Package size={24} className="text-primary" />
            <span className="font-semibold text-sm">My Listings</span>
          </Link>
          <Link
            href="/chats"
            data-testid="link-my-chats"
            className="flex flex-col items-center gap-2 p-4 bg-card rounded-2xl border border-border hover:border-primary transition-colors"
          >
            <MessageCircle size={24} className="text-primary" />
            <span className="font-semibold text-sm">Messages</span>
          </Link>
        </div>

        <Button
          data-testid="button-signout"
          variant="outline"
          className="w-full h-12 gap-2 text-destructive border-destructive/30 hover:bg-destructive/5"
          onClick={handleSignOut}
        >
          <LogOut size={16} />
          Sign Out
        </Button>
      </div>

      <BottomNav />
    </div>
  );
}
