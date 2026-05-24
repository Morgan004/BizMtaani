import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import {
  doc, getDoc, collection, query, orderBy,
  onSnapshot, addDoc, serverTimestamp,
  updateDoc, arrayUnion, arrayRemove, increment,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "@/components/BottomNav";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Heart, Send, Loader2, MoreHorizontal } from "lucide-react";
import { type CommunityPost, timeAgo } from "@/pages/Msquare";

interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  createdAt: { seconds: number } | null;
}

function AuthorAvatar({ name, avatar, size = 9 }: { name: string; avatar: string; size?: number }) {
  const cls = `w-${size} h-${size} rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0`;
  return (
    <div className={cls}>
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

export default function CommunityPostDetail() {
  const { postId } = useParams<{ postId: string }>();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [post, setPost] = useState<CommunityPost | null>(null);
  const [postLoading, setPostLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showReportMenu, setShowReportMenu] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load post
  useEffect(() => {
    if (!postId) return;
    getDoc(doc(db, "community_posts", postId))
      .then((snap) => {
        if (snap.exists()) {
          setPost({ id: snap.id, ...snap.data() } as CommunityPost);
        }
      })
      .finally(() => setPostLoading(false));
  }, [postId]);

  // Real-time comments
  useEffect(() => {
    if (!postId) return;
    const q = query(
      collection(db, "community_posts", postId, "comments"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as Comment))
      );
    });
    return unsub;
  }, [postId]);

  // Optimistic like
  async function handleLike() {
    if (!user) return navigate("/login");
    if (!post) return;
    const liked = (post.likes ?? []).includes(user.uid);
    setPost((p) =>
      p
        ? {
            ...p,
            likes: liked
              ? p.likes.filter((uid) => uid !== user.uid)
              : [...(p.likes ?? []), user.uid],
          }
        : p
    );
    try {
      await updateDoc(doc(db, "community_posts", postId!), {
        likes: liked ? arrayRemove(user.uid) : arrayUnion(user.uid),
      });
    } catch {
      // Revert
      setPost((p) =>
        p
          ? {
              ...p,
              likes: liked
                ? [...(p.likes ?? []), user.uid]
                : p.likes.filter((uid) => uid !== user.uid),
            }
          : p
      );
    }
  }

  async function submitComment() {
    if (!user) return navigate("/login");
    if (!commentText.trim() || !postId) return;
    setSubmittingComment(true);
    try {
      await addDoc(
        collection(db, "community_posts", postId, "comments"),
        {
          authorId: user.uid,
          authorName: user.displayName || "Community Member",
          authorAvatar: user.photoURL || "",
          content: commentText.trim(),
          createdAt: serverTimestamp(),
        }
      );
      await updateDoc(doc(db, "community_posts", postId), {
        commentCount: increment(1),
      });
      setCommentText("");
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {
      toast({ title: "Failed to comment", variant: "destructive" });
    } finally {
      setSubmittingComment(false);
    }
  }

  function handleReport() {
    setShowReportMenu(false);
    toast({ title: "Post reported", description: "We will review this soon." });
  }

  if (postLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <p className="font-bold text-lg">Post not found</p>
        <button onClick={() => navigate("/msquare")} className="text-primary font-semibold text-sm">
          Back to Msquare
        </button>
      </div>
    );
  }

  const liked = user ? (post.likes ?? []).includes(user.uid) : false;

  return (
    <div className="min-h-screen bg-background pb-36 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-card border-b border-border flex items-center gap-3 px-4 h-14">
        <button
          onClick={() => navigate("/msquare")}
          className="text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="font-black text-base flex-1">Post</h1>
        <div className="relative">
          <button
            onClick={() => setShowReportMenu((s) => !s)}
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <MoreHorizontal size={20} />
          </button>
          {showReportMenu && (
            <div className="absolute top-8 right-0 z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[140px]">
              <button
                onClick={handleReport}
                className="w-full text-left px-4 py-2.5 text-sm text-destructive hover:bg-muted"
              >
                Report post
              </button>
              <button
                onClick={() => setShowReportMenu(false)}
                className="w-full text-left px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Post */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          {/* Author */}
          <div className="flex items-center gap-3">
            <AuthorAvatar name={post.authorName} avatar={post.authorAvatar} />
            <div>
              <p className="font-semibold text-sm">{post.authorName}</p>
              <p className="text-xs text-muted-foreground">
                {post.ward || "Kenya"}{" "}
                {post.createdAt ? `· ${timeAgo(post.createdAt.seconds)}` : ""}
              </p>
            </div>
          </div>

          {/* Content */}
          <p className="text-sm leading-relaxed whitespace-pre-line">{post.content}</p>

          {/* Image */}
          {post.imageUrl && (
            <div className="rounded-xl overflow-hidden">
              <img
                src={post.imageUrl}
                alt="Post"
                className="w-full object-cover max-h-80"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <button
              onClick={handleLike}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                liked
                  ? "text-rose-500 bg-rose-50 dark:bg-rose-900/20"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Heart size={16} fill={liked ? "currentColor" : "none"} />
              {(post.likes ?? []).length} {(post.likes ?? []).length === 1 ? "like" : "likes"}
            </button>
          </div>
        </div>

        {/* Comments header */}
        <p className="font-bold text-sm px-1">
          {comments.length} {comments.length === 1 ? "Comment" : "Comments"}
        </p>

        {/* Comments list */}
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No comments yet. Be the first.
          </p>
        ) : (
          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="flex gap-3">
                <AuthorAvatar name={c.authorName} avatar={c.authorAvatar} size={8} />
                <div className="flex-1 bg-muted rounded-2xl px-3 py-2.5">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-xs">{c.authorName}</span>
                    {c.createdAt && (
                      <span className="text-[10px] text-muted-foreground">
                        {timeAgo(c.createdAt.seconds)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm mt-0.5 leading-relaxed">{c.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Comment input — fixed above bottom nav */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border px-4 py-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 64px)" }}
      >
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitComment();
                }
              }}
              placeholder={user ? "Add a comment..." : "Sign in to comment"}
              disabled={!user}
              rows={1}
              className="w-full resize-none rounded-xl border border-border bg-muted px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground min-h-[44px] max-h-28"
              style={{ field_sizing: "content" } as React.CSSProperties}
            />
          </div>
          <button
            onClick={submitComment}
            disabled={submittingComment || !commentText.trim()}
            className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0 disabled:opacity-50"
          >
            {submittingComment ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
