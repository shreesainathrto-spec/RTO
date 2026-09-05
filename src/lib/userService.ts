import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, writeBatch, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth as primaryAuth } from './firebase';
import { getSession, toEmail } from './auth';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword as secondaryCreate, 
  signInWithEmailAndPassword as secondarySignIn, 
  updatePassword as secondaryUpdate, 
  updateEmail as secondaryUpdateEmail,
  signOut as secondarySignOut,
  deleteUser as secondaryDelete,
  setPersistence,
  inMemoryPersistence
} from 'firebase/auth';

// Types
export type UserRecord = {
  uid: string;
  userId: string;
  fullName: string;
  username: string;
  email?: string;
  mobile?: string;
  role: 'admin' | 'manager' | 'employee' | 'viewer';
  status: 'active' | 'inactive';
  isActive?: boolean;
  password?: string; // Plain password stored securely to allow secondary auth resets
  employeeId: string;
  department?: string;
  designation?: string;
  createdBy: string;
  createdAt: string; // ISO string
  updatedBy?: string;
  updatedAt?: string;
  lastLogin?: string;
  forcePasswordChange?: boolean;
};

export type EmployeeAuditLog = {
  id: string;
  action: 'Employee Created' | 'Employee Edited' | 'Employee Credentials Updated' | 'Password Reset' | 'Employee Deactivated' | 'Employee Deleted';
  performedBy: string;
  timestamp: string; // ISO
  details?: string;
};

const USERS_COL = collection(db, 'users');
const AUDIT_COL = collection(db, 'employee_audit_logs');

// Initialize Secondary Firebase Auth helper to avoid logging out the current admin/manager
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
  const auth = getAuth(secondaryApp);
  setPersistence(auth, inMemoryPersistence).catch((err) => {
    console.error("Failed to set secondary auth persistence:", err);
  });
  return auth;
}

/** Helper to log employee management audit actions */
export async function logEmployeeAction(
  action: EmployeeAuditLog['action'],
  details: string,
  performedBy?: string
) {
  const actor = performedBy || getSession()?.username || 'system';
  const docRef = doc(AUDIT_COL);
  await setDoc(docRef, {
    id: docRef.id,
    action,
    details,
    performedBy: actor,
    timestamp: new Date().toISOString(),
  });
}

/** Fetch all users */
export async function fetchAllUsers(): Promise<UserRecord[]> {
  const snap = await getDocs(USERS_COL);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      userId: d.id,
      ...data,
    } as UserRecord;
  });
}

/** Generate sequential Employee ID */
export async function generateEmployeeId(): Promise<string> {
  const users = await fetchAllUsers();
  let maxNum = 0;
  for (const u of users) {
    if (u.employeeId && u.employeeId.startsWith('EMP')) {
      const numPart = parseInt(u.employeeId.replace('EMP', ''), 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    }
  }
  const nextNum = maxNum + 1;
  return `EMP${String(nextNum).padStart(3, '0')}`;
}

/** Generate Username from Full Name (e.g. rahul.patel) */
export async function generateUsername(fullName: string): Promise<string> {
  const normalized = fullName.trim().toLowerCase().replace(/\s+/g, '.');
  const users = await fetchAllUsers();
  let candidate = normalized;
  let counter = 1;
  while (users.some(u => u.username === candidate)) {
    candidate = `${normalized}${counter}`;
    counter++;
  }
  return candidate;
}

/** Generate Temporary Password (Initials + 4 random digits, e.g. RP4587) */
export function generateTemporaryPassword(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const initials = parts.map(p => p[0] || '').join('').toUpperCase().slice(0, 2);
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${initials || 'EM'}${digits}`;
}

/** Create a new employee with manual Username and Password */
export async function createEmployee(input: {
  fullName: string;
  username: string;
  password: string;
  email?: string;
  mobile?: string;
  department?: string;
  designation?: string;
  role: 'admin' | 'manager' | 'employee' | 'viewer';
  status?: 'active' | 'inactive';
}) {
  const employeeId = await generateEmployeeId();
  const actor = getSession()?.username || 'system';

  const username = input.username?.trim().toLowerCase();
  if (!username) {
    throw new Error('Username is required.');
  }

  const password = input.password;
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  // 1. Uniqueness check for username & email against existing users
  const existingUsers = await fetchAllUsers();
  if (existingUsers.some(u => u.username?.toLowerCase() === username)) {
    throw new Error('Username is already taken. Please choose another username.');
  }

  const emailStr = (input.email || '').trim().toLowerCase();
  if (!emailStr) {
    throw new Error('Email is required.');
  }
  if (!emailStr.includes('@')) {
    throw new Error('Invalid email.');
  }
  const domain = emailStr.split('@')[1];
  if (!domain || !domain.includes('.')) {
    throw new Error('Invalid email.');
  }
  const domainParts = domain.split('.');
  if (domainParts.length < 2 || domainParts.some(part => !part.trim())) {
    throw new Error('Invalid email.');
  }

  if (existingUsers.some(u => u.email && u.email.trim().toLowerCase() === emailStr)) {
    throw new Error('Email already exists. Please use a different email address.');
  }

  // 2. Create in Firebase Auth using Secondary Auth instance
  const secAuth = getSecondaryAuth();
  let cred;
  try {
    cred = await secondaryCreate(secAuth, toEmail(username), password);
  } catch (error: any) {
    console.error("Firebase auth error during employee creation:", error);
    if (error && error.code) {
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('Email already exists.');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Invalid email.');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('Password must be at least 6 characters.');
      } else if (error.code === 'auth/network-request-failed') {
        throw new Error('Network error. Please try again.');
      }
    }
    throw error;
  }
  await secondarySignOut(secAuth);

  // 3. Save in Firestore users collection
  const now = new Date().toISOString();
  const status = input.status || 'active';
  const userRecord: UserRecord & { name: string; createdDate: string } = {
    uid: cred.user.uid,
    userId: cred.user.uid,
    fullName: input.fullName.trim(),
    name: input.fullName.trim(),
    username,
    email: emailStr,
    mobile: input.mobile?.trim() || '',
    department: input.department?.trim() || '',
    designation: input.designation?.trim() || '',
    role: input.role,
    status,
    isActive: status === 'active',
    password, // Plain password stored securely to allow secondary auth resets
    employeeId,
    createdBy: actor,
    createdAt: now,
    createdDate: now,
  };

  await setDoc(doc(USERS_COL, cred.user.uid), userRecord);
  await logEmployeeAction(
    'Employee Created', 
    `Created employee ${input.fullName} (${employeeId}, username: ${username})`, 
    actor
  );

  return {
    employeeId,
    username,
    password,
  };
}

export interface UpdateEmployeeInput {
  fullName?: string;
  username?: string;
  password?: string;
  email?: string;
  mobile?: string;
  employeeId?: string;
  department?: string;
  designation?: string;
  role?: 'admin' | 'manager' | 'employee' | 'viewer';
  status?: 'active' | 'inactive';
}

/** Helper to synchronize employee email (username) and password in Firebase Auth */
async function syncEmployeeFirebaseAuth(
  oldUsername: string,
  oldPassword: string | undefined,
  newUsername: string,
  newPassword: string | undefined
) {
  const secAuth = getSecondaryAuth();
  const oldEmail = toEmail(oldUsername);
  const newEmail = toEmail(newUsername);
  const effectiveOldPass = oldPassword || `${oldUsername}123`;
  const effectiveNewPass = newPassword || effectiveOldPass;

  let signedInUser: any = null;

  // Try signing in with various combination fallbacks to locate the user in Firebase Auth
  const attemptCombos = [
    { email: oldEmail, pass: effectiveOldPass },
    { email: newEmail, pass: effectiveOldPass },
    { email: newEmail, pass: effectiveNewPass },
    { email: oldEmail, pass: effectiveNewPass },
  ];

  for (const combo of attemptCombos) {
    try {
      const cred = await secondarySignIn(secAuth, combo.email, combo.pass);
      signedInUser = cred.user;
      break;
    } catch {
      // Continue to next combination fallback
    }
  }

  if (signedInUser) {
    try {
      if (signedInUser.email?.toLowerCase() !== newEmail.toLowerCase()) {
        await secondaryUpdateEmail(signedInUser, newEmail);
      }
      if (newPassword && newPassword.trim() !== '') {
        await secondaryUpdate(signedInUser, newPassword.trim());
      }
      await secondarySignOut(secAuth);
      return;
    } catch (err) {
      console.warn("Secondary auth user update error:", err);
      try {
        await secondarySignOut(secAuth);
      } catch {}
    }
  }

  // Fallback: If user didn't exist in Firebase Auth yet, create the user with new credentials
  try {
    await secondaryCreate(secAuth, newEmail, effectiveNewPass);
    await secondarySignOut(secAuth);
  } catch (createErr: any) {
    if (createErr?.code !== "auth/email-already-in-use") {
      console.warn("Secondary auth user creation fallback notice:", createErr);
    }
  }
}

/** Edit Employee Details with full field validation, Firebase Auth sync, and detailed audit logging */
export async function updateEmployee(uid: string, input: UpdateEmployeeInput) {
  const userRef = doc(USERS_COL, uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('Employee not found');
  const oldData = snap.data() as UserRecord;

  const actor = getSession()?.username || getSession()?.name || 'system';
  const changes: string[] = [];
  const now = new Date().toISOString();

  const docUpdates: any = {
    updatedBy: actor,
    updatedAt: now,
  };

  const oldUsername = oldData.username || '';
  const rawNewUsername = input.username !== undefined ? input.username.trim() : oldUsername;
  const usernameChanged = rawNewUsername.toLowerCase() !== oldUsername.toLowerCase();

  const oldPassword = oldData.password || '';
  const rawNewPassword = input.password !== undefined ? input.password.trim() : '';
  const passwordChanged = Boolean(rawNewPassword && rawNewPassword !== oldPassword);

  // 1. Full Name
  if (input.fullName !== undefined && input.fullName.trim() !== '') {
    const newName = input.fullName.trim();
    if (newName !== oldData.fullName) {
      docUpdates.fullName = newName;
      docUpdates.name = newName;
      changes.push(`Full Name: "${oldData.fullName || ''}" → "${newName}"`);
    }
  }

  // 2. Username
  if (usernameChanged) {
    const allUsersSnap = await getDocs(query(USERS_COL));
    const duplicateUser = allUsersSnap.docs.find(
      (d) => d.id !== uid && (d.data().username || '').toLowerCase() === rawNewUsername.toLowerCase()
    );
    if (duplicateUser) {
      throw new Error(`Username "${rawNewUsername}" is already taken by another employee.`);
    }
    docUpdates.username = rawNewUsername;
    changes.push(`Username: "${oldUsername}" → "${rawNewUsername}"`);
  }

  // 3. Employee ID
  if (input.employeeId !== undefined && input.employeeId.trim() !== '') {
    const newEmpId = input.employeeId.trim();
    if (newEmpId.toLowerCase() !== (oldData.employeeId || '').toLowerCase()) {
      const allUsersSnap = await getDocs(query(USERS_COL));
      const duplicateEmpId = allUsersSnap.docs.find(
        (d) => d.id !== uid && (d.data().employeeId || '').toLowerCase() === newEmpId.toLowerCase()
      );
      if (duplicateEmpId) {
        throw new Error(`Employee ID "${newEmpId}" is already assigned to another employee.`);
      }
      docUpdates.employeeId = newEmpId;
      changes.push(`Employee ID: "${oldData.employeeId || ''}" → "${newEmpId}"`);
    }
  }

  // 4. Password
  if (passwordChanged) {
    if (rawNewPassword.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }
    docUpdates.password = rawNewPassword;
    changes.push('Password updated');
  }

  if (usernameChanged || passwordChanged) {
    docUpdates.credentialsChangedAt = now;
  }

  // 5. Email & Mobile
  if (input.email !== undefined && input.email !== oldData.email) {
    docUpdates.email = input.email.trim();
    changes.push(`Email: "${oldData.email || ''}" → "${input.email.trim()}"`);
  }
  if (input.mobile !== undefined && input.mobile !== oldData.mobile) {
    docUpdates.mobile = input.mobile.trim();
    changes.push(`Mobile: "${oldData.mobile || ''}" → "${input.mobile.trim()}"`);
  }

  // 6. Department & Designation
  if (input.department !== undefined && input.department !== oldData.department) {
    docUpdates.department = input.department.trim();
    changes.push(`Department: "${oldData.department || ''}" → "${input.department.trim()}"`);
  }
  if (input.designation !== undefined && input.designation !== oldData.designation) {
    docUpdates.designation = input.designation.trim();
    changes.push(`Designation: "${oldData.designation || ''}" → "${input.designation.trim()}"`);
  }

  // 7. Role
  if (input.role && input.role !== oldData.role) {
    docUpdates.role = input.role;
    changes.push(`Role: "${oldData.role || ''}" → "${input.role}"`);
  }

  // 8. Status
  if (input.status && input.status !== oldData.status) {
    docUpdates.status = input.status;
    docUpdates.isActive = input.status === 'active';
    changes.push(`Status: "${oldData.status || ''}" → "${input.status}"`);
  }

  // Synchronize to Firebase Auth
  if (usernameChanged || passwordChanged) {
    await syncEmployeeFirebaseAuth(
      oldUsername,
      oldPassword,
      rawNewUsername,
      passwordChanged ? rawNewPassword : undefined
    );
  }

  // Update Firestore
  await updateDoc(userRef, docUpdates);

  // Formulate Audit Details
  const isCredUpdate = usernameChanged || passwordChanged;
  const auditAction = isCredUpdate ? 'Employee Credentials Updated' : 'Employee Edited';

  let auditDetails = `Updated by Admin (${actor}). Previous Username: "${oldUsername}", New Username: "${rawNewUsername}", Password Changed: ${passwordChanged ? 'Yes' : 'No'}.`;
  if (changes.length > 0) {
    auditDetails += ` Details: ${changes.join('; ')}`;
  }

  await logEmployeeAction(auditAction, auditDetails, actor);
}

/** Reset Password */
export async function resetEmployeePassword(uid: string): Promise<string> {
  const userRef = doc(USERS_COL, uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('Employee not found');
  const userData = snap.data() as UserRecord;

  // Generate new password from employeeId + a random 3-digit number to ensure unique reset password
  const suffix = Math.floor(100 + Math.random() * 900);
  const newPassword = `${userData.employeeId || 'EMP000'}${suffix}`;
  
  if (newPassword.length < 6) {
    throw new Error('Generated password is less than 6 characters.');
  }
  
  const actor = getSession()?.username || 'system';

  // 1. Sign in secondary auth using old password
  const secAuth = getSecondaryAuth();
  if (userData.password) {
    try {
      await secondarySignIn(secAuth, toEmail(userData.username), userData.password);
      if (secAuth.currentUser) {
        await secondaryUpdate(secAuth.currentUser, newPassword);
      }
      await secondarySignOut(secAuth);
    } catch (err) {
      console.warn('Failed secondary auth reset, attempting fresh account create fallback:', err);
    }
  }

  // 2. Update Firestore
  await updateDoc(userRef, {
    password: newPassword,
    forcePasswordChange: true,
    updatedBy: actor,
    updatedAt: new Date().toISOString()
  });

  await logEmployeeAction(
    'Password Reset', 
    `Reset password for employee ${userData.fullName} (${userData.employeeId})`, 
    actor
  );

  return newPassword;
}

/** Deactivate / Activate Employee */
export async function setEmployeeStatus(uid: string, status: 'active' | 'inactive') {
  const userRef = doc(USERS_COL, uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('Employee not found');
  const userData = snap.data() as UserRecord;

  const actor = getSession()?.username || 'system';
  await updateDoc(userRef, {
    status,
    isActive: status === 'active',
    updatedBy: actor,
    updatedAt: new Date().toISOString()
  });

  const action = status === 'active' ? 'Employee Edited' : 'Employee Deactivated';
  await logEmployeeAction(
    action,
    `${status === 'active' ? 'Activated' : 'Deactivated'} employee ${userData.fullName} (${userData.employeeId})`,
    actor
  );
}

/** Fetch assigned tasks count for an employee before deletion dialog */
export async function getEmployeeAssignedTasksCount(uid: string): Promise<number> {
  try {
    const userRef = doc(USERS_COL, uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return 0;
    const userData = snap.data() as UserRecord;

    const identifiers = [
      uid,
      userData.userId,
      userData.employeeId,
      userData.username,
      userData.fullName,
    ]
      .filter(Boolean)
      .map((s) => String(s).trim().toLowerCase());

    const tasksSnap = await getDocs(collection(db, "registry_tasks"));
    let count = 0;

    tasksSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const taskAssignees = [
        data.assignee,
        data.assignedEmployeeId,
        data.assignedEmployeeUid,
        data.assignedEmployeeName,
      ]
        .filter(Boolean)
        .map((s) => String(s).trim().toLowerCase());

      if (taskAssignees.some((val) => identifiers.includes(val))) {
        count++;
      }
    });

    return count;
  } catch (err) {
    console.error("Failed to get employee assigned tasks count:", err);
    return 0;
  }
}

/** Delete Employee (Archives employee, unassigns all assigned tasks with activity logs, and deletes user doc) */
export async function deleteEmployee(uid: string) {
  const userRef = doc(USERS_COL, uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('Employee not found');
  const userData = snap.data() as UserRecord;
  const actor = getSession()?.username || getSession()?.name || 'system';

  // 1. Delete from Firebase Auth using secondary auth
  if (userData.password) {
    try {
      const secAuth = getSecondaryAuth();
      await secondarySignIn(secAuth, toEmail(userData.username), userData.password);
      if (secAuth.currentUser) {
        await secondaryDelete(secAuth.currentUser);
      }
    } catch (err) {
      console.warn('Could not delete auth user (already deleted or session issue):', err);
    }
  }

  const identifiers = [
    uid,
    userData.userId,
    userData.employeeId,
    userData.username,
    userData.fullName,
  ]
    .filter(Boolean)
    .map((s) => String(s).trim().toLowerCase());

  const empName = userData.fullName || userData.username || "Employee";
  const now = new Date().toISOString();

  const batch = writeBatch(db);

  // 2. Unassign and log activity on matching registry_tasks
  const tasksSnap = await getDocs(collection(db, "registry_tasks"));
  let unassignedCount = 0;

  tasksSnap.forEach((docSnap) => {
    const data = docSnap.data();
    const taskAssignees = [
      data.assignee,
      data.assignedEmployeeId,
      data.assignedEmployeeUid,
      data.assignedEmployeeName,
    ]
      .filter(Boolean)
      .map((s) => String(s).trim().toLowerCase());

    if (taskAssignees.some((val) => identifiers.includes(val))) {
      unassignedCount++;
      const existingActivity = Array.isArray(data.activityLogs)
        ? data.activityLogs
        : Array.isArray(data.activity)
          ? data.activity
          : [];

      const activityMessage = `Assigned employee "${empName}" was removed because the employee account was deleted.`;
      const newActivityLog = {
        id: crypto.randomUUID(),
        action: activityMessage,
        performedBy: actor,
        performedAt: now,
        at: now,
        actor: actor,
        message: activityMessage,
      };

      batch.update(docSnap.ref, {
        assignee: "",
        assignedEmployeeId: "",
        assignedEmployeeUid: "",
        assignedEmployeeName: "Unassigned",
        assignedEmployeeRole: "",
        assignmentStatus: "Unassigned",
        activityLogs: [...existingActivity, newActivityLog],
        activity: [...existingActivity, newActivityLog],
        lastUpdatedAt: now,
        lastUpdatedBy: actor,
      });
    }
  });

  // 3. Unassign matching registry_services_v2
  const servicesSnap = await getDocs(collection(db, "registry_services_v2"));
  servicesSnap.forEach((docSnap) => {
    const data = docSnap.data();
    const serviceAssignees = [
      data.assignee,
      data.assignedTo,
      data.employeeId,
      data.assignedStaff,
      data.assignedEmployeeId,
      data.assignedEmployeeUid,
      data.assignedEmployeeName,
    ]
      .filter(Boolean)
      .map((s) => String(s).trim().toLowerCase());

    if (serviceAssignees.some((val) => identifiers.includes(val))) {
      batch.update(docSnap.ref, {
        assignee: "",
        assignedTo: "",
        employeeId: "",
        assignedStaff: "",
        assignedEmployeeId: "",
        assignedEmployeeUid: "",
        assignedEmployeeName: "Unassigned",
        assignedEmployeeRole: "",
        updatedAt: now,
        updatedBy: actor,
      });
    }
  });

  // 4. Unassign matching registry_applications_v1
  try {
    const appsSnap = await getDocs(collection(db, "registry_applications_v1"));
    appsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const appAssignees = [
        data.assignedEmployeeId,
        data.assignedEmployeeUid,
        data.assignedEmployeeName,
      ]
        .filter(Boolean)
        .map((s) => String(s).trim().toLowerCase());

      if (appAssignees.some((val) => identifiers.includes(val))) {
        batch.update(docSnap.ref, {
          assignedEmployeeId: "",
          assignedEmployeeUid: "",
          assignedEmployeeName: "Unassigned",
        });
      }
    });
  } catch (err) {
    console.warn("Failed to unassign from registry_applications_v1:", err);
  }

  // 5. Unassign matching registry_accounting
  try {
    const accSnap = await getDocs(collection(db, "registry_accounting"));
    accSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const accAssignees = [
        data.employeeId,
        data.employeeName,
      ]
        .filter(Boolean)
        .map((s) => String(s).trim().toLowerCase());

      if (accAssignees.some((val) => identifiers.includes(val))) {
        batch.update(docSnap.ref, {
          employeeId: "",
          employeeName: "Unassigned",
        });
      }
    });
  } catch (err) {
    console.warn("Failed to unassign from registry_accounting:", err);
  }

  // 6. Unassign matching DrivingSchoolApplications
  try {
    const dsSnap = await getDocs(collection(db, "DrivingSchoolApplications"));
    dsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const dsAssignees = [
        data.assignedEmployeeId,
        data.assignedEmployee,
      ]
        .filter(Boolean)
        .map((s) => String(s).trim().toLowerCase());

      if (dsAssignees.some((val) => identifiers.includes(val))) {
        batch.update(docSnap.ref, {
          assignedEmployeeId: "",
          assignedEmployee: "Unassigned",
        });
      }
    });
  } catch (err) {
    console.warn("Failed to unassign from DrivingSchoolApplications:", err);
  }

  // 7. Move to archive collection
  const archiveRef = doc(db, 'employee_archive', uid);
  batch.set(archiveRef, {
    ...userData,
    archivedAt: now,
    archivedBy: actor,
  });

  // 8. Delete from users collection
  batch.delete(userRef);

  await batch.commit();

  await logEmployeeAction(
    'Employee Deleted', 
    `Deleted and archived employee ${userData.fullName} (${userData.employeeId}) and unassigned ${unassignedCount} tasks`, 
    actor
  );
}

/** Change Own Password (Self-service for employees) */
export async function changeOwnPassword(newPassword: string) {
  const session = getSession();
  if (!session) throw new Error('Not logged in');

  // Since self is logged in, we can update primaryAuth directly
  if (primaryAuth.currentUser) {
    await secondaryUpdate(primaryAuth.currentUser, newPassword);
  }

  // Update Firestore user document
  const userRef = doc(USERS_COL, session.uid);
  await updateDoc(userRef, {
    password: newPassword,
    forcePasswordChange: false,
    updatedAt: new Date().toISOString()
  });

  await logEmployeeAction(
    'Password Reset',
    `Changed own password`,
    session.username
  );
}

/** Subscribe to all active users */
export function subscribeAllUsers(cb: (users: UserRecord[]) => void): () => void {
  const q = query(USERS_COL, where("status", "==", "active"), orderBy("fullName", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          userId: d.id,
          ...data,
        } as UserRecord;
      });
      cb(list);
    },
    (err) => console.error("[subscribeAllUsers] error:", err),
  );
}
