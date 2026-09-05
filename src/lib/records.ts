// Records — Firestore-backed client & lead registry.
import {
  collection,
  query,
  orderBy,
  where,
  getDocs,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  arrayUnion,
  addDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { createActivity, logClientActivity, type ActivityLog } from "./activity";
import { transformInput, getForceCapsSetting, CAPITALIZE_FIELDS } from "./capitalize-settings";
import { isLicenseRenewal } from "./documentTypes";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecordStatus = "Pending" | "In Progress" | "Completed" | "On Hold";

export type DeleteReason = "Duplicate Entry" | "Wrong Client" | "Testing Data" | "Other";

export interface RecordAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  storagePath: string; // Firebase Storage path
  downloadUrl: string;
  uploadedAt: string;
  uploadedBy: string;
  /** Optional: the service this attachment is associated with */
  serviceType?: ServiceType;
}

export type PaymentStatus = "Paid" | "Partially Paid" | "Unpaid";

export type ServiceType =
  | "Insurance"
  | "Fitness"
  | "Gujarat Permit"
  | "National Permit"
  | "National Permit(Gujrat Permit)"
  | "Tax"
  | "PUC"
  | "License New"
  | "License Renew"
  | "RC Transfer"
  | "HP Addition"
  | "HP Termination";

export type ServiceStatus =
  | "Pending"
  | "In Progress"
  | "Completed"
  | "On Hold"
  | "Renewal Due"
  | "Active"
  | "Paid"
  | "Partially Paid"
  | "Unpaid";

export interface ServiceDetail {
  serviceType: ServiceType;
  dueDate: string; // YYYY-MM-DD
  status: string; // e.g. "Active", "Renewal Due", "Completed", etc.
  price?: number; // Service-specific price / charge
  amountReceived?: number; // Service-specific amount received
  assignee?: string; // Service-specific assignee (optional)
  serviceId?: string;
  notes?: string;
  vehicleId?: string;
  vehicleNumber?: string;
  vehicleType?: string;
  applicationType?: string;
  applicationId?: string;
  advancePayment?: number;
  assignedEmployeeName?: string;
  taskTemplate?: string;
}

export const SERVICE_TYPES: ServiceType[] = [
  "Insurance",
  "Fitness",
  "Gujarat Permit",
  "National Permit",
  "National Permit(Gujrat Permit)",
  "Tax",
  "PUC",
  "License New",
  "License Renew",
  "RC Transfer",
  "HP Addition",
  "HP Termination",
];

/**
 * Maps URL-safe route parameters (lowercase/dash-separated) to proper ServiceType names.
 * Used to resolve service types from dynamic routes like /dashboard/service/{serviceType}
 */
export const SERVICE_ROUTE_MAP: Record<string, ServiceType> = {
  insurance: "Insurance",
  fitness: "Fitness",
  "gujarat-permit": "Gujarat Permit",
  "national-permit": "National Permit(Gujrat Permit)",
  tax: "Tax",
  puc: "PUC",
  // Backwards-compatibility: /service/license -> License New
  license: "License New",
  "license-new": "License New",
  "license-renew": "License Renew",
  "license-renewal": "License Renew",
  "rc-transfer": "RC Transfer",
  "hp-addition": "HP Addition",
  "hp-termination": "HP Termination",
};

/**
 * CRITICAL: Normalize any service type value to canonical form.
 * Handles: "insurance" → "Insurance", "INSURANCE" → "Insurance", "Insurance" → "Insurance"
 * MUST be called before every Firestore write to maintain data consistency.
 */
export function normalizeServiceType(value: any): ServiceType | null {
  if (!value || typeof value !== "string") return null;

  const trimmed = value.trim();

  // Check if already canonical (in SERVICE_TYPES)
  if (SERVICE_TYPES.includes(trimmed as ServiceType)) {
    return trimmed as ServiceType;
  }

  // Try mapping from route parameter format
  const mapped = SERVICE_ROUTE_MAP[trimmed.toLowerCase()];
  if (mapped) return mapped;

  // Try converting from lowercase slug format
  const asSlug = trimmed.toLowerCase().replace(/\s+/g, "-");
  const mapped2 = SERVICE_ROUTE_MAP[asSlug];
  if (mapped2) return mapped2;

  // Special-case legacy single-word 'License' — map to License New by default
  if (trimmed.toLowerCase() === "license") return "License New";

  console.warn(
    "[normalizeServiceType] Unknown service type:",
    value,
    "- not in SERVICE_TYPES or SERVICE_ROUTE_MAP",
  );
  return null;
}

export function normalizeLegacyServiceType(
  value: any,
  application?: string,
  work?: string,
): ServiceType | null {
  const rawType = String(value ?? "").trim();
  const normalized = normalizeServiceType(rawType);
  if (!normalized) return null;

  if (rawType.toLowerCase() === "license") {
    return isLicenseRenewal(application, work) ? "License Renew" : "License New";
  }

  return normalized;
}

export interface RegistryRecord {
  id: string;
  srNo: number;
  date: string; // yyyy-mm-dd
  mvNo: string;
  application: string;
  work: string;
  name: string;
  status: RecordStatus;
  mo: string;
  insurance: string;
  fitness: string;
  tax: string;
  co: string;
  groupName?: string; // Client group/company
  assignee?: string; // staff username
  createdAt?: string;
  createdBy?: string;
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
  activityLogs?: ActivityLog[];
  attachments?: RecordAttachment[]; // Files attached to this client record
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: DeleteReason;
  // Vehicle Details addition
  chassisNo?: string;
  engineNo?: string;
  // Legacy accounting fields (kept for migration compatibility)
  serviceAmount?: number;
  amountReceived?: number;
  paymentDate?: string;
  paymentStatus?: string;
  // Service Management fields
  serviceType?: ServiceType; // Legacy single service field (kept for compatibility)
  services?: ServiceDetail[]; // New multi-service support with details
  serviceTypes?: ServiceType[]; // Support Firestore array-contains queries
  serviceStatus?: ServiceStatus; // Service-specific status
  serviceDueDate?: string; // ISO date string for service renewal
}

/**
 * Get canonical services for a record, supporting legacy `serviceType`.
 */
export function getRecordServices(record: RegistryRecord): ServiceType[] {
  const source =
    Array.isArray(record.services) && record.services.length > 0
      ? record.services
      : record.serviceType
        ? [record.serviceType]
        : [];

  return source
    .map((s) => {
      const rawType = typeof s === "object" && s !== null ? (s as any).serviceType : s;
      return normalizeLegacyServiceType(rawType, record.application, record.work);
    })
    .filter((t): t is ServiceType => Boolean(t));
}

/**
 * Get service details objects (serviceType, dueDate, status) for a record, supporting legacy formats.
 */
export function getRecordServiceDetails(record: RegistryRecord): ServiceDetail[] {
  const defaultStatus = record.serviceStatus ?? record.status ?? "Active";

  if (Array.isArray(record.services) && record.services.length > 0) {
    return record.services
      .map((s) => {
        if (typeof s === "object" && s !== null) {
          const normalizedType = normalizeLegacyServiceType(
            s.serviceType,
            record.application,
            record.work,
          );
          if (!normalizedType) return null;

          const price =
            typeof s.price === "number"
              ? s.price
              : typeof (s as any).serviceAmount === "number"
                ? (s as any).serviceAmount
                : Number(s.price ?? (s as any).serviceAmount) || 0;

          const amountReceived =
            typeof s.amountReceived === "number"
              ? s.amountReceived
              : typeof (s as any).receivedAmount === "number"
                ? (s as any).receivedAmount
                : (s.amountReceived ?? (s as any).receivedAmount) !== undefined
                  ? Number(s.amountReceived ?? (s as any).receivedAmount)
                  : undefined;

          return {
            serviceType: normalizedType,
            dueDate: s.dueDate || record.serviceDueDate || "",
            status: s.status || defaultStatus,
            price,
            amountReceived,
            ...(s.assignee ? { assignee: s.assignee } : {}),
            vehicleId: s.vehicleId,
            vehicleNumber: s.vehicleNumber,
            vehicleType: s.vehicleType,
            serviceId: s.serviceId,
            notes: s.notes,
          };
        }

        const normalizedType = normalizeLegacyServiceType(s, record.application, record.work);
        if (!normalizedType) return null;

        return {
          serviceType: normalizedType,
          dueDate: record.serviceDueDate || "",
          status: defaultStatus,
          price: 0,
          amountReceived: 0,
        };
      })
      .filter((detail) => detail !== null) as ServiceDetail[];
  }

  if (record.serviceType) {
    const normalizedType = normalizeLegacyServiceType(
      record.serviceType,
      record.application,
      record.work,
    );
    if (!normalizedType) return [];
    return [
      {
        serviceType: normalizedType,
        dueDate: record.serviceDueDate || "",
        status: defaultStatus,
        price: 0,
        amountReceived: 0,
      },
    ];
  }

  return [];
}

export type Bucket = "clients" | "leads";

// ─── Staff users (shared across auth + tasks) ─────────────────────────────────

export const STAFF_USERS: { username: string; name: string }[] = [
  { username: "staff", name: "Front Desk" },
  { username: "priya", name: "Priya Nair" },
  { username: "rahul", name: "Rahul Verma" },
];

let employeesCache: any[] = [];
// Subscribe to users collection to dynamically maintain cache of names
onSnapshot(collection(db, "users"), (snap) => {
  employeesCache = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  
  // Dynamically update STAFF_USERS to reflect only active users from DB
  const dbActive = employeesCache
    .filter((e) => e.status === "active" || e.isActive !== false)
    .map((e) => ({
      username: e.username || e.uid,
      name: e.fullName || e.name || e.username,
    }));
  if (dbActive.length > 0) {
    STAFF_USERS.length = 0;
    STAFF_USERS.push(...dbActive);
  }
});

export const staffLabel = (username?: string) => {
  if (!username) return "";
  const found = employeesCache.find(
    (e) =>
      e.uid === username ||
      e.employeeId === username ||
      e.username === username ||
      e.fullName === username ||
      e.name === username
  );
  if (found) return found.fullName || found.name || found.username || username;

  return STAFF_USERS.find((s) => s.username === username)?.name ?? username;
};

// ─── Service helpers ──────────────────────────────────────────────────────────

export const serviceLabel = (type?: ServiceType): string => {
  if (!type) return "";
  const labels: Record<ServiceType, string> = {
    Insurance: "🛡️ Insurance",
    Fitness: "💪 Fitness",
    "Gujarat Permit": "📍 Gujarat Permit",
    "National Permit": "🇮🇳 National Permit(Gujrat Permit)",
    "National Permit(Gujrat Permit)": "🇮🇳 National Permit(Gujrat Permit)",
    Tax: "💰 Tax",
    PUC: "🌍 PUC",
    "License New": "🔖 License (New)",
    "License Renew": "🔁 License (Renew)",
    "RC Transfer": "🔄 RC Transfer",
    "HP Addition": "➕ HP Addition",
    "HP Termination": "❌ HP Termination",
  };
  return labels[type] ?? type;
};

export const serviceColor = (type?: ServiceType): string => {
  if (!type) return "bg-gray-500";
  const colors: Record<ServiceType, string> = {
    Insurance: "bg-blue-500",
    Fitness: "bg-green-500",
    "Gujarat Permit": "bg-purple-600",
    "National Permit": "bg-purple-700",
    "National Permit(Gujrat Permit)": "bg-purple-700",
    Tax: "bg-yellow-500",
    PUC: "bg-emerald-500",
    "License New": "bg-cyan-500",
    "License Renew": "bg-sky-400",
    "RC Transfer": "bg-orange-500",
    "HP Addition": "bg-pink-500",
    "HP Termination": "bg-red-500",
  };
  return colors[type] ?? "bg-gray-500";
};

/**
 * Convert ServiceType to URL-safe route parameter (lowercase, dash-separated).
 * Used for generating service dashboard URLs.
 */
export const serviceToUrlParam = (type?: ServiceType): string => {
  if (!type) return "";
  return type.toLowerCase().replace(/\s+/g, "-"); // Replace spaces with dashes
};

// ─── Accounting helpers ────────────────────────────────────────────────────────

/** Calculate payment status based on amounts. */
export function calculatePaymentStatus(
  serviceAmount?: number,
  amountReceived?: number,
): PaymentStatus {
  if (!serviceAmount || serviceAmount === 0) return "Unpaid";
  if (!amountReceived || amountReceived === 0) return "Unpaid";
  if (amountReceived >= serviceAmount) return "Paid";
  return "Partially Paid";
}

/** Calculate pending amount (serviceAmount - amountReceived). */
export function calculatePendingAmount(serviceAmount?: number, amountReceived?: number): number {
  if (!serviceAmount) return 0;
  if (!amountReceived) return serviceAmount;
  return Math.max(0, serviceAmount - amountReceived);
}

/** Calculate service-specific pending amount. */
export function calculateServicePendingAmount(service: ServiceDetail): number {
  const amount = service.price ?? 0;
  const received = service.amountReceived ?? 0;
  return Math.max(0, amount - received);
}

/** Calculate service-specific payment status. */
export function calculateServicePaymentStatus(service: ServiceDetail): PaymentStatus {
  const amount = service.price ?? 0;
  const received = service.amountReceived ?? 0;

  if (!amount || amount === 0) return "Unpaid";
  if (!received || received === 0) return "Unpaid";
  if (received >= amount) return "Paid";
  return "Partially Paid";
}

/**
 * Get the authoritative total service amount for this record.
 * Uses detailed service item prices when available, otherwise falls back to legacy serviceAmount.
 */
export function getRecordServiceAmount(record: RegistryRecord): number {
  const detailTotal = getRecordServiceDetails(record).reduce(
    (sum, service) => sum + (service.price || 0),
    0,
  );

  // Legacy fallback: if no service details have price, use legacy serviceAmount if available
  if (detailTotal === 0 && typeof record.serviceAmount === "number") {
    return record.serviceAmount;
  }
  return detailTotal > 0 ? detailTotal : 0;
}

export function getRecordServiceAmountByType(
  record: RegistryRecord,
  serviceType: ServiceType,
): number {
  const details = getRecordServiceDetails(record).filter(
    (detail) => detail.serviceType === serviceType,
  );
  const detailTotal = details.reduce((sum, service) => sum + (service.price || 0), 0);

  if (detailTotal > 0) {
    return detailTotal;
  }

  const belongsToType =
    record.serviceType === serviceType || getRecordServices(record).includes(serviceType);
  return belongsToType ? (record.serviceAmount ?? 0) : 0;
}

/** Get service-specific received amount. */
export function getServiceReceivedAmount(service: ServiceDetail): number {
  return service.amountReceived ?? 0;
}

/** Get service-specific pending amount. */
export function getServicePendingAmount(service: ServiceDetail): number {
  return calculateServicePendingAmount(service);
}

/** Get service-specific payment status. */
export function getServicePaymentStatus(service: ServiceDetail): PaymentStatus {
  return calculateServicePaymentStatus(service);
}

/** Get total received across all services in a record. */
export function getRecordTotalReceived(record: RegistryRecord): number {
  const detailsTotal = getRecordServiceDetails(record).reduce(
    (sum, service) => sum + (service.amountReceived ?? 0),
    0,
  );

  return detailsTotal > 0 ? detailsTotal : (record.amountReceived ?? 0);
}

/** Get total pending across all services in a record. */
export function getRecordTotalPending(record: RegistryRecord): number {
  const totalAmount = getRecordServiceAmount(record);
  const totalReceived = getRecordTotalReceived(record);
  return Math.max(0, totalAmount - totalReceived);
}

export function getRecordPendingAmount(record: RegistryRecord, amountReceived?: number): number {
  const totalAmount = getRecordServiceAmount(record);
  const received = amountReceived ?? getRecordTotalReceived(record);
  return Math.max(0, totalAmount - received);
}

export function getRecordPaymentStatus(record: RegistryRecord): PaymentStatus {
  const totalAmount = getRecordServiceAmount(record);
  const received = getRecordTotalReceived(record);
  return calculatePaymentStatus(totalAmount, received);
}

export function hasLegacyAccounting(record: RegistryRecord): boolean {
  return !!(
    record.serviceAmount ||
    record.amountReceived ||
    (record as any).totalAmount ||
    (record as any).receivedAmount ||
    (record as any).pendingAmount ||
    (record as any).accounting ||
    (record as any).legacyAccounting ||
    (record as any).oldAccountingFields
  );
}

/**
 * Recursively removes all keys with undefined values from an object or array.
 */
export function removeUndefined<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => removeUndefined(item)) as unknown as T;
  }
  const result: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      if (val !== undefined) {
        result[key] = removeUndefined(val);
      }
    }
  }
  return result;
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

const colFor = (bucket: Bucket) => `registry_${bucket}`;

/**
 * Subscribe to live record updates for a bucket.
 * Returns an unsubscribe function (use in useEffect cleanup).
 */
export function subscribeToRecords(
  bucket: Bucket,
  cb: (records: RegistryRecord[]) => void,
  errorCb?: (error: unknown) => void,
): () => void {
  const q = query(collection(db, colFor(bucket)), orderBy("srNo"));
  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as RegistryRecord)
        .filter((r) => !r.isDeleted); // Hide soft-deleted records
      cb(records);
    },
    (error) => {
      console.error(`[subscribeToRecords] Firestore error for bucket=${bucket}:`, error);
      if (errorCb) {
        errorCb(error);
      }
      cb([]);
    },
  );
}

/** Upsert a record (creates if new, updates if exists). */
export async function saveRecord(
  bucket: Bucket,
  record: RegistryRecord,
  actor?: string,
): Promise<void> {
  console.log("[saveRecord] Received record for save:", record);
  const colName = colFor(bucket);
  // Ensure we have a valid document id. If the incoming record has no id,
  // generate a new Firestore id so we can safely call getDoc/setDoc.
  const docRef = record.id ? doc(db, colName, record.id) : doc(collection(db, colName));
  const recId = record.id ?? docRef.id;

  // Get existing record to track changes
  const existingDoc = await getDoc(doc(db, colName, recId));

  const existing = existingDoc.exists() ? (existingDoc.data() as RegistryRecord) : null;

  const activities: ActivityLog[] = [];

  // Define HSL/premium labels for fields
  const fieldLabelMap: Record<string, string> = {
    srNo: "SR Number",
    date: "Created Date",
    mvNo: "Vehicle Number",
    application: "Application",
    work: "Work",
    name: "Client Name",
    status: "Record Status",
    mo: "Mobile Number",
    insurance: "Insurance",
    fitness: "Fitness",
    tax: "Tax",
    co: "C/O",
    groupName: "Client Group",
    assignee: "Assigned Employee",
    chassisNo: "Chassis Number",
    engineNo: "Engine Number",
    serviceAmount: "Service Amount",
    amountReceived: "Amount Received",
    paymentDate: "Payment Date",
    paymentStatus: "Payment Status",
  };

  const formatValue = (value: unknown): string => {
    if (value === undefined || value === null || value === "") return "—";
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  };

  const prettyFieldName = (field: string): string =>
    fieldLabelMap[field] ||
    field
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const shouldSkipField = (field: string) =>
    [
      "id",
      "activityLogs",
      "lastUpdatedBy",
      "lastUpdatedAt",
      "isDeleted",
      "deletedAt",
      "deletedBy",
      "deleteReason",
      "attachments",
      "services",
      "serviceTypes",
      "serviceDueDate",
      "serviceStatus",
      "serviceType",
      "createdAt",
      "createdBy",
      "manual",
    ].includes(field);

  // 1. Check client/vehicle/accounting changes for every tracked field.
  if (existing && actor) {
    const tracked = Object.keys({ ...existing, ...record }).filter(
      (field) => !shouldSkipField(field),
    );
    for (const field of tracked) {
      const oldVal = (existing as any)[field];
      const newVal = (record as any)[field];
      const oldLabel = formatValue(oldVal);
      const newLabel = formatValue(newVal);
      if (oldLabel !== newLabel) {
        activities.push(
          createActivity(
            actor,
            `Changed ${prettyFieldName(field)}`,
            prettyFieldName(field),
            oldLabel,
            newLabel,
          ),
        );
      }
    }
  }

  // Log creation as an audit event for new records.
  if (!existing && actor) {
    activities.push(createActivity(actor, "Created client record", "Record Created", "", ""));
  }

  // 2. Normalize and check Service changes
  const normalizedServices: ServiceDetail[] = [];
  const serviceTypes: ServiceType[] = [];

  const normalizeType = (rawType: any) =>
    normalizeLegacyServiceType(rawType, record.application, record.work);

  console.log(
    "[saveRecord] Original services:",
    record.services,
    "serviceType:",
    record.serviceType,
    "serviceTypes:",
    record.serviceTypes,
  );

  const rawServices = record.services;
  if (Array.isArray(rawServices) && rawServices.length > 0) {
    for (const s of rawServices) {
      let rawType: any;
      let dueDate = "";
      let status: string = record.serviceStatus || "Active";
      let price = 0;
      let amountReceived = 0;
      let assignee: string | undefined;

      if (typeof s === "object" && s !== null) {
        rawType = s.serviceType;
        dueDate = s.dueDate || "";
        status = s.status || status;
        price = Number(s.price || 0);
        amountReceived = Number(s.amountReceived || 0);
        assignee = s.assignee;
      } else {
        rawType = s;
      }

      const nType = normalizeType(rawType);
      if (!nType) {
        console.warn("[saveRecord] Skipping invalid service type:", rawType);
        continue;
      }

      const serviceEntry: ServiceDetail = {
        serviceType: nType,
        dueDate,
        status,
        price,
        amountReceived,
      };
      if (assignee) {
        serviceEntry.assignee = assignee;
      }
      normalizedServices.push(serviceEntry);
      if (!serviceTypes.includes(nType)) {
        serviceTypes.push(nType);
      }
    }
  } else if (record.serviceType) {
    // Handle single legacy serviceType fallback
    const nType = normalizeType(record.serviceType);
    if (nType) {
      normalizedServices.push({
        serviceType: nType,
        dueDate: record.serviceDueDate || "",
        status: record.serviceStatus || "Active",
      });
      serviceTypes.push(nType);
    } else {
      console.warn("[saveRecord] Skipping invalid legacy serviceType:", record.serviceType);
    }
  }

  console.log(
    "[saveRecord] Normalized services:",
    normalizedServices,
    "serviceTypes:",
    serviceTypes,
  );

  // Compare service changes
  if (existing && actor) {
    const oldServices = Array.isArray(existing.services)
      ? existing.services
      : existing.serviceType
        ? [
            {
              serviceType: existing.serviceType,
              dueDate: existing.serviceDueDate || "",
              status: existing.serviceStatus || "Active",
            } as ServiceDetail,
          ]
        : [];

    // Services added / modified
    for (const newS of normalizedServices) {
      const oldS = oldServices.find((os) => os.serviceType === newS.serviceType);
      if (!oldS) {
        activities.push(
          createActivity(
            actor,
            `Added Service: ${newS.serviceType}`,
            "Service Added",
            "",
            newS.serviceType,
          ),
        );
      } else {
        if (oldS.dueDate !== newS.dueDate) {
          activities.push(
            createActivity(
              actor,
              `Changed ${newS.serviceType} Due Date`,
              `${newS.serviceType} Due Date`,
              oldS.dueDate || "—",
              newS.dueDate || "—",
            ),
          );
        }
        if (oldS.status !== newS.status) {
          activities.push(
            createActivity(
              actor,
              `Changed ${newS.serviceType} Status`,
              `${newS.serviceType} Status`,
              oldS.status || "—",
              newS.status || "—",
            ),
          );
        }
      }
    }

    // Services removed
    for (const oldS of oldServices) {
      const newS = normalizedServices.find((ns) => ns.serviceType === oldS.serviceType);
      if (!newS) {
        activities.push(
          createActivity(
            actor,
            `Removed Service: ${oldS.serviceType}`,
            "Service Removed",
            oldS.serviceType,
            "",
          ),
        );
      }
    }
  }

  // 3. Document attachment deletions tracking and cleanup
  if (existing && actor) {
    const oldAttachments = existing.attachments || [];
    const newAttachments = record.attachments || [];

    // Find deleted attachments
    for (const oldA of oldAttachments) {
      const existsInNew = newAttachments.some((na) => na.id === oldA.id);
      if (!existsInNew) {
        // Log delete activity
        activities.push(
          createActivity(actor, `Deleted document: ${oldA.name}`, "document", oldA.name, ""),
        );
        // Call backend deleteDoc from clientDocs
        try {
          const { deleteDoc: deleteClientDoc } = await import("./clientDocs");
          await deleteClientDoc(oldA.id, oldA.storagePath);
          console.log(`[saveRecord] Successfully cleaned up deleted attachment: ${oldA.name}`);
        } catch (err) {
          console.error(`[saveRecord] Error cleaning up deleted attachment: ${oldA.name}`, err);
        }
      }
    }
  }
  // Build normalized record without legacy accounting fields
  const normalized: Record<string, any> = {
    ...record,
    name: record.name || "",
    mo: record.mo || "",
    co: record.co || "",
    groupName: record.groupName || "",
    email: (record as any).email || "",
    address: (record as any).address || "",
    services: normalizedServices.length > 0 ? normalizedServices : [],
    serviceTypes: serviceTypes.length > 0 ? serviceTypes : [],
    // Keep legacy serviceType set to first normalized service for compatibility
    serviceType: serviceTypes.length > 0 ? serviceTypes[0] : "",
    serviceDueDate:
      normalizedServices.length > 0 ? normalizedServices[0].dueDate : record.serviceDueDate || "",
    serviceStatus:
      normalizedServices.length > 0
        ? (normalizedServices[0].status as ServiceStatus)
        : record.serviceStatus || "Active",
  };
  // Remove legacy accounting fields that should not exist at root level
  delete normalized.serviceAmount;
  delete normalized.amountReceived;
  delete normalized.pendingAmount;

  // Prepare data with updated metadata
  const now = new Date().toISOString();
  const data = {
    ...normalized,
    createdAt: existing?.createdAt ?? now,
    createdBy: existing?.createdBy ?? actor,
    lastUpdatedBy: actor,
    lastUpdatedAt: now,
    activityLogs: existing?.activityLogs ? [...existing.activityLogs, ...activities] : activities,
  };

  // Write detailed per-field activity logs to separate audit collection
  if (activities.length > 0 && record.id && actor) {
    for (const act of activities) {
      await logClientActivity(
        record.id,
        actor,
        actor,
        act.action,
        act.field || null,
        act.oldValue || null,
        act.newValue || null,
      );
    }
  }

  const { id: _maybeId, ...updateData } = data as any;
  const id = recId;

  // Apply uppercase forcing
  try {
    if (getForceCapsSetting()) {
      for (const field of [...CAPITALIZE_FIELDS, "chassisNo", "engineNo"]) {
        if ((updateData as any)[field]) {
          (updateData as any)[field] = transformInput((updateData as any)[field], true);
        }
      }
    }
  } catch (err) {
    console.warn("[saveRecord] Could not apply force-caps setting:", err);
  }

  // Debug logging: before save (original record)
  console.log("[CLIENT SAVE]", JSON.stringify(record, null, 2));

  // Validation step: Check if input record has undefined properties
  const hasUndefined = JSON.stringify(record, (k, v) =>
    v === undefined ? "undefined" : v,
  ).includes("undefined");
  if (hasUndefined) {
    console.error("[SAVE BLOCKED] Undefined value detected", record);
  }

  // Deep sanitize payload before Firestore call
  const cleanedRecord = removeUndefined(updateData);
  console.log("[CLIENT SAVE CLEANED]", JSON.stringify(cleanedRecord, null, 2));

  try {
    console.log(
      "[saveRecord] Firestore update call - Writing to doc:",
      id,
      "in collection:",
      colName,
    );
    await setDoc(doc(db, colName, id), cleanedRecord, { merge: true });
    console.log("[saveRecord] Save success - Successfully wrote record", id, "to", colName);
  } catch (err) {
    console.error(`[saveRecord] Save error - Failed to write record ${id} to ${colName}:`, err);
    throw err;
  }
}

/** Check for possible duplicate entries (same mvNo and work). */
export async function checkForDuplicates(
  bucket: Bucket,
  mvNo: string,
  work: string,
  excludeId?: string,
): Promise<RegistryRecord[]> {
  if (!mvNo || !work) return [];

  const q = query(
    collection(db, colFor(bucket)),
    where("mvNo", "==", mvNo),
    where("work", "==", work),
  );

  const snap = await getDocs(q);
  // Filter out deleted records and optionally exclude a specific id (the record being edited)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as RegistryRecord)
    .filter((r) => !r.isDeleted && r.id !== excludeId);
}

/** Soft-delete a record (admin only). */
export async function softDeleteRecord(
  bucket: Bucket,
  id: string,
  actor: string,
  reason: DeleteReason,
): Promise<void> {
  const now = new Date().toISOString();
  const deleteLog = createActivity(actor, "Record deleted", "deleteReason", "", reason);

  await updateDoc(doc(db, colFor(bucket), id), {
    isDeleted: true,
    deletedAt: now,
    deletedBy: actor,
    deleteReason: reason,
    activityLogs: arrayUnion(removeUndefined(deleteLog)),
  });
}

/** Hard-delete a record (internal use only, not exposed to UI). */
export async function deleteRecord(bucket: Bucket, id: string): Promise<void> {
  await deleteDoc(doc(db, colFor(bucket), id));
}

/** Add an attachment to a client record. */
export async function addAttachment(
  bucket: Bucket,
  recordId: string,
  attachment: RecordAttachment,
): Promise<void> {
  const now = new Date().toISOString();
  const entry = createActivity(
    attachment.uploadedBy,
    `Attached ${attachment.name}`,
    "attachment",
    "",
    attachment.name,
  );

  const cleanAttachment = removeUndefined(attachment);
  const cleanEntry = removeUndefined(entry);

  const updates = {
    attachments: arrayUnion(cleanAttachment),
    lastUpdatedBy: attachment.uploadedBy,
    lastUpdatedAt: now,
    activityLogs: arrayUnion(cleanEntry),
  };

  console.error("[addAttachment] Uploading attachment:", {
    bucket,
    recordId,
    attachmentName: attachment.name,
    attachmentSize: attachment.size,
    storagePath: attachment.storagePath,
  });

  await updateDoc(doc(db, colFor(bucket), recordId), updates);

  // Write to client_activity_logs
  await logClientActivity(
    recordId,
    attachment.uploadedBy,
    attachment.uploadedBy,
    `Attached ${attachment.name}`,
    "document",
    "",
    attachment.name,
  );
}

// ─── Legacy stubs (kept so non-updated call-sites don't break at compile time) ─

/**
 * @deprecated Use subscribeToRecords() for live data.
 * Returns an empty array — components using this need migrating.
 */
export function loadRecords(_bucket: Bucket): RegistryRecord[] {
  return [];
}

/**
 * @deprecated Use saveRecord() for individual writes.
 */
export async function saveRecords(bucket: Bucket, records: RegistryRecord[]): Promise<void> {
  await Promise.all(records.map((r) => saveRecord(bucket, r)));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function emptyRecord(srNo: number): RegistryRecord {
  return {
    id: crypto.randomUUID(),
    srNo,
    date: new Date().toISOString().slice(0, 10),
    mvNo: "",
    application: "",
    work: "",
    name: "",
    status: "Pending",
    mo: "",
    insurance: "",
    fitness: "",
    tax: "",
    co: "",
    assignee: "",
    // Accounting defaults
    serviceAmount: 0,
    amountReceived: 0,
    paymentDate: "",
    paymentStatus: "Unpaid",
  };
}

export const STATUS_OPTIONS: RecordStatus[] = ["Pending", "In Progress", "Completed", "On Hold"];
