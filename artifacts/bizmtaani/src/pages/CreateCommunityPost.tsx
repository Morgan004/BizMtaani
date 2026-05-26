import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  collection, addDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { uploadImage } from "@/lib/uploadImage";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Camera, Loader2, X, MapPin } from "lucide-react";
import { getWardInfo, type ResolvedLocation } from "@/lib/location";
import { encodeGeohash } from "@/lib/geohash";

const CATEGORIES = [
  "General",
  "Education",
  "Fun",
  "Questions",
  "Announcements",
  "Events",
  "Business Talk",
  "Community Issues",
] as const;

type Category = (typeof CATEGORIES)[number];

const NAIROBI = { lat: -1.286389, lng: 36.817223 };

export default function CreateCommunityPost() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [content, setContent] = useState("");
  const [category, setCategory] = useState<Category>("General");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [wardInfo, setWardInfo] = useState<ResolvedLocation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [showImageMenu, setShowImageMenu] = useState(false);

  // Auto-detect location on mount
  useEffect(() => {
    if (!user) { navigate("/login"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        getWardInfo(c.lat, c.lng).then(setWardInfo);
      },
      () => {
        setCoords(NAIROBI);
        getWardInfo(NAIROBI.lat, NAIROBI.lng).then(setWardInfo);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [user]);

  function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Maximum 5 MB.", variant: "destructive" });
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return navigate("/login");
    if (!content.trim()) {
      toast({ title: "Write something first", variant: "destructive" });
      return;
    }
    if (!coords) {
      toast({ title: "Location not ready", description: "Wait a moment and try again.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      let imageUrl = "";
      if (imageFile) {
        imageUrl = await uploadImage(imageFile, "community");
      }

      const geohash = encodeGeohash(coords.lat, coords.lng, 6);

      await addDoc(collection(db, "community_posts"), {
        authorId: user.uid,
        authorName: user.displayName || "Community Member",
        authorAvatar: user.photoURL || "",
        content: content.trim(),
        category,
        imageUrl,
        ward: wardInfo?.wardName ?? "",
        constituency: wardInfo?.constituency ?? "",
        county: wardInfo?.county ?? "",
        lat: coords.lat,
        lng: coords.lng,
        geohash,
        likes: [],
        commentCount: 0,
        createdAt: serverTimestamp(),
      });

      toast({ title: "Post shared" });
      navigate("/msquare");
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to post", description: "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-card border-b border-border flex items-center gap-3 px-4 h-14">
        <button
          onClick={() => navigate("/msquare")}
          className="text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="font-black text-base flex-1">New Post</h1>
        <Button
          onClick={handleSubmit}
          disabled={submitting || !content.trim()}
          className="h-9 px-5 font-bold rounded-xl text-sm"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : "Post"}
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col px-4 py-4 space-y-4">
        {/* Author row */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-bold text-muted-foreground">
                {user?.displayName?.charAt(0)?.toUpperCase() ?? "?"}
              </span>
            )}
          </div>
          <div>
            <p className="font-semibold text-sm">{user?.displayName || "You"}</p>
            {wardInfo?.wardName && (
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin size={10} className="text-primary" />
                <p className="text-[11px] text-primary font-medium">{wardInfo.wardName}</p>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <Textarea
          placeholder="What's happening in your mtaa?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[140px] text-base border-none shadow-none resize-none p-0 focus-visible:ring-0"
          maxLength={1000}
          autoFocus
        />

        {/* Character count */}
        <p className={`text-xs text-right ${content.length > 900 ? "text-amber-500" : "text-muted-foreground"}`}>
          {content.length}/1000
        </p>

        {/* Image preview */}
        {imagePreview && (
          <div className="relative rounded-xl overflow-hidden">
            <img src={imagePreview} alt="Preview" className="w-full max-h-64 object-cover" />
            <button
              type="button"
              onClick={() => { setImageFile(null); setImagePreview(null); }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Category selector */}
        <div className="space-y-2">
          <p className="font-bold text-sm">Category</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all ${
                  category === cat
                    ? "bg-primary text-white border-primary"
                    : "bg-muted text-muted-foreground border-transparent"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Image upload button */}
        <div className="pt-2 border-t border-border">
          <button
            type="button"
            onClick={() => setShowImageMenu(true)}
            className="flex items-center gap-2 text-sm text-muted-foreground font-semibold hover:text-foreground transition-colors"
          >
            <Camera size={18} />
            {imageFile ? "Change photo" : "Add a photo"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImage} />
        </div>

        {/* Image source action sheet */}
        {showImageMenu && (
          <>
            <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setShowImageMenu(false)} />
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl border-t border-border px-4 pt-4"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}>
              <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-5" />
              <p className="font-bold text-sm text-center mb-4">Add a photo</p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => { setShowImageMenu(false); cameraRef.current?.click(); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-muted font-semibold text-sm"
                >
                  <Camera size={20} className="text-primary" />
                  Take a photo
                </button>
                <button
                  type="button"
                  onClick={() => { setShowImageMenu(false); fileRef.current?.click(); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-muted font-semibold text-sm"
                >
                  <X size={20} className="text-primary rotate-45" />
                  Choose from gallery
                </button>
                <button
                  type="button"
                  onClick={() => setShowImageMenu(false)}
                  className="w-full flex items-center justify-center px-4 py-3.5 rounded-2xl font-semibold text-sm text-muted-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
