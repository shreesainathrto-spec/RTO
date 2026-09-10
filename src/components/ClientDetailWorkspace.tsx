import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { query, collection, where, onSnapshot, doc } from "firebase/firestore";
import { db, storage, auth } from "@/lib/firebase";
import { DateInput } from "./DateInput";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Car,
  Plus,
  Trash2,
  Pencil,
  DollarSign,
  CheckCircle2,
  Clock,
  Phone,
  ArrowRight,
  ChevronDown,
  User,
  MapPin,
  Briefcase,
  Calendar,
  AlertCircle,
  FileText,
  Eye,
  Download,
  Upload,
} from "lucide-react";
import {
  type Client,
  type Vehicle,
  type Service,
  type ServiceTaskStatus,
  isLicenseService,
  saveClient,
  saveVehicle,
  deleteVehicle,
  saveService,
  deleteService,
  subscribeToClientDetails,
  getProgressFromStatus,
  addVehicleDocument,
  deleteVehicleDocument,
  type VehicleDocument,
} from "@/lib/hierarchy";
import { SERVICE_TYPES, serviceLabel, STAFF_USERS } from "@/lib/records";
import { generatePDF } from "@/lib/pdfGenerator";
import { subscribeAllUsers, type UserRecord } from "@/lib/userService";
import { toast } from "sonner";
import { formatDateDDMMYYYY, formatDate } from "@/lib/formatting";
import { WhatsAppMessagePanel } from "@/components/WhatsAppMessagePanel";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";

import { getSession } from "@/lib/auth";
import { subscribeStaffPermissions, type RolePermissions } from "@/lib/permissions";
import { secureDelete } from "@/lib/secureDelete";
import {
  type ClientDocument,
  type VehicleDocumentInfo,
  subscribeClientDocs,
  subscribeVehicleDocs,
  saveClientDocument,
  saveVehicleDocument,
  deleteClientDocEntry,
  deleteVehicleDocEntry,
} from "@/lib/structuredDocs";

import { subscribeToTemplates, type TaskTemplate } from "@/lib/tasks";
import { cn, isAdvanceAmountValid, ADVANCE_AMOUNT_ERROR_MESSAGE } from "@/lib/utils";


interface ClientDetailWorkspaceProps {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TASK_STAGES: ServiceTaskStatus[] = [
  "Not Started",
  "Documents Collected",
  "Verification",
  "Submitted",
  "Approved",
  "Completed",
];

const CLIENT_DOC_SLOTS = [
  { key: "aadhaar", label: "Aadhaar Card" },
  { key: "pan", label: "PAN Card" },
  { key: "passport", label: "Passport" },
  { key: "driving_license", label: "Driving License" },
  { key: "photo", label: "Client Photo" },
  { key: "address_proof", label: "Address Proof" },
  { key: "other", label: "Other Client Documents" },
];

const VEHICLE_DOC_SLOTS = [
  { key: "rc_book", label: "RC Book" },
  { key: "insurance", label: "Insurance Copy" },
  { key: "fitness", label: "Fitness Certificate" },
  { key: "gujarat_permit", label: "Gujarat Permit" },
  { key: "national_permit", label: "National Permit" },
  { key: "tax", label: "Tax Documents" },
  { key: "puc", label: "PUC Certificate" },
  { key: "other", label: "Other Vehicle Documents" },
];

export function ClientDetailWorkspace({
  clientId,
  open,
  onOpenChange,
}: ClientDetailWorkspaceProps) {
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Modal / Form States
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [clientForm, setClientForm] = useState<Partial<Client>>({});

  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Partial<Vehicle> | null>(null);
  const [vehicleForm, setVehicleForm] = useState<Partial<Vehicle>>({});

  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Partial<Service> | null>(null);
  const [serviceForm, setServiceForm] = useState<Partial<Service>>({});
  const [activeEmployees, setActiveEmployees] = useState<UserRecord[]>([]);
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([]);
  const [clientApplications, setClientApplications] = useState<any[]>([]);
  const [clientTasks, setClientTasks] = useState<any[]>([]);

  const [docFields, setDocFields] = useState<Record<string, { documentNumber?: string; expiryDate?: string }>>({});
  const [personalDocsCollapsed, setPersonalDocsCollapsed] = useState(true);
  const [vehicleDocsCollapsed, setVehicleDocsCollapsed] = useState<Record<string, boolean>>({});

  const handleDocFieldChange = (vehicleId: string, slotKey: string, field: string, value: string) => {
    const key = `${vehicleId}-${slotKey}`;
    setDocFields((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }));
  };

  const hasDocChanges = (key: string, docObj: any) => {
    const changes = docFields[key];
    if (!changes) return false;
    
    const currentNum = changes.documentNumber !== undefined ? changes.documentNumber : (docObj?.documentNumber ?? "");
    const currentExp = changes.expiryDate !== undefined ? changes.expiryDate : (docObj?.expiryDate ?? "");
    
    const originalNum = docObj?.documentNumber ?? "";
    const originalExp = docObj?.expiryDate ?? "";
    
    return currentNum !== originalNum || currentExp !== originalExp;
  };

  const handleSaveDocFields = async (vehicleId: string, slotKey: string, docObj: any) => {
    const key = `${vehicleId}-${slotKey}`;
    const fields = docFields[key] || {};
    
    const documentNumber = fields.documentNumber !== undefined ? fields.documentNumber : (docObj?.documentNumber ?? "");
    const expiryDate = fields.expiryDate !== undefined ? fields.expiryDate : (docObj?.expiryDate ?? "");
    
    try {
      const now = new Date().toISOString();
      const userName = session?.name || "System";
      
      let docId = docObj?.id;
      if (!docId) {
        docId = `doc_${crypto.randomUUID()}`;
      }
      
      const docRef = doc(db, "vehicle_documents", docId);
      const payload = {
        clientId,
        vehicleId,
        documentType: slotKey,
        documentNumber,
        expiryDate,
        updatedAt: now,
        updatedBy: userName,
        fileName: docObj?.fileName || "",
        url: docObj?.url || "",
        uploadedAt: docObj?.uploadedAt || now,
        uploadedBy: docObj?.uploadedBy || userName,
        storagePath: docObj?.storagePath || "",
      };
      
      const { setDoc: firestoreSetDoc } = await import("firebase/firestore");
      await firestoreSetDoc(docRef, payload, { merge: true });
      toast.success("Document details updated successfully!");
      
      setDocFields((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (err: any) {
      console.error("Failed to save document details:", err);
      toast.error("Failed to save details: " + err.message);
    }
  };

  useEffect(() => {
    const unsub = subscribeToTemplates(setTaskTemplates);
    return unsub;
  }, []);

  const getActiveSubModule = (serviceType: string): string => {
    const s = (serviceType || "").toLowerCase();
    if (s.includes("vahaan")) return "vahaan";
    if (s.includes("licence") || s.includes("license")) return "licence";
    if (s.includes("driving")) return "driving_school";
    if (s.includes("insurance")) return "insurance";
    if (s.includes("form 5") || s.includes("form5")) return "form5";
    return "vahaan";
  };

  const getTemplateSubModule = (tpl: any): string => {
    let sub = (tpl.subModule || "").toLowerCase();
    if (sub === "services") sub = "vahaan";
    if (sub) return sub;
    const name = tpl.templateName.toLowerCase();
    if (name.includes("insurance")) return "insurance";
    if (name.includes("licence") || name.includes("license")) return "licence";
    if (name.includes("form 5") || name.includes("form5")) return "form5";
    if (name.includes("school") || name.includes("driving")) return "driving_school";
    return "vahaan";
  };

  const filteredTemplates = useMemo(() => {
    const activeSub = getActiveSubModule(serviceForm.serviceType || "");
    return taskTemplates.filter((t: any) => {
      const tplSub = getTemplateSubModule(t);
      return tplSub.toLowerCase() === activeSub.toLowerCase();
    });
  }, [taskTemplates, serviceForm.serviceType]);

  useEffect(() => {
    if (serviceForm.templateId) {
      const templateExists = filteredTemplates.some(t => t.id === serviceForm.templateId);
      if (!templateExists) {
        setServiceForm(prev => ({ ...prev, templateId: "" }));
      }
    }
  }, [filteredTemplates, serviceForm.templateId]);

  const [previewDoc, setPreviewDoc] = useState<{ url: string; type: string; name: string } | null>(
    null,
  );

  const [clientDocs, setClientDocs] = useState<ClientDocument[]>([]);
  const [vehicleDocs, setVehicleDocs] = useState<VehicleDocumentInfo[]>([]);
  const [docProgress, setDocProgress] = useState<Record<string, number>>({});
  const [viewerDoc, setViewerDoc] = useState<{ url: string; name: string; isPdf: boolean } | null>(
    null,
  );
  const [zoom, setZoom] = useState(1);
  const [payments, setPayments] = useState<any[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  // Load real-time client activity logs
  useEffect(() => {
    if (!clientId) return;
    const q = query(collection(db, "client_activity_logs"), where("clientId", "==", clientId));
    const unsubActs = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
        const it = d.data() as any;
        return {
          id: d.id,
          actor: it.performedBy || it.userName || it.userId || "Unknown",
          action: it.action ?? "",
          field: it.fieldName || it.field || "",
          oldValue: it.oldValue || "",
          newValue: it.newValue || "",
          timestamp: it.performedAt || it.timestamp || new Date().toISOString(),
        };
      });
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setActivities(list);
    });
    return unsubActs;
  }, [clientId]);

  const [rolePermissions, setRolePermissions] = useState<any>(null);
  const session = getSession();
  const isAdmin = session?.role === "admin";
  const canEdit = isAdmin || (rolePermissions?.editClients ?? true);

  useEffect(() => {
    const unsubPerms = subscribeStaffPermissions((p) => {
      setRolePermissions(p);
    });
    return unsubPerms;
  }, []);

  useEffect(() => {
    if (!clientId) return;
    const unsubClientDocs = subscribeClientDocs(clientId, setClientDocs);
    const unsubVehicleDocs = subscribeVehicleDocs(clientId, setVehicleDocs);
    return () => {
      unsubClientDocs();
      unsubVehicleDocs();
    };
  }, [clientId]);

  // Load real-time client details (includes nested vehicles & services)
  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    const unsub = subscribeToClientDetails(clientId, (data) => {
      setDetails(data);
      setLoading(false);
    });
    return unsub;
  }, [clientId]);

  // Load real-time active employees
  useEffect(() => {
    const unsub = subscribeAllUsers(setActiveEmployees);
    return unsub;
  }, []);

  // Load real-time client payments and ledger entries
  useEffect(() => {
    if (!clientId) return;
    const qPayments = query(collection(db, "payment_history"), where("clientId", "==", clientId));
    const unsubPayments = onSnapshot(qPayments, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => (b.receivedAt || "").localeCompare(a.receivedAt || ""));
      setPayments(list);
    });

    const qLedger = query(collection(db, "accounts_ledger"), where("clientId", "==", clientId));
    const unsubLedger = onSnapshot(qLedger, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => (b.timestamp || "").localeCompare(a.timestamp || ""));
      setLedgerEntries(list);
    });

    return () => {
      unsubPayments();
      unsubLedger();
    };
  }, [clientId]);

  // Load real-time client applications and tasks to extract appointment date
  useEffect(() => {
    if (!clientId) return;
    const qApps = query(collection(db, "registry_applications_v1"), where("clientId", "==", clientId));
    const unsubApps = onSnapshot(qApps, (snap) => {
      setClientApplications(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const qTasks = query(collection(db, "tasks"), where("clientId", "==", clientId));
    const unsubTasks = onSnapshot(qTasks, (snap) => {
      setClientTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubApps();
      unsubTasks();
    };
  }, [clientId]);

  // Handle Client Save
  const handleEditClient = () => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    if (!details) return;
    setClientForm(details);
    setEditClientOpen(true);
  };

  const handleSaveClient = async () => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    try {
      const actorOverride = session
        ? { name: session.name, uid: session.uid, role: session.role }
        : undefined;
      await saveClient(clientForm as Client, actorOverride);
      setEditClientOpen(false);
      toast.success("Client profile updated successfully!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save client profile.");
    }
  };

  // Handle Vehicle Save / Delete
  const handleOpenVehicleModal = (v?: Vehicle) => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    if (v) {
      setEditingVehicle(v);
      setVehicleForm(v);
    } else {
      setEditingVehicle(null);
      setVehicleForm({
        id: `vehicle_${crypto.randomUUID()}`,
        clientId,
        vehicleNumber: "",
        vehicleType: "Commercial",
        chassisNumber: "",
        engineNumber: "",
        registrationDate: "",
        status: "Pending",
      });
    }
    setVehicleModalOpen(true);
  };

  const handleSaveVehicle = async () => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    if (!vehicleForm.vehicleNumber?.trim()) {
      toast.error("Vehicle Number is required");
      return;
    }
    try {
      const actorOverride = session
        ? { name: session.name, uid: session.uid, role: session.role }
        : undefined;
      await saveVehicle(vehicleForm as Vehicle, actorOverride);
      setVehicleModalOpen(false);
      toast.success(editingVehicle ? "Vehicle updated!" : "Vehicle added!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save vehicle.");
    }
  };

  const handleDeleteVehicle = async (vId: string) => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    if (!confirm("Are you sure you want to delete this vehicle and all associated services?")) {
      return;
    }
    try {
      await secureDelete(
  () => deleteVehicle(vId),
  "Vehicle",
  vId,
  session?.uid ?? "unknown"
);
      toast.success("Vehicle deleted successfully.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete vehicle.");
    }
  };

  // Handle Service Save / Delete
  const handleOpenServiceModal = (vehicleId: string, s?: Service) => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    if (s) {
      setEditingService(s);
      setServiceForm({
        ...s,
        clientId: s.clientId || clientId,
      });
    } else {
      setEditingService(null);
      const defaultServiceType = vehicleId ? "Insurance" : "License New";
      const isLic = isLicenseService(defaultServiceType);
      setServiceForm({
        id: `service_${crypto.randomUUID()}`,
        clientId,
        vehicleId: vehicleId || "",
        serviceType: defaultServiceType,
        applicationType: isLic ? "Non-Faceless" : "Home",
        dueDate: "",
        appointmentDate: "",
        serviceAmount: undefined,
        amountReceived: undefined,
        advancePayment: undefined,
        assignedStaff: "",
        taskStatus: "Not Started",
        notes: "",
        applicationId: "",
        templateId: "",
      });
    }
    setServiceModalOpen(true);
  };
  const handleSaveService = async () => {
    if (!serviceForm.applicationId || !serviceForm.applicationId.trim()) {
      toast.error("Application ID is required");
      return;
    }
    if (!serviceForm.serviceAmount || serviceForm.serviceAmount <= 0) {
      toast.error("Total Amount is required and must be greater than 0");
      return;
    }
    const advanceVal = serviceForm.advancePayment ?? serviceForm.amountReceived ?? 0;
    if (advanceVal < 0) {
      toast.error("Advance Payment cannot be negative");
      return;
    }
    if (!isAdvanceAmountValid(serviceForm.serviceAmount, advanceVal)) {
      toast.error(ADVANCE_AMOUNT_ERROR_MESSAGE);
      return;
    }
    const isLicense = isLicenseService(serviceForm.serviceType);
    if (!isLicense && !serviceForm.vehicleId) {
      toast.error("Vehicle selection is required for vehicle services");
      return;
    }
    try {
      const actorOverride = session
        ? { name: session.name, uid: session.uid, role: session.role }
        : undefined;
      const servicePayload = {
        ...serviceForm,
        clientId,
        vehicleId: isLicense ? "" : serviceForm.vehicleId,
        applicationType: serviceForm.applicationType || "Home",
      };
      await saveService(servicePayload as Service, actorOverride);
      setServiceModalOpen(false);
      toast.success(editingService ? "Service updated!" : "Service added!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save service.");
    }
  };

  const handleDeleteService = async (sId: string) => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    if (!confirm("Are you sure you want to delete this service?")) {
      return;
    }
    try {
      const actorOverride = session
        ? { name: session.name, uid: session.uid, role: session.role }
        : undefined;
      await secureDelete(
  () => deleteService(sId, actorOverride),
  "Service",
  sId,
  session?.uid ?? "unknown"
);
      toast.success("Service deleted.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete service.");
    }
  };

  // Update Service Status directly (stepper)
  const handleUpdateServiceStatus = async (service: Service, status: ServiceTaskStatus) => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    try {
      const actorOverride = session
        ? { name: session.name, uid: session.uid, role: session.role }
        : undefined;
      await saveService(
        {
          ...service,
          taskStatus: status,
        },
        actorOverride,
      );
      toast.success(`Service status updated to ${status}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to update status.");
    }
  };

  const handleUploadDocument = (vehicleId: string) => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,image/png,image/jpeg,image/jpg";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      // Check type
      const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
      if (!allowedTypes.includes(file.type)) {
        toast.error("Allowed formats: PDF, JPG, JPEG, PNG");
        return;
      }

      const docId = crypto.randomUUID();
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const storagePath = `vehicle_documents/${clientId}/${vehicleId}/${docId}_${cleanFileName}`;
      const storageRef = ref(storage, storagePath);

      console.log("[Storage Upload]", storagePath);
      console.log("[Storage User]", auth.currentUser);

      toast.loading("Uploading document...", { id: "upload-doc" });
      try {
        const uploadTask = uploadBytesResumable(storageRef, file, { contentType: file.type });

        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            null,
            (error) => reject(error),
            () => resolve(),
          );
        });

        const fileUrl = await getDownloadURL(storageRef);
        const userEmail = localStorage.getItem("userEmail") ?? "admin";

        const newDoc: VehicleDocument = {
          id: docId,
          fileName: file.name,
          fileUrl,
          storagePath,
          uploadedAt: new Date().toISOString(),
          uploadedBy: userEmail,
          fileType: file.type.includes("pdf") ? "pdf" : "image",
        };

        const actorOverride = session
          ? { name: session.name, uid: session.uid, role: session.role }
          : undefined;
        await addVehicleDocument(vehicleId, newDoc, actorOverride);
        toast.success("Document uploaded successfully!", { id: "upload-doc" });
      } catch (err: any) {
        console.error(err);
        toast.error(`Upload failed: ${err.message || err}`, { id: "upload-doc" });
      }
    };
    input.click();
  };

  const handleUploadClientDoc = async (category: string, file: File) => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    const existing = clientDocs.find((d) => d.category === category) || null;
    toast.loading(`Uploading ${category}...`, { id: `upload-client-${category}` });
    try {
      await saveClientDocument(clientId, category as any, file, existing, (pct) => {
        setDocProgress((prev) => ({ ...prev, [`client-${category}`]: pct }));
      });
      toast.success("Document saved successfully!", { id: `upload-client-${category}` });
    } catch (err: any) {
      console.error(err);
      toast.error(`Upload failed: ${err.message || err}`, { id: `upload-client-${category}` });
    } finally {
      setDocProgress((prev) => {
        const next = { ...prev };
        delete next[`client-${category}`];
        return next;
      });
    }
  };

  const handleUploadVehicleDoc = async (vehicleId: string, documentType: string, file: File) => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    const existing =
      vehicleDocs.find((d) => d.vehicleId === vehicleId && d.documentType === documentType) || null;
    toast.loading(`Uploading ${documentType}...`, {
      id: `upload-vehicle-${vehicleId}-${documentType}`,
    });
    try {
      await saveVehicleDocument(clientId, vehicleId, documentType as any, file, existing, (pct) => {
        setDocProgress((prev) => ({ ...prev, [`vehicle-${vehicleId}-${documentType}`]: pct }));
      });
      toast.success("Vehicle document saved successfully!", {
        id: `upload-vehicle-${vehicleId}-${documentType}`,
      });
    } catch (err: any) {
      console.error(err);
      toast.error(`Upload failed: ${err.message || err}`, {
        id: `upload-vehicle-${vehicleId}-${documentType}`,
      });
    } finally {
      setDocProgress((prev) => {
        const next = { ...prev };
        delete next[`vehicle-${vehicleId}-${documentType}`];
        return next;
      });
    }
  };

  const handleDeleteClientDoc = async (docObj: ClientDocument) => {
    if (!isAdmin) {
      toast.error("Only administrators can delete documents");
      return;
    }
    if (!confirm("Are you sure you want to delete this document?")) return;
    toast.loading("Deleting document...", { id: "delete-doc" });
    try {
      await secureDelete(
  () => deleteClientDocEntry(docObj),
  "ClientDocument",
  docObj.id,
  session?.uid ?? "unknown"
);
      toast.success("Document deleted successfully!", { id: "delete-doc" });
    } catch (err: any) {
      console.error(err);
      toast.error(`Deletion failed: ${err.message || err}`, { id: "delete-doc" });
    }
  };

  const handleDeleteVehicleDoc = async (docObj: VehicleDocumentInfo) => {
    if (!isAdmin) {
      toast.error("Only administrators can delete documents");
      return;
    }
    if (!confirm("Are you sure you want to delete this document?")) return;
    toast.loading("Deleting document...", { id: "delete-doc" });
    try {
      await secureDelete(
  () => deleteVehicleDocEntry(docObj),
  "VehicleDocument",
  docObj.id,
  session?.uid ?? "unknown"
);
      toast.success("Document deleted successfully!", { id: "delete-doc" });
    } catch (err: any) {
      console.error(err);
      toast.error(`Deletion failed: ${err.message || err}`, { id: "delete-doc" });
    }
  };

  const handleDownloadDocument = async (url: string, fileName: string) => {
    toast.loading("Downloading file...", { id: "download-doc" });
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      toast.success("Download started!", { id: "download-doc" });
    } catch (err: any) {
      console.error("Download failed:", err);
      // Fallback: open in new tab
      window.open(url, "_blank");
      toast.dismiss("download-doc");
    }
  };

  const handleDeleteDocument = async (vehicleId: string, docId: string, storagePath: string) => {
    if (!canEdit) {
      toast.error("You do not have permission to edit clients");
      return;
    }
    if (!confirm("Are you sure you want to delete this document?")) return;
    toast.loading("Deleting document...", { id: "delete-doc" });
    try {
      // Delete from storage
      const storageRef = ref(storage, storagePath);
      try {
        await deleteObject(storageRef);
      } catch (storageErr) {
        console.warn("Storage deletion error:", storageErr);
      }

      // Delete metadata from Firestore
      const actorOverride = session
        ? { name: session.name, uid: session.uid, role: session.role }
        : undefined;
      await deleteVehicleDocument(vehicleId, docId, actorOverride);
      toast.success("Document deleted successfully!", { id: "delete-doc" });
    } catch (err: any) {
      console.error(err);
      toast.error(`Deletion failed: ${err.message || err}`, { id: "delete-doc" });
    }
  };

  // Aggregated lists
  const activeTasks = useMemo(() => {
    if (!details?.vehicles) return [];
    const tasks: any[] = [];
    details.vehicles.forEach((v: any) => {
      v.services.forEach((s: any) => {
        if (s.taskStatus !== "Completed") {
          tasks.push({
            id: s.id,
            vehicleNumber: v.vehicleNumber,
            serviceType: s.serviceType,
            taskStatus: s.taskStatus,
            progress: s.progress,
            dueDate: s.dueDate,
          });
        }
      });
    });
    return tasks;
  }, [details]);

  const serviceWiseAccounting = useMemo(() => {
    if (!details?.vehicles) return [];
    const servicesByType: {
      [type: string]: { totalAmount: number; amountReceived: number; pendingAmount: number };
    } = {};

    details.vehicles.forEach((v: any) => {
      v.services.forEach((s: any) => {
        const type = s.serviceType;
        if (!servicesByType[type]) {
          servicesByType[type] = {
            totalAmount: 0,
            amountReceived: 0,
            pendingAmount: 0,
          };
        }
        servicesByType[type].totalAmount += s.serviceAmount ?? 0;
        servicesByType[type].amountReceived += s.amountReceived ?? 0;
        servicesByType[type].pendingAmount += s.pendingAmount ?? 0;
      });
    });

    return Object.entries(servicesByType).map(([type, accounting]) => ({
      serviceType: type,
      ...accounting,
    }));
  }, [details]);

  const completedServices = useMemo(() => {
    if (!details) return [];
    const allSrvs = [
      ...(details.personalServices || []),
      ...(details.vehicles || []).flatMap((v: any) => v.services || []),
    ];
    const uniqueMap = new Map();
    allSrvs.forEach((s) => {
      if (s && s.id && s.taskStatus === "Completed") {
        uniqueMap.set(s.id, s);
      }
    });
    return Array.from(uniqueMap.values());
  }, [details]);

  const pendingServices = useMemo(() => {
    if (!details) return [];
    const allSrvs = [
      ...(details.personalServices || []),
      ...(details.vehicles || []).flatMap((v: any) => v.services || []),
    ];
    const uniqueMap = new Map();
    allSrvs.forEach((s) => {
      if (s && s.id && s.taskStatus !== "Completed") {
        uniqueMap.set(s.id, s);
      }
    });
    return Array.from(uniqueMap.values());
  }, [details]);

  const totalServicesCount = useMemo(() => {
    if (!details) return 0;
    const allSrvs = [
      ...(details.personalServices || []),
      ...(details.vehicles || []).flatMap((v: any) => v.services || []),
    ];
    return new Set(allSrvs.map((s) => s.id)).size;
  }, [details]);

  const totalRevenue = useMemo(() => {
    if (!details) return 0;
    const allSrvs = [
      ...(details.personalServices || []),
      ...(details.vehicles || []).flatMap((v: any) => v.services || []),
    ];
    const uniqueMap = new Map();
    allSrvs.forEach((s) => {
      if (s && s.id) uniqueMap.set(s.id, s);
    });
    return Array.from(uniqueMap.values()).reduce((sum: number, s: any) => sum + (s.serviceAmount || 0), 0);
  }, [details]);

  const lastServiceDateStr = useMemo(() => {
    if (!details) return "—";
    const allSrvs = [
      ...(details.personalServices || []),
      ...(details.vehicles || []).flatMap((v: any) => v.services || []),
    ];
    const dates = allSrvs
      .map((s) => s.updatedAt || s.createdAt || s.dueDate)
      .filter(Boolean)
      .map((d) => new Date(d).getTime());
    if (dates.length === 0) return "—";
    const maxTime = Math.max(...dates);
    return formatDateDDMMYYYY(new Date(maxTime));
  }, [details]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-6 bg-background rounded-2xl border shadow-xl">
        <DialogHeader className="border-b pb-4 mb-4 flex flex-row items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <DialogTitle className="text-2xl font-bold tracking-tight">
                {details?.name || "Client Details"}
              </DialogTitle>
              {details && (
                <Badge
                  variant={details.type === "lead" ? "secondary" : "default"}
                  className="capitalize"
                >
                  {details.type}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Client Workspace • Vehicles, Service Pipelines, and Accounting
            </p>
          </div>
          {details && (
            <div className="flex gap-2 items-center">
              <WhatsAppMessagePanel mobile={details.mobile} name={details.name} />
              <Button
                onClick={() => {
                  generatePDF(
                    "client-details",
                    {
                      name: details.name,
                      mo: details.mobile,
                      email: "",
                      address: details.address || "",
                      group: "",
                      createdAt: "",
                      createdBy: "",
                      vehicles: (details.vehicles || []).map((v: any) => ({
                        vehicleNumber: v.vehicleNumber,
                        vehicleType: v.makeModel || "Commercial",
                        status: "Active",
                        services: (details.services || [])
                          .filter((s: any) => s.vehicleId === v.id)
                          .map((s: any) => s.type),
                      })),
                    },
                    session?.username || "system",
                  );
                }}
                variant="outline"
                size="sm"
                className="bg-red-50 text-red-700 hover:bg-red-100 border-red-200 gap-1.5"
              >
                <FileText className="size-4" />
                Generate Client PDF
              </Button>
              <Button onClick={handleEditClient} variant="outline" size="sm">
                <Pencil className="size-4 mr-2" />
                Edit Profile
              </Button>
            </div>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-muted-foreground text-sm">Loading client details...</p>
          </div>
        ) : !details ? (
          <div className="text-center py-10">
            <p className="text-destructive font-semibold">Client not found.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Customer Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-2">
              <div className="p-3 border rounded-xl bg-slate-50/50 text-center shadow-sm">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Total Vehicles</span>
                <p className="text-lg font-bold text-slate-800">{details.vehicles?.length || 0}</p>
              </div>
              <div className="p-3 border rounded-xl bg-slate-50/50 text-center shadow-sm">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Total Services</span>
                <p className="text-lg font-bold text-slate-800">{totalServicesCount}</p>
              </div>
              <div className="p-3 border rounded-xl bg-emerald-50/50 text-center border-emerald-100 shadow-sm">
                <span className="text-[10px] text-emerald-700 uppercase font-bold font-sans">Completed</span>
                <p className="text-lg font-bold text-emerald-700">{completedServices.length}</p>
              </div>
              <div className="p-3 border rounded-xl bg-orange-50/50 text-center border-orange-100 shadow-sm">
                <span className="text-[10px] text-orange-700 uppercase font-bold font-sans">Pending</span>
                <p className="text-lg font-bold text-orange-700">{pendingServices.length}</p>
              </div>
              <div className="p-3 border rounded-xl bg-blue-50/50 text-center border-blue-100 shadow-sm">
                <span className="text-[10px] text-blue-700 uppercase font-bold font-sans">Total Revenue</span>
                <p className="text-lg font-bold text-blue-700">₹{totalRevenue.toLocaleString("en-IN")}</p>
              </div>
              <div className="p-3 border rounded-xl bg-slate-50/50 text-center shadow-sm">
                <span className="text-[10px] text-muted-foreground uppercase font-bold font-sans">Last Service</span>
                <p className="text-[11px] font-bold text-slate-800 mt-1">{lastServiceDateStr}</p>
              </div>
            </div>

            <Tabs defaultValue="current_details" className="w-full font-sans">
              <TabsList className="grid grid-cols-3 mb-6 bg-slate-100 p-1 rounded-xl">
                <TabsTrigger value="current_details" className="font-semibold text-xs py-2 rounded-lg">CURRENT DETAILS</TabsTrigger>
                <TabsTrigger value="change_history" className="font-semibold text-xs py-2 rounded-lg">CHANGE HISTORY</TabsTrigger>
                <TabsTrigger value="completed_service_history" className="font-semibold text-xs py-2 rounded-lg">COMPLETED SERVICE HISTORY</TabsTrigger>
              </TabsList>

              <TabsContent value="current_details" className="space-y-6">
                {/* Client summary & Accounting cards */}
                <div className="grid gap-6 md:grid-cols-3">
                  {/* Comprehensive Profile Info Card */}
                  <Card className="md:col-span-1 border shadow-sm">
                    <CardHeader className="pb-3 border-b">
                      <CardTitle className="text-xs uppercase font-bold tracking-wide text-muted-foreground">
                        Customer Basic Profile
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3.5 text-xs pt-4 font-sans">
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="text-muted-foreground font-bold uppercase text-[9px] tracking-wider">Customer Name</span>
                        <span className="font-bold text-slate-800">{details.name || "—"}</span>
                      </div>
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="text-muted-foreground font-bold uppercase text-[9px] tracking-wider">Owner Name</span>
                        <span className="font-semibold text-slate-800">{details.ownerName || "—"}</span>
                      </div>
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="text-muted-foreground font-bold uppercase text-[9px] tracking-wider">Mobile Number</span>
                        <span className="font-semibold text-slate-800 font-mono">{details.mobile || "—"}</span>
                      </div>
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="text-muted-foreground font-bold uppercase text-[9px] tracking-wider">Alternate Mobile</span>
                        <span className="font-semibold text-slate-800 font-mono">{details.alternateMobile || "—"}</span>
                      </div>
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="text-muted-foreground font-bold uppercase text-[9px] tracking-wider">Email Address</span>
                        <span className="font-semibold text-slate-800 truncate max-w-[150px]">{details.email || "—"}</span>
                      </div>
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="text-muted-foreground font-bold uppercase text-[9px] tracking-wider">Group / Company</span>
                        <span className="font-semibold text-slate-800">{details.groupName || details.companyName || "—"}</span>
                      </div>
                      <div className="flex justify-between items-start border-b pb-2">
                        <span className="text-muted-foreground font-bold uppercase text-[9px] tracking-wider mt-0.5">C/O Address</span>
                        <span className="font-semibold text-slate-800 text-right leading-relaxed max-w-[150px]">{details.address || "—"}</span>
                      </div>
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="text-muted-foreground font-bold uppercase text-[9px] tracking-wider">City</span>
                        <span className="font-semibold text-slate-800">{details.city || "—"}</span>
                      </div>
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="text-muted-foreground font-bold uppercase text-[9px] tracking-wider">State</span>
                        <span className="font-semibold text-slate-800">{details.state || "—"}</span>
                      </div>
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="text-muted-foreground font-bold uppercase text-[9px] tracking-wider">Customer Type</span>
                        <Badge variant="outline" className="capitalize text-[10px]">{details.customerType || details.type || "Client"}</Badge>
                      </div>
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="text-muted-foreground font-bold uppercase text-[9px] tracking-wider">Customer Status</span>
                        <Badge variant={details.status === "Active" || !details.status ? "default" : "secondary"} className="capitalize text-[10px]">
                          {details.status || "Active"}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="text-muted-foreground font-bold uppercase text-[9px] tracking-wider">Customer ID</span>
                        <span className="font-mono text-slate-500 font-bold">{details.id}</span>
                      </div>
                      {details.notes && (
                        <div className="pt-2">
                          <p className="font-bold text-muted-foreground uppercase text-[9px] tracking-wider">Notes</p>
                          <p className="text-xs text-muted-foreground leading-normal mt-1 bg-slate-50 p-2 rounded border">
                            {details.notes}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

              {/* Accounting Summary */}
              <Card className="md:col-span-2 border shadow-sm bg-muted/10">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs uppercase font-bold tracking-wide text-muted-foreground">
                    Accounting & Finance
                  </CardTitle>
                  <Badge variant="outline" className="capitalize text-[10px]">
                    Status: {details.accounting.pendingAmount === 0 ? "Paid" : details.accounting.amountReceived > 0 ? "Partially Paid" : "Pending"}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-3 border rounded-xl bg-background shadow-sm">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">
                        Advance Payment
                      </span>
                      <p className="text-xl font-bold mt-1 text-foreground">
                        ₹{(details.advancePayment || 0).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="p-3 border rounded-xl bg-background shadow-sm">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">
                        Total Bill
                      </span>
                      <p className="text-xl font-bold mt-1 text-foreground">
                        ₹{details.accounting.totalAmount.toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="p-3 border rounded-xl bg-background shadow-sm">
                      <span className="text-[10px] text-green-700 uppercase font-bold">
                        Received
                      </span>
                      <p className="text-xl font-bold mt-1 text-green-600">
                        ₹{details.accounting.amountReceived.toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="p-3 border rounded-xl bg-background shadow-sm">
                      <span className="text-[10px] text-red-700 uppercase font-bold">Pending</span>
                      <p className="text-xl font-bold mt-1 text-red-600">
                        ₹{details.accounting.pendingAmount.toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>

                  {serviceWiseAccounting.length > 0 && (
                    <div className="border-t pt-3 space-y-2">
                      <p className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
                        Accounting Summary by Service
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {serviceWiseAccounting.map((item) => (
                          <div
                            key={item.serviceType}
                            className="p-2.5 border rounded-lg bg-background text-xs flex flex-col justify-between"
                          >
                            <span className="font-semibold text-foreground mb-1.5">
                              {serviceLabel(item.serviceType as any)}
                            </span>
                            <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                              <div>
                                <span className="text-muted-foreground block">Total</span>
                                <span className="font-bold">
                                  ₹{item.totalAmount.toLocaleString("en-IN")}
                                </span>
                              </div>
                              <div>
                                <span className="text-green-700 block">Rec</span>
                                <span className="font-bold text-green-600">
                                  ₹{item.amountReceived.toLocaleString("en-IN")}
                                </span>
                              </div>
                              <div>
                                <span className="text-red-700 block">Pend</span>
                                <span className="font-bold text-red-600">
                                  ₹{item.pendingAmount.toLocaleString("en-IN")}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Collection History */}
                  <div className="border-t pt-3 space-y-2">
                    <p className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
                      Collection History (Payments)
                    </p>
                    {payments.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No payments recorded.</p>
                    ) : (
                      <div className="space-y-1 max-h-[150px] overflow-y-auto">
                        {payments.map((p: any) => (
                          <div key={p.id} className="p-2 border rounded-lg bg-background text-[11px] flex justify-between items-center font-mono">
                            <div>
                              <span className="font-semibold text-foreground">{p.paymentId || "PAYMENT"}</span>
                              <span className="text-muted-foreground ml-2">({p.method} - {p.accountName})</span>
                              {p.remarks && <span className="text-muted-foreground block text-[10px] font-sans italic">{p.remarks}</span>}
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-green-600 block">₹{p.amount.toLocaleString("en-IN")}</span>
                              <span className="text-[10px] text-muted-foreground">{(p.receivedAt || "").slice(0, 10)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Ledger Entries */}
                  <div className="border-t pt-3 space-y-2">
                    <p className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
                      Ledger Entries
                    </p>
                    {ledgerEntries.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No ledger entries.</p>
                    ) : (
                      <div className="space-y-1 max-h-[150px] overflow-y-auto">
                        {ledgerEntries.map((l: any) => (
                          <div key={l.id} className="p-2 border rounded-lg bg-background text-[11px] flex justify-between items-center font-mono">
                            <div>
                              <span className="font-semibold text-foreground">{l.remarks}</span>
                              <span className="text-muted-foreground block text-[10px]">{l.account}</span>
                            </div>
                            <div className="text-right">
                              <span className={`font-bold block ${l.type === "Debit" ? "text-green-600" : "text-red-600"}`}>
                                {l.type === "Debit" ? "+" : "-"}₹{l.amount.toLocaleString("en-IN")}
                              </span>
                              <span className="text-[10px] text-muted-foreground block">Bal: ₹{l.balance.toLocaleString("en-IN")}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Active Tasks & Pipeline progress */}
            {activeTasks.length > 0 && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs uppercase font-bold tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <Clock className="size-3.5 text-orange-500" />
                    Active Services Pipeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-2">
                  {activeTasks.map((t: any) => (
                    <div
                      key={t.id}
                      className="flex flex-col sm:flex-row justify-between sm:items-center p-3 border rounded-lg bg-card gap-2"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="font-mono text-xs">
                          {t.vehicleNumber}
                        </Badge>
                        <span className="font-semibold text-sm">{serviceLabel(t.serviceType)}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {t.taskStatus}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col text-right">
                          <span className="text-xs font-semibold text-foreground">
                            {t.progress}% Progress
                          </span>
                          {t.dueDate && (
                            <span className="text-[10px] text-muted-foreground mt-0.5">
                              Due: {formatDateDDMMYYYY(t.dueDate)}
                            </span>
                          )}
                        </div>
                        <div className="w-24 bg-muted h-2 rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${t.progress}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Structured Client Documents Section */}
            <Card className="border shadow-sm">
              <CardHeader 
                className="pb-3 border-b cursor-pointer hover:bg-muted/10 transition-colors select-none"
                onClick={() => setPersonalDocsCollapsed(!personalDocsCollapsed)}
              >
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileText className="size-4 text-primary" />
                    Personal Documents
                  </span>
                  <span className="text-xs text-muted-foreground font-normal">
                    {personalDocsCollapsed ? "▶ Expand" : "▼ Collapse"}
                  </span>
                </CardTitle>
              </CardHeader>
              {!personalDocsCollapsed && (
                <CardContent className="p-0 divide-y">
                  {CLIENT_DOC_SLOTS.map((slot) => {
                    const docObj = clientDocs.find((d) => d.category === slot.key) || null;
                    const progress = docProgress[`client-${slot.key}`];
                    return (
                      <div
                        key={slot.key}
                        className={cn(
                          "p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3 transition-colors",
                          docObj
                            ? "bg-emerald-50/40 hover:bg-emerald-50/60"
                            : "bg-rose-50/60 hover:bg-rose-50/80"
                        )}
                      >
                        <div className="space-y-1">
                          <span className={cn("font-semibold text-sm block", docObj ? "text-emerald-900" : "text-rose-900")}>
                            {slot.label}
                          </span>
                          {docObj ? (
                            <div className="text-xs text-muted-foreground space-y-0.5">
                              <p className="font-medium text-foreground truncate max-w-md">
                                {docObj.fileName}
                              </p>
                              <p>
                                Uploaded by {docObj.uploadedBy} on{" "}
                                {formatDateDDMMYYYY(docObj.uploadedAt)}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-rose-500 font-semibold block">Not Uploaded</span>
                          )}
                          {progress !== undefined && (
                            <div className="w-full max-w-[200px] mt-1.5">
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary transition-all duration-300"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {docObj && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs gap-1"
                                onClick={() => {
                                  const isPdf = docObj.fileName.toLowerCase().endsWith(".pdf");
                                  setViewerDoc({ url: docObj.url, name: slot.label, isPdf });
                                }}
                              >
                                <Eye className="size-3.5" /> View
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs gap-1"
                                onClick={() => handleDownloadDocument(docObj.url, docObj.fileName)}
                              >
                                <Download className="size-3.5" /> Download
                              </Button>
                            </>
                          )}
                          <label className={cn(
                            "h-8 px-3 rounded-md cursor-pointer flex items-center justify-center text-xs font-semibold gap-1.5 transition-colors",
                            docObj
                              ? "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                              : "bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-200"
                          )}>
                            <Upload className="size-3.5" />
                            {docObj ? "Replace" : "Upload"}
                            <input
                              type="file"
                              accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                              onChange={(e) => {
                                const file = e.currentTarget.files?.[0];
                                if (file) handleUploadClientDoc(slot.key, file);
                                e.currentTarget.value = "";
                              }}
                              className="hidden"
                            />
                          </label>
                          {docObj && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              disabled={!isAdmin}
                              title={
                                !isAdmin
                                  ? "Only administrators can delete documents"
                                  : "Delete document"
                              }
                              onClick={() => handleDeleteClientDoc(docObj)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              )}
            </Card>

            {/* Personal Services (License New / License Renew) section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                  <User className="size-5 text-primary" />
                  Personal Services ({details.personalServices?.length || 0})
                </h3>
                <Button onClick={() => handleOpenServiceModal("")} size="sm">
                  <Plus className="size-4 mr-1" /> Add License Service
                </Button>
              </div>

              {(!details.personalServices || details.personalServices.length === 0) ? (
                <div className="text-center py-6 border border-dashed rounded-2xl bg-muted/5">
                  <p className="text-xs text-muted-foreground">
                    No personal services (License New / License Renew) active for this client. Click Add License Service to create one.
                  </p>
                </div>
              ) : (
                <Card className="border shadow-sm overflow-hidden">
                  <CardContent className="p-0 divide-y">
                    {details.personalServices.map((s: Service) => (
                      <div key={s.id} className="p-5 flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">
                                {serviceLabel(s.serviceType)}
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {s.taskStatus}
                              </Badge>
                              {(() => {
                                const linkedApp = clientApplications.find(
                                  (app) => app.applicationId === s.applicationId || app.id === s.applicationId
                                );
                                const linkedAppDate = linkedApp?.appointmentDate || 
                                  linkedApp?.licenseDetails?.newLearningLicence?.appointmentDate || 
                                  linkedApp?.licenseDetails?.llRenewClass?.appointmentDate;
                                const linkedTask = clientTasks.find(
                                  (t) => t.serviceId === s.id || t.applicationId === s.applicationId
                                );
                                const linkedTaskDate = linkedTask?.appointmentDate;
                                const apptDate = (s as any).appointmentDate || linkedTaskDate || linkedAppDate;
                                return apptDate ? (
                                  <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                                    Appt: {formatDateDDMMYYYY(apptDate)}
                                  </Badge>
                                ) : null;
                              })()}
                              {s.dueDate && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="size-3" />
                                  Due: {formatDateDDMMYYYY(s.dueDate)}
                                </span>
                              )}
                              {s.applicationId && (
                                <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                  App ID: {s.applicationId}
                                </Badge>
                              )}
                            </div>
                            {s.notes && (
                              <p className="text-xs text-muted-foreground mt-1.5 bg-muted/20 p-2 rounded border leading-relaxed">
                                {s.notes}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-4 text-xs font-mono">
                            <div className="text-right">
                              <span className="text-[9px] text-muted-foreground block uppercase font-bold">Amt</span>
                              <span className="font-bold text-foreground">₹{s.serviceAmount}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[9px] text-green-700 block uppercase font-bold">Rec</span>
                              <span className="font-bold text-green-600">₹{s.amountReceived}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[9px] text-red-700 block uppercase font-bold">Pend</span>
                              <span className="font-bold text-red-600">₹{s.pendingAmount}</span>
                            </div>
                            <div className="flex gap-1 ml-2">
                              <Button
                                onClick={() => handleOpenServiceModal("", s)}
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                onClick={() => handleDeleteService(s.id)}
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2 border-t pt-3">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-semibold text-muted-foreground">Pipeline Progression:</span>
                            <span className="font-mono text-primary font-bold">{s.progress}% Complete</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {TASK_STAGES.map((stage) => {
                              const active = s.taskStatus === stage;
                              const completedIndex = TASK_STAGES.indexOf(s.taskStatus);
                              const currentIndex = TASK_STAGES.indexOf(stage);
                              const done = currentIndex <= completedIndex;
                              return (
                                <button
                                  key={stage}
                                  onClick={() => handleUpdateServiceStatus(s, stage)}
                                  className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                                    active
                                      ? "bg-primary text-primary-foreground font-semibold ring-2 ring-primary/30"
                                      : done
                                        ? "bg-green-100 text-green-700 border border-green-200"
                                        : "bg-muted text-muted-foreground hover:bg-muted/80 border border-transparent"
                                  }`}
                                >
                                  {stage}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Vehicles & nested Services section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                  <Car className="size-5 text-primary" />
                  Vehicles ({details.vehicles.length})
                </h3>
                <Button onClick={() => handleOpenVehicleModal()} size="sm">
                  <Plus className="size-4 mr-1" /> Add Vehicle
                </Button>
              </div>

              {details.vehicles.length === 0 ? (
                <div className="text-center py-10 border border-dashed rounded-2xl bg-muted/5">
                  <Car className="size-12 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No vehicles registered. Click Add Vehicle to get started.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {details.vehicles.map((v: any) => (
                    <Card
                      key={v.id}
                      className="border shadow-sm overflow-hidden hover:border-primary/20 transition-all"
                    >
                      <CardHeader className="bg-muted/10 px-5 py-4 border-b flex flex-row items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-lg font-bold tracking-tight text-primary">
                            {v.vehicleNumber}
                          </span>
                          <Badge variant="outline" className="text-xs bg-background">
                            {v.vehicleType}
                          </Badge>
                          <Badge
                            className="text-xs"
                            variant={v.status === "Completed" ? "default" : "secondary"}
                          >
                            {v.status}
                          </Badge>
                        </div>
                        <div className="flex gap-1.5">
                          <Button
                            onClick={() => handleOpenServiceModal(v.id)}
                            size="sm"
                            variant="outline"
                          >
                            <Plus className="size-3.5 mr-1" /> Add Service
                          </Button>
                          <Button
                            onClick={() => handleOpenVehicleModal(v)}
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            onClick={() => handleDeleteVehicle(v.id)}
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </CardHeader>

                      <CardContent className="p-0">
                        {/* Vehicle extra info cells */}
                        {(v.chassisNumber || v.engineNumber || v.registrationDate) && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 border-b text-xs bg-muted/5">
                            {v.chassisNumber && (
                              <div>
                                <span className="font-bold text-muted-foreground uppercase block text-[9px] tracking-wider mb-0.5">
                                  Chassis Number
                                </span>
                                <span className="font-mono font-medium">{v.chassisNumber}</span>
                              </div>
                            )}
                            {v.engineNumber && (
                              <div>
                                <span className="font-bold text-muted-foreground uppercase block text-[9px] tracking-wider mb-0.5">
                                  Engine Number
                                </span>
                                <span className="font-mono font-medium">{v.engineNumber}</span>
                              </div>
                            )}
                            {v.registrationDate && (
                              <div>
                                <span className="font-bold text-muted-foreground uppercase block text-[9px] tracking-wider mb-0.5">
                                  Reg Date
                                </span>
                                <span>
                                  {formatDateDDMMYYYY(v.registrationDate)}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Services List nested under this vehicle */}
                        <div className="divide-y">
                          {v.services.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-6">
                              No services active for this vehicle.
                            </p>
                          ) : (
                            v.services.map((s: Service) => (
                              <div key={s.id} className="p-5 flex flex-col gap-4">
                                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-semibold text-sm">
                                        {serviceLabel(s.serviceType)}
                                      </span>
                                      <Badge variant="outline" className="text-[10px]">
                                        {s.taskStatus}
                                      </Badge>
                                      {(() => {
                                        const vApp = clientApplications.find(
                                          (app) => app.applicationId === s.applicationId || app.id === s.applicationId
                                        );
                                        const vTask = clientTasks.find(
                                          (t) => t.serviceId === s.id || t.applicationId === s.applicationId
                                        );
                                        const vApptDate = (s as any).appointmentDate || vTask?.appointmentDate || vApp?.appointmentDate;
                                        return vApptDate ? (
                                          <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                                            Appt: {formatDateDDMMYYYY(vApptDate)}
                                          </Badge>
                                        ) : null;
                                      })()}
                                      {s.dueDate && (
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                          <Calendar className="size-3" />
                                          Due: {formatDateDDMMYYYY(s.dueDate)}
                                        </span>
                                      )}
                                      {s.applicationId && (
                                        <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                          App ID: {s.applicationId}
                                        </Badge>
                                      )}
                                      <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-700">
                                        Staff: {s.assignedStaff || (s as any).assignedEmployeeName || "Unassigned"}
                                      </Badge>
                                    </div>
                                    {(s.notes || (s as any).remarks) && (
                                      <p className="text-xs text-muted-foreground mt-1.5 bg-muted/20 p-2 rounded border leading-relaxed">
                                        <strong className="text-slate-700">Remarks:</strong> {s.notes || (s as any).remarks}
                                      </p>
                                    )}
                                  </div>

                                  {/* Service-level accounting numbers */}
                                  <div className="flex items-center gap-4 text-xs font-mono">
                                    <div className="text-right">
                                      <span className="text-[9px] text-muted-foreground block uppercase font-bold">
                                        Charges
                                      </span>
                                      <span className="font-bold text-foreground">
                                        ₹{s.serviceAmount || 0}
                                      </span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-[9px] text-purple-700 block uppercase font-bold">
                                        RTO Exp
                                      </span>
                                      <span className="font-bold text-purple-600">
                                        ₹{(s as any).rtoExpense || 0}
                                      </span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-[9px] text-green-700 block uppercase font-bold">
                                        Rec
                                      </span>
                                      <span className="font-bold text-green-600">
                                        ₹{s.amountReceived || 0}
                                      </span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-[9px] text-red-700 block uppercase font-bold">
                                        Pend
                                      </span>
                                      <span className="font-bold text-red-600">
                                        ₹{s.pendingAmount || 0}
                                      </span>
                                    </div>
                                    <div className="flex gap-1 ml-2">
                                      <Button
                                        onClick={() => {
                                          const pdfTypeMap: Record<string, string> = {
                                            Insurance: "insurance",
                                            Fitness: "fitness",
                                            "Gujarat Permit": "gujarat-permit",
                                            "National Permit": "national-permit",
                                            Tax: "tax",
                                            PUC: "puc",
                                            "License Renewal": "license-renew",
                                            "RC Transfer": "rc-transfer",
                                            "HP Termination": "hp-termination",
                                          };
                                          const type = pdfTypeMap[s.serviceType] || "insurance";
                                          generatePDF(
                                            type,
                                            {
                                              policyNumber: (s as any).serviceNo || (s as any).applicationNo || "—",
                                              company: (s as any).companyName || "—",
                                              startDate: (s as any).startDate || "—",
                                              expiryDate: s.dueDate || (s as any).expiryDate || "—",
                                              premiumAmount: s.serviceAmount || 0,
                                              status: s.taskStatus || "—",
                                              assignee: (s as any).assignedTo || "—",
                                              remarks: s.notes || "—",
                                              vehicleNumber: v.vehicleNumber || "—",
                                              inspectionDate: (s as any).startDate || "—",
                                              paymentAmount: s.serviceAmount || 0,
                                              paymentStatus: "Paid",
                                              permitNo: (s as any).serviceNo || "—",
                                              amount: s.serviceAmount || 0,
                                              period: (s as any).period || "—",
                                              paidAmount: s.amountReceived || 0,
                                              pendingAmount: s.pendingAmount || 0,
                                              pucNo: (s as any).serviceNo || "—",
                                              issueDate: (s as any).startDate || "—",
                                              licenseNo: (s as any).serviceNo || "—",
                                              licenseType: s.serviceType || "—",
                                              applicantName: details.name || "—",
                                              applicationNo: (s as any).applicationNo || "—",
                                            },
                                            session?.username || "system",
                                          );
                                        }}
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-red-600 hover:bg-red-50"
                                        title="Generate Service PDF"
                                      >
                                        <Download className="size-3.5" />
                                      </Button>
                                      <Button
                                        onClick={() => handleOpenServiceModal(v.id, s)}
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8"
                                      >
                                        <Pencil className="size-3.5" />
                                      </Button>
                                      <Button
                                        onClick={() => handleDeleteService(s.id)}
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                      >
                                        <Trash2 className="size-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>

                                {/* Interactive task tracking pipeline */}
                                <div className="space-y-2 border-t pt-3">
                                  <div className="flex items-center justify-between text-xs mb-1">
                                    <span className="font-semibold text-muted-foreground">
                                      Pipeline Progression:
                                    </span>
                                    <span className="font-mono text-primary font-bold">
                                      {s.progress}% Complete
                                    </span>
                                  </div>

                                  {/* Progress Bar steps indicator */}
                                  <div className="flex flex-wrap gap-2">
                                    {TASK_STAGES.map((stage) => {
                                      const active = s.taskStatus === stage;
                                      const completedIndex = TASK_STAGES.indexOf(s.taskStatus);
                                      const currentIndex = TASK_STAGES.indexOf(stage);
                                      const done = currentIndex <= completedIndex;

                                      return (
                                        <button
                                          key={stage}
                                          onClick={() => handleUpdateServiceStatus(s, stage)}
                                          className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                                            active
                                              ? "bg-primary text-primary-foreground font-semibold ring-2 ring-primary/30"
                                              : done
                                                ? "bg-green-100 text-green-700 border border-green-200"
                                                : "bg-muted text-muted-foreground hover:bg-muted/80 border border-transparent"
                                          }`}
                                        >
                                          {stage}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Structured Vehicle Documents Section */}
                        <div className="border-t bg-muted/5">
                          <div 
                            className="p-4 border-b cursor-pointer hover:bg-muted/10 transition-colors select-none flex items-center justify-between"
                            onClick={() => {
                              setVehicleDocsCollapsed((prev) => ({
                                ...prev,
                                [v.id]: prev[v.id] === false ? true : false,
                              }));
                            }}
                          >
                            <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
                              <FileText className="size-4 text-primary" />
                              Vehicle Documents
                            </h4>
                            <span className="text-xs text-muted-foreground">
                              {vehicleDocsCollapsed[v.id] !== false ? "▶ Expand" : "▼ Collapse"}
                            </span>
                          </div>

                          {vehicleDocsCollapsed[v.id] === false && (
                            <div className="p-4 space-y-4">
                              <div className="grid gap-3">
                                {VEHICLE_DOC_SLOTS.map((slot) => {
                                  const docObj =
                                    vehicleDocs.find(
                                      (d) => d.vehicleId === v.id && d.documentType === slot.key,
                                    ) || null;
                                  const progress = docProgress[`vehicle-${v.id}-${slot.key}`];
                                  const changeKey = `${v.id}-${slot.key}`;
                                  return (
                                    <div
                                      key={slot.key}
                                      className={cn(
                                        "p-3 border rounded-lg flex flex-col gap-3 hover:shadow-sm transition-all",
                                        docObj && docObj.fileName
                                          ? "bg-emerald-50/40 border-emerald-200"
                                          : "bg-rose-50/60 border-rose-200"
                                      )}
                                    >
                                      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                                        <div className="space-y-0.5">
                                          <span className={cn("font-semibold text-xs block", docObj && docObj.fileName ? "text-emerald-800" : "text-rose-800")}>
                                            {slot.label}
                                          </span>
                                          {docObj && docObj.fileName ? (
                                            <div className="text-[11px] text-muted-foreground">
                                              <p className="font-medium text-foreground truncate max-w-xs">
                                                {docObj.fileName}
                                              </p>
                                              <p>
                                                Uploaded by {docObj.uploadedBy} on{" "}
                                                {formatDate(docObj.uploadedAt)}
                                              </p>
                                            </div>
                                          ) : (
                                            <span className="text-[11px] text-rose-500 font-semibold block">
                                              Not Uploaded
                                            </span>
                                          )}
                                          {progress !== undefined && (
                                            <div className="w-full max-w-[150px] mt-1.5">
                                              <div className="h-1 bg-muted rounded-full overflow-hidden">
                                                <div
                                                  className="h-full bg-primary transition-all duration-300"
                                                  style={{ width: `${progress}%` }}
                                                />
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          {docObj && docObj.url && (
                                            <>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 text-[11px] px-2 gap-1"
                                                onClick={() => {
                                                  const isPdf = docObj.fileName
                                                    .toLowerCase()
                                                    .endsWith(".pdf");
                                                  setViewerDoc({
                                                    url: docObj.url,
                                                    name: `${v.vehicleNumber} - ${slot.label}`,
                                                    isPdf,
                                                  });
                                                }}
                                              >
                                                <Eye className="size-3" /> View
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 text-[11px] px-2 gap-1"
                                                onClick={() =>
                                                  handleDownloadDocument(docObj.url, docObj.fileName)
                                                }
                                              >
                                                <Download className="size-3" /> Download
                                              </Button>
                                            </>
                                          )}
                                          <label className={cn(
                                            "h-7 px-2.5 rounded-md cursor-pointer flex items-center justify-center text-[11px] font-semibold gap-1 transition-colors",
                                            docObj && docObj.url
                                              ? "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                                              : "bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-200"
                                          )}>
                                            <Upload className="size-3" />
                                            {docObj && docObj.url ? "Replace" : "Upload"}
                                            <input
                                              type="file"
                                              accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                                              onChange={(e) => {
                                                const file = e.currentTarget.files?.[0];
                                                if (file) handleUploadVehicleDoc(v.id, slot.key, file);
                                                e.currentTarget.value = "";
                                              }}
                                              className="hidden"
                                            />
                                          </label>
                                          {docObj && docObj.url && (
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                              disabled={!isAdmin}
                                              title={
                                                !isAdmin
                                                  ? "Only administrators can delete documents"
                                                  : "Delete document"
                                              }
                                              onClick={() => handleDeleteVehicleDoc(docObj)}
                                            >
                                              <Trash2 className="size-3" />
                                            </Button>
                                          )}
                                        </div>
                                      </div>

                                      {/* Document Number and Expiry Date Fields */}
                                      <div className="mt-2 pt-2 border-t flex flex-wrap gap-3 items-end">
                                        {(slot.key === "rc_book" || slot.key === "insurance") && (
                                          <div className="space-y-1">
                                            <label className="text-[10px] uppercase font-bold text-muted-foreground block font-sans">
                                              {slot.key === "rc_book" ? "Document Number" : "Policy Number"}
                                            </label>
                                            <Input
                                              className="h-8 text-xs w-48 bg-background border"
                                              value={docFields[changeKey]?.documentNumber ?? docObj?.documentNumber ?? ""}
                                              onChange={(e) => handleDocFieldChange(v.id, slot.key, "documentNumber", e.target.value)}
                                              placeholder={slot.key === "rc_book" ? "Enter Document Number" : "Enter Policy Number"}
                                            />
                                          </div>
                                        )}
                                        <div className="space-y-1">
                                          <label className="text-[10px] uppercase font-bold text-muted-foreground block font-sans">Expiry Date</label>
                                          <DateInput
                                            className="w-40"
                                            value={docFields[changeKey]?.expiryDate ?? docObj?.expiryDate ?? ""}
                                            onChange={(val) => handleDocFieldChange(v.id, slot.key, "expiryDate", val)}
                                          />
                                        </div>
                                        {hasDocChanges(changeKey, docObj) && (
                                          <Button
                                            size="sm"
                                            className="h-8 text-[11px] px-3 font-semibold"
                                            onClick={() => handleSaveDocFields(v.id, slot.key, docObj)}
                                          >
                                            Save Details
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Backward Compatibility: Display Legacy Documents if any exist */}
                              {v.documents &&
                                Array.isArray(v.documents) &&
                                v.documents.filter((doc: any) => doc && (doc.fileUrl || doc.url))
                                  .length > 0 && (
                                  <div className="mt-4 pt-4 border-t border-dashed">
                                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide block mb-2">
                                      Legacy Documents
                                    </span>
                                    <div className="grid gap-2">
                                      {v.documents
                                        .filter((doc: any) => doc && (doc.fileUrl || doc.url))
                                        .map((doc: any, index: number) => {
                                          const docUrl = doc.fileUrl || doc.url;
                                          const docName = doc.fileName || doc.name || "Document";
                                          const docId = doc.id || `doc-${index}-${docName}`;
                                          const docType =
                                            doc.fileType ||
                                            (docUrl.toLowerCase().includes(".pdf") ? "pdf" : "image");
                                          const storagePath = doc.storagePath || "";

                                          return (
                                            <div
                                              key={docId}
                                              className="flex items-center justify-between p-2.5 border border-dashed rounded-lg bg-background gap-3"
                                            >
                                              <div className="flex items-center gap-2 min-w-0">
                                                <FileText className="size-3.5 text-muted-foreground shrink-0" />
                                                <span
                                                  className="text-xs truncate text-muted-foreground"
                                                  title={docName}
                                                >
                                                  {docName}
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-1 shrink-0">
                                                <Button
                                                  size="icon"
                                                  variant="ghost"
                                                  className="h-7 w-7 hover:bg-muted"
                                                  onClick={() =>
                                                    setViewerDoc({
                                                      url: docUrl,
                                                      name: docName,
                                                      isPdf: docType === "pdf",
                                                    })
                                                  }
                                                  title="View Document"
                                                >
                                                  <Eye className="size-3" />
                                                </Button>
                                                <Button
                                                  size="icon"
                                                  variant="ghost"
                                                  className="h-7 w-7 hover:bg-muted"
                                                  onClick={() =>
                                                    handleDownloadDocument(docUrl, docName)
                                                  }
                                                  title="Download Document"
                                                >
                                                  <Download className="size-3" />
                                                </Button>
                                                <Button
                                                  size="icon"
                                                  variant="ghost"
                                                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                                  onClick={() =>
                                                    handleDeleteDocument(v.id, docId, storagePath)
                                                  }
                                                  title="Delete Document"
                                                >
                                                  <Trash2 className="size-3" />
                                                </Button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                    </div>
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="change_history" className="space-y-4 font-sans">
            <Card className="border shadow-sm">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  Customer Profile Change History
                </CardTitle>
                <CardDescription>
                  System-generated audit trail of all profile adjustments.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {activities.length === 0 ? (
                  <div className="text-center py-10 text-xs text-muted-foreground italic">
                    No change logs found for this customer.
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[50vh]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-slate-50 text-gray-500 uppercase font-bold text-[9px] border-b z-10">
                        <tr>
                          <th className="p-3">Date</th>
                          <th className="p-3">Time</th>
                          <th className="p-3">Changed By</th>
                          <th className="p-3">Field Changed</th>
                          <th className="p-3">Previous Value</th>
                          <th className="p-3">New Value</th>
                          <th className="p-3">Change Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-gray-700 font-medium">
                        {activities.map((act: any) => {
                          const dateObj = new Date(act.timestamp);
                          const dateStr = isNaN(dateObj.getTime())
                            ? "—"
                            : formatDate(dateObj);
                          const timeStr = isNaN(dateObj.getTime())
                            ? "—"
                            : dateObj.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

                          return (
                            <tr key={act.id} className="hover:bg-slate-50/50">
                              <td className="p-3 font-mono">{dateStr}</td>
                              <td className="p-3 font-mono">{timeStr}</td>
                              <td className="p-3 font-semibold text-slate-800">{act.actor}</td>
                              <td className="p-3 font-semibold text-sky-700 capitalize">{act.field || "—"}</td>
                              <td className="p-3 font-mono max-w-[150px] truncate" title={act.oldValue}>{act.oldValue || "—"}</td>
                              <td className="p-3 font-mono max-w-[150px] truncate" title={act.newValue}>{act.newValue || "—"}</td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 border text-slate-600">
                                  {act.action}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="completed_service_history" className="space-y-4 font-sans">
            <Card className="border shadow-sm">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Completed Services Log
                </CardTitle>
                <CardDescription>
                  Autorun list of all finalized service tasks.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {completedServices.length === 0 ? (
                  <div className="text-center py-10 text-xs text-muted-foreground italic">
                    No completed services found for this customer.
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[50vh]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-slate-50 text-gray-500 uppercase font-bold text-[9px] border-b z-10 font-sans">
                        <tr>
                          <th className="p-3">Sr No</th>
                          <th className="p-3">Completion Date</th>
                          <th className="p-3">Sub Module</th>
                          <th className="p-3">Service Name</th>
                          <th className="p-3">Vehicle Number</th>
                          <th className="p-3">Assigned Employee</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Total Charges</th>
                          <th className="p-3">Advance Paid</th>
                          <th className="p-3">RTO Receipt Amount</th>
                          <th className="p-3">RTO Expense</th>
                          <th className="p-3">Application Number</th>
                          <th className="p-3">Application Type</th>
                          <th className="p-3">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-gray-700 font-medium">
                        {completedServices.map((s: any, idx: number) => {
                          const dateObj = new Date(s.updatedAt || s.createdAt || s.dueDate);
                          const dateStr = isNaN(dateObj.getTime()) ? "—" : formatDate(dateObj);
                          const getSubModuleLabel = (serviceType: string): string => {
                            const sub = getActiveSubModule(serviceType);
                            if (sub === "vahaan") return "VAHAAN";
                            if (sub === "licence" || sub === "license") return "LICENCE";
                            if (sub === "driving_school" || sub === "driving") return "DRIVING SCHOOL";
                            if (sub === "insurance") return "INSURANCE";
                            if (sub === "form5") return "FORM 5";
                            return sub.toUpperCase();
                          };

                          return (
                            <tr key={s.id} className="hover:bg-slate-50/50">
                              <td className="p-3 font-mono text-slate-400">{idx + 1}</td>
                              <td className="p-3 font-mono">{dateStr}</td>
                              <td className="p-3 font-bold text-sky-800">{getSubModuleLabel(s.serviceType)}</td>
                              <td className="p-3 font-semibold">{serviceLabel(s.serviceType)}</td>
                              <td className="p-3 font-mono font-bold text-slate-700">{s.vehicleNumber || s.vehicleNo || "—"}</td>
                              <td className="p-3 text-slate-600">{s.assignedStaff || s.assignedEmployeeName || "—"}</td>
                              <td className="p-3">
                                <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                                  {s.taskStatus}
                                </Badge>
                              </td>
                              <td className="p-3 font-mono font-bold text-slate-900">₹{(s.serviceAmount || 0).toLocaleString("en-IN")}</td>
                              <td className="p-3 font-mono text-emerald-700 font-bold">₹{(s.advancePayment || 0).toLocaleString("en-IN")}</td>
                              <td className="p-3 font-mono text-purple-700 font-bold">₹{(s.rtoReceiptAmount || s.receiptAmount || s.rtoReceipt || 0).toLocaleString("en-IN")}</td>
                              <td className="p-3 font-mono text-red-700 font-bold">₹{(s.rtoExpense || 0).toLocaleString("en-IN")}</td>
                              <td className="p-3 font-mono">{s.applicationId || "—"}</td>
                              <td className="p-3">{s.applicationType || "—"}</td>
                              <td className="p-3 text-slate-500 text-[11px] truncate max-w-[150px]" title={s.notes || s.remarks}>{s.notes || s.remarks || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    )}

        <DialogFooter className="border-t pt-4">
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>

      {/* Document Preview Modal */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-4">
          <DialogHeader className="pb-2 border-b">
            <DialogTitle className="truncate">{previewDoc?.name || "Document Preview"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center bg-muted/20 rounded-lg mt-2 relative">
            {previewDoc &&
              (previewDoc.type === "pdf" ? (
                <iframe
                  src={previewDoc?.url || ""}
                  className="w-full h-full border-0 rounded-lg"
                  title={previewDoc?.name || "Document"}
                />
              ) : (
                <img
                  src={previewDoc?.url || ""}
                  alt={previewDoc?.name || "Document"}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-md"
                />
              ))}
          </div>
          <DialogFooter className="pt-2 border-t mt-2 flex justify-between items-center sm:justify-between">
            <span className="text-xs text-muted-foreground">
              Type: {previewDoc?.type?.toUpperCase() || ""}
            </span>
            <Button onClick={() => setPreviewDoc(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Client Profile Modal */}
      <Dialog open={editClientOpen} onOpenChange={setEditClientOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Client Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Client Name</Label>
              <Input
                value={clientForm.name || ""}
                onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Mobile Number</Label>
              <Input
                value={clientForm.mobile || ""}
                onChange={(e) => setClientForm({ ...clientForm, mobile: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Company Name</Label>
              <Input
                value={clientForm.companyName || ""}
                onChange={(e) => setClientForm({ ...clientForm, companyName: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">C/O Address</Label>
              <Textarea
                value={clientForm.address || ""}
                onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Internal Notes</Label>
              <Textarea
                value={clientForm.notes || ""}
                onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Record Type</Label>
              <Select
                value={clientForm.type || "client"}
                onValueChange={(v: any) => setClientForm({ ...clientForm, type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditClientOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveClient}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Vehicle Modal */}
      <Dialog open={vehicleModalOpen} onOpenChange={setVehicleModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingVehicle ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Vehicle Number</Label>
              <Input
                value={vehicleForm.vehicleNumber || ""}
                onChange={(e) =>
                  setVehicleForm({ ...vehicleForm, vehicleNumber: e.target.value.toUpperCase() })
                }
                placeholder="e.g. MH12AB1234"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Vehicle Type</Label>
              <Input
                value={vehicleForm.vehicleType || ""}
                onChange={(e) => setVehicleForm({ ...vehicleForm, vehicleType: e.target.value })}
                placeholder="e.g. Commercial, Commercial Trailer, Private"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Chassis Number</Label>
              <Input
                value={vehicleForm.chassisNumber || ""}
                onChange={(e) => setVehicleForm({ ...vehicleForm, chassisNumber: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Engine Number</Label>
              <Input
                value={vehicleForm.engineNumber || ""}
                onChange={(e) => setVehicleForm({ ...vehicleForm, engineNumber: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Registration Date</Label>
              <Input
                type="date"
                value={vehicleForm.registrationDate || ""}
                onChange={(e) =>
                  setVehicleForm({ ...vehicleForm, registrationDate: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Status</Label>
              <Select
                value={vehicleForm.status || "Pending"}
                onValueChange={(v: any) => setVehicleForm({ ...vehicleForm, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="On Hold">On Hold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVehicleModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveVehicle}>Save Vehicle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Service Modal */}
      <Dialog open={serviceModalOpen} onOpenChange={setServiceModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingService ? "Edit Service" : "Add Service"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3 font-sans">
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Service Type</Label>
              <Select
                value={serviceForm.serviceType || "Insurance"}
                onValueChange={(v: any) => {
                  const wasLic = isLicenseService(serviceForm.serviceType);
                  const isLic = isLicenseService(v);
                  let appType = serviceForm.applicationType;
                  if (wasLic !== isLic) {
                    appType = isLic ? "Non-Faceless" : "Home";
                  }
                  setServiceForm({ ...serviceForm, serviceType: v, applicationType: appType });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground bg-slate-50 uppercase tracking-wider">
                    Vahaan (Vehicles)
                  </div>
                  {["Fitness", "Gujarat Permit", "National Permit", "National Permit(Gujrat Permit)", "Tax", "PUC", "RC Transfer", "HP Addition", "HP Termination"].map((st) => (
                    <SelectItem key={st} value={st} className="text-xs">
                      {serviceLabel(st as any)}
                    </SelectItem>
                  ))}

                  <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground bg-slate-50 uppercase tracking-wider mt-2">
                    Licence
                  </div>
                  {["License New", "License Renew"].map((st) => (
                    <SelectItem key={st} value={st} className="text-xs">
                      {serviceLabel(st as any)}
                    </SelectItem>
                  ))}

                  <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground bg-slate-50 uppercase tracking-wider mt-2">
                    Insurance
                  </div>
                  {["Insurance"].map((st) => (
                    <SelectItem key={st} value={st} className="text-xs">
                      {serviceLabel(st as any)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Task Template (Optional)</Label>
              <Select
                value={serviceForm.templateId || "__none"}
                onValueChange={(v: any) =>
                  setServiceForm({ ...serviceForm, templateId: v === "__none" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Task Template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None (Default Manual Task)</SelectItem>
                  {filteredTemplates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.templateName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Application Type</Label>
              <Select
                value={serviceForm.applicationType || (isLicenseService(serviceForm.serviceType) ? "Non-Faceless" : "Home")}
                onValueChange={(v: any) => setServiceForm({ ...serviceForm, applicationType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {isLicenseService(serviceForm.serviceType) ? (
                    <>
                      <SelectItem value="Non-Faceless">Non-Faceless</SelectItem>
                      <SelectItem value="Faceless">Faceless</SelectItem>
                      <SelectItem value="Out Of Bhavnagar">Out Of Bhavnagar</SelectItem>
                      <SelectItem value="Out Of Bhavnagar To Bhavnagar">Out Of Bhavnagar To Bhavnagar</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="Home">Home</SelectItem>
                      <SelectItem value="Faceless">Faceless</SelectItem>
                      <SelectItem value="CNG">CNG</SelectItem>
                      <SelectItem value="Out Of Bhavnagar">Out Of Bhavnagar</SelectItem>
                      <SelectItem value="Out Of Bhavnagar To Bhavnagar">Out Of Bhavnagar To Bhavnagar</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Application ID *</Label>
              <Input
                placeholder="Enter Application ID"
                value={serviceForm.applicationId || ""}
                onChange={(e) => setServiceForm({ ...serviceForm, applicationId: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Due Date</Label>
              <Input
                type="date"
                value={serviceForm.dueDate || ""}
                onChange={(e) => setServiceForm({ ...serviceForm, dueDate: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Appointment Date</Label>
              <Input
                type="date"
                value={serviceForm.appointmentDate ? serviceForm.appointmentDate.slice(0, 10) : ""}
                onChange={(e) => setServiceForm({ ...serviceForm, appointmentDate: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-bold uppercase">Service Amount</Label>
                <Input
                  type="number"
                  value={serviceForm.serviceAmount ?? ""}
                  onChange={(e) =>
                    setServiceForm({ ...serviceForm, serviceAmount: e.target.value === "" ? undefined : Number(e.target.value) })
                  }
                  onWheel={(e) => e.currentTarget.blur()}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold uppercase">Amount Received</Label>
                <Input
                  type="number"
                  value={serviceForm.amountReceived ?? ""}
                  onChange={(e) =>
                    setServiceForm({ ...serviceForm, amountReceived: e.target.value === "" ? undefined : Number(e.target.value) })
                  }
                  onWheel={(e) => e.currentTarget.blur()}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div />
              <div className="space-y-1">
                <Label className="text-xs font-bold uppercase">Advance Payment (₹)</Label>
                <Input
                  type="number"
                  value={serviceForm.advancePayment ?? ""}
                  onChange={(e) =>
                    setServiceForm({ ...serviceForm, advancePayment: e.target.value === "" ? undefined : Number(e.target.value) })
                  }
                  onWheel={(e) => e.currentTarget.blur()}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Assigned Staff</Label>
              <Select
                value={serviceForm.assignedStaff || "__none"}
                onValueChange={(v: any) =>
                  setServiceForm({ ...serviceForm, assignedStaff: v === "__none" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Unassigned</SelectItem>
                  {activeEmployees.map((emp) => (
                    <SelectItem key={emp.uid || emp.username} value={emp.username}>
                      {emp.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase">Service Notes</Label>
              <Textarea
                value={serviceForm.notes || ""}
                onChange={(e) => setServiceForm({ ...serviceForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setServiceModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveService}>Save Service</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Structured Document Viewer Modal */}
      {viewerDoc && (
        <Dialog
          open={!!viewerDoc}
          onOpenChange={(open) => {
            if (!open) {
              setViewerDoc(null);
              setZoom(1);
            }
          }}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col p-6">
            <DialogHeader className="flex flex-row items-center justify-between border-b pb-3 mb-4 flex-wrap gap-2">
              <div>
                <DialogTitle className="text-lg font-bold">
                  {viewerDoc?.name || "Document Viewer"}
                </DialogTitle>
              </div>
              <div className="flex items-center gap-2 pr-6">
                {!viewerDoc?.isPdf && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
                    >
                      Zoom -
                    </Button>
                    <span className="text-xs font-semibold px-2">{Math.round(zoom * 100)}%</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
                    >
                      Zoom +
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  onClick={() =>
                    handleDownloadDocument(viewerDoc?.url || "", viewerDoc?.name || "document")
                  }
                >
                  <Download className="size-4 mr-1.5" />
                  Download
                </Button>
              </div>
            </DialogHeader>
            <div className="flex-1 min-h-[50vh] flex items-center justify-center bg-muted/20 rounded-xl border p-4 overflow-auto">
              {viewerDoc?.isPdf ? (
                <iframe
                  src={`${viewerDoc?.url || ""}#toolbar=0&navpanes=0`}
                  className="w-full h-[65vh] rounded-lg border shadow-inner"
                  title={viewerDoc?.name || "Document"}
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center transition-transform duration-200"
                  style={{ transform: `scale(${zoom})` }}
                >
                  <img
                    src={viewerDoc?.url || ""}
                    alt={viewerDoc?.name || "Document"}
                    className="max-h-[60vh] object-contain rounded-lg shadow-md cursor-zoom-in"
                    onClick={() => {
                      setZoom((z) => (z === 1 ? 1.8 : 1));
                    }}
                  />
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
