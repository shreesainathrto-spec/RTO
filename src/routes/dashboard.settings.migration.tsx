import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getMigrationStatus, migrateExistingRecords, getUnmigratedRecords } from "@/lib/migration";
import { runV2Migration, type MigrationReport } from "@/lib/migration-v2";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, RefreshCw, Zap, Server } from "lucide-react";

export const Route = createFileRoute("/dashboard/settings/migration")({
  component: MigrationPage,
});

interface MigrationStatus {
  totalRecords: number;
  migratedRecords: number;
  unmigratedRecords: number;
  migrationPercentage: number;
  unmigratedDetails: Array<{
    bucket: string;
    id: string;
    name: string;
    work?: string;
  }>;
}

function MigrationPage() {
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [message, setMessage] = useState<{
    type: "info" | "success" | "error";
    text: string;
  } | null>(null);

  const [v2Report, setV2Report] = useState<MigrationReport | null>(null);
  const [v2Migrating, setV2Migrating] = useState(false);

  const startV2Migration = async () => {
    if (
      !confirm(
        "Run V2 hierarchy migration to convert old records to Client -> Vehicle -> Service models?",
      )
    ) {
      return;
    }
    try {
      setV2Migrating(true);
      const rep = await runV2Migration();
      setV2Report(rep);
    } catch (err) {
      console.error(err);
      alert("V2 Migration failed: " + err);
    } finally {
      setV2Migrating(false);
    }
  };

  const loadStatus = async () => {
    try {
      setLoading(true);
      console.log("[Migration] Loading status...");
      const migrationStatus = await getMigrationStatus();
      setStatus(migrationStatus);
      console.log("[Migration] Status loaded:", migrationStatus);
    } catch (error) {
      console.error("[Migration] Error loading status:", error);
      setMessage({
        type: "error",
        text: `Error loading migration status: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const runMigration = async () => {
    if (
      !confirm(
        "Run migration to add serviceType to unmigrated records? This will update your database.",
      )
    ) {
      return;
    }

    try {
      setMigrating(true);
      setMessage(null);
      console.log("[Migration] Starting migration...");

      const results = await migrateExistingRecords();
      console.log("[Migration] Results:", results);

      // Reload status
      await loadStatus();

      const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
      setMessage({
        type: "success",
        text: `Migration complete! Updated ${totalUpdated} records.`,
      });
    } catch (error) {
      console.error("[Migration] Error during migration:", error);
      setMessage({
        type: "error",
        text: `Migration failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      setMigrating(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading migration status...</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Service Type Migration</h2>
          <p className="text-sm text-muted-foreground">Failed to load migration status</p>
        </div>
      </div>
    );
  }

  const isMigrationComplete = status.unmigratedRecords === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Service Type Migration</h2>
        <p className="text-sm text-muted-foreground">
          Migrate existing records to add the serviceType field for service module filtering.
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status.totalRecords}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Migrated</CardTitle>
            <CheckCircle2 className="size-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{status.migratedRecords}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unmigrated</CardTitle>
            <AlertCircle className="size-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{status.unmigratedRecords}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status.migrationPercentage}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Migration Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-green-600 h-2 rounded-full transition-all"
              style={{ width: `${status.migrationPercentage}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {status.migratedRecords} of {status.totalRecords} records migrated
          </p>
        </CardContent>
      </Card>

      {/* Message */}
      {message && (
        <Card
          className={
            message.type === "success"
              ? "border-green-500/50 bg-green-500/5"
              : "border-red-500/50 bg-red-500/5"
          }
        >
          <CardContent className="pt-6">
            <p className={message.type === "success" ? "text-green-700" : "text-red-700"}>
              {message.text}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Migration Button */}
      {!isMigrationComplete && (
        <Card className="border-orange-500/50 bg-orange-500/5">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="size-4 text-orange-600" />
              Action Required
            </CardTitle>
            <CardDescription>
              {status.unmigratedRecords} record(s) need to be migrated to add the serviceType field.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Running the migration will automatically assign service types to unmigrated records
              based on their work description. This is a one-time operation.
            </p>

            <Button onClick={runMigration} disabled={migrating} className="w-full">
              {migrating ? (
                <>
                  <RefreshCw className="size-4 mr-2 animate-spin" />
                  Running Migration...
                </>
              ) : (
                <>
                  <Zap className="size-4 mr-2" />
                  Run Migration Now
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground">
              This will update records in: clients, leads, and customers buckets.
            </p>
          </CardContent>
        </Card>
      )}

      {isMigrationComplete && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="flex items-center gap-3 pt-6">
            <CheckCircle2 className="size-6 text-green-600" />
            <div>
              <p className="font-semibold text-green-700">Migration Complete!</p>
              <p className="text-xs text-green-600">All records have been migrated successfully.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unmigrated Records List */}
      {status.unmigratedRecords > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Unmigrated Records ({status.unmigratedRecords})
            </CardTitle>
            <CardDescription>Records that need serviceType assignment</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {status.unmigratedDetails.map((record) => (
                <div
                  key={`${record.bucket}-${record.id}`}
                  className="flex items-center justify-between p-3 border rounded text-sm hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{record.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {record.bucket} • {record.work || "No work description"}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded bg-orange-500/15 text-orange-700">
                    Pending
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* V2 Hierarchy Migration Card */}
      <Card className="border-primary/50 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Server className="size-4 text-primary" />
            Client → Vehicle → Service Hierarchy Migration (V2)
          </CardTitle>
          <CardDescription>
            Migrate legacy flat records to the new normalized Client-Vehicle-Service relational
            structure.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This will scan registry clients, leads, and customer profiles, then create normalized
            records inside the new collections (`registry_clients_v2`, `registry_vehicles_v2`,
            `registry_services_v2`) in batches. Existing records will remain completely intact.
          </p>

          <Button onClick={startV2Migration} disabled={v2Migrating} className="w-full">
            {v2Migrating ? (
              <>
                <RefreshCw className="size-4 mr-2 animate-spin" />
                Migrating to Hierarchical Model...
              </>
            ) : (
              <>
                <Zap className="size-4 mr-2" />
                Run V2 Migration
              </>
            )}
          </Button>

          {v2Report && (
            <div className="mt-4 p-3 border rounded bg-background text-xs space-y-1 font-mono">
              <p
                className={v2Report.success ? "text-green-600 font-bold" : "text-red-600 font-bold"}
              >
                Status: {v2Report.success ? "SUCCESS" : "FAILED"}
              </p>
              <p>Total Legacy Docs Scanned: {v2Report.totalRecordsScanned}</p>
              <p>Clients Created: {v2Report.clientsCreated}</p>
              <p>Vehicles Created: {v2Report.vehiclesCreated}</p>
              <p>Services Created: {v2Report.servicesCreated}</p>
              {v2Report.errors.length > 0 && (
                <div className="mt-2 text-red-500">
                  <p className="font-bold">Errors:</p>
                  {v2Report.errors.map((e, idx) => (
                    <p key={idx}>{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Refresh Button */}
      <Button onClick={loadStatus} variant="outline" className="w-full">
        <RefreshCw className="size-4 mr-2" />
        Refresh Status
      </Button>
    </div>
  );
}
