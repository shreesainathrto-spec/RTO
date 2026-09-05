// All Clients — Aggregates client data from all buckets with service history and metrics.
import {
  subscribeToRecords,
  getRecordServiceDetails,
  getRecordServiceAmount,
  getRecordPaymentStatus,
  type RegistryRecord,
  type Bucket,
  type PaymentStatus,
} from "./records";
import { subscribeAllClients, subscribeAllVehicles, subscribeAllServices, sortClientsNewestFirst } from "./hierarchy";

export type CustomerProfile = any;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClientService {
  id: string;
  bucket: Bucket;
  date: string;
  application: string;
  work: string;
  status: string;
  serviceType?: string;
  dueDate?: string;
  serviceAmount?: number;
  amountReceived?: number;
  paymentStatus?: PaymentStatus;
  activityLogs?: RegistryRecord["activityLogs"];
  applicationId?: string;
}

export interface AggregatedClient {
  id: string; // Unique identifier (name-based)
  name: string;
  groupName?: string;
  mobile: string;
  email?: string;
  address?: string;
  vehicles: string[]; // Vehicle numbers
  allServices: ClientService[]; // All services across all buckets
  activeServices: number; // In Progress + Pending
  pendingServices: number; // Pending or On Hold
  completedServices: number; // Completed
  assignee?: string; // Latest assignee
  totalRevenue: number; // Sum of all authoritative service prices
  totalReceived: number; // Sum of all amountReceived
  pendingRevenue: number; // totalRevenue - totalReceived
  lastActivityDate?: string; // Most recent service date
  createdAt?: string; // Earliest record creation date
  serviceTypes: string[]; // Aggregated service types
  statuses: string[]; // Aggregated service statuses
  isActive: boolean; // Has recent activity
  paymentStatus: "Paid" | "Partial" | "Unpaid";
  type?: "client" | "lead";
}

// ─── Data aggregation ─────────────────────────────────────────────────────────

/**
 * Aggregate all records from all buckets and customers into a unified client view.
 */
export function aggregateAllClients(
  recordsByBucket: { [key in Bucket]: RegistryRecord[] },
  customers: CustomerProfile[],
): AggregatedClient[] {
  const clientMap = new Map<string, AggregatedClient>();

  // Process all records from all buckets
  const allRecords = Object.values(recordsByBucket).flat();

  for (const record of allRecords) {
    const key = record.name.toLowerCase();
    let client = clientMap.get(key);

    if (!client) {
      client = {
        id: key,
        name: record.name,
        groupName: record.groupName,
        mobile: record.mo || "",
        email: "",
        address: "",
        vehicles: [],
        allServices: [],
        activeServices: 0,
        pendingServices: 0,
        completedServices: 0,
        assignee: record.assignee,
        totalRevenue: 0,
        totalReceived: 0,
        pendingRevenue: 0,
        lastActivityDate: undefined,
        createdAt: undefined,
        serviceTypes: [],
        statuses: [],
        isActive: true,
        paymentStatus: "Unpaid",
      };
      clientMap.set(key, client);
    }

    // Add vehicle if not already present
    if (record.mvNo && !client.vehicles.includes(record.mvNo)) {
      client.vehicles.push(record.mvNo);
    }

    // Add one service entry per service detail in the record
    const serviceDetails = getRecordServiceDetails(record);

    for (const detail of serviceDetails) {
      const service: ClientService = {
        id: `${record.id}-${detail.serviceType ?? "unknown"}-${detail.dueDate ?? ""}`,
        bucket: Object.entries(recordsByBucket).find(([, records]) =>
          records.includes(record),
        )?.[0] as Bucket,
        date: record.date,
        application: record.application,
        work: record.work,
        status: detail.status || record.status,
        serviceType: detail.serviceType,
        dueDate: detail.dueDate,
        serviceAmount: detail.price ?? 0,
        amountReceived: detail.amountReceived ?? 0,
        paymentStatus:
          detail.amountReceived !== undefined
            ? detail.amountReceived >= (detail.price ?? 0)
              ? "Paid"
              : detail.amountReceived > 0
                ? "Partially Paid"
                : "Unpaid"
            : getRecordPaymentStatus(record),
        activityLogs: record.activityLogs,
      };

      client.allServices.push(service);

      if (detail.serviceType && !client.serviceTypes.includes(detail.serviceType)) {
        client.serviceTypes.push(detail.serviceType);
      }
      if (detail.status && !client.statuses.includes(detail.status)) {
        client.statuses.push(detail.status);
      }
    }

    // Update status counts using record status as the primary indicator for active/pending/completed service metrics
    if (record.status === "In Progress" || record.status === "Pending") {
      client.activeServices += 1;
    }
    if (record.status === "Pending" || record.status === "On Hold") {
      client.pendingServices += 1;
    }
    if (record.status === "Completed") {
      client.completedServices += 1;
    }

    // Update revenue - aggregate from SERVICE-LEVEL accounting
    const recordRevenue = getRecordServiceAmount(record);
    if (recordRevenue) {
      client.totalRevenue += recordRevenue;
    }
    // Update received from SERVICE-LEVEL accounting
    const recordReceived = getRecordServiceDetails(record).reduce(
      (sum, detail) => sum + (detail.amountReceived ?? 0),
      0,
    );
    if (recordReceived) {
      client.totalReceived += recordReceived;
    }

    // Update latest assignee
    if (record.assignee) {
      client.assignee = record.assignee;
    }

    // Track latest activity
    if (!client.lastActivityDate || record.date > client.lastActivityDate) {
      client.lastActivityDate = record.date;
    }

    // Track earliest createdAt
    if (record.createdAt) {
      const currentCreated = client.createdAt ? new Date(client.createdAt) : null;
      const recordCreated = new Date(record.createdAt);
      if (!client.createdAt || (currentCreated && recordCreated < currentCreated)) {
        client.createdAt = record.createdAt;
      }
    } else if (!client.createdAt) {
      client.createdAt = record.date;
    }

    // Track service status metadata from the record status
    if (record.status && !client.statuses.includes(record.status)) {
      client.statuses.push(record.status);
    }
  }

  // Add customer data
  for (const customer of customers) {
    const key = customer.name.toLowerCase();
    let client = clientMap.get(key);

    if (!client) {
      client = {
        id: key,
        name: customer.name,
        groupName: undefined,
        mobile: customer.mobile || "",
        email: customer.email || "",
        address: customer.address || "",
        vehicles: customer.vehicles.map((v: any) => v.mvNo),
        allServices: [],
        activeServices: 0,
        pendingServices: 0,
        completedServices: 0,
        assignee: undefined,
        totalRevenue: 0,
        totalReceived: 0,
        pendingRevenue: 0,
        lastActivityDate: undefined,
        createdAt: undefined,
        serviceTypes: [],
        statuses: [],
        isActive: false,
        paymentStatus: "Unpaid",
      };
      clientMap.set(key, client);
    } else {
      // Merge customer data
      if (customer.email && !client.email) {
        client.email = customer.email;
      }
      if (customer.address && !client.address) {
        client.address = customer.address;
      }
      if (customer.mobile && !client.mobile) {
        client.mobile = customer.mobile;
      }

      // Add unique vehicles
      for (const vehicle of customer.vehicles) {
        if (!client.vehicles.includes(vehicle.mvNo)) {
          client.vehicles.push(vehicle.mvNo);
        }
      }
    }
  }

  // Finalize clients and sort by name
  const clients = Array.from(clientMap.values());

  // Calculate pending revenue and payment status
  for (const client of clients) {
    client.pendingRevenue = client.totalRevenue - client.totalReceived;

    if (client.totalRevenue === 0) {
      client.paymentStatus = "Unpaid";
    } else if (client.totalReceived >= client.totalRevenue) {
      client.paymentStatus = "Paid";
    } else if (client.totalReceived > 0) {
      client.paymentStatus = "Partial";
    } else {
      client.paymentStatus = "Unpaid";
    }

    // Check if active (activity in last 30 days)
    if (client.lastActivityDate) {
      const lastDate = new Date(client.lastActivityDate);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      client.isActive = lastDate > thirtyDaysAgo;
    }
  }

  return sortClientsNewestFirst(clients);
}

/**
 * Subscribe to all clients with live updates from V2 collections.
 * Automatically aggregates data from all clients, vehicles, and services in real-time.
 */
export function subscribeToAllClients(callback: (clients: AggregatedClient[]) => void): () => void {
  let clientsList: any[] = [];
  let vehiclesList: any[] = [];
  let servicesList: any[] = [];
  let clientRecordsList: any[] = [];
  let leadRecordsList: any[] = [];

  let clientsReady = false;
  let vehiclesReady = false;
  let servicesReady = false;
  let clientRecordsReady = false;
  let leadRecordsReady = false;

  const buildRecordClients = (records: any[], type: "client" | "lead") =>
    records
      .filter((record) => !record.isDeleted)
      .map((record) => ({
        id: record.id,
        name: record.name,
        mobile: record.mo || "",
        address: "",
        companyName: record.groupName || "",
        type,
        createdAt: record.createdAt,
        updatedAt: record.lastUpdatedAt || record.createdAt,
      }));

  const buildSourceClients = () => {
    const merged = new Map<string, any>();
    const addClient = (client: any) => {
      if (!client?.name) return;
      const key = `${client.type || "client"}:${String(client.name).trim().toLowerCase()}`;
      if (!merged.has(key)) {
        merged.set(key, client);
      }
    };

    clientsList.forEach(addClient);
    buildRecordClients(clientRecordsList, "client").forEach(addClient);
    buildRecordClients(leadRecordsList, "lead").forEach(addClient);

    return Array.from(merged.values());
  };

  const checkAndUpdate = () => {
    if (!clientsReady || !vehiclesReady || !servicesReady || !clientRecordsReady || !leadRecordsReady) {
      return;
    }

    const sourceClients = buildSourceClients();
    const aggregated: AggregatedClient[] = sourceClients.map((client) => {
      const clientVehicles = vehiclesList.filter((v) => v.clientId === client.id);
      const vehicleIds = clientVehicles.map((v) => v.id);
      const vehicleNumbers = clientVehicles.map((v) => v.vehicleNumber);

      const clientServices = servicesList.filter((s) => vehicleIds.includes(s.vehicleId));

      let activeServices = 0;
      let pendingServices = 0;
      let completedServices = 0;
      let totalRevenue = 0;
      let hasAllocatedAdvance = clientServices.some((s) => s.invoiceId === `advance_${client.id}`);
      let totalReceived = hasAllocatedAdvance ? 0 : (Number((client as any).advancePayment) || 0);
      let lastActivityDate: string | undefined;

      const allServices: ClientService[] = clientServices.map((service) => {
        const serviceAmount = service.serviceAmount ?? 0;
        const amountReceived = service.amountReceived ?? 0;
        totalRevenue += serviceAmount;
        totalReceived += amountReceived;

        if (service.taskStatus === "Completed") {
          completedServices++;
        } else {
          activeServices++;
          if (
            service.taskStatus === "Not Started" ||
            service.taskStatus === "Documents Collected" ||
            service.taskStatus === "Verification"
          ) {
            pendingServices++;
          }
        }

        if (service.updatedAt && (!lastActivityDate || service.updatedAt > lastActivityDate)) {
          lastActivityDate = service.updatedAt;
        }

        return {
          id: service.id,
          bucket: client.type === "lead" ? "leads" : "clients",
          date: service.createdAt || client.createdAt || "",
          application: service.serviceType,
          work: service.notes || "",
          status: service.taskStatus === "Completed" ? "Completed" : "In Progress",
          serviceType: service.serviceType,
          dueDate: service.dueDate,
          serviceAmount,
          amountReceived,
          paymentStatus:
            amountReceived >= serviceAmount
              ? "Paid"
              : amountReceived > 0
                ? "Partially Paid"
                : "Unpaid",
          applicationId: service.applicationId,
        };
      });

      const pendingRevenue = totalRevenue - totalReceived;
      let paymentStatus: "Paid" | "Partial" | "Unpaid" = "Unpaid";
      if (totalRevenue > 0) {
        if (totalReceived >= totalRevenue) {
          paymentStatus = "Paid";
        } else if (totalReceived > 0) {
          paymentStatus = "Partial";
        }
      }

      let isActive = activeServices > 0;
      if (!isActive && lastActivityDate) {
        const lastDate = new Date(lastActivityDate);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        isActive = lastDate > thirtyDaysAgo;
      }

      return {
        id: client.id,
        name: client.name,
        groupName: client.companyName || undefined,
        mobile: client.mobile || "",
        email: client.email || "",
        address: client.address || "",
        vehicles: vehicleNumbers,
        allServices,
        activeServices,
        pendingServices,
        completedServices,
        assignee: clientServices[0]?.assignedStaff || undefined,
        totalRevenue,
        totalReceived,
        pendingRevenue,
        lastActivityDate: lastActivityDate || client.updatedAt || client.createdAt,
        createdAt: client.createdAt,
        serviceTypes: Array.from(new Set(clientServices.map((s) => s.serviceType))),
        statuses: Array.from(new Set(clientServices.map((s) => s.taskStatus))),
        isActive,
        paymentStatus,
        type: client.type || "client",
      };
    });

    callback(sortClientsNewestFirst(aggregated));
  };

  const unsubClients = subscribeAllClients((clients) => {
    clientsList = clients;
    clientsReady = true;
    checkAndUpdate();
  });

  const unsubClientRecords = subscribeToRecords("clients", (records) => {
    clientRecordsList = records;
    clientRecordsReady = true;
    checkAndUpdate();
  });

  const unsubLeadRecords = subscribeToRecords("leads", (records) => {
    leadRecordsList = records;
    leadRecordsReady = true;
    checkAndUpdate();
  });

  const unsubVehicles = subscribeAllVehicles((vehicles) => {
    vehiclesList = vehicles;
    vehiclesReady = true;
    checkAndUpdate();
  });

  const unsubServices = subscribeAllServices((services) => {
    servicesList = services;
    servicesReady = true;
    checkAndUpdate();
  });

  return () => {
    unsubClients();
    unsubClientRecords();
    unsubLeadRecords();
    unsubVehicles();
    unsubServices();
  };
}

// ─── Filter helpers ───────────────────────────────────────────────────────────

export function filterClients(
  clients: AggregatedClient[],
  searchQuery: string,
  filters: {
    status?: "active" | "inactive";
    paymentStatus?: AggregatedClient["paymentStatus"];
    serviceType?: string;
    serviceStatus?: string;
    groupName?: string;
    vehicleNumber?: string;
    mobileNumber?: string;
    clientName?: string;
    assignedTo?: string;
    dueDateStart?: string;
    dueDateEnd?: string;
    createdStart?: string;
    createdEnd?: string;
  },
): AggregatedClient[] {
  let result = clients;

  const dateInRange = (value: string | undefined, start?: string, end?: string) => {
    if (!value) return false;
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) return false;
    if (start) {
      const startDate = new Date(start);
      startDate.setHours(0, 0, 0, 0);
      if (parsed < startDate) return false;
    }
    if (end) {
      const endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);
      if (parsed > endDate) return false;
    }
    return true;
  };

  // Apply search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(
      (c) =>
        [c.name, c.mobile, c.groupName, c.assignee, ...c.vehicles]
          .filter((v): v is string => !!v)
          .some((v) => v.toLowerCase().includes(q)) ||
        c.serviceTypes.some((type) => typeof type === "string" && type.toLowerCase().includes(q)) ||
        c.statuses.some(
          (status) => typeof status === "string" && status.toLowerCase().includes(q),
        ) ||
        c.allServices.some((service) =>
          [service.work, service.application, service.serviceType, service.status, service.dueDate]
            .filter(Boolean)
            .some((value) => typeof value === "string" && value.toLowerCase().includes(q)),
        ),
    );
  }

  if (filters.clientName) {
    const q = filters.clientName.toLowerCase();
    result = result.filter((c) => c.name.toLowerCase().includes(q));
  }

  if (filters.groupName) {
    const q = filters.groupName.toLowerCase();
    result = result.filter((c) => (c.groupName ?? "").toLowerCase().includes(q));
  }

  if (filters.vehicleNumber) {
    const q = filters.vehicleNumber.toLowerCase();
    result = result.filter((c) => c.vehicles.some((v) => v.toLowerCase().includes(q)));
  }

  if (filters.mobileNumber) {
    const q = filters.mobileNumber.toLowerCase();
    result = result.filter((c) => c.mobile.toLowerCase().includes(q));
  }

  if (filters.assignedTo) {
    const q = filters.assignedTo.toLowerCase();
    result = result.filter((c) => (c.assignee ?? "").toLowerCase().includes(q));
  }

  if (filters.serviceType && filters.serviceStatus) {
    const typeQuery = filters.serviceType.toLowerCase();
    const statusQuery = filters.serviceStatus.toLowerCase();
    result = result.filter((c) =>
      c.allServices.some(
        (service) =>
          typeof service.serviceType === "string" &&
          service.serviceType.toLowerCase() === typeQuery &&
          typeof service.status === "string" &&
          service.status.toLowerCase() === statusQuery,
      ),
    );
  } else if (filters.serviceType) {
    const q = filters.serviceType.toLowerCase();
    result = result.filter((c) =>
      c.allServices.some(
        (service) =>
          typeof service.serviceType === "string" && service.serviceType.toLowerCase() === q,
      ),
    );
  } else if (filters.serviceStatus) {
    const q = filters.serviceStatus.toLowerCase();
    result = result.filter((c) =>
      c.allServices.some(
        (service) => typeof service.status === "string" && service.status.toLowerCase() === q,
      ),
    );
  }

  if (filters.dueDateStart || filters.dueDateEnd) {
    result = result.filter((c) =>
      c.allServices.some((service) =>
        dateInRange(service.dueDate, filters.dueDateStart, filters.dueDateEnd),
      ),
    );
  }

  if (filters.createdStart || filters.createdEnd) {
    result = result.filter((c) =>
      dateInRange(c.createdAt, filters.createdStart, filters.createdEnd),
    );
  }

  if (filters.status === "active") {
    result = result.filter((c) => c.isActive);
  } else if (filters.status === "inactive") {
    result = result.filter((c) => !c.isActive);
  }

  if (filters.paymentStatus) {
    result = result.filter((c) => c.paymentStatus === filters.paymentStatus);
  }

  return result;
}
