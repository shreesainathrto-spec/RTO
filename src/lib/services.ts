import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { type Bucket, type RegistryRecord, type ServiceType } from "./records";

/**
 * Get all records for a specific service type across all buckets.
 * Fetches data from the V2 collections: registry_services_v2, registry_vehicles_v2, registry_clients_v2
 */
export async function getServiceClientsAll(serviceType: ServiceType): Promise<RegistryRecord[]> {
  console.log(
    `[getServiceClientsAll] START (V2): Fetching all records for serviceType="${serviceType}"`,
  );

  try {
    const qServices = query(
      collection(db, "registry_services_v2"),
      where("serviceType", "==", serviceType),
    );
    const servicesSnap = await getDocs(qServices);

    const vehiclesSnap = await getDocs(collection(db, "registry_vehicles_v2"));
    const clientsSnap = await getDocs(collection(db, "registry_clients_v2"));

    const vehiclesMap = new Map<string, any>();
    vehiclesSnap.forEach((doc) => {
      vehiclesMap.set(doc.id, { id: doc.id, ...doc.data() });
    });

    const clientsMap = new Map<string, any>();
    clientsSnap.forEach((doc) => {
      clientsMap.set(doc.id, { id: doc.id, ...doc.data() });
    });

    const records: RegistryRecord[] = [];
    let srNo = 1;

    servicesSnap.forEach((docSnap) => {
      const service = { id: docSnap.id, ...docSnap.data() } as any;
      const vehicle = service.vehicleId ? vehiclesMap.get(service.vehicleId) : null;
      const clientId = service.clientId || (vehicle ? vehicle.clientId : null);
      if (!clientId) return;

      const client = clientsMap.get(clientId);
      if (!client) return;

      let status: any = "Pending";
      if (service.taskStatus === "Completed") {
        status = "Completed";
      } else if (service.taskStatus === "On Hold") {
        status = "On Hold";
      } else if (service.taskStatus !== "Not Started") {
        status = "In Progress";
      }

      const record: any = {
        id: client.id,
        srNo: srNo++,
        date: service.createdAt || client.createdAt || new Date().toISOString(),
        mvNo: vehicle?.vehicleNumber || "—",
        application: service.serviceType,
        work: service.notes || "",
        name: client.name,
        status: status,
        mo: client.mobile || "",
        co: client.address || "",
        groupName: client.companyName || "",
        assignee: service.assignedStaff || "",
        createdAt: service.createdAt || client.createdAt,
        serviceType: service.serviceType,
        serviceStatus: service.taskStatus,
        serviceDueDate: service.dueDate,
        type: client.type || "client",
        services: [
          {
            serviceId: service.id,
            serviceType: service.serviceType,
            applicationId: service.applicationId || "",
            applicationType: service.applicationType || "Home",
            dueDate: service.dueDate || "",
            status: service.taskStatus || "Pending",
            price: service.serviceAmount ?? 0,
            advancePayment: service.advancePayment ?? service.advance ?? 0,
            amountReceived: service.amountReceived ?? 0,
            assignee: service.assignedStaff || service.assignee || "",
            assignedEmployeeName: service.assignedEmployeeName || service.assignedStaff || "",
            vehicleId: service.vehicleId || "",
            vehicleNumber: vehicle?.vehicleNumber || "—",
            vehicleType: vehicle?.vehicleType || "—",
            notes: service.notes || service.remarks || "",
            taskTemplate: service.taskTemplate || "",
          },
        ],
      };

      records.push(record);
    });

    return records;
  } catch (error) {
    console.error(`[getServiceClientsAll] ERROR V2:`, error);
    return [];
  }
}

/**
 * Get all records for a specific service type across a specific bucket.
 * Differentiates using V2 client record type ('client' | 'lead').
 */
export async function getServiceClients(
  bucket: Bucket,
  serviceType: ServiceType,
): Promise<RegistryRecord[]> {
  const all = await getServiceClientsAll(serviceType);
  const targetType = bucket === "leads" ? "lead" : "client";
  return all.filter((r) => (r as any).type === targetType);
}

/**
 * Get service statistics for a specific service type.
 */
export async function getServiceStats(serviceType: ServiceType) {
  try {
    const qServices = query(
      collection(db, "registry_services_v2"),
      where("serviceType", "==", serviceType),
    );
    const servicesSnap = await getDocs(qServices);

    const stats = {
      total: servicesSnap.size,
      active: 0,
      completed: 0,
      pending: 0,
      onHold: 0,
    };

    servicesSnap.forEach((doc) => {
      const s = doc.data();
      const status = s.taskStatus || "Not Started";
      if (status === "Completed") {
        stats.completed += 1;
      } else if (
        status === "In Progress" ||
        status === "Documents Collected" ||
        status === "Verification" ||
        status === "Submitted" ||
        status === "Approved" ||
        status === "Active"
      ) {
        stats.active += 1;
      } else if (status === "On Hold") {
        stats.onHold += 1;
      } else {
        stats.pending += 1;
      }
    });

    return stats;
  } catch (error) {
    console.error(`[getServiceStats] ERROR V2:`, error);
    return { total: 0, active: 0, completed: 0, pending: 0, onHold: 0 };
  }
}

/**
 * Calculate total revenue for a specific service type.
 */
export async function getServiceRevenue(serviceType: ServiceType): Promise<number> {
  const records = await getServiceClientsAll(serviceType);

  return records.reduce((sum, r) => {
    const details = r.services || [];
    const matching = details.filter((detail) => detail.serviceType === serviceType);
    if (matching.length > 0) {
      return sum + matching.reduce((serviceSum, detail) => serviceSum + (detail.price || 0), 0);
    }
    return sum;
  }, 0);
}

/**
 * Calculate total amount received for a specific service type.
 */
export async function getServiceAmountReceived(serviceType: ServiceType): Promise<number> {
  const records = await getServiceClientsAll(serviceType);
  return records.reduce((sum, r) => {
    const details = r.services || [];
    const matching = details.filter((detail) => detail.serviceType === serviceType);
    if (matching.length > 0) {
      return (
        sum + matching.reduce((serviceSum, detail) => serviceSum + (detail.amountReceived || 0), 0)
      );
    }
    return sum;
  }, 0);
}

/**
 * Calculate pending amount for a specific service type.
 */
export async function getServicePendingAmount(serviceType: ServiceType): Promise<number> {
  const revenue = await getServiceRevenue(serviceType);
  const received = await getServiceAmountReceived(serviceType);
  return Math.max(0, revenue - received);
}

/**
 * Get records with upcoming service renewals (within N days).
 */
export async function getUpcomingRenewals(daysFromNow: number = 30): Promise<RegistryRecord[]> {
  try {
    const servicesSnap = await getDocs(collection(db, "registry_services_v2"));
    const vehiclesSnap = await getDocs(collection(db, "registry_vehicles_v2"));
    const clientsSnap = await getDocs(collection(db, "registry_clients_v2"));

    const vehiclesMap = new Map<string, any>();
    vehiclesSnap.forEach((doc) => {
      vehiclesMap.set(doc.id, { id: doc.id, ...doc.data() });
    });

    const clientsMap = new Map<string, any>();
    clientsSnap.forEach((doc) => {
      clientsMap.set(doc.id, { id: doc.id, ...doc.data() });
    });

    const now = new Date();
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysFromNow);

    const records: RegistryRecord[] = [];
    let srNo = 1;

    servicesSnap.forEach((docSnap) => {
      const service = { id: docSnap.id, ...docSnap.data() } as any;
      if (!service.dueDate) return;

      const dueDate = new Date(service.dueDate);
      if (isNaN(dueDate.getTime())) return;

      const timeDiff = dueDate.getTime() - now.getTime();
      const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));

      if (daysRemaining >= 0 && daysRemaining <= daysFromNow) {
        const vehicle = service.vehicleId ? vehiclesMap.get(service.vehicleId) : null;
        const clientId = service.clientId || (vehicle ? vehicle.clientId : null);
        if (!clientId) return;

        const client = clientsMap.get(clientId);
        if (!client) return;

        let status: any = "Pending";
        if (service.taskStatus === "Completed") {
          status = "Completed";
        } else if (service.taskStatus === "On Hold") {
          status = "On Hold";
        } else if (service.taskStatus !== "Not Started") {
          status = "In Progress";
        }

        const record: any = {
          id: client.id,
          srNo: srNo++,
          date: service.createdAt || client.createdAt || new Date().toISOString(),
          mvNo: vehicle.vehicleNumber,
          application: service.serviceType,
          work: service.notes || "",
          name: client.name,
          status: status,
          mo: client.mobile || "",
          co: client.address || "",
          groupName: client.companyName || "",
          assignee: service.assignedStaff || "",
          createdAt: service.createdAt || client.createdAt,
          serviceType: service.serviceType,
          serviceStatus: service.taskStatus,
          serviceDueDate: service.dueDate,
          type: client.type || "client",
          services: [
            {
              serviceType: service.serviceType,
              dueDate: service.dueDate || "",
              status: service.taskStatus || "Pending",
              price: service.serviceAmount ?? 0,
              amountReceived: service.amountReceived ?? 0,
              assignee: service.assignedStaff || "",
            },
          ],
        };

        records.push(record);
      }
    });

    return records;
  } catch (error) {
    console.error(`[getUpcomingRenewals] ERROR V2:`, error);
    return [];
  }
}

/**
 * Get total revenue across all services.
 */
export async function getTotalRevenue(): Promise<number> {
  try {
    const servicesSnap = await getDocs(collection(db, "registry_services_v2"));
    let total = 0;
    servicesSnap.forEach((doc) => {
      const data = doc.data();
      total += data.serviceAmount ?? 0;
    });
    return total;
  } catch (error) {
    console.error(`[getTotalRevenue] ERROR V2:`, error);
    return 0;
  }
}

/**
 * Get total amount received across all services.
 */
export async function getTotalAmountReceived(): Promise<number> {
  try {
    const servicesSnap = await getDocs(collection(db, "registry_services_v2"));
    let total = 0;
    servicesSnap.forEach((doc) => {
      const data = doc.data();
      total += data.amountReceived ?? 0;
    });
    return total;
  } catch (error) {
    console.error(`[getTotalAmountReceived] ERROR V2:`, error);
    return 0;
  }
}

/**
 * Get total pending amount across all services.
 */
export async function getTotalPendingAmount(): Promise<number> {
  const revenue = await getTotalRevenue();
  const received = await getTotalAmountReceived();
  return Math.max(0, revenue - received);
}

/**
 * Get count of active services across all buckets.
 */
export async function getActiveServicesCount(): Promise<number> {
  try {
    const q = query(
      collection(db, "registry_services_v2"),
      where("taskStatus", "in", [
        "In Progress",
        "Documents Collected",
        "Verification",
        "Submitted",
        "Approved",
      ]),
    );
    const snap = await getDocs(q);
    return snap.size;
  } catch (error) {
    console.error(`[getActiveServicesCount] ERROR V2:`, error);
    return 0;
  }
}

/**
 * Get revenue breakdown by service type.
 */
export async function getRevenueByService() {
  const serviceTypes = [
    "Insurance",
    "Fitness",
    "Gujarat Permit",
    "National Permit(Gujrat Permit)",
    "Tax",
    "PUC",
    "License New",
    "License Renew",
    "RC Transfer",
    "HP Addition",
    "HP Termination",
  ] as const;

  const revenues = await Promise.all(
    serviceTypes.map(async (type) => ({
      service: type,
      revenue: await getServiceRevenue(type),
    })),
  );

  return revenues.filter((r) => r.revenue > 0);
}

/**
 * Validate service filtering for a specific record.
 */
export async function validateRecordInService(
  recordId: string,
  expectedServiceType: string,
): Promise<{ isValid: boolean; message: string; details: any }> {
  try {
    const docSnap = await getDocs(
      query(collection(db, "registry_services_v2"), where("id", "==", recordId)),
    );

    if (docSnap.empty) {
      return {
        isValid: false,
        message: `Record "${recordId}" not found in V2 services`,
        details: { recordId, expectedServiceType },
      };
    }

    const serviceData = docSnap.docs[0].data();
    const isValid = serviceData.serviceType === expectedServiceType;

    return {
      isValid,
      message: isValid
        ? `✓ Record correctly has serviceType="${expectedServiceType}"`
        : `✗ Record has serviceType="${serviceData.serviceType}" but expected "${expectedServiceType}"`,
      details: {
        recordId,
        expectedServiceType,
        actualServiceType: serviceData.serviceType,
      },
    };
  } catch (error) {
    return {
      isValid: false,
      message: `Error validating record: ${error instanceof Error ? error.message : "Unknown error"}`,
      details: { recordId, expectedServiceType, error },
    };
  }
}

/**
 * Get a summary of all records grouped by service type.
 */
export async function getServiceDistributionSummary() {
  const serviceTypes = [
    "Insurance",
    "Fitness",
    "Gujarat Permit",
    "National Permit(Gujrat Permit)",
    "Tax",
    "PUC",
    "License New",
    "License Renew",
    "RC Transfer",
    "HP Addition",
    "HP Termination",
  ] as const;

  const distribution = await Promise.all(
    serviceTypes.map(async (type) => ({
      serviceType: type,
      count: (await getServiceClientsAll(type)).length,
    })),
  );

  const totalRecords = distribution.reduce((sum, d) => sum + d.count, 0);

  return {
    totalRecords,
    totalServices: serviceTypes.length,
    distribution,
    summary: distribution
      .filter((d) => d.count > 0)
      .map((d) => `${d.serviceType}: ${d.count}`)
      .join(", "),
  };
}
