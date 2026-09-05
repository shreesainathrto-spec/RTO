import { getFirestore, doc, getDoc, setDoc, collection, addDoc, Timestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import * as bcrypt from 'bcryptjs';

// Firestore reference (assumes firebase has been initialized elsewhere)
const db = getFirestore();

/**
 * Retrieves the hashed admin PIN from Firestore.
 */
export async function getAdminPinHash(): Promise<string | null> {
  const ref = doc(db, 'system_settings', 'admin_security');
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as { adminPinHash?: string };
  return data.adminPinHash ?? null;
}

/**
 * Verifies a plain PIN against the stored hash.
 * Returns true if the PIN matches, false otherwise.
 * Defaults to "1234" if no PIN has been set yet.
 */
export async function verifyAdminPin(pin: string): Promise<boolean> {
  if (!pin) return false;
  const hash = await getAdminPinHash();
  if (!hash) {
    return pin === "1234";
  }
  return bcrypt.compare(pin, hash);
}

/**
 * Hashes a PIN for storage. Uses bcrypt with a salt.
 */
export async function hashPin(pin: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(pin, saltRounds);
}

/**
 * Updates the global Delete Confirmation PIN after verifying current PIN,
 * new PIN format, confirm match, and the authenticated Admin's actual password.
 */
export async function updateAdminPin(
  currentPin: string,
  newPin: string,
  confirmNewPin: string,
  adminPassword: string
): Promise<void> {
  const { getSession, toEmail } = await import("./auth");
  const { auth } = await import("./firebase");
  const { signInWithEmailAndPassword } = await import("firebase/auth");

  const session = getSession();
  if (!session || session.role !== "admin") {
    throw new Error("Only Admin users can change the Delete PIN.");
  }

  // 1. Verify Current PIN
  const currentPinOk = await verifyAdminPin(currentPin);
  if (!currentPinOk) {
    throw new Error("Current Delete PIN is incorrect.");
  }

  // 2. Validate New PIN format (4-8 digits)
  if (!/^\d{4,8}$/.test(newPin)) {
    throw new Error("New Delete PIN must be 4–8 digits.");
  }

  // 3. Confirm PIN match
  if (newPin !== confirmNewPin) {
    throw new Error("Confirm PIN does not match.");
  }

  // 4. Verify Admin Password with Firebase Auth
  if (!adminPassword) {
    throw new Error("Invalid administrator password.");
  }
  try {
    const email = toEmail(session.username);
    await signInWithEmailAndPassword(auth, email, adminPassword);
  } catch (err: any) {
    console.error("[AdminPasswordVerificationFailed]", err);
    throw new Error("Invalid administrator password.");
  }

  // 5. Store hashed PIN in Firestore
  const newHash = await hashPin(newPin);
  const ref = doc(db, "system_settings", "admin_security");
  await setDoc(ref, {
    adminPinHash: newHash,
    updatedAt: new Date().toISOString(),
    updatedBy: session.username,
  }, { merge: true });
}

/**
 * Logs a deletion event to Firestore for audit purposes.
 */
export interface DeletionLog {
  recordType: string;
  recordId: string;
  deletedBy: string; // uid of the user performing deletion
  deletedAt: Date;
  pinVerified: boolean;
  ip?: string;
}

export async function logDeletion(log: DeletionLog): Promise<void> {
  const col = collection(db, 'deletion_audit_logs');
  await addDoc(col, {
    recordType: log.recordType,
    recordId: log.recordId,
    deletedBy: log.deletedBy,
    deletedAt: Timestamp.fromDate(log.deletedAt),
    pinVerified: log.pinVerified,
    ip: log.ip ?? null,
  });
}
