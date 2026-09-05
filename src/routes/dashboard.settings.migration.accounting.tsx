import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Download } from "lucide-react";
import {
  subscribeToRecords,
  getRecordServiceAmount,
  getRecordServiceDetails,
  type RegistryRecord,
  type Bucket,
  type ServiceType,
} from "@/lib/records";
import { saveRecord } from "@/lib/records";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/settings/migration/accounting")({
  component: AccountingMigration,
});

interface RecordWithOldData extends RegistryRecord {
  hasOldAccountingData: boolean;
  migratedStatus?: "pending" | "success" | "error";
  errorMessage?: string;
}

function AccountingMigration() {
  const [allRecords, setAllRecords] = useState<RecordWithOldData[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<RecordWithOldData | null>(null);
  const [distributionOpen, setDistributionOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const session = getSession();
  const isAdmin = session?.role === "admin";

  // Subscribe to all records
  useEffect(() => {
    const buckets: Bucket[] = ["clients", "leads"];
    const unsubscribers: Array<() => void> = [];
    const recordsByBucket: { [key in Bucket]: RegistryRecord[] } = {
      clients: [],
      leads: [],
    };

    buckets.forEach((bucket) => {
      const unsub = subscribeToRecords(bucket, (records) => {
        recordsByBucket[bucket] = records;
        const combined = Object.values(recordsByBucket)
          .flat()
          .map(
            (r) =>
              ({
                ...r,
                hasOldAccountingData: !!(r.serviceAmount && r.serviceAmount > 0),
              }) as RecordWithOldData,
          );
        setAllRecords(combined);
      });
      unsubscribers.push(unsub);
    });

    return () => unsubscribers.forEach((unsub) => unsub());
  }, []);

  const recordsWithOldData = allRecords.filter((r) => r.hasOldAccountingData);

  const handleDistributeClick = (record: RecordWithOldData) => {
    setSelectedRecord(record);
    setDistributionOpen(true);
  };

  const handleMigrateAll = async () => {
    if (!recordsWithOldData.length) return;
    if (
      !confirm(
        `Are you sure you want to automatically migrate all ${recordsWithOldData.length} records? This will distribute their old accounting amounts evenly across their services.`
      )
    ) {
      return;
    }

    setProcessing(true);
    let successCount = 0;
    let errorCount = 0;

    for (const record of recordsWithOldData) {
      try {
        const services = getRecordServiceDetails(record);
        if (services.length === 0) {
          throw new Error("No services defined for this record");
        }

        const amountPerService = (record.serviceAmount || 0) / services.length;
        const receivedPerService = (record.amountReceived || 0) / services.length;

        const updatedServices = services.map((service) => ({
          ...service,
          price: amountPerService,
          amountReceived: receivedPerService,
        }));

        const updatedRecord: RegistryRecord = {
          ...record,
          services: updatedServices,
          serviceAmount: undefined,
          amountReceived: undefined,
          paymentDate: undefined,
          paymentStatus: undefined,
        };

        const bucket = (Object.entries({
          clients: allRecords.filter((r) => r.id === record.id),
          leads: allRecords.filter((r) => r.id === record.id),
        }).find(([, records]) => records.length > 0)?.[0] || "clients") as Bucket;

        await saveRecord(bucket, updatedRecord, session?.username || "system");
        successCount++;
      } catch (err) {
        console.error(`Error migrating record ${record.name}:`, err);
        errorCount++;
      }
    }

    setProcessing(false);
    alert(`Migration complete! Successfully migrated: ${successCount}, Failed: ${errorCount}`);
  };

  const handleAutoDistribute = async (record: RecordWithOldData) => {
    if (!record.serviceAmount || record.serviceAmount === 0) return;

    setProcessing(true);
    try {
      const services = getRecordServiceDetails(record);
      if (services.length === 0) {
        throw new Error("No services defined for this record");
      }

      // Distribute amount evenly across services
      const amountPerService = record.serviceAmount / services.length;
      const receivedPerService = (record.amountReceived || 0) / services.length;

      const updatedServices = services.map((service) => ({
        ...service,
        price: amountPerService,
        amountReceived: receivedPerService,
      }));

      const updatedRecord: RegistryRecord = {
        ...record,
        services: updatedServices,
        serviceAmount: undefined, // Remove old field
        amountReceived: undefined, // Remove old field
        paymentDate: undefined, // Remove old field
        paymentStatus: undefined, // Remove old field
      };

      // Find bucket
      const bucket = (Object.entries({
        clients: allRecords.filter((r) => r.id === record.id),
        leads: allRecords.filter((r) => r.id === record.id),
      }).find(([, records]) => records.length > 0)?.[0] || "clients") as Bucket;

      await saveRecord(bucket, updatedRecord, session?.username || "system");

      setAllRecords((prev) =>
        prev.map((r) =>
          r.id === record.id
            ? { ...updatedRecord, hasOldAccountingData: false, migratedStatus: "success" }
            : r,
        ),
      );
    } catch (error) {
      console.error("Migration error:", error);
      setAllRecords((prev) =>
        prev.map((r) =>
          r.id === record.id
            ? {
                ...r,
                migratedStatus: "error",
                errorMessage: error instanceof Error ? error.message : "Unknown error",
              }
            : r,
        ),
      );
    } finally {
      setProcessing(false);
      setDistributionOpen(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Accounting Migration</h2>
          <p className="text-sm text-muted-foreground">
            Migrate old client-level accounting to service-wise accounting
          </p>
        </div>
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 flex gap-3">
          <AlertCircle className="size-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-900">Admin Only</p>
            <p className="text-sm text-yellow-800">
              Only administrators can access this migration tool.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Accounting Migration Tool</h2>
          <p className="text-sm text-muted-foreground">
            Migrate old client-level accounting fields to the new service-wise accounting system
          </p>
        </div>
        {recordsWithOldData.length > 0 && (
          <Button
            onClick={handleMigrateAll}
            disabled={processing}
            className="bg-orange-600 hover:bg-orange-700 text-white font-semibold"
          >
            {processing ? "Migrating..." : `Auto Migrate All (${recordsWithOldData.length})`}
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allRecords.length}</div>
            <p className="text-xs text-muted-foreground">Across all buckets</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Need Migration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{recordsWithOldData.length}</div>
            <p className="text-xs text-muted-foreground">With old accounting data</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Migrated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {allRecords.filter((r) => r.migratedStatus === "success").length}
            </div>
            <p className="text-xs text-muted-foreground">Successfully migrated</p>
          </CardContent>
        </Card>
      </div>

      {/* Migration Information */}
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 space-y-2">
        <h3 className="font-semibold text-blue-900">How It Works</h3>
        <ul className="text-sm text-blue-800 space-y-1 ml-4 list-disc">
          <li>Records with old accounting data (serviceAmount, amountReceived) are listed below</li>
          <li>Click "Auto Migrate" to distribute the old amounts evenly across all services</li>
          <li>After migration, old accounting fields are removed permanently</li>
          <li>Each service will have its own amount, received, and payment status</li>
        </ul>
      </div>

      {recordsWithOldData.length === 0 ? (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-8 text-center">
          <CheckCircle2 className="size-12 mx-auto text-green-600 mb-4" />
          <h3 className="font-semibold text-green-900 mb-2">All Records Migrated!</h3>
          <p className="text-sm text-green-800">
            No records with old accounting data found. The system is fully migrated to service-wise
            accounting.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {recordsWithOldData.map((record) => (
            <Card
              key={record.id}
              className={cn(
                record.migratedStatus === "success" && "border-green-500/50 bg-green-50",
                record.migratedStatus === "error" && "border-red-500/50 bg-red-50",
              )}
            >
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{record.name}</h4>
                      {record.migratedStatus === "success" && (
                        <CheckCircle2 className="size-4 text-green-600" />
                      )}
                      {record.migratedStatus === "error" && (
                        <AlertCircle className="size-4 text-red-600" />
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>Service Amount: ₹{(record.serviceAmount || 0).toLocaleString("en-IN")}</p>
                      <p>
                        Amount Received: ₹{(record.amountReceived || 0).toLocaleString("en-IN")}
                      </p>
                      <p>
                        Services:{" "}
                        {getRecordServiceDetails(record)
                          .map((s) => s.serviceType)
                          .join(", ")}
                      </p>
                    </div>
                    {record.errorMessage && (
                      <p className="text-sm text-red-600">Error: {record.errorMessage}</p>
                    )}
                  </div>

                  {record.migratedStatus !== "success" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleAutoDistribute(record)}
                        disabled={processing}
                        variant="default"
                      >
                        {processing ? "Migrating..." : "Auto Migrate"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDistributeClick(record)}
                      >
                        Manual
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Distribution Dialog */}
      <Dialog open={distributionOpen} onOpenChange={setDistributionOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Distribute Old Accounting Data - {selectedRecord?.name}</DialogTitle>
          </DialogHeader>

          {selectedRecord && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <p className="text-sm font-medium">Old Accounting Data</p>
                <p className="text-sm">Total Service Amount: ₹{selectedRecord.serviceAmount}</p>
                <p className="text-sm">Amount Received: ₹{selectedRecord.amountReceived || 0}</p>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">Services to Distribute To:</p>
                {getRecordServiceDetails(selectedRecord).map((service, idx) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-2">
                    <p className="font-semibold">{service.serviceType}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Amount</label>
                        <Input
                          type="number"
                          defaultValue={
                            selectedRecord.serviceAmount
                              ? selectedRecord.serviceAmount /
                                getRecordServiceDetails(selectedRecord).length
                              : 0
                          }
                          disabled
                          className="bg-muted"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Received</label>
                        <Input
                          type="number"
                          defaultValue={
                            selectedRecord.amountReceived
                              ? selectedRecord.amountReceived /
                                getRecordServiceDetails(selectedRecord).length
                              : 0
                          }
                          disabled
                          className="bg-muted"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs text-blue-900">
                  The old accounting data will be divided equally across all services. You can
                  manually edit individual services after migration.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDistributionOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedRecord && handleAutoDistribute(selectedRecord)}
              disabled={processing}
            >
              {processing ? "Migrating..." : "Confirm & Migrate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
