import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { MessageCircle, Loader2 } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";

interface Chat {
  id: string;
  productTitle: string;
  productImage: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  lastMessage: string;
  lastMessageAt: { seconds: number } | null;
}

export default function ChatList() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLocation("/login");
      return;
    }
    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", user.uid),
      orderBy("lastMessageAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setChats(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Chat)));
      setLoading(false);
    });
    return unsub;
  }, [user, setLocation]);

  function getOtherParty(chat: Chat) {
    if (!user) return "";
    return user.uid === chat.buyerId ? chat.sellerName : chat.buyerName;
  }

  function formatTime(ts: { seconds: number } | null) {
    if (!ts) return "";
    const d = new Date(ts.seconds * 1000);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-card border-b border-border px-4 h-14 flex items-center">
        <h1 className="font-black text-lg">Messages</h1>
      </header>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      ) : chats.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 px-6">
          <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center">
            <MessageCircle size={36} className="text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-bold text-lg">No messages yet</p>
            <p className="text-muted-foreground text-sm mt-1">
              When you chat with sellers or buyers, conversations appear here
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {chats.map((chat) => (
            <Link
              key={chat.id}
              href={`/chat/${chat.id}`}
              data-testid={`chat-item-${chat.id}`}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
            >
              {chat.productImage ? (
                <img
                  src={chat.productImage}
                  alt={chat.productTitle}
                  className="w-12 h-12 rounded-xl object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                  <MessageCircle size={20} className="text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p data-testid={`text-chat-party-${chat.id}`} className="font-bold text-sm truncate">
                    {getOtherParty(chat)}
                  </p>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatTime(chat.lastMessageAt)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{chat.productTitle}</p>
                {chat.lastMessage ? (
                  <p data-testid={`text-last-message-${chat.id}`} className="text-sm text-muted-foreground truncate mt-0.5">
                    {chat.lastMessage}
                  </p>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
