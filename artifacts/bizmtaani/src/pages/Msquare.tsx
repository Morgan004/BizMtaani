import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  collection, query, where, orderBy, limit,
  getDocs, startAfter, doc, updateDoc,
  arrayUnion, arrayRemove, type QueryConstraint,
  type DocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "@/components/BottomNav";
import { useToast } from "@/hooks/use-toast";
import { getWardInfo, type ResolvedLocation } from "@/lib/location";
import { Heart, MessageCircle, Share2, Plus, Loader2, MoreHorizontal } from "lucide-react";

const NAIROBI: [number, number] = [-1.286389, 36.817223];
const PAGE_SIZE = 10;

const FILTERS = [
  { key: "ward" as const, label: "My Ward" },
  { key: "county" as const, label: "My County" },
  { key: "all" as const, label: "All Kenya" },
];

type Filter = "ward" | "county" | "all";

const CATEGORY_COLORS: Record<string, string> = {
  General: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  Education: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Fun: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  Questions: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  Announcements: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  Events: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "Business Talk": "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  "Community Issues": "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

export interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  ward: string;
  county: string;
  content: string;
  imageUrl?: string;
  category: string;
  likes: string[];
  commentCount: number;
  createdAt: { seconds: number } | null;
}

export function timeAgo(seconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(seconds * 1000).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

function AuthorAvatar({ name, avatar }: { name: string; avatar: string }) {
  return (
    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
      {avatar ? (
        <img src={avatar} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span className="text-sm font-bold text-muted-foreground">
          {name?.charAt(0)?.toUpperCase() ?? "?"}
        </span>
      )}
    </div>
  );
}

function PostCard({
  post,
  onLike,
}: {
  post: CommunityPost;
  onLike: (id: string) => void;
}) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const liked = user ? (post.likes ?? []).includes(user.uid) : false;
  const [showMenu, setShowMenu] = useState(false);

  function handleShare() {
    const url = `${window.location.origin}/msquare/${post.id}`;
    if (navigator.share) {
      navigator.share({ title: "Msquare post", url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).then(() =>
        toast({ title: "Link copied" })
      );
    }
  }

  function handleReport() {
    setShowMenu(false);
    toast({ title: "Post reported", description: "We will review this soon." });
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <AuthorAvatar name={post.authorName} avatar={post.authorAvatar} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-none truncate">{post.authorName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {post.ward || "Kenya"}{" "}
            {post.createdAt ? `· ${timeAgo(post.createdAt.seconds)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 relative">
          {post.category && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                CATEGORY_COLORS[post.category] ?? "bg-muted text-muted-foreground"
              }`}
            >
              {post.category}
            </span>
          )}
          <button
            onClick={() => setShowMenu((s) => !s)}
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <MoreHorizontal size={16} />
          </button>
          {showMenu && (
            <div className="absolute top-7 right-0 z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[120px]">
              <button
                onClick={handleReport}
                className="w-full text-left px-4 py-2.5 text-sm text-destructive hover:bg-muted"
              >
                Report post
              </button>
              <button
                onClick={() => setShowMenu(false)}
                className="w-full text-left px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        className="px-4 pb-3 cursor-pointer"
        onClick={() => navigate(`/msquare/${post.id}`)}
      >
        <p className="text-sm leading-relaxed line-clamp-5 whitespace-pre-line">
          {post.content}
        </p>
      </div>

      {/* Image */}
      {post.imageUrl && (
        <div
          className="mx-4 mb-3 rounded-xl overflow-hidden cursor-pointer"
          onClick={() => navigate(`/msquare/${post.id}`)}
        >
          <img
            src={post.imageUrl}
            alt="Post"
            className="w-full max-h-72 object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 px-3 pb-3 pt-2 border-t border-border">
        <button
          onClick={() => (user ? onLike(post.id) : navigate("/login"))}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
            liked
              ? "text-rose-500 bg-rose-50 dark:bg-rose-900/20"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Heart size={15} fill={liked ? "currentColor" : "none"} />
          {(post.likes ?? []).length}
        </button>

        <button
          onClick={() => navigate(`/msquare/${post.id}`)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
        >
          <MessageCircle size={15} />
          {post.commentCount ?? 0}
        </button>

        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors ml-auto"
        >
          <Share2 size={15} />
          Share
        </button>
      </div>
    </div>
  );
}

export default function Msquare() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [locationInfo, setLocationInfo] = useState<ResolvedLocation | null>(null);
  const [filter, setFilter] = useState<Filter>("ward");

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  // Detect location once
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        getWardInfo(pos.coords.latitude, pos.coords.longitude).then(
          setLocationInfo
        );
      },
      () => {
        getWardInfo(NAIROBI[0], NAIROBI[1]).then(setLocationInfo);
      },
      { timeout: 8000 }
    );
  }, []);

  function buildConstraints(
    afterDoc?: DocumentSnapshot | null
  ): QueryConstraint[] {
    const c: QueryConstraint[] = [];
    if (filter === "ward" && locationInfo?.wardName) {
      c.push(where("ward", "==", locationInfo.wardName));
    } else if (filter === "county" && locationInfo?.county) {
      c.push(where("county", "==", locationInfo.county));
    }
    c.push(orderBy("createdAt", "desc"));
    if (afterDoc) c.push(startAfter(afterDoc));
    c.push(limit(PAGE_SIZE));
    return c;
  }

  async function loadInitial() {
    setLoading(true);
    setCursor(null);
    setHasMore(true);
    try {
      const q = query(collection(db, "community_posts"), ...buildConstraints());
      const snap = await getDocs(q);
      const items = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as CommunityPost)
      );
      setPosts(items);
      setCursor(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, "community_posts"),
        ...buildConstraints(cursor)
      );
      const snap = await getDocs(q);
      const items = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as CommunityPost)
      );
      setPosts((prev) => [...prev, ...items]);
      setCursor(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }

  // Reload when filter or location changes
  useEffect(() => {
    if (locationInfo || filter === "all") {
      loadInitial();
    }
  }, [filter, locationInfo]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMoreRef.current();
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, cursor]);

  // Optimistic like toggle
  async function handleLike(postId: string) {
    if (!user) return navigate("/login");
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const liked = (post.likes ?? []).includes(user.uid);
    setPosts((prev) =>
      prev.map((p) =>
        p.id !== postId
          ? p
          : {
              ...p,
              likes: liked
                ? p.likes.filter((uid) => uid !== user.uid)
                : [...(p.likes ?? []), user.uid],
            }
      )
    );
    try {
      await updateDoc(doc(db, "community_posts", postId), {
        likes: liked ? arrayRemove(user.uid) : arrayUnion(user.uid),
      });
    } catch {
      // Revert
      setPosts((prev) =>
        prev.map((p) =>
          p.id !== postId
            ? p
            : {
                ...p,
                likes: liked
                  ? [...(p.likes ?? []), user.uid]
                  : p.likes.filter((uid) => uid !== user.uid),
              }
        )
      );
    }
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-card border-b border-border px-4 pt-3 pb-2">
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <h1 className="text-xl font-black leading-none">Msquare</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {locationInfo?.wardName
                ? `${locationInfo.wardName} · Community`
                : "Mtaa Square — Community"}
            </p>
          </div>
        </div>
        {/* Filter tabs */}
        <div className="flex gap-2">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                filter === key
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div className="px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={28} className="animate-spin text-muted-foreground" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <p className="font-bold text-lg">No posts yet</p>
            <p className="text-muted-foreground text-sm">
              Be the first to post in your community
            </p>
          </div>
        ) : (
          <>
            {posts.map((post) => (
              <PostCard key={post.id} post={post} onLike={handleLike} />
            ))}
            {hasMore && <div ref={sentinelRef} className="h-4" />}
            {loadingMore && (
              <div className="flex justify-center py-4">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            )}
            {!hasMore && posts.length > 0 && (
              <p className="text-center text-xs text-muted-foreground py-4">
                You have seen all posts
              </p>
            )}
          </>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => (user ? navigate("/msquare/create") : navigate("/login"))}
        className="fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Create post"
      >
        <Plus size={24} />
      </button>

      <BottomNav />
    </div>
  );
}
