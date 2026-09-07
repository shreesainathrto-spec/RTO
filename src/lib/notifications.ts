// Notifications — Task assignment notifications & audible sound alerts
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { removeUndefined } from "./records";

export interface AppNotification {
  id: string;
  userId: string; // Target employee's uid / normalized ID / name
  type: "task_assigned" | "task_reassigned" | "general";
  title: string;
  message: string;
  taskId: string;
  applicationId?: string;
  applicationDocId?: string;
  serviceName?: string;
  vehicleNumber?: string;
  assignedBy?: string;
  subModule?: string;
  read: boolean;
  createdAt: string; // ISO string
}

export const NOTIFICATIONS_COL = "notifications";

// ─── Sound Generator (Web Audio API) ──────────────────────────────────────────
// Synthesizes a pleasant modern chime sound without requiring external mp3 assets,
// avoiding 404s, CORS, or network download lag.
let audioCtx: AudioContext | null = null;

export function playNotificationSound(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    // Primary chime tone 1 (high pleasant harmonic note)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5

    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(0.28, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);

    osc1.start(now);
    osc1.stop(now + 0.45);

    // Secondary bell tone 2 (sparkle overtone)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(1174.66, now + 0.08); // D6
    osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.22); // A6

    gain2.gain.setValueAtTime(0.001, now + 0.08);
    gain2.gain.linearRampToValueAtTime(0.22, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);

    osc2.start(now + 0.08);
    osc2.stop(now + 0.55);
  } catch (err) {
    console.warn("Could not play notification sound:", err);
  }
}

// ─── Helpers for User Identities ─────────────────────────────────────────────
export function getUserIdentityKeys(user?: {
  uid?: string;
  employeeId?: string;
  username?: string;
  name?: string;
} | null): string[] {
  if (!user) return [];
  const rawList = [user.uid, user.employeeId, user.username, user.name];
  const keys = new Set<string>();
  rawList.forEach((val) => {
    if (val && typeof val === "string" && val.trim()) {
      keys.add(val.trim().toLowerCase());
    }
  });
  return Array.from(keys);
}

// ─── Create Notification on Task Assignment ──────────────────────────────────
export interface TaskAssignmentInfo {
  taskId: string;
  title: string;
  serviceName?: string;
  vehicleNumber?: string;
  applicationId?: string;
  applicationDocId?: string;
  subModule?: string;
  assignedEmployeeId?: string;
  assignedEmployeeUid?: string;
  assignedEmployeeName?: string;
  assignee?: string;
  assignedBy?: string;
}

/**
 * Sends a task assignment notification to Firestore.
 * Generates a deterministic notification ID to prevent duplicate writes:
 * `task_assigned_${taskId}_${assigneeClean}`
 */
export async function sendTaskAssignmentNotification(
  info: TaskAssignmentInfo,
  options?: { isReassignment?: boolean }
): Promise<void> {
  try {
    const rawTarget =
      info.assignedEmployeeUid ||
      info.assignedEmployeeId ||
      info.assignee ||
      info.assignedEmployeeName ||
      "";

    const targetKey = rawTarget.trim().toLowerCase();
    if (!targetKey || targetKey === "unassigned" || targetKey === "former employee" || targetKey === "none") {
      return;
    }

    const cleanTaskId = info.taskId.trim();
    if (!cleanTaskId) return;

    // Deterministic ID for deduplication
    const notifDocId = options?.isReassignment
      ? `task_reassigned_${cleanTaskId}_${targetKey.replace(/[\s\/\\]/g, "_")}`
      : `task_assigned_${cleanTaskId}_${targetKey.replace(/[\s\/\\]/g, "_")}`;

    const serviceDisplay = info.serviceName || info.title || "Task";
    const vehicleDisplay = info.vehicleNumber ? ` (${info.vehicleNumber})` : "";
    const appDisplay = info.applicationId ? ` [App: ${info.applicationId}]` : "";

    const title = options?.isReassignment ? "Task Reassigned To You" : "New Task Assigned";
    const message = `You have been assigned to: ${serviceDisplay}${vehicleDisplay}${appDisplay}`;

    const notificationPayload: AppNotification = {
      id: notifDocId,
      userId: targetKey,
      type: options?.isReassignment ? "task_reassigned" : "task_assigned",
      title,
      message,
      taskId: cleanTaskId,
      applicationId: info.applicationId || "",
      applicationDocId: info.applicationDocId || "",
      serviceName: info.serviceName || info.title || "",
      vehicleNumber: info.vehicleNumber || "",
      assignedBy: info.assignedBy || "System",
      subModule: info.subModule || "services",
      read: false,
      createdAt: new Date().toISOString(),
    };

    const docRef = doc(db, NOTIFICATIONS_COL, notifDocId);
    await setDoc(docRef, removeUndefined(notificationPayload), { merge: true });
    console.log("🔔 [Notification Sent]:", notifDocId, "to", targetKey);
  } catch (err) {
    console.error("Failed to send task assignment notification:", err);
  }
}

// ─── Real-time Notification Listener ──────────────────────────────────────────
/**
 * Subscribes to notifications targeted to the logged-in user.
 * Supports listening across all identifiers the user might have (uid, username, employeeId, name).
 * On snapshot:
 * - On first load: Initializes without playing sound.
 * - On new unread docs added after initialization: Plays notification chime.
 */
export function subscribeUserNotifications(
  user: { uid?: string; employeeId?: string; username?: string; name?: string } | null,
  onUpdate: (notifications: AppNotification[], newArrivalsCount: number) => void
): Unsubscribe {
  if (!user) {
    onUpdate([], 0);
    return () => {};
  }

  const identityKeys = getUserIdentityKeys(user);
  if (identityKeys.length === 0) {
    onUpdate([], 0);
    return () => {};
  }

  let isFirstSnapshot = true;
  const knownIds = new Set<string>();

  // Firestore query for user notifications (ordered by createdAt desc)
  const q = query(collection(db, NOTIFICATIONS_COL), orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    (snap) => {
      const allMatchingDocs: AppNotification[] = [];
      let newArrivals = 0;

      snap.docs.forEach((d) => {
        const data = d.data() as AppNotification;
        const itemUserId = (data.userId || "").trim().toLowerCase();

        // Check if notification belongs to any of user's keys or assignee matching
        if (identityKeys.includes(itemUserId)) {
          allMatchingDocs.push({
            ...data,
            id: d.id,
          });

          if (!isFirstSnapshot && !knownIds.has(d.id) && !data.read) {
            newArrivals++;
          }
          knownIds.add(d.id);
        }
      });

      if (isFirstSnapshot) {
        isFirstSnapshot = false;
      }

      onUpdate(allMatchingDocs, newArrivals);
    },
    (err) => {
      console.error("Error subscribing to user notifications:", err);
      onUpdate([], 0);
    }
  );
}

// ─── Notification Actions ────────────────────────────────────────────────────
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  try {
    const docRef = doc(db, NOTIFICATIONS_COL, notificationId);
    await updateDoc(docRef, { read: true });
  } catch (err) {
    console.error("Failed to mark notification as read:", err);
  }
}

export async function markAllNotificationsAsRead(
  user: { uid?: string; employeeId?: string; username?: string; name?: string } | null
): Promise<void> {
  if (!user) return;
  try {
    const identityKeys = getUserIdentityKeys(user);
    const q = query(collection(db, NOTIFICATIONS_COL), where("read", "==", false));
    const snap = await getDocs(q);

    const batch = writeBatch(db);
    let count = 0;
    snap.docs.forEach((d) => {
      const data = d.data() as AppNotification;
      const itemUserId = (data.userId || "").trim().toLowerCase();
      if (identityKeys.includes(itemUserId)) {
        batch.update(d.ref, { read: true });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
    }
  } catch (err) {
    console.error("Failed to mark all notifications as read:", err);
  }
}
