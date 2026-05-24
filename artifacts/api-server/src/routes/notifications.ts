import { Router } from "express";
import { getMessaging } from "../lib/firebase-admin";
import { logger } from "../lib/logger";

const router = Router();

router.post("/notify", async (req, res) => {
  const { token, title, body, data } = req.body as {
    token?: string;
    title?: string;
    body?: string;
    data?: Record<string, string>;
  };

  if (!token || !title || !body) {
    res.status(400).json({ error: "token, title, and body are required" });
    return;
  }

  try {
    const messaging = getMessaging();
    const result = await messaging.send({
      token,
      notification: { title, body },
      data: data ?? {},
      webpush: {
        notification: {
          title,
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          requireInteraction: false,
        },
        fcmOptions: {
          link: data?.chatUrl ?? "/",
        },
      },
    });
    req.log.info({ messageId: result }, "FCM notification sent");
    res.json({ success: true, messageId: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "FCM send failed");
    res.status(500).json({ error: msg });
  }
});

export default router;
