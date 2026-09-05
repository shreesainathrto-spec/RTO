import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

export interface RolePermissions {
  createClients: boolean;
  editClients: boolean;
  deleteClients: boolean;
}

export const DEFAULT_STAFF_PERMISSIONS: RolePermissions = {
  createClients: true,
  editClients: true,
  deleteClients: false,
};

const DOC_REF = doc(db, "system_config", "permissions");

export async function getStaffPermissions(): Promise<RolePermissions> {
  try {
    const snap = await getDoc(DOC_REF);
    if (snap.exists() && snap.data().staff) {
      return { ...DEFAULT_STAFF_PERMISSIONS, ...snap.data().staff };
    }
  } catch (err) {
    console.error("[permissions] Failed to get staff permissions:", err);
  }
  return DEFAULT_STAFF_PERMISSIONS;
}

export async function saveStaffPermissions(perms: RolePermissions): Promise<void> {
  await setDoc(DOC_REF, { staff: perms }, { merge: true });
}

export function subscribeStaffPermissions(cb: (perms: RolePermissions) => void): () => void {
  return onSnapshot(DOC_REF, (snap) => {
    if (snap.exists() && snap.data().staff) {
      cb({ ...DEFAULT_STAFF_PERMISSIONS, ...snap.data().staff });
    } else {
      cb(DEFAULT_STAFF_PERMISSIONS);
    }
  });
}
