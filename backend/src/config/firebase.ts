import fs from "node:fs";
import admin from "firebase-admin";
import { env } from "./env";

function loadServiceAccount(): admin.ServiceAccount {
  if (!env.firebaseServiceAccountPath) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH is not configured.");
  }

  if (!fs.existsSync(env.firebaseServiceAccountPath)) {
    throw new Error(`Firebase service account file not found at ${env.firebaseServiceAccountPath}.`);
  }

  const raw = fs.readFileSync(env.firebaseServiceAccountPath, "utf8");
  return JSON.parse(raw) as admin.ServiceAccount;
}

function getOrInitializeFirebaseApp(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccount = loadServiceAccount();

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.projectId || env.FIREBASE_PROJECT_ID,
  });
}

const firebaseApp = getOrInitializeFirebaseApp();

export const db = admin.firestore(firebaseApp);
export const firebaseAuth = admin.auth(firebaseApp);

db.settings({ ignoreUndefinedProperties: true });
