import { useState, useEffect, useRef } from "react";
import { useLocation, useParams, Link } from "wouter";
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Send, Loader2 } from "lucide-react";

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: { seconds: number } | null;
}

interface Chat {
  productId: string;
  productTitle: string;
  productImage: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
}

async function sendPushNotification(recipientUid: string, title: string, body: string, chatId: string) {
  try {
    const tokenDoc = await getDoc(doc(db, "fcmTokens", recipientUid));
    if (!tokenDoc.exists()) return;
    const { token } = tokenDoc.data() as { token: string };
    if (!token) return;

    await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        title,
        body,
        data: { chatUrl: `/chat/${chatId}` },
      }),
    });
  } catch {
    // Silently fail — notifications are best-effort
  }
}

export default function ChatThread() {
  const { chatId } = useParams<{ chatId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || !chatId) return;
    getDoc(doc(db, "chats", chatId)).then((snap) => {
      if (snap.exists()) setChat(snap.data() as Chat);
    });
    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message)));
    });
    return unsub;
  }, [user, chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !user || !chatId || !chat) return;
    setSending(true);
    const msgText = text.trim();
    setText("");
    try {
      await addDoc(collection(db, "chats", chatId, "messages"), {
        senderId: user.uid,
        senderName: user.displayName || "User",
        text: msgText,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "chats", chatId), {
        lastMessage: msgText,
        lastMessageAt: serverTimestamp(),
        lastSenderId: user.uid,
      });

      // Notify the other party
      const recipientUid = user.uid === chat.buyerId ? chat.sellerId : chat.buyerId;
      const senderName = user.displayName || "Someone";
      sendPushNotification(
        recipientUid,
        `${senderName} — ${chat.productTitle}`,
        msgText,
        chatId
      );
    } finally {
      setSending(false);
    }
  }

  function getOtherName() {
    if (!chat || !user) return "";
    return user.uid === chat.buyerId ? chat.sellerName : chat.buyerName;
  }

  function formatTime(ts: { seconds: number } | null) {
    if (!ts) return "";
    return new Date(ts.seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex-shrink-0 bg-card border-b border-border px-4 h-14 flex items-center gap-3 z-40">
        <button
          data-testid="button-back"
          onClick={() => setLocation("/chats")}
          className="p-1 -ml-1 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {chat?.productImage ? (
            <img src={chat.productImage} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
          ) : null}
          <div className="min-w-0">
            <p data-testid="text-chat-header-name" className="font-bold text-sm truncate">{getOtherName()}</p>
            {chat?.productTitle ? (
              <Link
                href={`/product/${chat.productId}`}
                className="text-xs text-primary truncate block"
                data-testid="link-product"
              >
                {chat.productTitle}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground text-sm">Send a message to start the conversation</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderId === user?.uid;
            return (
              <div
                key={msg.id}
                data-testid={`message-${msg.id}`}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[78%] px-4 py-2.5 rounded-2xl ${
                    isMine
                      ? "bg-primary text-white rounded-br-md"
                      : "bg-card border border-border rounded-bl-md"
                  }`}
                >
                  <p className="text-sm leading-relaxed break-words">{msg.text}</p>
                  <p className={`text-[10px] mt-1 ${isMine ? "text-white/60 text-right" : "text-muted-foreground"}`}>
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={sendMessage}
        className="flex-shrink-0 flex items-center gap-2 px-4 py-3 bg-card border-t border-border"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <Input
          data-testid="input-message"
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 h-11 rounded-full"
          autoComplete="off"
        />
        <Button
          data-testid="button-send"
          type="submit"
          size="icon"
          className="h-11 w-11 rounded-full flex-shrink-0"
          disabled={!text.trim() || sending}
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </Button>
      </form>
    </div>
  );
}
