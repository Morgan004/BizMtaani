import admin from "firebase-admin";
import { logger } from "./logger";

let initialized = false;

export function getAdminApp(): admin.app.App {
  if (initialized) return admin.app();

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON env var is not set");
  }

  let serviceAccount: admin.ServiceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson) as admin.ServiceAccount;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  initialized = true;
  logger.info("Firebase Admin initialized");
  return admin.app();
}

export function getMessaging() {
  return getAdminApp().messaging();
}
