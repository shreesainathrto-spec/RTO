import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  getDoc,
  addDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { removeUndefined, type ServiceType } from "./records";
import { getSession } from "./auth";
import { invalidateCache } from "./cacheInvalidator";
import { transformDataObject } from "./capitalize-settings";
import { isAdvanceAmountValid, ADVANCE_AMOUNT_ERROR_MESSAGE } from "./utils";

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface Client {
  id: string;
  name: string;
  mobile: string;
  address: string;
  companyName: string;
  notes: string;
  type: "client" | "lead";
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  createdById?: string;
  updatedBy?: string;
  updatedById?: string;
  advancePayment?: number;
  gstNumber?: string;
  ownerName?: string;
  alternateMobile?: string;
  email?: string;
  city?: string;
  state?: string;
  groupName?: string;
  customerType?: string;
  status?: string;
}

export interface VehicleDocument {
  id: string;
  fileName: string;
  fileUrl: string;
  storagePath: string;
  uploadedAt: string;
  uploadedBy: string;
  fileType: string;
}

export interface Vehicle {
  id: string;
  clientId: string;
  vehicleNumber: string;
  vehicleType: string;
  chassisNumber: string;
  engineNumber: string;
  registrationDate: string;
  status: "Pending" | "In Progress" | "Completed" | "On Hold";
  createdAt?: string;
  updatedAt?: string;
  documents?: VehicleDocument[];
}

export type ServiceTaskStatus =
  | "Not Started"
  | "Documents Collected"
  | "Verification"
  | "Submitted"
  | "Approved"
  | "Completed";

export function isLicenseService(serviceType?: string): boolean {
  return serviceType === "License New" || serviceType === "License Renew";
}

export interface Service {
  id: string;
  vehicleId?: string;
  serviceType: ServiceType;
  dueDate: string;
  serviceAmount: number;
  amountReceived: number;
  advancePayment?: number;
  applicationType?: string;
  pendingAmount: number; // serviceAmount - amountReceived - advancePayment
  assignedStaff: string;
  taskStatus: ServiceTaskStatus;
  progress: number; // mapped from taskStatus
  notes: string;
  createdAt?: string;
  updatedAt?: string;
  clientId?: string;
  clientName?: string;
  clientMobile?: string;
  collectionDate?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  askBhaylubha?: boolean;
  applicationId?: string;
  templateId?: string;
  title?: string;
  description?: string;
  subtasks?: any[];
  appointmentDate?: string;
  assignedEmployeeName?: string;
  applicationDocId?: string;
}

export interface ClientAccounting {
  totalAmount: number;
  amountReceived: number;
  pendingAmount: number;
}

export interface ClientDetails extends Client {
  vehicles: (Vehicle & { services: Service[] })[];
  personalServices?: Service[];
  accounting: ClientAccounting;
}

// ─── Constants & Collection Names ───────────────────────────────────────────

export const CLIENTS_COL = "registry_clients_v2";
export const VEHICLES_COL = "registry_vehicles_v2";
export const SERVICES_COL = "registry_services_v2";

export const TASK_STATUS_PROGRESS: Record<ServiceTaskStatus, number> = {
  "Not Started": 0,
  "Documents Collected": 20,
  Verification: 40,
  Submitted: 60,
  Approved: 80,
  Completed: 100,
};

// ─── Helper Functions ────────────────────────────────────────────────────────

export function getProgressFromStatus(status: ServiceTaskStatus): number {
  return TASK_STATUS_PROGRESS[status] ?? 0;
}

// ─── Client Operations ────────────────────────────────────────────────────────

export function sortClientsNewestFirst<T extends { createdAt?: string; createdOn?: string; timestamp?: any; id?: string; name?: string }>(clients: T[]): T[] {
  return clients.sort((a, b) => {
    const getTs = (c: T) => {
      if (!c) return 0;
      const val = c.createdAt || c.createdOn || c.timestamp;
      if (!val) return 0;
      if (typeof val === "string") {
        const parsed = Date.parse(val);
        return isNaN(parsed) ? 0 : parsed;
      }
      if (typeof val === "number") return val;
      if ((val as any)?.seconds) return (val as any).seconds * 1000;
      if (typeof (val as any)?.toDate === "function") return (val as any).toDate().getTime();
      return 0;
    };
    const tA = getTs(a);
    const tB = getTs(b);
    if (tA !== tB) return tB - tA; // Newest first
    return (a.name || "").localeCompare(b.name || "");
  });
}

/** Subscribe to clients of a specific type (client/lead). */
export function subscribeToClients(
  type: "client" | "lead",
  cb: (clients: Client[]) => void,
  errorCb?: (error: unknown) => void,
): () => void {
  const q = query(collection(db, CLIENTS_COL), where("type", "==", type));
  return onSnapshot(
    q,
    (snap) => {
      const clients = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Client);
      cb(sortClientsNewestFirst(clients));
    },
    (error) => {
      console.error(`[subscribeToClients] type=${type} failed:`, error);
      if (errorCb) errorCb(error);
      cb([]);
    },
  );
}

/** Subscribe to all clients. */
export function subscribeAllClients(
  cb: (clients: Client[]) => void,
  errorCb?: (error: unknown) => void,
): () => void {
  const q = query(collection(db, CLIENTS_COL));
  return onSnapshot(
    q,
    (snap) => {
      const clients = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Client);
      cb(sortClientsNewestFirst(clients));
    },
    (error) => {
      console.error("[subscribeAllClients] failed:", error);
      if (errorCb) errorCb(error);
      cb([]);
    },
  );
}

export async function logActivity(
  clientId: string,
  action: string,
  fieldName: string | null,
  oldValue: string | null,
  newValue: string | null,
  actorOverride?: { name: string; uid: string; role: string },
): Promise<void> {
  try {
    const session = getSession();
    const performedBy = actorOverride?.name ?? session?.name ?? "System";
    const performedById = actorOverride?.uid ?? session?.uid ?? "system";
    const performedByRole = actorOverride?.role ?? session?.role ?? "admin";
    const performedAt = new Date().toISOString();

    await addDoc(collection(db, "client_activity_logs"), {
      clientId,
      action,
      fieldName: fieldName || null,
      oldValue: oldValue || null,
      newValue: newValue || null,
      performedBy,
      performedById,
      performedByRole,
      performedAt,
    });
  } catch (err) {
    console.error("[logActivity] Failed to write client_activity_logs:", err);
  }
}

/** Upsert a client doc. */
export async function saveClient(
  client: Client,
  actorOverride?: { name: string; uid: string; role: string },
): Promise<void> {
  const { id, ...data } = client;
  const now = new Date().toISOString();
  const docRef = doc(db, CLIENTS_COL, id);

  const session = getSession();
  const actorName = actorOverride?.name ?? session?.name ?? "System";
  const actorId = actorOverride?.uid ?? session?.uid ?? "system";

  // Check if client doc exists
  const existingSnap = await getDoc(docRef);
  const existing = existingSnap.exists() ? (existingSnap.data() as Client) : null;

  const isNew = !existing;

  const cleanData = removeUndefined(transformDataObject({
    ...data,
    createdAt: existing?.createdAt ?? now,
    createdBy: existing?.createdBy ?? actorName,
    createdById: existing?.createdById ?? actorId,
    updatedAt: now,
    updatedBy: actorName,
    updatedById: actorId,
  }));

  await setDoc(docRef, cleanData, { merge: true });

  // Automatically initialize all required profile collections
  if (isNew) {
    const profiles = [
      "accounting_profiles",
      "service_profiles",
      "task_profiles",
      "billing_profiles",
      "document_folders",
      "activity_histories",
      "payment_ledgers",
      "insurance_profiles",
      "registry_profiles",
      "analytics_records",
      "dashboard_counters"
    ];
    for (const colName of profiles) {
      try {
        await setDoc(doc(db, colName, id), {
          clientId: id,
          createdAt: now,
          updatedAt: now,
        });
      } catch (err) {
        console.error(`[saveClient] Failed to create profile ${colName}:`, err);
      }
    }
    await logActivity(id, "Created Client", null, null, null, actorOverride);
  } else if (existing) {
    // Compare fields
    const fieldsToTrack: (keyof Client)[] = [
      "name",
      "mobile",
      "address",
      "companyName",
      "notes",
      "ownerName",
      "alternateMobile",
      "email",
      "city",
      "state",
      "groupName",
      "customerType",
      "status",
    ];
    for (const f of fieldsToTrack) {
      const oldVal = existing[f] || "";
      const newVal = client[f] || "";
      if (oldVal !== newVal) {
        await logActivity(id, "Updated Details", f, String(oldVal), String(newVal), actorOverride);
      }
    }
  }

  invalidateCache();
}

/** Delete a client doc and all related records in a cascading fashion. */
export async function deleteClient(id: string): Promise<void> {
  const batch = writeBatch(db);

  // 1. Delete client document
  batch.delete(doc(db, CLIENTS_COL, id));

  // 2. Delete static profiles (ID matches clientId)
  const profiles = [
    "accounting_profiles",
    "service_profiles",
    "task_profiles",
    "billing_profiles",
    "document_folders",
    "activity_histories",
    "payment_ledgers",
    "insurance_profiles",
    "registry_profiles",
    "analytics_records",
    "dashboard_counters"
  ];
  profiles.forEach((p) => {
    batch.delete(doc(db, p, id));
  });

  // 3. Delete from queryable collections where clientId / recordId == id
  const queries = [
    query(collection(db, "finance_records"), where("clientId", "==", id)),
    query(collection(db, "billing_invoices"), where("clientId", "==", id)),
    query(collection(db, "billing_invoice_payments"), where("clientId", "==", id)),
    query(collection(db, "payment_history"), where("clientId", "==", id)),
    query(collection(db, "registry_tasks"), where("recordId", "==", id)),
    query(collection(db, "registry_tasks"), where("clientId", "==", id)),
    query(collection(db, "client_activity_logs"), where("clientId", "==", id)),
    query(collection(db, "client_documents"), where("clientId", "==", id)),
    query(collection(db, "vehicle_documents"), where("clientId", "==", id)),
    query(collection(db, "registry_client_docs"), where("clientId", "==", id)),
    query(collection(db, "registry_vehicles_v2"), where("clientId", "==", id)),
    query(collection(db, "accounts_ledger"), where("referenceId", "==", id)),
    query(collection(db, "accounts_ledger"), where("clientId", "==", id)),
    query(collection(db, "registry_services_v2"), where("clientId", "==", id)),
  ];

  const vehicleIds: string[] = [];
  const invoiceIds: string[] = [];
  const deletedPaymentIds: string[] = [];

  for (const q of queries) {
    try {
      const snap = await getDocs(q);
      snap.forEach((d) => {
        batch.delete(d.ref);
        if (d.ref.parent.id === "registry_vehicles_v2") {
          vehicleIds.push(d.id);
        }
        if (d.ref.parent.id === "billing_invoices") {
          invoiceIds.push(d.id);
        }
        if (d.ref.parent.id === "payment_history") {
          deletedPaymentIds.push(d.id || d.ref.id);
        }
      });
    } catch (err) {
      console.warn(`[deleteClient] Query failed during cascade:`, err);
    }
  }

  // 4. Delete services associated with the vehicles
  for (const vId of vehicleIds) {
    try {
      const qServices = query(collection(db, "registry_services_v2"), where("vehicleId", "==", vId));
      const snapServices = await getDocs(qServices);
      snapServices.forEach((d) => {
        batch.delete(d.ref);
      });
    } catch (err) {
      console.warn(`[deleteClient] Service delete failed for vehicle ${vId}:`, err);
    }
  }

  // 5. Delete finance records / payments for the invoices
  for (const invId of invoiceIds) {
    try {
      const qFinance = query(collection(db, "finance_records"), where("invoiceId", "==", invId));
      const snapFinance = await getDocs(qFinance);
      snapFinance.forEach((d) => {
        batch.delete(d.ref);
      });
    } catch (err) {
      console.warn(`[deleteClient] Finance record delete failed for invoice ${invId}:`, err);
    }

    try {
      const qPayments = query(collection(db, "payment_history"), where("invoiceId", "==", invId));
      const snapPayments = await getDocs(qPayments);
      snapPayments.forEach((d) => {
        batch.delete(d.ref);
        deletedPaymentIds.push(d.id || d.ref.id);
      });
    } catch (err) {
      console.warn(`[deleteClient] Payment history delete failed for invoice ${invId}:`, err);
    }
  }

  // 6. Delete ledger entries for all deleted payments
  for (const pid of deletedPaymentIds) {
    try {
      const qLedger = query(collection(db, "accounts_ledger"), where("referenceId", "==", pid));
      const snapLedger = await getDocs(qLedger);
      snapLedger.forEach((d) => {
        batch.delete(d.ref);
      });
    } catch (err) {
      console.warn(`[deleteClient] Ledger delete failed for payment ${pid}:`, err);
    }
  }

  await batch.commit();
  invalidateCache();
}

// ─── Vehicle Operations ───────────────────────────────────────────────────────

/** Subscribe to vehicles for a specific client. */
export function subscribeToVehiclesForClient(
  clientId: string,
  cb: (vehicles: Vehicle[]) => void,
): () => void {
  const q = query(collection(db, VEHICLES_COL), where("clientId", "==", clientId));
  return onSnapshot(
    q,
    (snap) => {
      const vehicles = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Vehicle);
      cb(vehicles.sort((a, b) => a.vehicleNumber.localeCompare(b.vehicleNumber)));
    },
    (error) => {
      console.error(`[subscribeToVehiclesForClient] client=${clientId} failed:`, error);
      cb([]);
    },
  );
}

/** Subscribe to all vehicles. */
export function subscribeAllVehicles(cb: (vehicles: Vehicle[]) => void): () => void {
  const q = query(collection(db, VEHICLES_COL));
  return onSnapshot(
    q,
    (snap) => {
      const vehicles = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Vehicle);
      cb(vehicles);
    },
    (error) => {
      console.error("[subscribeAllVehicles] failed:", error);
      cb([]);
    },
  );
}

/** Upsert a vehicle doc. */
export async function saveVehicle(
  vehicle: Vehicle,
  actorOverride?: { name: string; uid: string; role: string },
): Promise<void> {
  const { id, ...data } = vehicle;
  const now = new Date().toISOString();
  const docRef = doc(db, VEHICLES_COL, id);

  const existingSnap = await getDoc(docRef);
  const existing = existingSnap.exists() ? (existingSnap.data() as Vehicle) : null;
  const isNew = !existing;

  const cleanData = removeUndefined(transformDataObject({
    ...data,
    updatedAt: now,
    createdAt: data.createdAt || now,
  }));
  await setDoc(docRef, cleanData, { merge: true });

  if (isNew) {
    await logActivity(
      vehicle.clientId,
      "Vehicle Added",
      "vehicleNumber",
      null,
      vehicle.vehicleNumber,
      actorOverride,
    );
  } else if (existing) {
    const fieldsToTrack: (keyof Vehicle)[] = [
      "vehicleNumber",
      "vehicleType",
      "chassisNumber",
      "engineNumber",
      "registrationDate",
      "status",
    ];
    for (const f of fieldsToTrack) {
      const oldVal = existing[f] || "";
      const newVal = vehicle[f] || "";
      if (oldVal !== newVal) {
        await logActivity(
          vehicle.clientId,
          "Vehicle Updated",
          f,
          String(oldVal),
          String(newVal),
          actorOverride,
        );
      }
    }
  }
}

/** Delete a vehicle doc and cascade delete services and accounting records. */
export async function deleteVehicle(id: string): Promise<void> {
  const servicesSnap = await getDocs(
    query(collection(db, SERVICES_COL), where("vehicleId", "==", id))
  );
  for (const d of servicesSnap.docs) {
    await deleteService(d.id);
  }
  await deleteDoc(doc(db, VEHICLES_COL, id));
}

// ─── Service Operations ───────────────────────────────────────────────────────

/** Subscribe to services for a specific vehicle. */
export function subscribeToServicesForVehicle(
  vehicleId: string,
  cb: (services: Service[]) => void,
): () => void {
  const q = query(collection(db, SERVICES_COL), where("vehicleId", "==", vehicleId));
  return onSnapshot(
    q,
    (snap) => {
      const services = snap.docs.map((d) => {
        const item = d.data();
        const serviceAmount = item.serviceAmount ?? 0;
        const amountReceived = item.amountReceived ?? 0;
        return {
          id: d.id,
          ...item,
          pendingAmount: Math.max(0, serviceAmount - amountReceived),
        } as Service;
      });
      cb(services);
    },
    (error) => {
      console.error(`[subscribeToServicesForVehicle] vehicle=${vehicleId} failed:`, error);
      cb([]);
    },
  );
}

/** Subscribe to all services. */
export function subscribeAllServices(cb: (services: Service[]) => void): () => void {
  const q = query(collection(db, SERVICES_COL));
  return onSnapshot(
    q,
    (snap) => {
      const services = snap.docs.map((d) => {
        const item = d.data();
        const serviceAmount = item.serviceAmount ?? 0;
        const amountReceived = item.amountReceived ?? 0;
        return {
          id: d.id,
          ...item,
          pendingAmount: Math.max(0, serviceAmount - amountReceived),
        } as Service;
      });
      cb(services);
    },
    (error) => {
      console.error("[subscribeAllServices] failed:", error);
      cb([]);
    },
  );
}

/** Subscribe to services filtered by type. */
export function subscribeToServicesByType(
  serviceType: ServiceType,
  cb: (services: Service[]) => void,
): () => void {
  const q = query(collection(db, SERVICES_COL), where("serviceType", "==", serviceType));
  return onSnapshot(
    q,
    (snap) => {
      const services = snap.docs.map((d) => {
        const item = d.data();
        const serviceAmount = item.serviceAmount ?? 0;
        const amountReceived = item.amountReceived ?? 0;
        return {
          id: d.id,
          ...item,
          pendingAmount: Math.max(0, serviceAmount - amountReceived),
        } as Service;
      });
      cb(services);
    },
    (error) => {
      console.error(`[subscribeToServicesByType] type=${serviceType} failed:`, error);
      cb([]);
    },
  );
}

/** Upsert a service doc. */
export async function saveService(
  service: Service,
  actorOverride?: { name: string; uid: string; role: string },
): Promise<void> {
  const { id, ...data } = service;
  const now = new Date().toISOString();
  const docRef = doc(db, SERVICES_COL, id);
  const serviceAmount = data.serviceAmount ?? 0;
  const amountReceived = data.amountReceived ?? 0;
  const advancePayment = data.advancePayment ?? 0;
  const effAdvance = advancePayment || amountReceived;

  if (serviceAmount > 0 && !isAdvanceAmountValid(serviceAmount, effAdvance)) {
    throw new Error(ADVANCE_AMOUNT_ERROR_MESSAGE);
  } else if (serviceAmount === 0 && effAdvance > 0) {
    throw new Error(ADVANCE_AMOUNT_ERROR_MESSAGE);
  }

  const pendingAmount = Math.max(0, serviceAmount - amountReceived - advancePayment);
  const progress = getProgressFromStatus(data.taskStatus);

  const existingSnap = await getDoc(docRef);
  const existing = existingSnap.exists() ? (existingSnap.data() as Service) : null;
  const isNew = !existing;

  // Uniqueness validation for applicationId
  if (data.applicationId && data.applicationId.trim() !== "") {
    const q = query(
      collection(db, SERVICES_COL),
      where("applicationId", "==", data.applicationId.trim())
    );
    const snap = await getDocs(q);
    const duplicate = snap.docs.find((d) => d.id !== id);
    if (duplicate) {
      throw new Error(`Application ID "${data.applicationId.trim()}" is already assigned to another service.`);
    }
  }

  // Fetch task template if specified and changed/new
  let templateUpdates: any = {};
  if (data.templateId && data.templateId.trim() !== "") {
    if (isNew || existing?.templateId !== data.templateId) {
      try {
        const tplDoc = await getDoc(doc(db, "task_templates", data.templateId));
        if (tplDoc.exists()) {
          const tplData = tplDoc.data();
          const actor = actorOverride?.name || actorOverride?.role || "system";
          const copiedSubtasks = (tplData.subtasks || []).map((sub: string) => ({
            id: `sub_${crypto.randomUUID()}`,
            title: sub,
            completed: false,
            createdBy: actor,
            createdAt: now,
          }));
          templateUpdates = {
            title: tplData.templateName || "",
            description: tplData.description || "",
            subtasks: copiedSubtasks,
          };
        }
      } catch (err) {
        console.error("Failed to fetch task template in saveService:", err);
      }
    }
  }

  const cleanData = removeUndefined(transformDataObject({
    ...data,
    ...templateUpdates,
    pendingAmount,
    progress,
    updatedAt: now,
    createdAt: data.createdAt || now,
  }));
  await setDoc(docRef, cleanData, { merge: true });

  // Look up vehicle or use clientId directly for activity logging
  let clientId = data.clientId || "";
  if (!clientId && data.vehicleId) {
    try {
      const vDoc = await getDoc(doc(db, VEHICLES_COL, data.vehicleId));
      if (vDoc.exists()) {
        clientId = vDoc.data().clientId || "";
      }
    } catch (err) {
      console.error("Failed to fetch vehicle for service activity log:", err);
    }
  }

  if (clientId) {
    if (isNew) {
      await logActivity(
        clientId,
        "Service Added",
        "serviceType",
        null,
        data.serviceType,
        actorOverride,
      );
    } else if (existing) {
      if (existing.dueDate !== data.dueDate) {
        await logActivity(
          clientId,
          "Due Date Changed",
          `${data.serviceType} Due Date`,
          existing.dueDate,
          data.dueDate,
          actorOverride,
        );
      }
      if (existing.serviceAmount !== serviceAmount || existing.amountReceived !== amountReceived) {
        await logActivity(
          clientId,
          "Accounting Updated",
          `${data.serviceType} Accounting`,
          `Amount: ${existing.serviceAmount}, Received: ${existing.amountReceived}`,
          `Amount: ${serviceAmount}, Received: ${amountReceived}`,
          actorOverride,
        );
      }
      if (existing.taskStatus !== data.taskStatus) {
        await logActivity(
          clientId,
          "Service Updated",
          `${data.serviceType} Status`,
          existing.taskStatus,
          data.taskStatus,
          actorOverride,
        );
      }
    }
  }

  // Sync payment history / ledger entries for this service advance payment
  if (clientId) {
    try {
      const clientRef = doc(db, CLIENTS_COL, clientId);
      const clientSnap = await getDoc(clientRef);
      if (clientSnap.exists()) {
        const clientData = clientSnap.data() as Client;
        const { syncServiceAdvancePayment } = await import("./financeService");
        await syncServiceAdvancePayment(
          { id, ...cleanData },
          clientId,
          clientData.name,
          clientData.mobile,
          clientData.address,
          actorOverride?.name || "System"
        );
      }
    } catch (err) {
      console.error("Failed to sync service advance payment:", err);
    }
  }

  // Sync invoice totals
  if (cleanData.invoiceId && cleanData.invoiceId !== "none") {
    try {
      const { syncInvoiceWithServices } = await import("./financeService");
      await syncInvoiceWithServices(cleanData.invoiceId);
    } catch (err) {
      console.error("Failed to sync invoice with services:", err);
    }
  }
  if (existing?.invoiceId && existing.invoiceId !== "none" && existing.invoiceId !== cleanData.invoiceId) {
    try {
      const { syncInvoiceWithServices } = await import("./financeService");
      await syncInvoiceWithServices(existing.invoiceId);
    } catch (err) {
      console.error("Failed to sync old invoice with services:", err);
    }
  }
}

/** Delete a service doc and cascade delete its billing invoices, payments, and ledger entries. */
export async function deleteService(
  id: string,
  actorOverride?: { name: string; uid: string; role: string },
): Promise<void> {
  const sSnap = await getDoc(doc(db, SERVICES_COL, id));
  if (sSnap.exists()) {
    const service = sSnap.data() as Service;
    let clientId = service.clientId || "";
    if (!clientId && service.vehicleId) {
      try {
        const vDoc = await getDoc(doc(db, VEHICLES_COL, service.vehicleId));
        if (vDoc.exists()) {
          clientId = vDoc.data().clientId || "";
        }
      } catch (err) {
        console.error(err);
      }
    }
    if (clientId) {
      await logActivity(
        clientId,
        "Service Removed",
        "serviceType",
        service.serviceType,
        null,
        actorOverride,
      );
    }

    const batch = writeBatch(db);

    // 1. Delete payment and ledger entries associated with this service advance
    const paymentId = `pay_service_${id}`;
    const ledgerId = `ledger_service_${id}`;
    batch.delete(doc(db, "payment_history", paymentId));
    batch.delete(doc(db, "accounts_ledger", ledgerId));

    // 2. Find invoices containing this serviceId to sync them later
    const invoicesSnap = await getDocs(collection(db, "billing_invoices"));
    const invoiceIdsToSync: string[] = [];
    invoicesSnap.forEach((d) => {
      const inv = d.data() as any;
      if (inv.services?.some((s: any) => s.serviceId === id)) {
        invoiceIdsToSync.push(inv.id || d.id);
      }
    });

    await batch.commit();
    await deleteDoc(doc(db, SERVICES_COL, id));

    // Sync remaining invoices
    if (invoiceIdsToSync.length > 0) {
      try {
        const { syncInvoiceWithServices } = await import("./financeService");
        for (const invId of invoiceIdsToSync) {
          await syncInvoiceWithServices(invId);
        }
      } catch (err) {
        console.error("Failed to sync invoices after service deletion:", err);
      }
    }
  }
}

// ─── Hierarchical Client Details ──────────────────────────────────────────────

/**
 * Subscribes to a client, all their vehicles, and all their services.
 * Dynamically aggregates accounting totals and yields details.
 */
export function subscribeToClientDetails(
  clientId: string,
  cb: (details: ClientDetails | null) => void,
): () => void {
  let client: Client | null = null;
  let vehicles: Vehicle[] = [];
  let personalServices: Service[] = [];
  let serviceSubscribers: Record<string, () => void> = {};
  let servicesMap: Record<string, Service[]> = {};
  let unsubscribing = false;

  const triggerCallback = () => {
    if (unsubscribing || !client) {
      cb(null);
      return;
    }

    const detailedVehicles = vehicles.map((v) => ({
      ...v,
      services: servicesMap[v.id] ?? [],
    }));

    // Calculate aggregated accounting
    let totalAmount = 0;
    let amountReceived = 0;
    let hasAllocatedAdvance = false;

    for (const v of detailedVehicles) {
      for (const s of v.services) {
        totalAmount += s.serviceAmount ?? 0;
        amountReceived += s.amountReceived ?? 0;
        if (s.invoiceId === `advance_${client.id}`) {
          hasAllocatedAdvance = true;
        }
      }
    }

    for (const s of personalServices) {
      totalAmount += s.serviceAmount ?? 0;
      amountReceived += s.amountReceived ?? 0;
      if (s.invoiceId === `advance_${client.id}`) {
        hasAllocatedAdvance = true;
      }
    }

    if (!hasAllocatedAdvance) {
      amountReceived += client.advancePayment ?? 0;
    }

    const accounting: ClientAccounting = {
      totalAmount,
      amountReceived,
      pendingAmount: Math.max(0, totalAmount - amountReceived),
    };

    cb({
      ...client,
      vehicles: detailedVehicles,
      personalServices,
      accounting,
    });
  };

  // Subscribe to Client
  const unsubClient = onSnapshot(doc(db, CLIENTS_COL, clientId), (snap) => {
    if (!snap.exists()) {
      client = null;
      triggerCallback();
      return;
    }
    client = { id: snap.id, ...snap.data() } as Client;
    triggerCallback();
  });

  // Subscribe to Personal Services (where clientId == clientId and vehicleId is empty or is a license service)
  const qPersonalServices = query(collection(db, SERVICES_COL), where("clientId", "==", clientId));
  const unsubPersonalServices = onSnapshot(qPersonalServices, (snap) => {
    personalServices = snap.docs
      .map((d) => {
        const data = d.data();
        const serviceAmount = data.serviceAmount ?? 0;
        const amountReceived = data.amountReceived ?? 0;
        return {
          id: d.id,
          ...data,
          pendingAmount: Math.max(0, serviceAmount - amountReceived),
        } as Service;
      })
      .filter((s) => !s.vehicleId || isLicenseService(s.serviceType));

    triggerCallback();
  });

  // Subscribe to Vehicles
  const qVehicles = query(collection(db, VEHICLES_COL), where("clientId", "==", clientId));
  const unsubVehicles = onSnapshot(qVehicles, (snap) => {
    vehicles = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Vehicle);

    // Cleanup service subscriptions for vehicles that are no longer present
    const vehicleIds = vehicles.map((v) => v.id);
    Object.keys(serviceSubscribers).forEach((vid) => {
      if (!vehicleIds.includes(vid)) {
        serviceSubscribers[vid]();
        delete serviceSubscribers[vid];
        delete servicesMap[vid];
      }
    });

    // Subscribe to services for any new vehicles
    vehicles.forEach((v) => {
      if (!serviceSubscribers[v.id]) {
        const qServices = query(collection(db, SERVICES_COL), where("vehicleId", "==", v.id));
        serviceSubscribers[v.id] = onSnapshot(qServices, (sSnap) => {
          servicesMap[v.id] = sSnap.docs.map((d) => {
            const data = d.data();
            const serviceAmount = data.serviceAmount ?? 0;
            const amountReceived = data.amountReceived ?? 0;
            return {
              id: d.id,
              ...data,
              pendingAmount: Math.max(0, serviceAmount - amountReceived),
            } as Service;
          });
          triggerCallback();
        });
      }
    });

    triggerCallback();
  });

  return () => {
    unsubscribing = true;
    unsubClient();
    unsubPersonalServices();
    unsubVehicles();
    Object.values(serviceSubscribers).forEach((unsub) => unsub());
  };
}

/** Add a document metadata object to a vehicle's documents array. */
export async function addVehicleDocument(
  vehicleId: string,
  docData: VehicleDocument,
  actorOverride?: { name: string; uid: string; role: string },
): Promise<void> {
  const docRef = doc(db, VEHICLES_COL, vehicleId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error("Vehicle not found");
  const vehicle = snap.data() as Vehicle;
  const documents = vehicle.documents || [];
  documents.push(docData);
  await setDoc(docRef, { documents }, { merge: true });

  await logActivity(
    vehicle.clientId,
    "Document Uploaded",
    "documentName",
    null,
    docData.fileName,
    actorOverride,
  );
}

/** Delete a document metadata object from a vehicle's documents array by document id. */
export async function deleteVehicleDocument(
  vehicleId: string,
  documentId: string,
  actorOverride?: { name: string; uid: string; role: string },
): Promise<void> {
  const docRef = doc(db, VEHICLES_COL, vehicleId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error("Vehicle not found");
  const vehicle = snap.data() as Vehicle;
  const toDelete = (vehicle.documents || []).find((d) => d.id === documentId);
  const documents = (vehicle.documents || []).filter((d) => d.id !== documentId);
  await setDoc(docRef, { documents }, { merge: true });

  if (toDelete) {
    await logActivity(
      vehicle.clientId,
      "Document Removed",
      "documentName",
      toDelete.fileName,
      null,
      actorOverride,
    );
  }
}
