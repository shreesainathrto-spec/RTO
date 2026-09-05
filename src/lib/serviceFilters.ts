// Service Filters — Service type definitions and filtering utilities.
import {
  subscribeToRecords,
  normalizeServiceType,
  SERVICE_TYPES,
  type RegistryRecord,
  type Bucket,
  type ServiceType,
  getRecordServiceAmount,
} from "./records";
import { isLicenseRenewal } from "./documentTypes";

export interface ServiceConfig {
  type: ServiceType;
  label: string;
  description: string;
  icon: string; // Icon name or emoji
  color: string; // Tailwind color class
}

export const SERVICE_CONFIGS: Record<ServiceType, ServiceConfig> = {
  Insurance: {
    type: "Insurance",
    label: "Insurance",
    description: "Vehicle insurance applications and renewals",
    icon: "🛡️",
    color: "bg-blue-500",
  },
  Fitness: {
    type: "Fitness",
    label: "Fitness",
    description: "Vehicle fitness certificates and inspections",
    icon: "✓",
    color: "bg-green-500",
  },
  "Gujarat Permit": {
    type: "Gujarat Permit",
    label: "Gujarat Permit",
    description: "Gujarat state vehicle permits",
    icon: "📍",
    color: "bg-amber-500",
  },
  "National Permit": {
    type: "National Permit",
    label: "National Permit(Gujrat Permit)",
    description: "National level vehicle permits",
    icon: "🌐",
    color: "bg-red-500",
  },
  "National Permit(Gujrat Permit)": {
    type: "National Permit(Gujrat Permit)" as any,
    label: "National Permit(Gujrat Permit)",
    description: "Gujrat Permit details",
    icon: "🌐",
    color: "bg-red-500",
  },
  Tax: {
    type: "Tax",
    label: "Tax",
    description: "Vehicle tax and registration",
    icon: "💰",
    color: "bg-cyan-500",
  },
  PUC: {
    type: "PUC",
    label: "PUC",
    description: "Pollution under control certificates",
    icon: "🌱",
    color: "bg-emerald-500",
  },
  "License New": {
    type: "License New",
    label: "License New",
    description: "New license applications",
    icon: "🎫",
    color: "bg-indigo-500",
  },
  "License Renew": {
    type: "License Renew",
    label: "License Renew",
    description: "License renewals",
    icon: "🔁",
    color: "bg-sky-400",
  },
  "RC Transfer": {
    type: "RC Transfer",
    label: "RC Transfer",
    description: "RC ownership transfer services",
    icon: "↔️",
    color: "bg-pink-500",
  },
  "HP Addition": {
    type: "HP Addition",
    label: "HP Addition",
    description: "HP addition on RC",
    icon: "➕",
    color: "bg-orange-500",
  },
  "HP Termination": {
    type: "HP Termination",
    label: "HP Termination",
    description: "HP termination on RC",
    icon: "➖",
    color: "bg-rose-500",
  },
};

// ─── Slug conversion helper ────────────────────────────────────────────────────

/**
 * Convert ServiceType to slug.
 * Example: "RC Transfer" -> "rc-transfer"
 */
export function serviceTypeToSlug(serviceType: ServiceType): string {
  return serviceType.toLowerCase().replace(/\s+/g, "-");
}

// ─── Record filtering ──────────────────────────────────────────────────────────

/**
 * Check if a record matches a service type.
 */
export function recordMatchesService(record: RegistryRecord, serviceType: ServiceType): boolean {
  // Match explicit serviceTypes array first.
  if (Array.isArray(record.serviceTypes) && record.serviceTypes.length > 0) {
    if (record.serviceTypes.includes(serviceType)) return true;
  }

  // Match explicit services array, including legacy string values and License markers.
  if (Array.isArray(record.services)) {
    if (
      record.services.some((s) => {
        const typeValue = typeof s === "object" && s !== null ? (s as any).serviceType : s;
        const raw = String(typeValue ?? "")
          .trim()
          .toLowerCase();

        if (!raw) return false;
        if (raw === serviceType.toLowerCase()) return true;
        if (
          raw === "license" &&
          (serviceType === "License New" || serviceType === "License Renew")
        ) {
          const renewal = isLicenseRenewal(record.application, record.work);
          return serviceType === "License Renew" ? renewal : !renewal;
        }
        return false;
      })
    ) {
      return true;
    }
  }

  // Match legacy serviceType single-value field.
  const legacyType = (record.serviceType ?? "").toString().trim();
  if (legacyType) {
    if (legacyType === serviceType) return true;
    if (
      legacyType.toLowerCase() === "license" &&
      (serviceType === "License New" || serviceType === "License Renew")
    ) {
      const renewal = isLicenseRenewal(record.application, record.work);
      return serviceType === "License Renew" ? renewal : !renewal;
    }
  }

  // Match by work or application string if explicit service fields are missing.
  if (record.work && record.work.trim().toLowerCase() === serviceType.toLowerCase()) {
    return true;
  }

  if (record.application && record.application.trim().toLowerCase() === serviceType.toLowerCase()) {
    return true;
  }

  return false;
}

/**
 * Subscribe to records for a specific service type across all buckets.
 */
export function subscribeToServiceRecords(
  serviceType: ServiceType,
  callback: (records: RegistryRecord[]) => void,
): () => void {
  const buckets: Bucket[] = ["clients", "leads"];
  const recordsByBucket: { [key in Bucket]: RegistryRecord[] } = {
    clients: [],
    leads: [],
  };

  const unsubscribers: Array<() => void> = [];

  buckets.forEach((bucket) => {
    const unsub = subscribeToRecords(bucket, (records) => {
      recordsByBucket[bucket] = records.filter((r) => recordMatchesService(r, serviceType));

      // Combine and sort all records
      const allRecords = Object.values(recordsByBucket)
        .flat()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      callback(allRecords);
    });
    unsubscribers.push(unsub);
  });

  return () => unsubscribers.forEach((u) => u());
}

// ─── Metrics calculation ──────────────────────────────────────────────────────

export interface ServiceMetrics {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  onHold: number;
  totalRevenue: number;
  totalReceived: number;
  pendingAmount: number;
}

/**
 * Calculate metrics for a set of service records.
 */
export function calculateServiceMetrics(records: RegistryRecord[]): ServiceMetrics {
  const metrics: ServiceMetrics = {
    total: records.length,
    pending: 0,
    inProgress: 0,
    completed: 0,
    onHold: 0,
    totalRevenue: 0,
    totalReceived: 0,
    pendingAmount: 0,
  };

  for (const record of records) {
    // Count by status
    switch (record.status) {
      case "Pending":
        metrics.pending += 1;
        break;
      case "In Progress":
        metrics.inProgress += 1;
        break;
      case "Completed":
        metrics.completed += 1;
        break;
      case "On Hold":
        metrics.onHold += 1;
        break;
    }

    // Revenue calculations
    const serviceRevenue = getRecordServiceAmount(record);
    if (serviceRevenue) {
      metrics.totalRevenue += serviceRevenue;
    }
    if (record.amountReceived) {
      metrics.totalReceived += record.amountReceived;
    }
  }

  metrics.pendingAmount = metrics.totalRevenue - metrics.totalReceived;

  return metrics;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

export function getStatusColor(status: RegistryRecord["status"]) {
  switch (status) {
    case "Completed":
      return "bg-green-100 text-green-800 border-green-200";
    case "In Progress":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "On Hold":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "Pending":
      return "bg-slate-100 text-slate-800 border-slate-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}
