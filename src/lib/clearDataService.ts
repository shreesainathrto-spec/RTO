import { collection, getDocs, writeBatch, deleteDoc as fbDeleteDoc, doc, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { getSession } from "./auth";
import { verifyAdminPin } from "./adminSecurity";

export interface ClearDataProgress {
  current: number;
  total: number;
  currentCollection: string;
  percentage: number;
}

// All collections to delete (excluding users, employees, settings)
const COLLECTIONS_TO_DELETE = [
  // Core operational
  "registry_clients_v2",
  "registry_leads_v2", 
  "registry_vehicles_v2",
  "registry_services_v2",
  "registry_applications_v1",
  "registry_vehicles_master_v1",
  "registry_accounting",
  "DrivingSchoolApplications",
  "DrivingSchoolDailyReports",
  "DrivingSchoolVehicles",

  // Task management
  "tasks",
  "task_templates",

  // Billing & Finance
  "billing_invoices",
  "billing_invoice_payments",
  "payments",
  "payment_entries",
  "collections",
  "outstanding_payments",
  "accounts_ledger",
  "finance_records",
  "accounting",

  // Documents
  "registry_client_docs",

  // Logging & Analytics
  "client_activity_logs",
  "activity_logs",
  "activityLogs",
  "notifications",
  "analytics",
  "deletion_audit_logs",
  "employee_audit_logs",

  // Management
  "targets",
  "registry",

  // Cache & Temp
  "dashboard_cache",
  "duplicates",
  "deleted_records",
  "service_templates",
  "service_requests",
  "invoice_items",
  "history",
  "logs",
  "_meta",

  // V2 Collections
  "clients_v2",
  "leads_v2",
  "vehicles_v2",
  "services_v2",

  // Legacy collections
  "registry_clients",
  "registry_leads",
  "registry_applications",
  "registry_tasks",
  "registry_insurance",
];

/**
 * Verify that the user has admin privileges and correct PIN
 */
async function verifyPermissionsAndPin(adminPin: string): Promise<boolean> {
  const session = getSession();
  if (!session || session.role !== "admin") {
    throw new Error("Only admins can clear data.");
  }
  
  try {
    await verifyAdminPin(adminPin);
    return true;
  } catch (err) {
    throw new Error("Invalid admin PIN.");
  }
}

/**
 * Delete all documents from a collection in batches
 */
async function deleteCollectionBatch(
  collectionName: string,
  onProgress: (progress: ClearDataProgress) => void,
  currentIndex: number,
  totalCollections: number
): Promise<number> {
  let deletedCount = 0;
  const batchSize = 100;
  let hasMore = true;

  while (hasMore) {
    try {
      const snapshot = await getDocs(collection(db, collectionName));
      
      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      const batch = writeBatch(db);
      snapshot.docs.slice(0, batchSize).forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });

      await batch.commit();
      deletedCount += snapshot.docs.length;

      const percentage = Math.round(((currentIndex + 1) / totalCollections) * 100);
      onProgress({
        current: currentIndex + 1,
        total: totalCollections,
        currentCollection: collectionName,
        percentage,
      });

      if (snapshot.docs.length < batchSize) {
        hasMore = false;
      }
    } catch (err: any) {
      // Collection might not exist or permission denied - continue with next collection
      console.warn(`Skipping collection ${collectionName}:`, err.message);
      hasMore = false;
    }
  }

  return deletedCount;
}

/**
 * Delete subcollections recursively
 */
async function deleteSubcollections(
  parentPath: string,
  onProgress: (msg: string) => void
): Promise<void> {
  try {
    const snapshot = await getDocs(collection(db, parentPath));
    const subCollectionNames = [
      "services",
      "invoices",
      "payments",
      "documents",
      "activities",
      "tasks",
      "attachments",
      "items",
      "entries",
      "history",
      "logs",
    ];

    for (const docSnap of snapshot.docs) {
      for (const subColName of subCollectionNames) {
        try {
          const subColPath = `${parentPath}/${docSnap.id}/${subColName}`;
          const subSnapshot = await getDocs(collection(db, subColPath));

          if (!subSnapshot.empty) {
            const batch = writeBatch(db);
            subSnapshot.docs.forEach((subDoc) => {
              batch.delete(subDoc.ref);
            });
            await batch.commit();
            onProgress(`Deleted from ${subColName} in ${docSnap.id}`);
          }
        } catch {
          // Subcollection doesn't exist, continue
        }
      }
    }
  } catch {
    // Parent collection doesn't exist or permission denied
  }
}

/**
 * Clear all CRM data except users, employees, and settings
 */
export async function clearAllCrmData(
  adminPin: string,
  onProgress: (progress: ClearDataProgress) => void
): Promise<{ success: boolean; totalDeleted: number; errors: string[] }> {
  try {
    // Verify permissions
    await verifyPermissionsAndPin(adminPin);

    let totalDeleted = 0;
    const errors: string[] = [];

    // Delete from each collection
    for (let i = 0; i < COLLECTIONS_TO_DELETE.length; i++) {
      const collectionName = COLLECTIONS_TO_DELETE[i];
      try {
        const deleted = await deleteCollectionBatch(
          collectionName,
          onProgress,
          i,
          COLLECTIONS_TO_DELETE.length
        );
        totalDeleted += deleted;
      } catch (err: any) {
        const errMsg = `Error clearing ${collectionName}: ${err.message}`;
        console.warn(errMsg);
        errors.push(errMsg);
      }
    }

    // Delete nested subcollections
    onProgress({
      current: COLLECTIONS_TO_DELETE.length,
      total: COLLECTIONS_TO_DELETE.length + 1,
      currentCollection: "Subcollections",
      percentage: 99,
    });

    try {
      await deleteSubcollections("registry_clients_v2", (msg) => {
        console.log(msg);
      });
    } catch (err) {
      console.warn("Error deleting client subcollections");
    }

    onProgress({
      current: COLLECTIONS_TO_DELETE.length + 1,
      total: COLLECTIONS_TO_DELETE.length + 1,
      currentCollection: "Complete",
      percentage: 100,
    });

    return {
      success: true,
      totalDeleted,
      errors,
    };
  } catch (err: any) {
    throw new Error(`Failed to clear data: ${err.message}`);
  }
}

/**
 * Clear React Query and Zustand caches
 */
export async function clearCaches(): Promise<void> {
  try {
    // Clear localStorage but keep auth
    const keysToKeep = ["rp_session", "firebase-session"];
    const keysToDelete: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !keysToKeep.includes(key)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => {
      localStorage.removeItem(key);
    });

    // Clear IndexedDB if used
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) {
        indexedDB.deleteDatabase(db.name);
      }
    }

    // Dispatch custom event for Zustand stores to clear
    window.dispatchEvent(new CustomEvent("clear-crm-data"));
  } catch (err) {
    console.error("Error clearing caches:", err);
  }
}
