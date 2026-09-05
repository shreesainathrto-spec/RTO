// Auth — Firebase Auth + Firestore user profiles.
// Maintains the same public API as the old localStorage auth so routes
// don't need major changes.
import { 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword as secondaryCreate,
  signInWithEmailAndPassword as secondarySignIn,
  updatePassword as secondaryUpdate,
  signOut as secondarySignOut,
  getAuth,
} from "firebase/auth";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch, onSnapshot, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { auth, db } from "./firebase";
import { STAFF_USERS } from "./records";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StaffUser = {
  uid: string;
  username: string;
  name: string;
  role: "admin" | "manager" | "employee" | "viewer";
  isActive?: boolean;
  employeeId?: string;
  status?: string;
};

// ─── In-memory session cache ──────────────────────────────────────────────────
// Populated eagerly so getSession() stays synchronous and reliable.

// ─── In-memory session cache ──────────────────────────────────────────────────
// Populated eagerly so getSession() stays synchronous and reliable.

let _session: StaffUser | null = null;
let _initialized = false;
let _userDocUnsub: (() => void) | null = null;
let _authCallbacks: ((user: StaffUser | null) => void)[] = [];
let _isLoggingIn = false;

const EMAIL_DOMAIN = "staff-focus-hub.app";
export const toEmail = (username: string) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function getSecondaryAuth() {
  const apps = getApps();
  const existing = apps.find(a => a.name === 'SecondaryEmployeeAuth');
  const secondaryApp = existing || initializeApp(firebaseConfig, 'SecondaryEmployeeAuth');
  return getAuth(secondaryApp);
}

// ─── Staff account definitions ────────────────────────────────────────────────

export const PRIVILEGED_ADMINS = ["admin", "priya", "rahul", "manager", "staff"];
const ALL_ACCOUNTS = [
  // Core admin accounts (always active)
  { username: "admin", password: "admin123", name: "Office Admin", role: "admin" as const, employeeId: "EMP000" },
  { username: "priya", password: "priya123", name: "Priya", role: "admin" as const, employeeId: "EMP000A" },
  { username: "manager", password: "manager123", name: "Manager", role: "manager" as const, employeeId: "EMP001" },
  { username: "employee1", password: "employee1", name: "Employee 1", role: "employee" as const, employeeId: "EMP002" },
  { username: "employee2", password: "employee2", name: "Employee 2", role: "employee" as const, employeeId: "EMP003" },
  { username: "employee3", password: "employee3", name: "Employee 3", role: "employee" as const, employeeId: "EMP004" },
  { username: "employee4", password: "employee4", name: "Employee 4", role: "employee" as const, employeeId: "EMP005" },
  { username: "employee5", password: "employee5", name: "Employee 5", role: "employee" as const, employeeId: "EMP006" },
  { username: "employee6", password: "employee6", name: "Employee 6", role: "employee" as const, employeeId: "EMP007" },
  { username: "employee7", password: "employee7", name: "Employee 7", role: "employee" as const, employeeId: "EMP008" },
  // Staff users defined in records.ts
  ...STAFF_USERS.map((s, idx) => ({
    username: s.username,
    password: `${s.username}123`,
    name: s.name,
    role: "employee" as const,
    employeeId: `EMP0${9 + idx}`,
  })),
];

export const STAFF_CREDENTIALS = ALL_ACCOUNTS.map((a) => ({
  username: a.username,
  name: a.name,
  password: a.password,
}));

// ─── First-run provisioning ───────────────────────────────────────────────────

async function migrateUsers(): Promise<void> {
  const usersCol = collection(db, "users");
  const snapshot = await getDocs(usersCol);

  const existingUsernames = new Set(
    snapshot.docs.map((d) => (d.data().username || "").toLowerCase())
  );

  const batch = writeBatch(db);
  let batchCount = 0;

  // 1. Pre-seed default staff accounts if missing in Firestore
  for (const account of ALL_ACCOUNTS) {
    if (!existingUsernames.has(account.username.toLowerCase())) {
      const docRef = doc(usersCol);
      batch.set(docRef, {
        uid: docRef.id,
        userId: docRef.id,
        fullName: account.name,
        name: account.name,
        username: account.username,
        password: account.password,
        role: account.role,
        status: "active",
        isActive: true,
        employeeId: account.employeeId,
        createdBy: "system",
        createdAt: new Date().toISOString(),
      });
      batchCount++;
    }
  }

  // 2. Ensure default fields on existing docs
  snapshot.forEach((docSnap) => {
    const data = docSnap.data() as any;
    const updates: any = {};
    if (!data.role) updates.role = "employee";
    if (!data.permissions) updates.permissions = {};
    if (!data.status) {
      const privileged = ["admin", "priya", "rahul", "staff"];
      updates.status = privileged.includes(data.username) ? "active" : "inactive";
    }
    if (!data.createdAt) updates.createdAt = new Date().toISOString();
    if (!data.createdBy) updates.createdBy = "system";
    if (Object.keys(updates).length) {
      batch.update(doc(db, "users", docSnap.id), updates);
      batchCount++;
    }
  });

  if (batchCount > 0) {
    await batch.commit();
  }
}

// ─── Eager Authentication Listener ────────────────────────────────────────────

// Run database migrations once
(async () => {
  await migrateUsers().catch(console.error);
})();

// Listen to Firebase Auth state eagerly on module load
onAuthStateChanged(auth, async (firebaseUser) => {
  if (_userDocUnsub) {
    _userDocUnsub();
    _userDocUnsub = null;
  }

  if (firebaseUser) {
    if (_isLoggingIn) {
      // Let the login() function finish document migration and initialize the session
      return;
    }
    _userDocUnsub = onSnapshot(doc(db, "users", firebaseUser.uid), async (snap) => {
      if (!snap.exists()) {
        await logout();
        _authCallbacks.forEach(cb => cb(null));
        return;
      }

      const data = snap.data();
      const isInactive = data.status === "inactive" || data.isActive === false;

      if (isInactive) {
        toast.error("Your account has been deactivated by an administrator.");
        await logout();
        _authCallbacks.forEach(cb => cb(null));
        return;
      }

      _session = {
        uid: firebaseUser.uid,
        username: data.username,
        name: data.fullName || data.name || data.username || "",
        role: data.role,
        employeeId: data.employeeId,
        ...data,
      } as StaffUser;

      _initialized = true;
      _authCallbacks.forEach(cb => cb(_session));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("auth-change"));
      }
    }, (err) => {
      console.error("Firestore session subscription error:", err);
    });
  } else {
    _session = null;
    _initialized = true;
    _authCallbacks.forEach(cb => cb(null));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("auth-change"));
    }
  }
});

// ─── Public API ───────────────────────────────────────────────────────────────

export function initAuth(onChange: (user: StaffUser | null) => void): () => void {
  _authCallbacks.push(onChange);
  // Trigger immediately if already initialized to prevent race conditions
  if (_initialized) {
    onChange(_session);
  }
  return () => {
    _authCallbacks = _authCallbacks.filter(cb => cb !== onChange);
  };
}

/** Synchronous getter — populated after eagerly initialized auth fires. */
export function getSession(): StaffUser | null {
  return _session;
}

/** True once the first onAuthStateChanged callback has fired. */
export function isAuthReady(): boolean {
  return _initialized;
}

export async function login(usernameInput: string, passwordInput: string): Promise<StaffUser> {
  _isLoggingIn = true;
  
  try {
    const cleanInput = usernameInput.trim();
    const cleanPass = passwordInput.trim();

    if (!cleanInput || !cleanPass) {
      throw new Error("Username and password are required.");
    }

    // 1. Search Firestore users collection using highly targeted queries
    let userDocSnap: any = null;
    const usersCol = collection(db, "users");

    const q1 = await getDocs(query(usersCol, where("username", "==", cleanInput.toLowerCase())));
    if (q1.docs.length > 0) {
      userDocSnap = q1.docs[0];
    } else {
      const q2 = await getDocs(query(usersCol, where("employeeId", "==", cleanInput)));
      if (q2.docs.length > 0) {
        userDocSnap = q2.docs[0];
      } else {
        const q3 = await getDocs(query(usersCol, where("email", "==", cleanInput.toLowerCase())));
        if (q3.docs.length > 0) {
          userDocSnap = q3.docs[0];
        }
      }
    }

    let targetUsername = cleanInput;
    let userProfile: any = null;

    if (userDocSnap) {
      userProfile = userDocSnap.data();
      targetUsername = userProfile.username || cleanInput;

      // Check account status
      const isInactive = userProfile.status === "inactive" || userProfile.isActive === false;
      if (isInactive) {
        throw new Error("Your account is inactive. Please contact the Administrator.");
      }
      if (userProfile.status === "suspended") {
        throw new Error("Your account has been suspended.");
      }

      // Check password matching against Firestore user record or default seed account
      const expectedPassword = userProfile.password;
      if (expectedPassword && expectedPassword !== cleanPass) {
        const seedAccount = ALL_ACCOUNTS.find(
          (a) => a.username.toLowerCase() === targetUsername.toLowerCase()
        );
        if (!seedAccount || seedAccount.password !== cleanPass) {
          throw new Error("Invalid username or password.");
        }
      }
    }

    // 2. Authenticate with Firebase Auth
    const firebaseEmail = toEmail(targetUsername);
    let cred;

    try {
      cred = await signInWithEmailAndPassword(auth, firebaseEmail, cleanPass);
    } catch (err: any) {
      console.warn("Primary sign-in failed, checking secondary auth auto-provisioning fallback...", err);
      if (userProfile) {
        try {
          const secAuth = getSecondaryAuth();
          try {
            await secondaryCreate(secAuth, firebaseEmail, cleanPass);
          } catch (createErr: any) {
            if (createErr?.code === "auth/email-already-in-use") {
              try {
                const secCred = await secondarySignIn(secAuth, firebaseEmail, userProfile.password || cleanPass);
                if (secCred.user) {
                  await secondaryUpdate(secCred.user, cleanPass);
                }
              } catch {}
            }
          }
          await secondarySignOut(secAuth);
          cred = await signInWithEmailAndPassword(auth, firebaseEmail, cleanPass);
        } catch (fallbackErr) {
          throw new Error("Invalid username or password.");
        }
      } else {
        throw new Error("Invalid username or password.");
      }
    }

    // 3. Resolve Firestore profile doc strictly by authenticated Firebase UID
    const docId = cred.user.uid;
    let snap = await getDoc(doc(db, "users", docId));

    // If the profile document exists under an old random doc ID, copy/migrate it to the correct UID
    if (!snap.exists() && userDocSnap && userDocSnap.id !== docId) {
      const data = userDocSnap.data();
      await setDoc(doc(db, "users", docId), {
        ...data,
        uid: docId,
        userId: docId,
      });
      try {
        await deleteDoc(doc(db, "users", userDocSnap.id));
      } catch (delErr) {
        console.warn("Failed to clean up old mismatched seed user doc:", delErr);
      }
      snap = await getDoc(doc(db, "users", docId));
    }

    if (!snap.exists()) {
      throw new Error("User profile not found — contact admin.");
    }

    const profile = snap.data() as any;
    if (profile.status === "inactive" || profile.isActive === false) {
      await signOut(auth);
      throw new Error("Your account is inactive. Please contact the Administrator.");
    }

    _session = {
      uid: docId,
      username: profile.username,
      name: profile.fullName || profile.name || profile.username || "",
      role: profile.role,
      employeeId: profile.employeeId,
      ...profile
    } as StaffUser;

    // Start real-time snapshot listener on the migrated user profile document
    if (_userDocUnsub) {
      _userDocUnsub();
    }
    _userDocUnsub = onSnapshot(doc(db, "users", docId), (s) => {
      if (!s.exists()) {
        logout();
        return;
      }
      const uData = s.data();
      if (uData.status === "inactive" || uData.isActive === false) {
        toast.error("Your account has been deactivated by an administrator.");
        logout();
        return;
      }
      _session = {
        uid: docId,
        username: uData.username,
        name: uData.fullName || uData.name || uData.username || "",
        role: uData.role,
        employeeId: uData.employeeId,
        ...uData,
      } as StaffUser;
      _authCallbacks.forEach(cb => cb(_session));
    });

    _initialized = true;
    _authCallbacks.forEach(cb => cb(_session));
    window.dispatchEvent(new Event("auth-change"));
    return _session;
  } catch (err) {
    throw err;
  } finally {
    _isLoggingIn = false;
  }
}

/** Sign out the current user. */
export async function logout(): Promise<void> {
  await signOut(auth);
  _session = null;
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {}

  try {
    const { queryClient } = await import("@/router");
    queryClient.clear();
  } catch (err) {
    console.warn("Failed to clear query cache on logout:", err);
  }

  window.dispatchEvent(new Event("auth-change"));
}
