import { collection, getDocs, doc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import {
  CLIENTS_COL,
  VEHICLES_COL,
  SERVICES_COL,
  type Client,
  type Vehicle,
  type Service,
  getProgressFromStatus,
  type ServiceTaskStatus,
} from "./hierarchy";
import {
  getRecordServiceDetails,
  normalizeLegacyServiceType,
  type RegistryRecord,
  type Bucket,
  type ServiceType,
} from "./records";


export interface MigrationReport {
  success: boolean;
  totalRecordsScanned: number;
  clientsCreated: number;
  vehiclesCreated: number;
  servicesCreated: number;
  errors: string[];
}

/** Helper to infer ServiceType from work text */
function inferType(work?: string): ServiceType {
  const combined = (work || "").toLowerCase();
  if (combined.includes("insurance")) return "Insurance";
  if (combined.includes("fitness")) return "Fitness";
  if (combined.includes("permit")) return "Gujarat Permit";
  if (combined.includes("tax")) return "Tax";
  if (combined.includes("puc")) return "PUC";
  if (combined.includes("license")) {
    if (combined.includes("renew")) return "License Renew";
    return "License New";
  }
  if (combined.includes("transfer")) return "RC Transfer";
  if (combined.includes("addition")) return "HP Addition";
  if (combined.includes("termination")) return "HP Termination";
  return "Insurance"; // default fallback
}

export async function runV2Migration(): Promise<MigrationReport> {
  console.log(
    "[MIGRATION V2] Starting migration to hierarchical Client -> Vehicle -> Service models...",
  );

  const report: MigrationReport = {
    success: true,
    totalRecordsScanned: 0,
    clientsCreated: 0,
    vehiclesCreated: 0,
    servicesCreated: 0,
    errors: [],
  };

  try {
    const clientsMap = new Map<string, Client>();
    const vehiclesMap = new Map<string, Vehicle>();
    const servicesList: Service[] = [];

    // ─── 1. Migrate registry_clients and registry_leads ──────────────────────
    const legacyBuckets: Bucket[] = ["clients", "leads"];

    for (const bucket of legacyBuckets) {
      const colName = `registry_${bucket}`;
      const snap = await getDocs(collection(db, colName));
      report.totalRecordsScanned += snap.size;

      for (const d of snap.docs) {
        const record = { id: d.id, ...d.data() } as RegistryRecord;

        // Skip soft-deleted records
        if (record.isDeleted) continue;

        // Deduplicate Client by clean name + mobile
        const clientName = (record.name || "Unknown Client").trim();
        const clientMobile = (record.mo || "").trim();
        const clientKey = `${clientName.toLowerCase()}_${clientMobile.toLowerCase()}`;

        let client = clientsMap.get(clientKey);
        if (!client) {
          client = {
            id: `client_${crypto.randomUUID()}`,
            name: clientName,
            mobile: clientMobile,
            address: (record.co || "").trim(),
            companyName: (record.groupName || "").trim(),
            gstNumber: "",
            notes: `Migrated from legacy ${bucket} collection.`,
            type: bucket === "leads" ? "lead" : "client",
          };
          clientsMap.set(clientKey, client);
        }

        if (!client) continue;

        // Deduplicate Vehicle by vehicleNumber under this client
        const vehicleNo = (record.mvNo || "UNKNOWN-MV").trim().toUpperCase();
        const vehicleKey = `${client.id}_${vehicleNo}`;

        let vehicle = vehiclesMap.get(vehicleKey);
        if (!vehicle) {
          vehicle = {
            id: `vehicle_${crypto.randomUUID()}`,
            clientId: client.id,
            vehicleNumber: vehicleNo,
            vehicleType: "Commercial",
            chassisNumber: (record.chassisNo || "").trim(),
            engineNumber: (record.engineNo || "").trim(),
            registrationDate: record.date || "",
            status: record.status || "Pending",
          };
          vehiclesMap.set(vehicleKey, vehicle);
        }

        // Extract services
        const serviceDetails = getRecordServiceDetails(record);
        if (serviceDetails.length > 0) {
          for (const s of serviceDetails) {
            const taskStatus: ServiceTaskStatus =
              s.status === "Completed" ? "Completed" : "Submitted";
            const progress = getProgressFromStatus(taskStatus);

            servicesList.push({
              id: `service_${crypto.randomUUID()}`,
              vehicleId: vehicle.id,
              serviceType: s.serviceType,
              dueDate: s.dueDate || "",
              serviceAmount: s.price ?? 0,
              amountReceived: s.amountReceived ?? 0,
              pendingAmount: Math.max(0, (s.price ?? 0) - (s.amountReceived ?? 0)),
              assignedStaff: record.assignee || "",
              taskStatus,
              progress,
              notes: record.work || "",
            });
          }
        } else if (record.work) {
          // If no structured serviceDetails, infer one from the record's work description
          const sType = inferType(record.work);
          const taskStatus: ServiceTaskStatus =
            record.status === "Completed" ? "Completed" : "Submitted";
          const progress = getProgressFromStatus(taskStatus);

          servicesList.push({
            id: `service_${crypto.randomUUID()}`,
            vehicleId: vehicle.id,
            serviceType: sType,
            dueDate: record.serviceDueDate || "",
            serviceAmount: record.serviceAmount ?? 0,
            amountReceived: record.amountReceived ?? 0,
            pendingAmount: Math.max(0, (record.serviceAmount ?? 0) - (record.amountReceived ?? 0)),
            assignedStaff: record.assignee || "",
            taskStatus,
            progress,
            notes: record.work || "",
          });
        }
      }
    }



    // ─── 3. Write Normalized Data in batches ────────────────────────────────
    console.log(
      `[MIGRATION V2] Staging ${clientsMap.size} clients, ${vehiclesMap.size} vehicles, and ${servicesList.length} services.`,
    );

    let batch = writeBatch(db);
    let count = 0;
    const batchLimit = 400; // conservative batch limit (Firestore limit is 500)

    // Save Clients
    for (const client of clientsMap.values()) {
      batch.set(doc(db, CLIENTS_COL, client.id), client);
      count++;
      report.clientsCreated++;

      if (count >= batchLimit) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }

    // Save Vehicles
    for (const vehicle of vehiclesMap.values()) {
      batch.set(doc(db, VEHICLES_COL, vehicle.id), vehicle);
      count++;
      report.vehiclesCreated++;

      if (count >= batchLimit) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }

    // Save Services
    for (const service of servicesList) {
      batch.set(doc(db, SERVICES_COL, service.id), service);
      count++;
      report.servicesCreated++;

      if (count >= batchLimit) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }

    // Commit any remaining writes
    if (count > 0) {
      await batch.commit();
    }

    console.log("[MIGRATION V2] Complete!", report);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[MIGRATION V2] Failed with error:", err);
    report.success = false;
    report.errors.push(msg);
  }

  return report;
}
