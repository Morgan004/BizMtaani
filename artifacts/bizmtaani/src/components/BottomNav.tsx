import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { LayoutGrid, Package, MessageCircle, User, Users2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Chat {
  lastSenderId?: string;
}

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    if (!user) {
      setHasUnread(false);
      return;
    }
    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const unread = snap.docs.some((d) => {
        const data = d.data() as Chat;
        return data.lastSenderId && data.lastSenderId !== user.uid;
      });
      setHasUnread(unread);
    });
    return unsub;
  }, [user]);

  const navItems = [
    { path: "/", label: "Discover", icon: LayoutGrid, badge: false },
    { path: "/msquare", label: "Msquare", icon: Users2, badge: false },
    { path: "/my-listings", label: "Listings", icon: Package, badge: false },
    { path: "/chats", label: "Chats", icon: MessageCircle, badge: hasUnread },
    { path: "/profile", label: "Profile", icon: User, badge: false },
  ];

  return (
    <nav
      data-testid="bottom-nav"
      className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch h-16">
        {navItems.map(({ path, label, icon: Icon, badge }) => {
          const isActive =
            path === "/" ? location === "/" : location.startsWith(path);
          return (
            <Link
              key={path}
              href={user || path === "/" ? path : "/login"}
              data-testid={`nav-${label.toLowerCase()}`}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="relative">
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                {badge && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-destructive border-2 border-card" />
                )}
              </div>
              <span
                className={`text-[10px] font-medium tracking-wide ${isActive ? "text-primary" : ""}`}
              >
                {label}
              </span>
              {isActive && (
                <span className="absolute bottom-0 w-6 h-0.5 rounded-t-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
