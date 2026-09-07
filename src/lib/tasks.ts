// Tasks — Firestore-backed task management.
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  getDocs,
  getDoc,
  arrayUnion,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { saveRecord, type Bucket, type RegistryRecord, type DeleteReason } from "./records";
import { createActivity, logClientActivity, type ActivityLog } from "./activity";
import { toast } from "sonner";
import { invalidateCache } from "./cacheInvalidator";
import { getProgressFromStatus } from "./hierarchy";
import { transformDataObject } from "./capitalize-settings";

export function handleFirestoreError(err: any, context: string) {
  console.error(`[Firestore Error: ${context}]`, err);
  if (err && (err.code === "failed-precondition" || err.message?.includes("index"))) {
    toast.error("Database index is being prepared. Please try again shortly.");
  }
}


// ─── Re-exports ──────────────────────────────────────────────────────────────
export type { DeleteReason };

export type TaskStatus = "Assigned" | "Read" | "In Progress" | "Completed" | "On Hold" | "READ" | "IN PROGRESS" | "ON HOLD" | "COMPLETED";
export type TaskPriority = "Low" | "Medium" | "High" | "Urgent";
export type AssociationType = "client" | "lead" | "none";

export interface TaskComment {
  id: string;
  author: string;
  text: string;
  at: string;
}

export interface TaskActivity {
  id: string;
  at: string;
  actor: string;
  message: string;
}

export interface TaskAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  storageKey: string; // Firebase Storage path
  downloadUrl: string;
  addedAt: string;
  addedBy: string;
}

export interface SubtaskRemark {
  id: string;
  text: string;
  author: string;
  at: string;
}

export interface TaskSubtask {
  id: string;
  title: string;
  completed: boolean;
  status?: string;
  assignedTo?: string;
  dueDate?: string;
  completedBy?: string;
  completedOn?: string;
  completedAt?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  remarks?: SubtaskRemark[];
}

export interface Task {
  id: string;
  title: string;
  serviceName?: string;
  description?: string;
  assignee: string;
  status: TaskStatus;
  priority: TaskPriority;
  done: boolean;
  createdAt: string;
  createdBy: string;
  dueDate?: string;
  reminderMinutes?: number;
  associationType: AssociationType;
  recordId?: string;
  vehicleId?: string;
  bucket?: Bucket;
  manual: boolean;
  readBy?: string;
  readAt?: string;
  acknowledged?: boolean;
  subtasks?: TaskSubtask[];
  progress?: number;
  comments?: TaskComment[];
  activity?: TaskActivity[];
  attachments?: TaskAttachment[];
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
  activityLogs?: ActivityLog[];
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: DeleteReason;
  templateId?: string;
  lastRemark?: string;
  lastRemarkBy?: string;
  lastRemarkAt?: string;
  // New fields for enterprise task management
  taskId?: string;
  clientId?: string;
  clientName?: string;
  serviceType?: string;
  assignedEmployeeId?: string;
  assignedEmployeeUid?: string;
  assignedEmployeeName?: string;
  assignedEmployeeRole?: string;
  createdDate?: string;
  remarks?: string;
  appointmentDate?: string;
  applicationId?: string;
  applicationType?: string;
  serviceId?: string;
  activityLog?: any[];
  holdReason?: string;
  holdRemarks?: string;
  rtoExpense?: number;
  issueDate?: string;
  reference?: string;
  vehicleNumber?: string;
  applicationDocId?: string;
  subModule?: string;
  parentApplicationId?: string;
  holdDate?: string;
  phone?: string;
  mobileNumber?: string;
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

const COL = "registry_tasks";

/**
 * CRITICAL: Remove all undefined values from objects and arrays recursively.
 * Firestore does NOT allow undefined values, even in nested objects or arrays.
 * This utility ensures data is safe to send to Firestore.
 */
export function removeUndefined<T>(obj: T): T {
  // Handle arrays: filter out undefined items and recurse
  if (Array.isArray(obj)) {
    return obj.filter((item) => item !== undefined).map((item) => removeUndefined(item)) as T;
  }

  // Handle objects: filter out undefined properties and recurse
  if (obj && typeof obj === "object" && obj.constructor === Object) {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)]),
    ) as T;
  }

  // Return primitives and other types as-is
  return obj;
}

function normalizeTaskIdentityValue(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

export function isTaskAssignedToUser(
  task: Task,
  user?: { uid?: string; employeeId?: string; username?: string; name?: string; fullName?: string } | null,
): boolean {
  if (!user) return false;

  const userIdentities = [
    user.uid,
    user.employeeId,
    user.username,
    user.name,
    user.fullName,
  ]
    .map((v) => normalizeTaskIdentityValue(v))
    .filter(Boolean);

  const taskIdentities = [
    task.assignedEmployeeId,
    (task as any).assignedEmployeeUid,
    task.assignee,
    task.assignedEmployeeName,
  ]
    .map((v) => normalizeTaskIdentityValue(v))
    .filter(Boolean);

  if (taskIdentities.length === 0) return false;
  if (taskIdentities.some((id) => id === "unassigned" || id === "former employee")) return false;

  return userIdentities.some((uId) => taskIdentities.includes(uId));
}

export function taskMatchesClient(
  task: Pick<Task, "recordId" | "clientId" | "clientName">,
  clientId?: string,
  clientName?: string,
): boolean {
  const targetValues = [clientId, clientName]
    .map((value) => normalizeTaskIdentityValue(value))
    .filter(Boolean);

  const taskValues = [task.recordId, task.clientId, task.clientName]
    .map((value) => normalizeTaskIdentityValue(value))
    .filter(Boolean);

  return targetValues.some((value) => taskValues.includes(value));
}

function activityEntry(actor: string, message: string): TaskActivity {
  return { id: crypto.randomUUID(), at: new Date().toISOString(), actor, message };
}

/**
 * Calculate task progress based on completed subtasks.
 */
export function calculateProgress(subtasks: TaskSubtask[]): number {
  if (!subtasks.length) return 0;
  const completed = subtasks.filter((s) => s.completed).length;
  return Math.round((completed / subtasks.length) * 100);
}

/**
 * Update subtasks and recalculate progress.
 * If all subtasks are completed, mark task as completed.
 */
export async function updateSubtasks(
  taskId: string,
  subtasks: TaskSubtask[],
  actor: string,
): Promise<void> {
  const { getDoc } = await import("firebase/firestore");
  let taskDoc = await getDoc(doc(db, COL, taskId));
  let isService = false;
  
  if (!taskDoc.exists()) {
    taskDoc = await getDoc(doc(db, "registry_services_v2", taskId));
    if (!taskDoc.exists()) throw new Error("Task not found");
    isService = true;
  }

  const task = taskDoc.data() as Task;
  const progress = calculateProgress(subtasks);
  const isCompleted = progress === 100 && subtasks.length > 0;
  const now = new Date().toISOString();
  
  // Create default activity entry
  let entry = activityEntry(actor, "Updated subtasks");
  let actLog = createActivity(actor, "Updated subtasks");

  const cleanLog = removeUndefined(actLog);
  const updates: any = {
    subtasks,
    progress,
    lastUpdatedBy: actor,
    lastUpdatedAt: now,
    activity: arrayUnion(entry),
    activityLogs: arrayUnion(cleanLog),
  };

  if (isCompleted) {
    updates.status = "Completed";
    updates.done = true;
    updates.completedBy = actor;
    updates.completedAt = now;
  } else {
    updates.status = "In Progress";
    updates.done = false;
  }

  const cleanUpdates = removeUndefined(updates);

  if (isService) {
    if (cleanUpdates.status !== undefined) {
      cleanUpdates.taskStatus = cleanUpdates.status;
    }
    const existingActivity = task.activity || [];
    const existingActivityLogs = task.activityLogs || [];
    cleanUpdates.activity = [...existingActivity, entry];
    cleanUpdates.activityLogs = [...existingActivityLogs, cleanLog];
    await updateDoc(doc(db, "registry_services_v2", taskId), cleanUpdates);
  } else {
    await updateDoc(doc(db, COL, taskId), cleanUpdates);
  }

  // Sync to parent application if it exists
  const appDocId = task.recordId || task.clientId || task.parentApplicationId || task.applicationDocId;
  if (appDocId) {
    try {
      const appRef = doc(db, "registry_applications_v1", appDocId);
      const appSnap = await getDoc(appRef);
      if (appSnap.exists()) {
        await updateDoc(appRef, {
          applicationStatus: isCompleted ? "Approved" : "In Progress",
          updatedAt: now,
        });
      } else {
        const dsRef = doc(db, "DrivingSchoolApplications", appDocId);
        const dsSnap = await getDoc(dsRef);
        if (dsSnap.exists()) {
          await updateDoc(dsRef, {
            status: isCompleted ? "Completed" : "Active",
            updatedAt: now,
          });
        }
      }
    } catch (e) {
      console.warn("Failed to sync parent application status:", e);
    }
  }
}

/**
 * Toggle a subtask's completion status and auto-update task progress.
 */
export async function toggleSubtask(
  taskId: string,
  subtaskId: string,
  actor: string,
): Promise<void> {
  console.log("🔄 Toggling subtask:", subtaskId, "in task:", taskId);

  // Fetch current task to get all subtasks
  const { getDoc } = await import("firebase/firestore");
  let taskDoc = await getDoc(doc(db, COL, taskId));
  let isService = false;
  
  if (!taskDoc.exists()) {
    taskDoc = await getDoc(doc(db, "registry_services_v2", taskId));
    if (!taskDoc.exists()) throw new Error("Task not found");
    isService = true;
  }

  const task = taskDoc.data() as Task;
  const subtasks = task.subtasks ?? [];
  const subtask = subtasks.find((s) => s.id === subtaskId);
  if (!subtask) throw new Error("Subtask not found");

  // Toggle completion
  subtask.completed = !subtask.completed;
  const wasCompleted = subtask.completed;

  // Recalculate progress
  const progress = calculateProgress(subtasks);
  const isCompleted = progress === 100 && subtasks.length > 0;

  // Determine activity message
  const message = wasCompleted
    ? `Completed subtask: ${subtask.title}`
    : `Reopened subtask: ${subtask.title}`;
  const entry = activityEntry(actor, message);
  const actLog = createActivity(actor, message, "subtask", "", subtask.title);

  // Update with new status logic
  const updates: any = {
    subtasks,
    progress,
    lastUpdatedBy: actor,
    lastUpdatedAt: new Date().toISOString(),
    activity: arrayUnion(entry),
    activityLogs: arrayUnion(actLog),
  };

  // Mark as Completed if progress is 100%
  if (isCompleted) {
    updates.status = "Completed";
    updates.done = true;
    updates.completedBy = actor;
    updates.completedAt = new Date().toISOString();
  } else {
    updates.status = "In Progress";
    updates.done = false;
  }

  try {
    const cleanLog = removeUndefined(actLog);
    const cleanUpdates = removeUndefined({
      ...updates,
      activityLogs: arrayUnion(cleanLog),
    });
    console.log("🔄 toggleSubtask raw:", { updates, actLog });
    console.log("🔄 toggleSubtask clean:", cleanUpdates);

    if (isService) {
      if (cleanUpdates.status !== undefined) {
        cleanUpdates.taskStatus = cleanUpdates.status;
      }
      const existingActivity = task.activity || [];
      const existingActivityLogs = task.activityLogs || [];
      cleanUpdates.activity = [...existingActivity, entry];
      cleanUpdates.activityLogs = [...existingActivityLogs, cleanLog];
      await updateDoc(doc(db, "registry_services_v2", taskId), cleanUpdates);
    } else {
      await updateDoc(doc(db, COL, taskId), cleanUpdates);
    }
    // Sync to parent application if it exists
    const appDocId = task.recordId || task.clientId || task.parentApplicationId || task.applicationDocId;
    if (appDocId) {
      try {
        const appRef = doc(db, "registry_applications_v1", appDocId);
        const appSnap = await getDoc(appRef);
        if (appSnap.exists()) {
          await updateDoc(appRef, {
            applicationStatus: isCompleted ? "Approved" : "In Progress",
            updatedAt: new Date().toISOString(),
          });
        } else {
          const dsRef = doc(db, "DrivingSchoolApplications", appDocId);
          const dsSnap = await getDoc(dsRef);
          if (dsSnap.exists()) {
            await updateDoc(dsRef, {
              status: isCompleted ? "Completed" : "Active",
              updatedAt: new Date().toISOString(),
            });
          }
        }
      } catch (e) {
        console.warn("Failed to sync parent application status in toggleSubtask:", e);
      }
    }
    console.log("✅ Subtask toggled successfully, progress:", progress);
  } catch (error) {
    console.error("❌ Failed to toggle subtask:", error);
    throw error;
  }
}

/**
 * Add a new subtask to a task.
 */
export async function addSubtask(taskId: string, title: string, actor: string): Promise<void> {
  console.log("➕ Adding subtask to task:", taskId, "title:", title);

  const { getDoc } = await import("firebase/firestore");
  let taskDoc = await getDoc(doc(db, COL, taskId));
  let isService = false;
  
  if (!taskDoc.exists()) {
    taskDoc = await getDoc(doc(db, "registry_services_v2", taskId));
    if (!taskDoc.exists()) throw new Error("Task not found");
    isService = true;
  }

  const task = taskDoc.data() as Task;
  const subtasks = task.subtasks ?? [];

  const newSubtask: TaskSubtask = {
    id: crypto.randomUUID(),
    title,
    completed: false,
  };

  subtasks.push(newSubtask);

  const entry = activityEntry(actor, `Added subtask: ${title}`);
  const actLog = createActivity(actor, `Added subtask`, "subtask", "", title);

  const now = new Date().toISOString();
  try {
    const cleanLog = removeUndefined(actLog);
    const updates = removeUndefined({
      subtasks,
      lastUpdatedBy: actor,
      lastUpdatedAt: now,
      activity: arrayUnion(entry),
      activityLogs: arrayUnion(cleanLog),
    });

    if (isService) {
      const existingActivity = task.activity || [];
      const existingActivityLogs = task.activityLogs || [];
      (updates as any).activity = [...existingActivity, entry];
      (updates as any).activityLogs = [...existingActivityLogs, cleanLog];
      await updateDoc(doc(db, "registry_services_v2", taskId), updates as any);
    } else {
      await updateDoc(doc(db, COL, taskId), updates);
    }
    console.log("✅ Subtask added successfully");
  } catch (error) {
    console.error("❌ Failed to add subtask:", error);
    throw error;
  }
}

/**
 * Reassign task to a different staff member.
 */
export async function reassignTask(
  taskId: string,
  newAssignee: string,
  actor: string,
): Promise<void> {
  const { getDoc } = await import("firebase/firestore");
  let taskDoc = await getDoc(doc(db, COL, taskId));
  let isService = false;
  
  if (!taskDoc.exists()) {
    taskDoc = await getDoc(doc(db, "registry_services_v2", taskId));
    if (!taskDoc.exists()) throw new Error("Task not found");
    isService = true;
  }

  const task = taskDoc.data() as Task;
  const prevAssignee = task.assignee;

  const assigneeInfo = await resolveAssigneeIdentity(newAssignee);
  const newAssigneeId = assigneeInfo.assignedEmployeeId || newAssignee;
  const newAssigneeName = assigneeInfo.assignedEmployeeName || newAssignee;

  const message =
    actor === newAssignee
      ? `Task taken over by ${actor}`
      : `Task reassigned from ${prevAssignee} to ${newAssigneeName}`;

  const entry = activityEntry(actor, message);
  const actLog = createActivity(actor, message, "assignee", prevAssignee, newAssigneeName);

  const now = new Date().toISOString();
  const cleanLog = removeUndefined(actLog);
  const updates = removeUndefined({
    assignee: assigneeInfo.assignee,
    assignedEmployeeId: newAssigneeId,
    assignedEmployeeName: newAssigneeName,
    lastUpdatedBy: actor,
    lastUpdatedAt: now,
    activity: arrayUnion(entry),
    activityLogs: arrayUnion(cleanLog),
  });

  if (isService) {
    (updates as any).assignedTo = assigneeInfo.assignee;
    (updates as any).employeeId = newAssigneeId;
    (updates as any).assignedStaff = assigneeInfo.assignee;
    const existingActivity = task.activity || [];
    const existingActivityLogs = task.activityLogs || [];
    (updates as any).activity = [...existingActivity, entry];
    (updates as any).activityLogs = [...existingActivityLogs, cleanLog];
    await updateDoc(doc(db, "registry_services_v2", taskId), updates as any);
  } else {
    await updateDoc(doc(db, COL, taskId), updates);
  }

  // Send reassignment notification to the new assignee
  if (newAssigneeId && newAssigneeId !== prevAssignee) {
    try {
      const { sendTaskAssignmentNotification } = await import("./notifications");
      await sendTaskAssignmentNotification({
        taskId,
        title: task.title,
        serviceName: task.serviceName || (task as any).serviceType || task.title,
        vehicleNumber: task.vehicleId || (task as any).vehicleNumber || "",
        applicationId: task.applicationId || "",
        applicationDocId: (task as any).applicationDocId || task.recordId || "",
        subModule: (task as any).subModule || "services",
        assignedEmployeeId: newAssigneeId,
        assignedEmployeeUid: assigneeInfo.assignedEmployeeUid,
        assignedEmployeeName: newAssigneeName,
        assignee: assigneeInfo.assignee,
        assignedBy: actor,
      }, { isReassignment: true });
    } catch (notifErr) {
      console.warn("Failed to dispatch task reassignment notification:", notifErr);
    }
  }

  invalidateCache();
}

/**
 * Mark a task as read by the current assignee.
 * Automatically called when the assignee opens the task for the first time.
 */
export async function markTaskAsRead(
  taskId: string,
  actor: string,
  userName: string, // Full name for display in activity log
): Promise<void> {
  const { getDoc } = await import("firebase/firestore");
  const taskDoc = await getDoc(doc(db, COL, taskId));
  if (!taskDoc.exists()) throw new Error("Task not found");

  const task = taskDoc.data() as Task;

  // Only mark as read if not already read
  if (task.readBy) return;

  const now = new Date().toISOString();
  const message = `Task viewed by ${userName}`;
  const entry = activityEntry(actor, message);
  const actLog = createActivity(actor, message, "read", "", userName);
  const cleanLog = removeUndefined(actLog);
  const updates = removeUndefined({
    readBy: actor,
    readAt: now,
    status: "Read",
    lastUpdatedBy: actor,
    lastUpdatedAt: now,
    activity: arrayUnion(entry),
    activityLogs: arrayUnion(cleanLog),
  });
  console.log("📖 markTaskAsRead raw:", { readBy: actor, actLog });
  console.log("📖 markTaskAsRead clean:", updates);
  await updateDoc(doc(db, COL, taskId), updates);
}

/**
 * Subscribe to live task updates.
 * Returns an unsubscribe function for useEffect cleanup.
 */
export function subscribeToTasks(subModule: string, cb: (tasks: Task[]) => void): () => void {
  const q = query(
    collection(db, COL),
    where("subModule", "==", subModule),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      const tasks = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Task)
        .filter((t) => !t.isDeleted); // Hide soft-deleted tasks

      cb(tasks);
    },
    (err) => {
      console.warn("subscribeToTasks orderBy failed, falling back to simple query:", err);
      // Fallback query without orderBy to ensure tasks are always loaded even if index is building
      const fallbackQ = query(
        collection(db, COL),
        where("subModule", "==", subModule)
      );
      return onSnapshot(
        fallbackQ,
        (snap) => {
          const tasks = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as Task)
            .filter((t) => !t.isDeleted);
          // Sort by createdAt descending in memory
          tasks.sort((a, b) => {
            const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return db - da;
          });
          cb(tasks);
        },
        (fallbackErr) => {
          handleFirestoreError(fallbackErr, "subscribeToTasks");
          cb([]);
        }
      );
    }
  );
}

/**
 * Subscribe to live task updates for a specific recordId (client/lead/customer).
 * Returns an unsubscribe function for useEffect cleanup.
 */
export function subscribeToTasksForRecord(
  recordId: string,
  cb: (tasks: Task[]) => void,
  clientName?: string,
): () => void {
  const q = query(collection(db, COL), orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    (snap) => {
      const tasks = snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as Task)
        .filter((task) => !task.isDeleted)
        .filter((task) => taskMatchesClient(task, recordId, clientName))
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      cb(tasks);
    },
    (err) => {
      handleFirestoreError(err, "subscribeToTasksForRecord");
      cb([]);
    },
  );
}

export interface CreateTaskInput {
  title: string;
  serviceName?: string;
  description?: string;
  assignee: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  reminderMinutes?: number;
  associationType: AssociationType;
  bucket?: Bucket;
  recordId?: string;
  vehicleId?: string;
  createdBy: string;
  subtasks?: TaskSubtask[];
  templateId?: string;
  // New fields
  clientId?: string;
  clientName?: string;
  serviceType?: string;
  assignedEmployeeId?: string;
  assignedEmployeeUid?: string;
  assignedEmployeeName?: string;
  assignedEmployeeRole?: string;
  remarks?: string;
  appointmentDate?: string;
  applicationId?: string;
  applicationType?: string;
  subModule?: string;
}

export async function resolveAssigneeIdentity(input: string): Promise<{
  assignee: string;
  assignedEmployeeId: string;
  assignedEmployeeUid: string;
  assignedEmployeeName: string;
  assignedEmployeeRole: string;
}> {
  const normalized = input?.trim() ?? "";
  if (!normalized) {
    return { assignee: "", assignedEmployeeId: "", assignedEmployeeUid: "", assignedEmployeeName: "", assignedEmployeeRole: "" };
  }

  // Check by doc ID (Firebase UID)
  const directUser = await getDoc(doc(db, "users", normalized));
  if (directUser.exists()) {
    const data = directUser.data() as any;
    const resolvedName = data.fullName || data.name || data.username || normalized;
    return {
      assignee: directUser.id, // Stores Firebase UID internally
      assignedEmployeeId: data.employeeId || directUser.id,
      assignedEmployeeUid: directUser.id,
      assignedEmployeeName: resolvedName,
      assignedEmployeeRole: data.role || "",
    };
  }

  // Check by other attributes
  const usersSnap = await getDocs(collection(db, "users"));
  const match = usersSnap.docs.find((docSnap) => {
    const data = docSnap.data() as any;
    return [docSnap.id, data.username, data.fullName, data.name, data.employeeId].includes(normalized);
  });

  if (match) {
    const data = match.data() as any;
    const resolvedName = data.fullName || data.name || data.username || normalized;
    return {
      assignee: match.id, // Stores Firebase UID internally
      assignedEmployeeId: data.employeeId || match.id,
      assignedEmployeeUid: match.id,
      assignedEmployeeName: resolvedName,
      assignedEmployeeRole: data.role || "",
    };
  }

  return {
    assignee: normalized,
    assignedEmployeeId: normalized,
    assignedEmployeeUid: normalized,
    assignedEmployeeName: normalized,
    assignedEmployeeRole: "",
  };
}

export async function createManualTask(input: CreateTaskInput): Promise<Task> {
  // Validate required fields
  if (!input.title?.trim()) {
    throw new Error("Task title is required");
  }
  if (!input.assignee?.trim()) {
    throw new Error("Assignee is required");
  }
  if (input.associationType !== "none" && !input.recordId) {
    throw new Error(`Record ID is required when linking to a ${input.associationType}`);
  }

  console.log("📋 Creating task with input:", input);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const assigneeInfo = await resolveAssigneeIdentity(input.assignee ?? "");
  const linkedRecordId = input.recordId || input.clientId || undefined;
  const initActivity = createActivity(input.createdBy, "Task created");
  const task: Task = {
    id,
    title: input.title,
    serviceName: input.serviceName,
    description: input.description ?? "",
    assignee: assigneeInfo.assignee,
    status: input.status ?? "Read",
    priority: input.priority,
    done: false,
    createdAt: now,
    createdBy: input.createdBy,
    dueDate: input.dueDate,
    reminderMinutes: input.reminderMinutes,
    associationType: input.associationType,
    bucket: input.bucket,
    recordId: linkedRecordId,
    vehicleId: input.vehicleId,
    manual: true,
    subtasks: input.subtasks ?? [],
    progress: input.subtasks ? calculateProgress(input.subtasks) : 0,
    comments: [],
    attachments: [],
    activity: [activityEntry(input.createdBy, "Task created")],
    lastUpdatedBy: input.createdBy,
    lastUpdatedAt: now,
    activityLogs: [initActivity],
    templateId: input.templateId ?? "",
    // New properties
    taskId: id,
    clientId: input.clientId ?? linkedRecordId,
    clientName: input.clientName,
    serviceType: input.serviceName,
    assignedEmployeeId: input.assignedEmployeeId || assigneeInfo.assignedEmployeeId,
    assignedEmployeeUid: input.assignedEmployeeUid || assigneeInfo.assignedEmployeeUid,
    assignedEmployeeName: input.assignedEmployeeName || assigneeInfo.assignedEmployeeName,
    assignedEmployeeRole: input.assignedEmployeeRole || assigneeInfo.assignedEmployeeRole,
    createdDate: now,
    remarks: input.description ?? "",
    activityLog: [initActivity],
    applicationId: input.applicationId,
    subModule: input.subModule,
  };

  try {
    // Build data object, excluding undefined fields (Firestore doesn't allow undefined)
    const data = {
      title: task.title,
      serviceName: task.serviceName,
      description: task.description,
      assignee: task.assignee,
      status: task.status,
      priority: task.priority,
      done: task.done,
      createdAt: task.createdAt,
      createdBy: task.createdBy,
      associationType: task.associationType,
      manual: task.manual,
      subtasks: task.subtasks,
      progress: task.progress,
      comments: task.comments,
      attachments: task.attachments,
      activity: task.activity,
      lastUpdatedBy: task.lastUpdatedBy,
      lastUpdatedAt: task.lastUpdatedAt,
      activityLogs: task.activityLogs,
      templateId: task.templateId,
      // New properties
      taskId: task.taskId,
      clientId: task.clientId,
      clientName: task.clientName,
      serviceType: task.serviceType,
      assignedEmployeeId: task.assignedEmployeeId,
      assignedEmployeeUid: task.assignedEmployeeUid,
      assignedEmployeeName: task.assignedEmployeeName,
      assignedEmployeeRole: task.assignedEmployeeRole,
      createdDate: task.createdDate,
      remarks: task.remarks,
      activityLog: task.activityLog,
      applicationId: task.applicationId,
      subModule: task.subModule,
      // Conditionally include optional fields only if they have values
      ...(task.dueDate ? { dueDate: task.dueDate } : {}),
      ...(task.reminderMinutes !== undefined ? { reminderMinutes: task.reminderMinutes } : {}),
      ...(task.bucket ? { bucket: task.bucket } : {}),
      ...(task.recordId ? { recordId: task.recordId } : {}),
      ...(task.clientId ? { clientId: task.clientId } : {}),
      ...(task.vehicleId ? { vehicleId: task.vehicleId } : {}),
    };

    // CRITICAL: Remove all undefined values recursively before sending to Firestore
    const cleanData = removeUndefined(transformDataObject(data));
    console.log("📋 createManualTask RAW DATA:", data);
    console.log("📋 createManualTask CLEAN DATA:", cleanData);
    console.log(
      "📋 createManualTask REMOVED FIELDS:",
      Object.keys(data).filter((k) => !(k in cleanData)),
    );

    await setDoc(doc(db, COL, id), cleanData);
    console.log("✅ Task created successfully:", id);

    // Send task assignment notification to the assigned employee
    if (task.assignee || task.assignedEmployeeId || task.assignedEmployeeUid) {
      try {
        const { sendTaskAssignmentNotification } = await import("./notifications");
        await sendTaskAssignmentNotification({
          taskId: id,
          title: task.title,
          serviceName: task.serviceName || task.serviceType || task.title,
          vehicleNumber: task.vehicleId || (task as any).vehicleNumber || "",
          applicationId: task.applicationId || "",
          applicationDocId: (task as any).applicationDocId || task.recordId || "",
          subModule: task.subModule || "services",
          assignedEmployeeId: task.assignedEmployeeId,
          assignedEmployeeUid: task.assignedEmployeeUid,
          assignedEmployeeName: task.assignedEmployeeName,
          assignee: task.assignee,
          assignedBy: task.createdBy || "System",
        });
      } catch (notifErr) {
        console.warn("Failed to dispatch task assignment notification:", notifErr);
      }
    }

    if (task.associationType === "client" && task.recordId) {
      await logClientActivity(
        task.recordId,
        task.createdBy,
        task.createdBy,
        "Task Created",
        "task",
        "",
        task.title,
      );
    }
    invalidateCache();
    return task;
  } catch (error) {
    console.error("❌ Failed to create task:", error);
    if (error instanceof Error) {
      throw new Error(`Firestore error: ${error.message}`);
    }
    throw error;
  }
}

export async function updateTask(
  taskId: string,
  patch: Partial<Task>,
  actor: string,
  note?: string,
): Promise<void> {
  console.log("📝 Updating task:", taskId, "with patch:", patch);

  if (patch.assignee !== undefined) {
    const assigneeInfo = await resolveAssigneeIdentity(patch.assignee);
    patch.assignee = assigneeInfo.assignee;
    patch.assignedEmployeeId = assigneeInfo.assignedEmployeeId;
    patch.assignedEmployeeUid = assigneeInfo.assignedEmployeeUid;
    patch.assignedEmployeeName = assigneeInfo.assignedEmployeeName;
    patch.assignedEmployeeRole = assigneeInfo.assignedEmployeeRole;
  }

  const { getDoc } = await import("firebase/firestore");
  const taskDoc = await getDoc(doc(db, COL, taskId));
  
  if (!taskDoc.exists()) {
    // Check if it's in registry_services_v2
    const serviceRef = doc(db, "registry_services_v2", taskId);
    const serviceSnap = await getDoc(serviceRef);
    if (serviceSnap.exists()) {
      console.log("📝 Task is a service task. Updating registry_services_v2.");
      const serviceData = serviceSnap.data() as any;
      const updates: any = {
        updatedAt: new Date().toISOString(),
      };
      if (patch.assignee !== undefined) {
        updates.assignedTo = patch.assignee;
        updates.assignee = patch.assignee;
        updates.assignedStaff = patch.assignee;
      }
      if (patch.assignedEmployeeId !== undefined) {
        updates.employeeId = patch.assignedEmployeeId;
      }
      if (patch.assignedEmployeeUid !== undefined) {
        updates.assignedEmployeeUid = patch.assignedEmployeeUid;
      }
      if (patch.assignedEmployeeName !== undefined) {
        updates.assignedEmployeeName = patch.assignedEmployeeName;
      }
      if (patch.assignedEmployeeRole !== undefined) {
        updates.assignedEmployeeRole = patch.assignedEmployeeRole;
      }
      if (patch.status !== undefined) {
        updates.taskStatus = patch.status;
        updates.progress = getProgressFromStatus(patch.status as any);
      }
      if (patch.remarks !== undefined || patch.description !== undefined) {
        updates.remarks = patch.remarks || patch.description || "";
        updates.notes = patch.remarks || patch.description || "";
      }
      if (patch.dueDate !== undefined) {
        updates.dueDate = patch.dueDate;
      }
      if (patch.serviceName !== undefined || patch.serviceType !== undefined) {
        updates.serviceType = patch.serviceName || patch.serviceType || "";
      }
      if (patch.subtasks !== undefined) {
        updates.subtasks = patch.subtasks;
        updates.progress = calculateProgress(patch.subtasks);
      }
      if (patch.recordId !== undefined || patch.clientId !== undefined) {
        updates.clientId = patch.recordId || patch.clientId || "";
      }
      if (patch.clientName !== undefined) {
        updates.clientName = patch.clientName;
      }
      if (patch.vehicleId !== undefined) {
        updates.vehicleId = patch.vehicleId;
      }
      if (patch.title !== undefined) {
        updates.title = patch.title;
      }
      if (patch.priority !== undefined) {
        updates.priority = patch.priority;
      }
      if (patch.reminderMinutes !== undefined) {
        updates.reminderMinutes = patch.reminderMinutes;
      }
      if ((patch as any).applicationId !== undefined) {
        updates.applicationId = (patch as any).applicationId;
      }
      if ((patch as any).applicationType !== undefined) {
        updates.applicationType = (patch as any).applicationType;
      }
      
      const mainEntry = activityEntry(actor, note ?? "Task updated");
      const existingActivity = serviceData.activity || [];
      updates.activity = [...existingActivity, mainEntry];

      const cleanUpdates = removeUndefined(transformDataObject(updates));
      await updateDoc(serviceRef, cleanUpdates);
      console.log("✅ Service task updated successfully in registry_services_v2");
      invalidateCache();
      return;
    }

    // Check if it's an application task ID (e.g. task-app-...)
    if (taskId.startsWith("task-app-")) {
      const appDocId = taskId.replace(/^task-app-/, "");
      const appRef = doc(db, "registry_applications_v1", appDocId);
      const appSnap = await getDoc(appRef);
      const appData = appSnap.exists() ? (appSnap.data() as any) : {};

      const appStatus = patch.status === "Completed" ? "Approved" : patch.status === "On Hold" ? "On Hold" : patch.status;
      if (appSnap.exists()) {
        try {
          const appUpdates: any = {
            updatedAt: new Date().toISOString(),
          };
          if (patch.status) {
            appUpdates.applicationStatus = appStatus;
          }
          if ((patch as any).applicationId !== undefined) {
            appUpdates.applicationId = (patch as any).applicationId;
          }
          if ((patch as any).applicationType !== undefined) {
            appUpdates.applicationType = (patch as any).applicationType;
          }
          await updateDoc(appRef, appUpdates);
        } catch (e) {
          console.warn("App doc status update notice:", e);
        }
      }

      const existingTaskSnap = await getDoc(doc(db, COL, taskId));
      const existingTaskData = existingTaskSnap.exists() ? (existingTaskSnap.data() as any) : {};

      const cleanUpdates = removeUndefined(transformDataObject({
        ...appData,
        ...existingTaskData,
        id: taskId,
        taskId: taskId,
        applicationId: (patch as any).applicationId !== undefined ? (patch as any).applicationId : (existingTaskData.applicationId || appData.applicationId || ""),
        applicationDocId: appDocId,
        recordId: appDocId,
        clientId: appDocId,
        vehicleNumber: appData.vehicleNumber || existingTaskData.vehicleNumber || (patch as any).vehicleNumber,
        clientName: appData.ownerName || appData.clientName || existingTaskData.clientName,
        mobileNumber: appData.mobileNumber || existingTaskData.mobileNumber,
        reference: appData.reference || appData.applicationId || existingTaskData.reference,
        ...patch,
        lastUpdatedBy: actor,
        lastUpdatedAt: new Date().toISOString(),
      }));
      await setDoc(doc(db, COL, taskId), cleanUpdates, { merge: true });
      console.log("✅ Application task doc created and updated in registry_tasks:", taskId);
      invalidateCache();
      return;
    }

    // Upsert task document directly
    const cleanUpdates = removeUndefined(transformDataObject({
      id: taskId,
      taskId: taskId,
      ...patch,
      lastUpdatedBy: actor,
      lastUpdatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }));
    await setDoc(doc(db, COL, taskId), cleanUpdates);
    invalidateCache();
    return;
  }

  const existing = taskDoc.data() as Task;

  // Track important field changes
  const tracked = ["status", "priority", "assignee"];
  const activities: ActivityLog[] = [];

  for (const field of tracked) {
    const oldVal = (existing as any)[field];
    const newVal = (patch as any)[field];
    if (newVal !== undefined && oldVal !== newVal) {
      console.log(`  Changed ${field}: ${oldVal} → ${newVal}`);
      activities.push(
        createActivity(actor, `Updated ${field}`, field, String(oldVal ?? "—"), String(newVal)),
      );
    }
  }

  // Create main activity entry if note provided
  const mainEntry = activityEntry(actor, note ?? "Task updated");

  const now = new Date().toISOString();
  if (patch.remarks !== undefined) {
    patch.lastRemark = patch.remarks;
    patch.lastRemarkBy = actor;
    patch.lastRemarkAt = now;
  }
  const updates: any = {
    ...patch,
    lastUpdatedBy: actor,
    lastUpdatedAt: now,
    activity: arrayUnion(mainEntry),
  };

  // Add tracked activities one by one
  for (const activity of activities) {
    const cleanActivity = removeUndefined(activity);
    updates.activityLogs = arrayUnion(cleanActivity);
  }

  try {
    const cleanUpdates = removeUndefined(transformDataObject(updates));
    console.log("📝 updateTask RAW:", updates);
    console.log("📝 updateTask CLEAN:", cleanUpdates);
    await updateDoc(doc(db, COL, taskId), cleanUpdates);
    console.log("✅ Task updated successfully");

    // Sync back to registry_applications_v1 application doc if it is associated with one
    try {
      const appDocId = existing.recordId || existing.clientId;
      if (appDocId) {
        const appRef = doc(db, "registry_applications_v1", appDocId);
        const appSnap = await getDoc(appRef);
        if (appSnap.exists()) {
          const appUpdates: any = { updatedAt: new Date().toISOString() };
          if (patch.applicationId !== undefined) {
            appUpdates.applicationId = patch.applicationId;
          }
          if (patch.applicationType !== undefined) {
            appUpdates.applicationType = patch.applicationType;
          }
          await updateDoc(appRef, appUpdates);
          console.log("✅ Synced Application ID and Type back to application document:", appDocId);
        }
      }
    } catch (e) {
      console.warn("Application doc sync notice:", e);
    }

    // Dispatch reassignment notification if assignee has changed to a new employee
    if (patch.assignee !== undefined && patch.assignee !== existing.assignee) {
      try {
        const { sendTaskAssignmentNotification } = await import("./notifications");
        await sendTaskAssignmentNotification({
          taskId,
          title: patch.title || existing.title,
          serviceName: patch.serviceName || existing.serviceName || patch.title || existing.title,
          vehicleNumber: patch.vehicleId || (patch as any).vehicleNumber || existing.vehicleId || (existing as any).vehicleNumber || "",
          applicationId: (patch as any).applicationId || existing.applicationId || "",
          applicationDocId: (patch as any).applicationDocId || existing.applicationDocId || existing.recordId || "",
          subModule: (patch as any).subModule || existing.subModule || "services",
          assignedEmployeeId: patch.assignedEmployeeId || existing.assignedEmployeeId,
          assignedEmployeeUid: patch.assignedEmployeeUid || existing.assignedEmployeeUid,
          assignedEmployeeName: patch.assignedEmployeeName || existing.assignedEmployeeName,
          assignee: patch.assignee,
          assignedBy: actor,
        }, { isReassignment: true });
      } catch (notifErr) {
        console.warn("Failed to dispatch task assignment notification on update:", notifErr);
      }
    }

    if (existing.associationType === "client" && existing.recordId) {
      await logClientActivity(
        existing.recordId,
        actor,
        actor,
        note || "Task Updated",
        "task",
        "",
        patch.title || existing.title,
      );
    }
    invalidateCache();
  } catch (error) {
    console.error("❌ Failed to update task:", error);
    throw error;
  }
}

export async function setTaskDone(taskId: string, done: boolean, actor = "system"): Promise<void> {
  const taskDoc = await getDoc(doc(db, COL, taskId));
  
  if (!taskDoc.exists()) {
    // Check if it's in registry_services_v2
    const serviceRef = doc(db, "registry_services_v2", taskId);
    const serviceSnap = await getDoc(serviceRef);
    if (serviceSnap.exists()) {
      await updateDoc(serviceRef, {
        taskStatus: done ? "Completed" : "Read",
        updatedAt: new Date().toISOString(),
      });
      invalidateCache();
      return;
    }
    throw new Error("Task not found");
  }

  const taskData = taskDoc.data() as Task;

  const entry = activityEntry(actor, done ? "Marked complete" : "Reopened");
  const actLog = createActivity(
    actor,
    done ? "Marked complete" : "Reopened",
    "status",
    done ? "Read" : "Completed",
    done ? "Completed" : "Read",
  );
  const cleanLog = removeUndefined(actLog);

  const now = new Date().toISOString();
  const updates = removeUndefined({
    done,
    status: done ? "Completed" : "Read",
    lastUpdatedBy: actor,
    lastUpdatedAt: now,
    activity: arrayUnion(entry),
    activityLogs: arrayUnion(cleanLog),
  });
  console.log("✓ setTaskDone RAW:", { done, actLog });
  console.log("✓ setTaskDone CLEAN:", updates);
  await updateDoc(doc(db, COL, taskId), updates);

  if (taskData && taskData.associationType === "client" && taskData.recordId) {
    await logClientActivity(
      taskData.recordId,
      actor,
      actor,
      done ? "Task Completed" : "Task Reopened",
      "task",
      done ? "Read" : "Completed",
      done ? "Completed" : "Read",
    );
  }
}

export async function addComment(taskId: string, author: string, text: string): Promise<void> {
  const comment: TaskComment = {
    id: crypto.randomUUID(),
    author,
    text,
    at: new Date().toISOString(),
  };
  const entry = activityEntry(author, "Added comment");
  const actLog = createActivity(author, "Added comment", "comment", "", text);
  const cleanLog = removeUndefined(actLog);

  const now = new Date().toISOString();
  const updates = removeUndefined({
    comments: arrayUnion(comment),
    lastUpdatedBy: author,
    lastUpdatedAt: now,
    activity: arrayUnion(entry),
    activityLogs: arrayUnion(cleanLog),
    lastRemark: text,
    lastRemarkBy: author,
    lastRemarkAt: now,
    remarks: text,
  });

  const taskDoc = await getDoc(doc(db, COL, taskId));
  if (!taskDoc.exists()) {
    const serviceRef = doc(db, "registry_services_v2", taskId);
    const serviceSnap = await getDoc(serviceRef);
    if (serviceSnap.exists()) {
      const serviceData = serviceSnap.data() as any;
      const existingComments = serviceData.comments || [];
      const existingActivity = serviceData.activity || [];
      const existingActivityLogs = serviceData.activityLogs || [];
      
      const sUpdates = removeUndefined({
        comments: [...existingComments, comment],
        lastUpdatedBy: author,
        lastUpdatedAt: now,
        activity: [...existingActivity, entry],
        activityLogs: [...existingActivityLogs, cleanLog],
        lastRemark: text,
        lastRemarkBy: author,
        lastRemarkAt: now,
        remarks: text,
      });
      await updateDoc(serviceRef, sUpdates);
      invalidateCache();
      return;
    }
  }

  console.log("💬 addComment RAW:", { comment, actLog });
  console.log("💬 addComment CLEAN:", updates);
  await updateDoc(doc(db, COL, taskId), updates);
}

export async function addAttachment(taskId: string, file: TaskAttachment): Promise<void> {
  const entry = activityEntry(file.addedBy, `Attached ${file.name}`);
  const actLog = createActivity(file.addedBy, "Added attachment", "attachment", "", file.name);
  const cleanLog = removeUndefined(actLog);

  const now = new Date().toISOString();
  const updates = removeUndefined({
    attachments: arrayUnion(file),
    lastUpdatedBy: file.addedBy,
    lastUpdatedAt: now,
    activity: arrayUnion(entry),
    activityLogs: arrayUnion(cleanLog),
  });

  const taskDoc = await getDoc(doc(db, COL, taskId));
  if (!taskDoc.exists()) {
    const serviceRef = doc(db, "registry_services_v2", taskId);
    const serviceSnap = await getDoc(serviceRef);
    if (serviceSnap.exists()) {
      const serviceData = serviceSnap.data() as any;
      const existingAttachments = serviceData.attachments || [];
      const existingActivity = serviceData.activity || [];
      const existingActivityLogs = serviceData.activityLogs || [];
      
      const sUpdates = removeUndefined({
        attachments: [...existingAttachments, file],
        lastUpdatedBy: file.addedBy,
        lastUpdatedAt: now,
        activity: [...existingActivity, entry],
        activityLogs: [...existingActivityLogs, cleanLog],
      });
      await updateDoc(serviceRef, sUpdates);
      invalidateCache();
      return;
    }
  }

  console.log("📎 addAttachment RAW:", { file, actLog });
  console.log("📎 addAttachment CLEAN:", updates);
  await updateDoc(doc(db, COL, taskId), updates);
}

export async function removeTask(taskId: string): Promise<void> {
  const taskDoc = await getDoc(doc(db, COL, taskId));
  if (!taskDoc.exists()) {
    const serviceRef = doc(db, "registry_services_v2", taskId);
    const serviceSnap = await getDoc(serviceRef);
    if (serviceSnap.exists()) {
      await deleteDoc(serviceRef);
      invalidateCache();
      return;
    }
  }
  await deleteDoc(doc(db, COL, taskId));
  invalidateCache();
}

/** Soft-delete a task (admin only). */
export async function softDeleteTask(
  taskId: string,
  actor: string,
  reason: DeleteReason,
): Promise<void> {
  const now = new Date().toISOString();
  const deleteLog = createActivity(actor, "Task deleted", "deleteReason", "", reason);
  const cleanLog = removeUndefined(deleteLog);

  const updates = removeUndefined({
    isDeleted: true,
    deletedAt: now,
    deletedBy: actor,
    deleteReason: reason,
    activityLogs: arrayUnion(cleanLog),
  });

  const taskDoc = await getDoc(doc(db, COL, taskId));
  if (!taskDoc.exists()) {
    const serviceRef = doc(db, "registry_services_v2", taskId);
    const serviceSnap = await getDoc(serviceRef);
    if (serviceSnap.exists()) {
      await updateDoc(serviceRef, {
        isDeleted: true,
        deletedAt: now,
        deletedBy: actor,
        deleteReason: reason,
        taskStatus: "Deleted",
        updatedAt: now,
      });
      invalidateCache();
      return;
    }
  }

  console.log("🗑️ softDeleteTask RAW:", { isDeleted: true, deleteLog });
  console.log("🗑️ softDeleteTask CLEAN:", updates);
  await updateDoc(doc(db, COL, taskId), updates);
  invalidateCache();
}

/** Auto-sync a task from a record save — creates or updates the linked task. */
export async function syncTaskFromRecord(
  bucket: Bucket,
  record: RegistryRecord,
  actor: string,
): Promise<void> {
  // We need to find the linked task by recordId. Use a separate query.
  const { collection: col, query: q, where, getDocs } = await import("firebase/firestore");
  const snap = await getDocs(q(col(db, COL), where("recordId", "==", record.id)));

  const title = record.work || record.application || "General Follow Up";
  const serviceName = record.work || record.application || "Follow Up";
  const mappedStatus: TaskStatus =
    record.status === "Completed"
      ? "Completed"
      : record.status === "In Progress"
        ? "In Progress"
        : record.status === "On Hold"
          ? "On Hold"
          : "Read";

  if (!snap.empty) {
    // Update existing linked task
    const taskDoc = snap.docs[0];
    const entry = activityEntry(actor, `Auto-synced from ${bucket}`);
    const updates = removeUndefined({
      title,
      serviceName,
      status: mappedStatus,
      done: record.status === "Completed",
      ...(record.assignee ? { assignee: record.assignee } : {}),
      activity: arrayUnion(entry),
    });
    console.log("🔄 syncTaskFromRecord UPDATE RAW:", {
      title,
      serviceName,
      status: mappedStatus,
      done: record.status === "Completed",
      assignee: record.assignee,
    });
    console.log("🔄 syncTaskFromRecord UPDATE CLEAN:", updates);
    await updateDoc(taskDoc.ref, updates);
  } else if (record.assignee) {
    // Create a new linked task
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const task: Task = {
      id,
      title,
      serviceName,
      description: record.work || record.application || "",
      assignee: record.assignee,
      status: mappedStatus,
      priority: "Medium",
      done: record.status === "Completed",
      createdAt: now,
      createdBy: actor,
      associationType: bucket === "leads" ? "lead" : "client",
      recordId: record.id,
      clientId: record.id,
      bucket,
      manual: false,
      subtasks: [],
      progress: 0,
      comments: [],
      attachments: [],
      activity: [activityEntry(actor, `Created from ${bucket}`)],
      lastUpdatedBy: actor,
      lastUpdatedAt: now,
      activityLogs: [],
    };

    // Build data object, excluding undefined fields (Firestore doesn't allow undefined)
    const data = {
      title: task.title,
      serviceName: task.serviceName,
      description: task.description,
      assignee: task.assignee,
      status: task.status,
      priority: task.priority,
      done: task.done,
      createdAt: task.createdAt,
      createdBy: task.createdBy,
      associationType: task.associationType,
      recordId: task.recordId,
      bucket: task.bucket,
      manual: task.manual,
      subtasks: task.subtasks,
      progress: task.progress,
      comments: task.comments,
      attachments: task.attachments,
      activity: task.activity,
      lastUpdatedBy: task.lastUpdatedBy,
      lastUpdatedAt: task.lastUpdatedAt,
      activityLogs: task.activityLogs,
    };

    const cleanData = removeUndefined(data);
    console.log("📋 syncTaskFromRecord CREATE RAW:", data);
    console.log("📋 syncTaskFromRecord CREATE CLEAN:", cleanData);
    await setDoc(doc(db, COL, id), cleanData);
  }
}

// ─── Legacy stubs ─────────────────────────────────────────────────────────────

/** @deprecated Use subscribeToTasks(). */
export function loadTasks(): Task[] {
  return [];
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const PRIORITY_OPTIONS: TaskPriority[] = ["Low", "Medium", "High", "Urgent"];
export const TASK_STATUS_OPTIONS: TaskStatus[] = [
  "Read",
  "In Progress",
  "On Hold",
  "Completed",
];

export interface TaskTemplate {
  id: string;
  templateName: string;
  serviceType?: string;
  description?: string;
  subModule?: string;
  subtasks: string[];
  isDefault: boolean;
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
}

const TEMPLATES_COL = "task_templates";

export const DEFAULT_TEMPLATES_SPEC = [
  {
    templateName: "Insurance",
    serviceType: "Insurance",
    subModule: "insurance",
    subtasks: [
      "Call Client",
      "Collect RC",
      "Collect Insurance Copy",
      "Receive Payment",
      "Submit Application",
      "Deliver Documents"
    ],
  },
  {
    templateName: "Fitness",
    serviceType: "Fitness",
    subModule: "vahaan",
    subtasks: [
      "Call Client",
      "Collect RC",
      "Schedule Inspection",
      "Receive Payment",
      "Update Fitness",
      "Deliver Documents"
    ],
  },
  {
    templateName: "Tax",
    serviceType: "Tax",
    subModule: "vahaan",
    subtasks: [
      "Call Client",
      "Verify Tax Amount",
      "Collect Payment",
      "Submit Tax",
      "Update Record"
    ],
  },
  {
    templateName: "PUC",
    serviceType: "PUC",
    subModule: "vahaan",
    subtasks: [
      "Call Client",
      "Vehicle Inspection",
      "Generate PUC",
      "Deliver Certificate"
    ],
  },
  {
    templateName: "National Permit(Gujrat Permit)",
    serviceType: "National Permit(Gujrat Permit)" as any,
    subModule: "vahaan",
    subtasks: [
      "Collect Documents",
      "Verify Permit Status",
      "Collect Payment",
      "Submit Application",
      "Receive Permit",
      "Deliver Documents"
    ],
  },
  {
    templateName: "Gujarat Permit",
    serviceType: "Gujarat Permit",
    subModule: "vahaan",
    subtasks: [
      "Collect Documents",
      "Verify Permit",
      "Collect Payment",
      "Submit Application",
      "Receive Permit",
      "Deliver Documents"
    ],
  },
  {
    templateName: "License Renewal",
    serviceType: "License Renewal",
    subModule: "licence",
    subtasks: [
      "Call Client",
      "Collect License",
      "Collect Documents",
      "Receive Payment",
      "Submit Renewal",
      "Deliver License"
    ],
  },
  {
    templateName: "RC Transfer",
    serviceType: "RC Transfer",
    subModule: "vahaan",
    subtasks: [
      "Collect RC",
      "Collect Documents",
      "Receive Payment",
      "Submit Transfer",
      "Track Status",
      "Deliver RC"
    ],
  },
  {
    templateName: "HP Termination",
    serviceType: "HP Termination",
    subModule: "vahaan",
    subtasks: [
      "Collect NOC",
      "Collect Documents",
      "Receive Payment",
      "Submit Request",
      "Verify Closure"
    ],
  }
];

export async function provisionDefaultTemplates(): Promise<void> {
  try {
    const colRef = collection(db, TEMPLATES_COL);
    const metaDoc = await getDoc(doc(db, TEMPLATES_COL, "_metadata"));
    if (metaDoc.exists() && metaDoc.data()?.provisioned) {
      return; // Already provisioned once, do not auto-recreate if deleted
    }

    const snap = await getDocs(colRef);
    const existingNames = snap.docs
      .filter(d => d.id !== "_metadata")
      .map(d => (d.data() as any).templateName);

    for (const spec of DEFAULT_TEMPLATES_SPEC) {
      if (!existingNames.includes(spec.templateName)) {
        await addDoc(colRef, {
          templateName: spec.templateName,
          serviceType: spec.serviceType,
          subModule: spec.subModule || "vahaan",
          subtasks: spec.subtasks,
          isDefault: true,
          createdBy: "system",
          createdAt: new Date().toISOString(),
        });
      }
    }

    await setDoc(doc(db, TEMPLATES_COL, "_metadata"), { provisioned: true });
  } catch (err) {
    console.error("[provisionDefaultTemplates] Error seeding defaults:", err);
  }
}

export function subscribeToTemplates(cb: (templates: TaskTemplate[]) => void): () => void {
  // Try provisioning defaults on load
  provisionDefaultTemplates().catch(console.error);

  return onSnapshot(
    collection(db, TEMPLATES_COL),
    (snap) => {
      // If snap is empty (completely unseeded), fallback to spec
      if (snap.empty) {
        cb(DEFAULT_TEMPLATES_SPEC.map((s, i) => ({
          id: `temp-spec-${i}`,
          templateName: s.templateName,
          serviceType: s.serviceType,
          subtasks: s.subtasks,
          isDefault: true,
          createdBy: "system",
          createdAt: new Date().toISOString()
        })));
        return;
      }
      const docs = snap.docs.filter((d) => d.id !== "_metadata");
      cb(docs.map((d) => ({ id: d.id, ...d.data() }) as TaskTemplate));
    },
    (err) => {
      console.error("[subscribeToTemplates] error:", err);
      cb([]);
    },
  );
}

export async function createTemplate(
  templateName: string,
  description: string,
  subtasks: string[],
  createdBy: string,
  subModule?: string,
): Promise<TaskTemplate> {
  const payload = {
    templateName,
    description,
    subtasks,
    subModule: subModule || "",
    isDefault: false,
    createdBy,
    createdAt: new Date().toISOString(),
  };
  const docRef = await addDoc(collection(db, TEMPLATES_COL), payload);

  try {
    await logClientActivity(
      "system",
      createdBy,
      createdBy,
      `Task Template created: ${templateName}`,
      "template",
      null,
      `Description: ${description || "—"}`,
    );
  } catch (err) {
    console.warn("Template Created log activity failed:", err);
  }

  return { id: docRef.id, ...payload };
}

export async function updateTemplate(
  templateId: string,
  updates: Partial<TaskTemplate>,
  updatedBy: string,
): Promise<void> {
  const payload = {
    ...updates,
    updatedBy,
    updatedAt: new Date().toISOString(),
  };
  await updateDoc(doc(db, TEMPLATES_COL, templateId), removeUndefined(payload));

  try {
    await logClientActivity(
      "system",
      updatedBy,
      updatedBy,
      `Task Template updated: ${updates.templateName || templateId}`,
      "template",
      null,
      `Updates: ${Object.keys(updates).join(", ")}`,
    );
  } catch (err) {
    console.warn("Template Updated log activity failed:", err);
  }
}

export async function deleteTemplate(templateId: string, deletedBy: string): Promise<void> {
  await deleteDoc(doc(db, TEMPLATES_COL, templateId));

  try {
    await logClientActivity(
      "system",
      deletedBy,
      deletedBy,
      `Task Template deleted: ${templateId}`,
      "template",
      null,
      "",
    );
  } catch (err) {
    console.warn("Template Deleted log activity failed:", err);
  }
}

export async function deleteAllTemplates(deletedBy: string): Promise<void> {
  const colRef = collection(db, TEMPLATES_COL);
  const snap = await getDocs(colRef);
  const { writeBatch } = await import("firebase/firestore");
  const batch = writeBatch(db);
  let count = 0;
  
  snap.docs.forEach((d) => {
    if (d.id !== "_metadata") {
      batch.delete(d.ref);
      count++;
    }
  });

  if (count > 0) {
    await batch.commit();
  }

  // Ensure the provisioned metadata document stays/exists so it doesn't re-seed on next load
  await setDoc(doc(db, TEMPLATES_COL, "_metadata"), { provisioned: true });

  try {
    await logClientActivity(
      "system",
      deletedBy,
      deletedBy,
      `All Task Templates deleted`,
      "template",
      null,
      "",
    );
  } catch (err) {
    console.warn("Delete All Templates log activity failed:", err);
  }
}

export async function restoreDefaultTemplates(actor: string): Promise<void> {
  // Reset provisioned flag so provisionDefaultTemplates will write them
  await setDoc(doc(db, TEMPLATES_COL, "_metadata"), { provisioned: false });
  await provisionDefaultTemplates();

  try {
    await logClientActivity(
      "system",
      actor,
      actor,
      `Restored default task templates`,
      "template",
      null,
      "",
    );
  } catch (err) {
    console.warn("Restore Default Templates log activity failed:", err);
  }
}

/** Permanently deletes a task and cleans up all references. */
export async function deleteTaskPermanently(taskId: string): Promise<void> {
  const taskRef = doc(db, COL, taskId);
  const taskSnap = await getDoc(taskRef);
  
  let recordId: string | undefined;
  let assignee: string | undefined;
  
  if (taskSnap.exists()) {
    const taskData = taskSnap.data() as Task;
    recordId = taskData.recordId || (taskData as any).clientId;
    assignee = taskData.assignee;
  }
  
  // Delete the actual task document
  await deleteDoc(taskRef);
  
  // Clean up related service if it exists in registry_services_v2
  try {
    const serviceRef = doc(db, "registry_services_v2", taskId);
    const serviceSnap = await getDoc(serviceRef);
    if (serviceSnap.exists()) {
      await deleteDoc(serviceRef);
    }
  } catch (err) {
    console.error("Failed to delete related service:", err);
  }

  // Clean up client/lead references
  if (recordId) {
    try {
      const clientRef = doc(db, "registry_clients_v2", recordId);
      const clientSnap = await getDoc(clientRef);
      if (clientSnap.exists()) {
        const clientData = clientSnap.data() as any;
        const clientUpdates: any = {};
        
        if (Array.isArray(clientData.taskIds)) {
          clientUpdates.taskIds = clientData.taskIds.filter((id: string) => id !== taskId);
        }
        if (Array.isArray(clientData.activeTasks)) {
          clientUpdates.activeTasks = clientData.activeTasks.filter((t: any) => {
            if (typeof t === "string") return t !== taskId;
            if (t && typeof t === "object") return t.id !== taskId;
            return true;
          });
        }
        if (Array.isArray(clientData.linkedTasks)) {
          clientUpdates.linkedTasks = clientData.linkedTasks.filter((t: any) => {
            if (typeof t === "string") return t !== taskId;
            if (t && typeof t === "object") return t.id !== taskId;
            return true;
          });
        }
        
        if (Object.keys(clientUpdates).length > 0) {
          await updateDoc(clientRef, clientUpdates);
        }
      }
    } catch (err) {
      console.error("Failed to clean up client task references:", err);
    }
  }
  
  // Clean up employee references
  if (assignee) {
    try {
      const usersSnap = await getDocs(query(
        collection(db, "users"),
        where("username", "==", assignee)
      ));
      
      for (const userDoc of usersSnap.docs) {
        const userData = userDoc.data() as any;
        const userUpdates: any = {};
        if (Array.isArray(userData.taskIds)) {
          userUpdates.taskIds = userData.taskIds.filter((id: string) => id !== taskId);
        }
        if (Array.isArray(userData.activeTasks)) {
          userUpdates.activeTasks = userData.activeTasks.filter((id: string) => id !== taskId);
        }
        if (Object.keys(userUpdates).length > 0) {
          await updateDoc(userDoc.ref, userUpdates);
        }
      }
    } catch (err) {
      console.error("Failed to clean up employee task references:", err);
    }
  }
  
  // Clean up other collections referencing this taskId
  const extraCollections = ["notifications", "reminders", "activity_logs", "client_activity_logs"];
  for (const colName of extraCollections) {
    try {
      const qSnap = await getDocs(query(collection(db, colName), where("taskId", "==", taskId)));
      for (const d of qSnap.docs) {
        await deleteDoc(d.ref);
      }
    } catch (err) {
      console.warn(`Could not clean up references in ${colName}:`, err);
    }
  }

  invalidateCache();
}

/**
 * Duplicate an existing task (manual or service).
 */
export async function duplicateTask(taskId: string, actor: string): Promise<Task> {
  const { getDoc } = await import("firebase/firestore");
  let taskDoc = await getDoc(doc(db, COL, taskId));
  let isService = false;
  if (!taskDoc.exists()) {
    taskDoc = await getDoc(doc(db, "registry_services_v2", taskId));
    if (!taskDoc.exists()) throw new Error("Task not found");
    isService = true;
  }
  const task = taskDoc.data() as Task;
  
  // Clone task subtasks
  const clonedSubtasks = (task.subtasks ?? []).map(st => ({
    ...st,
    id: crypto.randomUUID(),
    completed: false,
    completedBy: undefined,
    completedOn: undefined,
    completedAt: undefined,
  }));

  const assocType = (task.recordId || task.clientId) ? (task.associationType || "client") : "none";

  const input: CreateTaskInput = {
    title: `Copy of ${task.title || "Untitled Task"}`,
    serviceName: task.serviceName || task.serviceType || "",
    description: task.description || task.remarks || "",
    assignee: task.assignee || task.assignedEmployeeUid || "",
    priority: task.priority || "Medium",
    status: "Read",
    dueDate: task.dueDate || undefined,
    reminderMinutes: task.reminderMinutes || undefined,
    associationType: assocType,
    bucket: (task.recordId || task.clientId) ? (task.bucket || "clients") : undefined,
    recordId: task.recordId || task.clientId || undefined,
    vehicleId: task.vehicleId || undefined,
    createdBy: actor,
    subtasks: clonedSubtasks,
    templateId: task.templateId || "",
    clientId: task.clientId || task.recordId || undefined,
    clientName: task.clientName || undefined,
    serviceType: task.serviceType || task.serviceName || "",
    assignedEmployeeId: task.assignedEmployeeId || undefined,
    assignedEmployeeUid: task.assignedEmployeeUid || undefined,
    assignedEmployeeName: task.assignedEmployeeName || undefined,
    assignedEmployeeRole: task.assignedEmployeeRole || undefined,
    remarks: task.remarks || task.description || "",
  };

  return createManualTask(input);
}

