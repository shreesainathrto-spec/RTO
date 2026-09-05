// Targets — Firestore-backed target management for various service categories.
import {
  collection,
  query,
  getDocs,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  arrayUnion,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { createActivity, type ActivityLog } from "./activity";
import { removeUndefined } from "./records";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Target {
  id: string;
  category: string; // Used for UI compatibility, but now maps to service
  submodule: string; // services (Vahaan), insurance, licence, form5, driving_school
  service: string; // Service name/id
  period: string; // Monthly, Weekly, Yearly
  target: number;
  completed: number;
  startDate?: string;
  endDate?: string;
  color?: string;
  status?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
  activityLogs?: ActivityLog[];
}

// ─── Calculated fields ────────────────────────────────────────────────────────

export interface TargetMetrics extends Target {
  remaining: number;
  achievementPercentage: number;
}

/**
 * Calculate metrics for a target.
 */
export function calculateTargetMetrics(target: Target): TargetMetrics {
  const remaining = Math.max(0, target.target - target.completed);
  const achievementPercentage = target.target > 0 ? (target.completed / target.target) * 100 : 0;

  return {
    ...target,
    remaining,
    achievementPercentage: Math.round(achievementPercentage * 100) / 100,
  };
}

// ─── Period & Service matching helpers ────────────────────────────────────────

function isDateInPeriod(dateStr: string | undefined, period: string): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  const now = new Date();

  const p = period.toLowerCase();
  if (p === "daily") {
    return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  } else if (p === "monthly") {
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  } else if (p === "weekly") {
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    return date >= startOfWeek && date < endOfWeek;
  } else if (p === "yearly") {
    return date.getFullYear() === now.getFullYear();
  }
  return true;
}



function matchService(dbService: string | undefined, targetService: string): boolean {
  if (!dbService) return false;
  const dbNorm = dbService.trim().toLowerCase();
  const targetNorm = targetService.trim().toLowerCase();
  if (dbNorm === targetNorm) return true;

  // Handle common aliases/normalizations
  if (targetNorm === "rc transfer of ownership" || targetNorm === "rc transfer") {
    return dbNorm === "transfer of ownership" || dbNorm === "rc transfer" || dbNorm === "rc transfer of ownership";
  }
  if (targetNorm === "national permit (gujarat permit)") {
    return dbNorm === "national permit(gujrat permit)" || dbNorm === "national permit (gujarat permit)";
  }
  if (targetNorm === "national permit (gujarat permit) renewal") {
    return dbNorm === "national permit(gujrat permit) renewal" || dbNorm === "national permit (gujarat permit) renewal";
  }
  if (targetNorm === "dl new" || targetNorm === "license new") {
    return dbNorm === "license new" || dbNorm === "dl new";
  }
  if (targetNorm === "dl renew" || targetNorm === "license renew") {
    return dbNorm === "license renew" || dbNorm === "dl renew" || dbNorm === "license renewal";
  }
  if (targetNorm === "hypothecation continue" || targetNorm === "hypothecation continuation") {
    return dbNorm === "hypothecation continuation" || dbNorm === "hypothecation continue";
  }
  if (targetNorm === "vahaan rc sudharo vadhro" || targetNorm === "vahan correction") {
    return dbNorm === "vahan correction" || dbNorm === "vahaan rc sudharo vadhro";
  }

  return false;
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

const TARGETS_COLLECTION = "targets";

/**
 * Subscribe to all targets with live updates (with real completed counts).
 */
export function subscribeToTargets(callback: (targets: TargetMetrics[]) => void): () => void {
  let targetsList: Target[] = [];
  let servicesList: any[] = [];
  let applicationsList: any[] = [];
  let drivingSchoolList: any[] = [];

  const update = () => {
    const enrichedTargets = targetsList.map((target) => {
      const targetSubmodule = target.submodule || "services";
      const targetService = target.service || target.category || "";
      const targetPeriod = target.period || "Monthly";

      // Count completed/created from services collection
      const completedServices = servicesList.filter((s) => {
        const status = (s.taskStatus || s.status || "").toLowerCase();
        // Count all services except rejected/cancelled/deleted
        if (status === "rejected" || status === "cancelled" || s.isDeleted === true) return false;

        // Match submodule
        const dbSubmodule = s.subModule || "services";
        if (dbSubmodule.toLowerCase() !== targetSubmodule.toLowerCase()) return false;

        // Match service
        const dbService = s.serviceType || s.serviceName || "";
        if (!matchService(dbService, targetService)) return false;

        // Match period
        return isDateInPeriod(s.createdAt || s.updatedAt || s.date, targetPeriod);
      }).length;

      // Count completed/created from applications collection
      const completedApps = applicationsList.filter((app) => {
        const status = (app.applicationStatus || "").toLowerCase();
        // Count all applications except rejected/deleted
        if (status === "rejected" || app.isDeleted === true) return false;

        // Match submodule
        const dbSubmodule = app.subModule || "services";
        if (dbSubmodule.toLowerCase() !== targetSubmodule.toLowerCase()) return false;

        // Match service
        const appServices: string[] = Array.isArray(app.services)
          ? app.services
          : app.selectedServices
          ? (Array.isArray(app.selectedServices) ? app.selectedServices : [app.selectedServices])
          : [];
        
        const hasMatchingService = appServices.some(srv => matchService(srv, targetService));
        if (!hasMatchingService) return false;

        // Match period
        return isDateInPeriod(app.createdAt || app.updatedAt, targetPeriod);
      }).length;

      // Count completed/created from driving school collection
      const completedDriving = drivingSchoolList.filter((app) => {
        const status = (app.status || "").toLowerCase();
        // Count all except rejected/deleted
        if (status === "rejected" || app.isDeleted === true) return false;

        // Match submodule
        if (targetSubmodule.toLowerCase() !== "driving_school") return false;

        // Match service
        const appService = app.courseType || "Driving School Course";
        if (!matchService(appService, targetService)) return false;

        // Match period
        return isDateInPeriod(app.createdAt || app.updatedAt, targetPeriod);
      }).length;

      const totalCompleted = completedServices + completedApps + completedDriving;

      return {
        ...target,
        completed: totalCompleted,
      };
    });

    const metrics = enrichedTargets.map(calculateTargetMetrics);
    callback(metrics);
  };

  const unsubTargets = onSnapshot(query(collection(db, TARGETS_COLLECTION)), (snap) => {
    targetsList = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Target);
    update();
  });

  const unsubServices = onSnapshot(query(collection(db, "registry_services_v2")), (snap) => {
    servicesList = snap.docs.map((d) => d.data());
    update();
  });

  const unsubApps = onSnapshot(query(collection(db, "registry_applications_v1")), (snap) => {
    applicationsList = snap.docs.map((d) => d.data());
    update();
  });

  const unsubDriving = onSnapshot(query(collection(db, "DrivingSchoolApplications")), (snap) => {
    drivingSchoolList = snap.docs.map((d) => d.data());
    update();
  });

  return () => {
    unsubTargets();
    unsubServices();
    unsubApps();
    unsubDriving();
  };
}

/**
 * Create or initialize a target.
 */
export async function createOrInitializeTarget(
  submodule: string,
  service: string,
  period: string,
  targetValue: number,
  actor: string,
  extra?: Partial<Target>
): Promise<void> {
  const targetRef = doc(collection(db, TARGETS_COLLECTION));
  const activity = createActivity(actor, "Created", "target", "0", `${targetValue}`);

  await setDoc(
    targetRef,
    removeUndefined({
      category: service, // Map to category for backward compatibility
      submodule,
      service,
      period,
      target: targetValue,
      startDate: extra?.startDate,
      endDate: extra?.endDate,
      color: extra?.color,
      status: extra?.status ?? "Active",
      completed: 0,
      createdBy: actor,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUpdatedBy: actor,
      lastUpdatedAt: new Date().toISOString(),
      activityLogs: [activity],
    } as Target)
  );
}

/**
 * Update target value.
 */
export async function updateTargetValue(
  id: string,
  newTarget: number,
  actor: string,
  extra?: Partial<Target>
): Promise<void> {
  const targetRef = doc(db, TARGETS_COLLECTION, id);
  const snapshot = await getDoc(targetRef);

  if (!snapshot.exists()) {
    throw new Error("Target not found");
  }

  const currentTarget = snapshot.data().target;
  const activity = createActivity(actor, "Updated", "target", `${currentTarget}`, `${newTarget}`);

  await updateDoc(targetRef, removeUndefined({
    target: newTarget,
    startDate: extra?.startDate,
    endDate: extra?.endDate,
    color: extra?.color,
    status: extra?.status,
    lastUpdatedBy: actor,
    lastUpdatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activityLogs: arrayUnion(activity),
  }));
}

/**
 * Delete a target.
 */
export async function deleteTarget(id: string): Promise<void> {
  const targetRef = doc(db, TARGETS_COLLECTION, id);
  await deleteDoc(targetRef);
}

