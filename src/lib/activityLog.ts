// src/lib/activityLog.ts
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

/** Log a user‑related action */
export async function logAction(
  action: string,
  targetUserId: string,
  performedBy: string,
): Promise<void> {
  await setDoc(doc(collection(db, "activityLogs")), {
    action,
    targetUserId,
    performedBy,
    timestamp: serverTimestamp(),
  });
}
