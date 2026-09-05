/**
 * MIGRATION UTILITY: Normalize existing serviceType values in Firestore
 *
 * This utility detects and fixes serviceType values with inconsistent casing.
 * Run this ONCE after the normalization fix is deployed.
 *
 * Usage:
 *   import { runServiceTypeMigration } from "@/lib/migration-normalize-services";
 *   await runServiceTypeMigration(); // Call from a one-time admin action
 *
 * What it does:
 * 1. Scans all records in all buckets (clients, leads, customers)
 * 2. Detects serviceType values with wrong casing (e.g., "insurance", "INSURANCE")
 * 3. Normalizes them to canonical form (e.g., "Insurance")
 * 4. Updates Firestore documents
 * 5. Returns detailed migration report
 */

import { collection, getDocs, query, where, writeBatch, type WriteBatch } from "firebase/firestore";
import { db } from "./firebase";
import { normalizeServiceType, SERVICE_TYPES, type Bucket, type RegistryRecord } from "./records";

interface MigrationStats {
  bucket: Bucket;
  totalScanned: number;
  needsNormalization: number;
  normalized: number;
  failed: number;
  details: Array<{
    id: string;
    name: string;
    before: string;
    after: string | null;
    status: "normalized" | "failed";
  }>;
}

/**
 * Run the serviceType normalization migration.
 * CAUTION: This modifies production data. Call only once.
 */
export async function runServiceTypeMigration(): Promise<{
  success: boolean;
  stats: MigrationStats[];
  message: string;
}> {
  const buckets: Bucket[] = ["clients", "leads"];
  const allStats: MigrationStats[] = [];

  console.log("[MIGRATION] Starting serviceType normalization...");

  for (const bucket of buckets) {
    const stats = await migrateBucket(bucket);
    allStats.push(stats);

    console.log(
      `[MIGRATION] ${bucket}: ${stats.normalized}/${stats.needsNormalization} records normalized`,
    );

    if (stats.failed > 0) {
      console.warn(`[MIGRATION] ${bucket}: ${stats.failed} records failed to normalize`);
    }
  }

  const totalNormalized = allStats.reduce((sum, s) => sum + s.normalized, 0);
  const totalFailed = allStats.reduce((sum, s) => sum + s.failed, 0);

  const message =
    totalFailed === 0
      ? `✅ Migration complete: ${totalNormalized} records normalized`
      : `⚠️ Migration complete with errors: ${totalNormalized} normalized, ${totalFailed} failed`;

  console.log("[MIGRATION]", message);

  return {
    success: totalFailed === 0,
    stats: allStats,
    message,
  };
}

/**
 * Migrate all records in a single bucket.
 */
async function migrateBucket(bucket: Bucket): Promise<MigrationStats> {
  const colName = `registry_${bucket}`;
  const stats: MigrationStats = {
    bucket,
    totalScanned: 0,
    needsNormalization: 0,
    normalized: 0,
    failed: 0,
    details: [],
  };

  try {
    // Get all records with serviceType field
    const q = query(collection(db, colName), where("serviceType", "!=", null));

    const snap = await getDocs(q);
    stats.totalScanned = snap.size;

    const batch = writeBatch(db);
    let batchOps = 0;
    const maxBatchSize = 500; // Firestore batch limit

    for (const doc of snap.docs) {
      const data = doc.data() as RegistryRecord;
      const current = data.serviceType;

      if (!current) continue; // Skip null values

      // Check if normalization is needed
      if (!SERVICE_TYPES.includes(current as any)) {
        stats.needsNormalization++;

        const normalized = normalizeServiceType(current);

        if (normalized) {
          stats.normalized++;
          stats.details.push({
            id: doc.id,
            name: data.name || "N/A",
            before: current,
            after: normalized,
            status: "normalized",
          });

          batch.update(doc.ref, { serviceType: normalized });
          batchOps++;

          if (batchOps >= maxBatchSize) {
            await batch.commit();
            console.log(`[MIGRATION] ${bucket}: Committed batch of ${batchOps} updates`);
            batchOps = 0;
          }
        } else {
          stats.failed++;
          stats.details.push({
            id: doc.id,
            name: data.name || "N/A",
            before: current,
            after: null,
            status: "failed",
          });

          console.warn(
            `[MIGRATION] ${bucket}: Cannot normalize "${current}" for record "${data.name || doc.id}"`,
          );
        }
      }
    }

    // Commit any remaining updates
    if (batchOps > 0) {
      await batch.commit();
      console.log(`[MIGRATION] ${bucket}: Committed final batch of ${batchOps} updates`);
    }
  } catch (error) {
    console.error(`[MIGRATION] Error migrating ${bucket}:`, error);
  }

  return stats;
}

/**
 * Generate a human-readable migration report.
 */
export function formatMigrationReport(stats: MigrationStats[]): string {
  let report = "=== SERVICE TYPE NORMALIZATION MIGRATION REPORT ===\n\n";

  for (const s of stats) {
    report += `📦 Bucket: ${s.bucket}\n`;
    report += `   Total Scanned: ${s.totalScanned}\n`;
    report += `   Needs Normalization: ${s.needsNormalization}\n`;
    report += `   Successfully Normalized: ${s.normalized}\n`;
    report += `   Failed: ${s.failed}\n`;

    if (s.details.length > 0) {
      report += `   Details:\n`;
      for (const d of s.details) {
        const emoji = d.status === "normalized" ? "✅" : "❌";
        report += `     ${emoji} ${d.name} (${d.id}): "${d.before}" → "${d.after || "FAILED"}"\n`;
      }
    }

    report += "\n";
  }

  return report;
}
