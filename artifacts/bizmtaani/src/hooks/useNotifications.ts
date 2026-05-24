import { useEffect, useRef } from "react";
import { getToken, onMessage } from "firebase/messaging";
import { doc, setDoc } from "firebase/firestore";
import { auth, db, getMessagingIfSupported } from "@/lib/firebase";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string;

const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export function useNotifications() {
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    if (!("serviceWorker" in navigator) || !("Notification" in window)) return;
    if (!VAPID_KEY) return;

    async function setup() {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
        await navigator.serviceWorker.ready;

        // Pass Firebase config to the service worker
        registration.active?.postMessage({
          type: "FIREBASE_CONFIG",
          config: FIREBASE_CONFIG,
        });

        const messaging = await getMessagingIfSupported();
        if (!messaging) return;

        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: registration,
        });

        if (!token) return;

        const user = auth.currentUser;
        if (!user) return;

        // Store token in Firestore so the backend can look it up
        await setDoc(
          doc(db, "fcmTokens", user.uid),
          { token, updatedAt: new Date().toISOString() },
          { merge: true }
        );

        registered.current = true;

        // Handle foreground messages (app is open)
        onMessage(messaging, (payload) => {
          const { title, body } = payload.notification ?? {};
          if (title && Notification.permission === "granted") {
            new Notification(title, {
              body: body ?? "",
              icon: "/icon-192.png",
            });
          }
        });
      } catch (err) {
        console.error("FCM setup failed:", err);
      }
    }

    setup();
  }, []);
}
