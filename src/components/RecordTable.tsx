import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Download,
  Printer,
  Paperclip,
  X,
  Users,
  Eye,
} from "lucide-react";
import { addDoc as addClientDoc, deleteDoc as deleteClientDoc } from "@/lib/clientDocs";
import {
  subscribeToRecords,
  saveRecord,
  softDeleteRecord,
  emptyRecord,
  checkForDuplicates,
  calculatePaymentStatus,
  calculatePendingAmount,
  addAttachment,
  STATUS_OPTIONS,
  STAFF_USERS,
  staffLabel,
  SERVICE_TYPES,
  serviceLabel,
  getRecordServices,
  getRecordServiceDetails,
  getRecordServiceAmount,
  getRecordPendingAmount,
  getRecordPaymentStatus,
  normalizeLegacyServiceType,
  type ServiceDetail,
  type ServiceType,
  type Bucket,
  type RegistryRecord,
  type RecordStatus,
  type PaymentStatus,
  type RecordAttachment,
} from "@/lib/records";
import { syncTaskFromRecord } from "@/lib/tasks";
import { getSession } from "@/lib/auth";
import { transformInput, getForceCapsSetting } from "@/lib/capitalize-settings";
import { generateRecordPDF, printWindow } from "@/lib/pdfGenerator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DeleteRecordDialog } from "@/components/DeleteRecordDialog";
import ClientProfile from "@/components/ClientProfile";
import { DuplicateDetectionDialog } from "@/components/DuplicateDetectionDialog";
import { useDuplicateDetection } from "@/hooks/useDuplicateDetection";
import { WhatsAppMessagePanel } from "@/components/WhatsAppMessagePanel";
import { toast } from "sonner";
import { formatPaymentStatus } from "@/lib/formatting";

interface Props {
  bucket: Bucket;
  title: string;
  description: string;
}

const COLS: { key: keyof RegistryRecord; label: string }[] = [
  { key: "srNo", label: "SR NO" },
  { key: "date", label: "DATE" },
  { key: "mvNo", label: "MV NO" },
  { key: "application", label: "APPLICATION" },
  { key: "work", label: "WORK" },
  { key: "name", label: "NAME" },
  { key: "groupName", label: "GROUP" },
  { key: "status", label: "STATUS" },
  { key: "mo", label: "MO" },
  { key: "insurance", label: "INSURANCE" },
  { key: "fitness", label: "FITNESS" },
  { key: "tax", label: "TAX" },
  { key: "co", label: "C/O" },
];

function statusClass(status: RecordStatus) {
  switch (status) {
    case "Completed":
      return "bg-success/15 text-success border-success/30";
    case "In Progress":
      return "bg-primary/15 text-primary border-primary/30";
    case "On Hold":
      return "bg-warning/20 text-warning-foreground border-warning/40";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function paymentStatusClass(status?: PaymentStatus) {
  switch (status) {
    case "Paid":
      return "bg-green-500/15 text-green-700 border-green-500/30";
    case "Partially Paid":
      return "bg-yellow-500/15 text-yellow-700 border-yellow-500/30";
    default:
      return "bg-red-500/15 text-red-700 border-red-500/30";
  }
}

export function RecordTable({ bucket, title, description }: Props) {
  const [records, setRecords] = useState<RegistryRecord[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<RegistryRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<RegistryRecord | null>(null);
  const [viewRecord, setViewRecord] = useState<RegistryRecord | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [forceCaps, setForceCaps] = useState(() => getForceCapsSetting());
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const session = getSession();
  const isAdmin = session?.role === "admin";
  const username = session?.username ?? "system";

  const {
    duplicateDialogOpen,
    duplicates,
    loading: dupLoading,
    checkAndSave,
    handleContinueWithDuplicate,
    handleCancelDuplicate,
  } = useDuplicateDetection({ bucket, actor: username });

  // ── Firestore real-time subscription ────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToRecords(bucket, setRecords);
    return unsub;
  }, [bucket]);

  // ── Listen for force caps setting changes ──────────────────────────────────
  useEffect(() => {
    const handleSettingChange = () => {
      setForceCaps(getForceCapsSetting());
    };
    window.addEventListener("force-caps-changed", handleSettingChange);
    return () => window.removeEventListener("force-caps-changed", handleSettingChange);
  }, []);

  const filtered = useMemo(() => {
    if (!query) return records;
    const q = query.toLowerCase();
    return records.filter((r) =>
      [r.mvNo, r.application, r.work, r.name, r.mo, r.co, r.groupName].some((v) =>
        (v ?? "").toLowerCase().includes(q),
      ),
    );
  }, [records, query]);

  const openNew = () => {
    const nextSr = records.length ? Math.max(...records.map((r) => r.srNo)) + 1 : 1;
    setEditing({ ...emptyRecord(nextSr), services: [] });
    setOpen(true);
  };

  const openEdit = (r: RegistryRecord) => {
    // Initialize services[] as objects for the editor
    let services = getRecordServiceDetails(r);
    // If no services exist but legacy accounting fields are present, create a default service entry
    if (
      (!services || services.length === 0) &&
      (r.serviceAmount !== undefined || r.amountReceived !== undefined)
    ) {
      const serviceType =
        normalizeLegacyServiceType(r.serviceType, r.application, r.work) || "Insurance";
      services = [
        {
          serviceType,
          dueDate: r.serviceDueDate || "",
          status: r.serviceStatus || "Active",
          price: r.serviceAmount ?? 0,
          amountReceived: r.amountReceived ?? 0,
        },
      ];
    }
    const normalizedServiceType = normalizeLegacyServiceType(r.serviceType, r.application, r.work);
    const normalizedRecord = normalizedServiceType
      ? { ...r, serviceType: normalizedServiceType }
      : r;
    setEditing({ ...normalizedRecord, services });
    setOpen(true);
  };

  const initiateDelete = (r: RegistryRecord) => {
    setRecordToDelete(r);
    setDeleteOpen(true);
  };

  const handleDeleteSuccess = () => {
    setDeleteOpen(false);
    setRecordToDelete(null);
  };

  const handleFileUpload = async (file: File) => {
    if (!editing) {
      setAttachmentError("No record selected");
      return;
    }



    setUploading(true);
    setUploadPct(0);
    setAttachmentError(null);

    try {
      // Delegate upload to clientDocs.addDoc which uses the canonical
      // storage path: clients/{clientId}/attachments/{fileName}
      console.error("[Attachment Upload] Delegating upload to addDoc for client:", editing.id);
      const docEntry = await addClientDoc(editing.id, file.name, file.type, file, (pct) =>
        setUploadPct(pct),
      );

      // Map ClientDoc -> RecordAttachment shape
      const attachment: RecordAttachment = {
        id: docEntry.id,
        name: docEntry.name,
        type: docEntry.mimeType || file.type,
        size: docEntry.fileSize || file.size,
        storagePath: docEntry.storagePath || `clients/${editing.id}/attachments/${file.name}`,
        downloadUrl: (docEntry.downloadURL as string) || "",
        uploadedAt: docEntry.addedAt,
        uploadedBy: username,
      };

      // Add attachment to editing state
      setEditing({ ...editing, attachments: [...(editing.attachments ?? []), attachment] });

      // Persist attachment reference on registry record
      await addAttachment(bucket, editing.id, attachment);

      console.error("[Attachment Upload] Attachment saved to Firestore successfully", attachment);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setAttachmentError(`Upload failed: ${errorMsg}`);
      console.error("[Attachment Upload Error]", error);
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  const handleServiceFileUpload = async (file: File, serviceIndex: number) => {
    if (!editing) {
      setAttachmentError("No record selected");
      return;
    }



    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setAttachmentError("Only PDF files are allowed for service attachments.");
      return;
    }

    setUploading(true);
    setUploadPct(0);
    setAttachmentError(null);

    try {
      const services = (editing.services as any) || [];
      const serviceObj =
        typeof services[serviceIndex] === "object" && services[serviceIndex] !== null
          ? services[serviceIndex]
          : { serviceType: services[serviceIndex] };

      const docEntry = await addClientDoc(editing.id, file.name, file.type, file, (pct: any) =>
        setUploadPct(pct),
      );

      const attachment: RecordAttachment = {
        id: docEntry.id,
        name: docEntry.name,
        type: docEntry.mimeType || file.type,
        size: docEntry.fileSize || file.size,
        storagePath: docEntry.storagePath || `customers/${editing.id}/attachments/${file.name}`,
        downloadUrl: (docEntry.downloadURL as string) || "",
        uploadedAt: docEntry.addedAt,
        uploadedBy: username,
        serviceType: serviceObj.serviceType,
      };

      setEditing({ ...editing, attachments: [...(editing.attachments ?? []), attachment] });
      await addAttachment(bucket, editing.id, attachment);
      console.error(
        "[Service Attachment Upload] Saved attachment for service",
        serviceObj.serviceType,
        attachment,
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setAttachmentError(`Upload failed: ${errorMsg}`);
      console.error("[Service Attachment Upload Error]", error);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAttachment = async (attachmentId: string) => {
    if (!editing) return;
    const toRemove = (editing.attachments ?? []).find((a) => a.id === attachmentId);
    if (!toRemove) return;

    // Optimistically update UI
    const updatedAttachments = (editing.attachments ?? []).filter((a) => a.id !== attachmentId);
    setEditing({ ...editing, attachments: updatedAttachments });

    try {
      // Remove storage + clientDocs entry if present
      try {
        await deleteClientDoc(attachmentId, toRemove.storagePath);
      } catch (err) {
        console.warn("[handleRemoveAttachment] deleteClientDoc failed; continuing:", err);
      }

      // Persist change to the registry record
      try {
        await saveRecord(bucket, { ...editing, attachments: updatedAttachments }, username);
      } catch (err) {
        console.error(
          "[handleRemoveAttachment] Failed to save record after removing attachment:",
          err,
        );
      }
    } catch (error) {
      console.error("[handleRemoveAttachment] Unexpected error:", error);
      setAttachmentError("Failed to remove attachment. Please try again.");
      // Revert UI
      setEditing({ ...editing, attachments: editing.attachments ?? [] });
    }
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    console.log("[RecordTable] Before save - Initiating client save flow");
    console.log("[RecordTable] Data being submitted:", editing);
    try {
      await checkAndSave(
        editing.mvNo,
        editing.work,
        async () => {
          console.log("[RecordTable] Save Callback - Writing record to database...");
          await saveRecord(bucket, editing, username);
          await syncTaskFromRecord(bucket, editing, username);
          setOpen(false);
          toast.success("Client saved successfully!");
        },
        editing.id,
      );
    } catch (error) {
      console.error("[RecordTable] Save error:", error);
      toast.error(
        `Failed to save client: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="pl-8"
            />
          </div>
          <Button onClick={openNew}>
            <Plus className="size-4 mr-1" />
            Add
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {COLS.map((c) => (
                  <th key={c.key} className="text-left font-semibold px-3 py-3 whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
                <th className="text-left font-semibold px-3 py-3 whitespace-nowrap">ASSIGNEE</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={COLS.length + 2}
                    className="px-3 py-12 text-center text-muted-foreground"
                  >
                    No records yet.
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-3 font-medium">{r.srNo}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{r.date}</td>
                  <td className="px-3 py-3 font-mono text-xs">{r.mvNo || "—"}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{r.application || "—"}</td>
                  <td className="px-3 py-3">{r.work || "—"}</td>
                  <td className="px-3 py-3 font-medium">{r.name || "—"}</td>
                  <td className="px-3 py-3 text-xs">{r.groupName || "—"}</td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                        statusClass(r.status),
                      )}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">{r.mo || "—"}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{r.insurance || "—"}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{r.fitness || "—"}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{r.tax || "—"}</td>
                  <td className="px-3 py-3">{r.co || "—"}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs">
                    {staffLabel(r.assignee) || (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setViewRecord(r);
                          setViewOpen(true);
                        }}
                        title="View profile"
                      >
                        <Users className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => initiateDelete(r)}
                        disabled={!isAdmin}
                        title={
                          !isAdmin ? "Only administrators can delete records" : "Delete record"
                        }
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing && records.some((r) => r.id === editing.id) ? "Edit record" : "New record"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="SR NO">
                <Input
                  type="number"
                  value={editing.srNo}
                  onChange={(e) => setEditing({ ...editing, srNo: Number(e.target.value) })}
                />
              </Field>
              <Field label="DATE">
                <Input
                  type="date"
                  value={editing.date}
                  onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                />
              </Field>
              <Field label="MV NO">
                <Input
                  value={editing.mvNo}
                  onChange={(e) =>
                    setEditing({ ...editing, mvNo: transformInput(e.target.value, forceCaps) })
                  }
                />
              </Field>
              <Field label="APPLICATION">
                <Input
                  value={editing.application}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      application: transformInput(e.target.value, forceCaps),
                    })
                  }
                />
              </Field>
              <Field label="WORK" full>
                <Input
                  value={editing.work}
                  onChange={(e) =>
                    setEditing({ ...editing, work: transformInput(e.target.value, forceCaps) })
                  }
                />
              </Field>
              <Field label="NAME">
                <Input
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: transformInput(e.target.value, forceCaps) })
                  }
                />
              </Field>
              <Field label="GROUP NAME">
                <Input
                  value={editing.groupName || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, groupName: transformInput(e.target.value, forceCaps) })
                  }
                  placeholder="Customer group / company"
                />
              </Field>
              <Field label="STATUS">
                <Select
                  value={editing.status}
                  onValueChange={(v) => setEditing({ ...editing, status: v as RecordStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="MO">
                <Input
                  value={editing.mo}
                  onChange={(e) =>
                    setEditing({ ...editing, mo: transformInput(e.target.value, forceCaps) })
                  }
                />
              </Field>
              <Field label="INSURANCE">
                <Input
                  value={editing.insurance}
                  onChange={(e) => setEditing({ ...editing, insurance: e.target.value })}
                  placeholder="Expiry / status"
                />
              </Field>
              <Field label="FITNESS">
                <Input
                  value={editing.fitness}
                  onChange={(e) => setEditing({ ...editing, fitness: e.target.value })}
                  placeholder="Expiry / status"
                />
              </Field>
              <Field label="TAX">
                <Input
                  value={editing.tax}
                  onChange={(e) => setEditing({ ...editing, tax: e.target.value })}
                  placeholder="Paid / Due"
                />
              </Field>
              <Field label="C/O">
                <Input
                  value={editing.co}
                  onChange={(e) =>
                    setEditing({ ...editing, co: transformInput(e.target.value, forceCaps) })
                  }
                />
              </Field>
              <Field label="CHASSIS NUMBER">
                <Input
                  value={editing.chassisNo || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, chassisNo: transformInput(e.target.value, forceCaps) })
                  }
                  placeholder="Chassis No"
                />
              </Field>
              <Field label="ENGINE NUMBER">
                <Input
                  value={editing.engineNo || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, engineNo: transformInput(e.target.value, forceCaps) })
                  }
                  placeholder="Engine No"
                />
              </Field>

              {/* Service Management & Accounting - UNIFIED SYSTEM */}
              <Field label={isAdmin ? "ASSIGN TO STAFF" : "ASSIGNED TO"} full>
                <Select
                  value={editing.assignee || "__none"}
                  onValueChange={(v) =>
                    setEditing({ ...editing, assignee: v === "__none" ? "" : v })
                  }
                  disabled={!isAdmin}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Unassigned</SelectItem>
                    {STAFF_USERS.map((s) => (
                      <SelectItem key={s.username} value={s.username}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isAdmin && (
                  <p className="text-xs text-muted-foreground">
                    A task is auto-created for the assignee and stays in sync with the record
                    status.
                  </p>
                )}
              </Field>

              <div className="sm:col-span-2 border-t pt-4 mt-2">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                  Services (Each Service Manages Its Own Amount, Received, Status)
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  This is the only accounting source. No client-level accounting.
                </p>
              </div>

              <div className="sm:col-span-2 space-y-4">
                <Label className="text-xs font-semibold text-muted-foreground uppercase">
                  Selected Services & Due Dates
                </Label>

                {/* List of active services */}
                <div className="space-y-3">
                  {((editing.services as any) || []).map((service: any, index: number) => {
                    const serviceObj =
                      typeof service === "object" && service !== null
                        ? service
                        : {
                            serviceType: service,
                            dueDate: editing.serviceDueDate || "",
                            status: "Active",
                          };

                    return (
                      <div
                        key={index}
                        className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 border rounded-lg bg-muted/20 relative group hover:border-primary/30 transition-colors"
                      >
                        <div className="font-semibold text-sm sm:w-1/6">
                          {serviceLabel(serviceObj.serviceType)}
                        </div>

                        <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground uppercase font-bold w-full sm:hidden">
                              Due Date
                            </span>
                            <Input
                              type="date"
                              value={serviceObj.dueDate}
                              onChange={(e) => {
                                const newServices = [...(editing.services || [])];
                                newServices[index] = { ...serviceObj, dueDate: e.target.value };
                                setEditing({ ...editing, services: newServices });
                              }}
                              className="h-9 text-xs flex-1"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground uppercase font-bold w-full sm:hidden">
                              Amount
                            </span>
                            <Input
                              type="number"
                              min="0"
                              value={serviceObj.price ?? ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                const price = value === "" ? 0 : Number(value);
                                const newServices = [...(editing.services || [])];
                                newServices[index] = { ...serviceObj, price };
                                setEditing({ ...editing, services: newServices });
                              }}
                              placeholder="0"
                              className="h-9 text-xs flex-1"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground uppercase font-bold w-full sm:hidden">
                              Received
                            </span>
                            <Input
                              type="number"
                              min="0"
                              value={serviceObj.amountReceived ?? ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                const amountReceived = value === "" ? 0 : Number(value);
                                const newServices = [...(editing.services || [])];
                                newServices[index] = { ...serviceObj, amountReceived };
                                setEditing({ ...editing, services: newServices });
                              }}
                              placeholder="0"
                              className="h-9 text-xs flex-1"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground uppercase font-bold w-full sm:hidden">
                              Pending
                            </span>
                            <Input
                              type="number"
                              disabled
                              value={Math.max(
                                0,
                                (serviceObj.price || 0) - (serviceObj.amountReceived || 0),
                              )}
                              className="h-9 text-xs flex-1 bg-muted"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground uppercase font-bold w-full sm:hidden">
                              Status
                            </span>
                            <Select
                              value={serviceObj.status || "Active"}
                              onValueChange={(v) => {
                                const newServices = [...(editing.services || [])];
                                newServices[index] = { ...serviceObj, status: v };
                                setEditing({ ...editing, services: newServices });
                              }}
                            >
                              <SelectTrigger className="h-9 text-xs flex-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[
                                  "Active",
                                  "Renewal Due",
                                  "Completed",
                                  "Pending",
                                  "In Progress",
                                  "On Hold",
                                  "Paid",
                                  "Partially Paid",
                                  "Unpaid",
                                ].map((st) => (
                                   <SelectItem key={st} value={st} className="text-xs">
                                     {formatPaymentStatus(st)}
                                   </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const newServices = (editing.services || []).filter(
                              (_, idx) => idx !== index,
                            );
                            setEditing({ ...editing, services: newServices });
                          }}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 w-9 self-end sm:self-auto"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                        <label className="flex items-center gap-2 px-2 py-1 self-end sm:self-auto">
                          <Paperclip className="size-4 text-muted-foreground" />
                          <input
                            type="file"
                            accept="application/pdf"
                            onChange={(e) => {
                              const file = e.currentTarget.files?.[0];
                              if (file) handleServiceFileUpload(file, index);
                              e.currentTarget.value = "";
                            }}
                            className="hidden"
                          />
                        </label>

                        {/* Per-service attachments preview */}
                        <div className="absolute left-3 top-3 flex gap-1">
                          {(editing?.attachments ?? [])
                            .filter((a) => a.serviceType === serviceObj.serviceType)
                            .slice(0, 3)
                            .map((a) => (
                              <div
                                key={a.id}
                                className="flex items-center gap-1 bg-white/80 px-1 py-0.5 rounded border"
                              >
                                <a
                                  href={a.downloadUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={a.name}
                                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                >
                                  <Eye className="size-4" />
                                </a>
                                <button
                                  onClick={() => handleRemoveAttachment(a.id)}
                                  className="text-destructive hover:text-destructive/80"
                                  title="Remove attachment"
                                >
                                  <X className="size-4" />
                                </button>
                              </div>
                            ))}
                        </div>
                      </div>
                    );
                  })}

                  {(!editing.services || editing.services.length === 0) && (
                    <p className="text-xs text-muted-foreground text-center py-4 bg-muted/10 border border-dashed rounded-lg">
                      No services added to this client yet.
                    </p>
                  )}
                </div>

                {/* Add Service Selector */}
                {SERVICE_TYPES.filter((s) => !getRecordServices(editing).includes(s)).length >
                  0 && (
                  <div className="flex items-center gap-2 max-w-sm">
                    <Select
                      value="__placeholder"
                      onValueChange={(v) => {
                        if (v === "__placeholder") return;
                        const newServices = [...(editing.services || [])];
                        newServices.push({
                          serviceType: v as ServiceType,
                          dueDate: "",
                          status: "Active",
                          price: 0,
                          amountReceived: 0,
                        });
                        setEditing({ ...editing, services: newServices });
                      }}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Add service..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        <SelectItem value="__placeholder" disabled>
                          Select service to add...
                        </SelectItem>
                        
                        <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground bg-slate-50 uppercase tracking-wider">
                          Vahaan (Vehicles)
                        </div>
                        {["Fitness", "Gujarat Permit", "National Permit", "National Permit(Gujrat Permit)", "Tax", "PUC", "RC Transfer", "HP Addition", "HP Termination"]
                          .filter((st) => !getRecordServices(editing).includes(st as any))
                          .map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              {serviceLabel(s as any)}
                            </SelectItem>
                          ))}

                        <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground bg-slate-50 uppercase tracking-wider mt-2">
                          Licence
                        </div>
                        {["License New", "License Renew"]
                          .filter((st) => !getRecordServices(editing).includes(st as any))
                          .map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              {serviceLabel(s as any)}
                            </SelectItem>
                          ))}

                        <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground bg-slate-50 uppercase tracking-wider mt-2">
                          Insurance
                        </div>
                        {["Insurance"]
                          .filter((st) => !getRecordServices(editing).includes(st as any))
                          .map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              {serviceLabel(s as any)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* WhatsApp Quick Actions */}
              <div className="sm:col-span-2 border-t pt-4 mt-2">
                <WhatsAppMessagePanel mobile={editing.mo} name={editing.name} />
              </div>

              {/* File Attachments Section */}
              <div className="sm:col-span-2 border-t pt-4 mt-2">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Attachments</h3>

                {/* Existing Attachments */}
                <div className="space-y-2 mb-4">
                  {(editing.attachments ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No attachments yet.</p>
                  )}
                  {(editing.attachments ?? []).map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center justify-between bg-muted/30 p-2 rounded-md border border-muted-foreground/20"
                    >
                      <a
                        href={attachment.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 flex-1 text-blue-600 hover:underline text-sm"
                      >
                        <Paperclip className="size-4 flex-shrink-0" />
                        <span className="truncate">{attachment.name}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          ({(attachment.size / 1024).toFixed(1)} KB)
                        </span>
                      </a>
                      <button
                        onClick={() => handleRemoveAttachment(attachment.id)}
                        className="text-destructive hover:text-destructive/80"
                        title="Remove attachment"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Upload Progress */}
                {uploading && (
                  <div className="mb-3">
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span>Uploading attachment…</span>
                      <span className="font-semibold">{uploadPct}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${uploadPct}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {attachmentError && (
                  <div className="text-xs text-destructive bg-destructive/10 p-2 rounded-md mb-3">
                    {attachmentError}
                  </div>
                )}

                {/* File Input */}
                <div>
                  <label className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-muted-foreground/40 rounded-md bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors">
                    <Paperclip className="size-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs text-muted-foreground">Attach file</span>
                    <input
                      type="file"
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0];
                        if (file) {
                          handleFileUpload(file);
                        }
                        // Reset input so same file can be selected again
                        e.currentTarget.value = "";
                      }}
                      disabled={uploading}
                      className="hidden"
                      accept="*/*"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <div className="flex gap-2 flex-1">
              {editing && !records.some((r) => r.id === editing.id) ? null : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateRecordPDF(editing || emptyRecord(1), bucket)}
                    disabled={saving}
                  >
                    <Download className="size-4 mr-1" />
                    Export PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={printWindow} disabled={saving}>
                    <Printer className="size-4 mr-1" />
                    Print
                  </Button>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DuplicateDetectionDialog
        open={duplicateDialogOpen}
        onOpenChange={(open) => !open && handleCancelDuplicate()}
        duplicates={duplicates}
        onContinue={handleContinueWithDuplicate}
        onCancel={handleCancelDuplicate}
        loading={dupLoading}
      />

      <DeleteRecordDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        recordId={recordToDelete?.id || ""}
        recordName={recordToDelete?.name || ""}
        bucket={bucket}
        userRole={isAdmin ? "admin" : "staff"}
        username={username}
        onSuccess={handleDeleteSuccess}
      />
      <ClientProfile
        record={viewRecord}
        open={viewOpen}
        onOpenChange={setViewOpen}
        bucket={bucket}
      />
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", full && "sm:col-span-2")}>    
      <Label className="text-xs font-semibold tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
