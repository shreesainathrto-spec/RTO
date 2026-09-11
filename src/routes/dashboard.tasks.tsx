import { createFileRoute, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Trash2,
  Plus,
  Link2,
  Search,
  LayoutGrid,
  List,
  Pencil,
  CheckCircle2,
  Eye,
  Paperclip,
  Send,
  MessageSquare,
  Car,
  Calendar as CalIcon,
  Clock,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Users,
  Download,
  Printer,
  GripVertical,
  CheckCircle,
  X,
  Copy,
  ChevronDown,
} from "lucide-react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { collection, onSnapshot, doc, query, where, updateDoc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { getSession } from "@/lib/auth";
import { ApplicationFullDetailsModal } from "@/components/ApplicationFullDetailsModal";
import { SubModuleTabs, type SubModuleType } from "@/components/SubModuleTabs";
import {
  subscribeApplications,
  subscribeAccountingRecords,
  syncAccountingRecord,
  type AccountingRecord,
} from "@/lib/applications";
import {
  STAFF_USERS,
  staffLabel,
  subscribeToRecords,
  removeUndefined,
  type Bucket,
  type RegistryRecord,
} from "@/lib/records";
import { subscribeAllVehicles } from "@/lib/hierarchy";
import { subscribeToAllClients } from "@/lib/allClients";
import {
  subscribeToTasks,
  createManualTask,
  setTaskDone,
  softDeleteTask,
  updateTask,
  addComment,
  addAttachment,
  toggleSubtask,
  addSubtask,
  reassignTask,
  markTaskAsRead,
  removeTask,
  updateSubtasks,
  isTaskAssignedToUser,
  taskMatchesClient,
  duplicateTask,
  PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  subscribeToTemplates,
  DEFAULT_TEMPLATES_SPEC,
  type Task,
  type TaskStatus,
  type TaskPriority,
  type AssociationType,
  type TaskAttachment,
  type TaskTemplate,
  type TaskSubtask,
} from "@/lib/tasks";
import { generateTaskPDF, printWindow } from "@/lib/pdfGenerator";
import { cn, compareAppointmentDatesDescending, parseAppointmentDateToTime } from "@/lib/utils";
import { DeleteTaskDialog } from "@/components/DeleteTaskDialog";
import { toast } from "sonner";
import { ApplicationTypeBadge } from "@/components/ApplicationTypeBadge";
import { formatPaymentStatus, formatDateDDMMYYYY } from "@/lib/formatting";

const getLicenseMaxSteps = (lic: any) => {
  if (!lic) return 1;
  if (lic.newLearningLicence?.enabled) return 2;
  if (lic.dlNewLlEndorsement?.enabled) return 3;
  if (lic.llRenewClass?.enabled) return 3;
  if (lic.dlRenewRetest?.enabled) return 3;
  return 1;
};

const ensureYYYYMMDD = (val: any): string => {
  if (!val) return "";
  if (typeof val === "string") {
    const cleaned = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
      return cleaned;
    }
    const matchDMY = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (matchDMY) {
      const day = matchDMY[1].padStart(2, "0");
      const month = matchDMY[2].padStart(2, "0");
      const year = matchDMY[3];
      return `${year}-${month}-${day}`;
    }
    const matchYMD = cleaned.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (matchYMD) {
      const year = matchYMD[1];
      const month = matchYMD[2].padStart(2, "0");
      const day = matchYMD[3].padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  }
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
  } catch (e) {}
  return "";
};

const filterSubtasksByStep = (subtasks: any[], step: number) => {
  if (!subtasks) return [];
  const hasStepLabel = subtasks.some(s => s.title.toLowerCase().includes("step ") || s.title.toLowerCase().includes("ll") || s.title.toLowerCase().includes("dl"));
  if (!hasStepLabel) return subtasks;

  return subtasks.filter(s => {
    const title = s.title.toLowerCase();
    if (step === 1) {
      if (title.includes("step 2") || title.includes("step 2:") || title.includes("step 2 ") || title.includes("step2")) return false;
      if (title.includes("step 3") || title.includes("step 3:") || title.includes("step 3 ") || title.includes("step3")) return false;
      if (title.includes("dl") && !title.includes("ll") && !title.includes("learning")) return false;
      return true;
    } else if (step === 2) {
      if (title.includes("step 1") || title.includes("step 1:") || title.includes("step 1 ") || title.includes("step1")) return false;
      if (title.includes("step 3") || title.includes("step 3:") || title.includes("step 3 ") || title.includes("step3")) return false;
      if (title.includes("ll") && !title.includes("dl")) return false;
      return true;
    } else if (step === 3) {
      if (title.includes("step 1") || title.includes("step 1:") || title.includes("step 1 ") || title.includes("step1")) return false;
      if (title.includes("step 2") || title.includes("step 2:") || title.includes("step 2 ") || title.includes("step2")) return false;
      return true;
    }
    return true;
  });
};

export const Route = createFileRoute("/dashboard/tasks")({ component: TasksPage });

type SortMode = "latest" | "oldest" | "priority" | "due";

const PRIORITY_RANK: Record<TaskPriority, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

// Predefined templates are now loaded from Firestore database collection

const priorityBadgeClass = (p: TaskPriority) =>
  ({
    Urgent: "bg-red-50 text-red-700 border-red-200/80 rounded-full",
    High: "bg-amber-50 text-amber-700 border-amber-200/80 rounded-full",
    Medium: "bg-blue-50 text-blue-700 border-blue-200/80 rounded-full",
    Low: "bg-slate-100 text-slate-600 border-slate-200/80 rounded-full",
  })[p];

const statusBadgeClass = (s: string) => {
  const norm = (s || "").toUpperCase();
  if (norm === "IN RTO" || norm === "RTO") return "bg-orange-50 text-orange-700 border-orange-200/80 rounded-full font-semibold";
  if (norm === "INWARD") return "bg-blue-50 text-blue-700 border-blue-200/80 rounded-full font-semibold";
  if (norm === "VERIFY") return "bg-purple-50 text-purple-700 border-purple-200/80 rounded-full font-semibold";
  if (norm === "APPROVED") return "bg-indigo-50 text-indigo-700 border-indigo-200/80 rounded-full font-semibold";
  if (norm === "PASS") return "bg-emerald-50 text-emerald-700 border-emerald-200/80 rounded-full font-semibold";
  if (norm === "FAIL") return "bg-rose-50 text-rose-700 border-rose-200/80 rounded-full font-semibold";
  if (norm === "RETEST") return "bg-amber-50 text-amber-700 border-amber-200/80 rounded-full font-semibold";
  if (norm === "ON HOLD") return "bg-amber-50 text-amber-700 border-amber-200/80 rounded-full font-semibold";
  if (norm === "COMPLETED") return "bg-emerald-50 text-emerald-700 border-emerald-200/80 rounded-full font-semibold";
  return "bg-slate-100 text-slate-600 border-slate-200/80 rounded-full font-semibold";
};

const getLatestTaskComment = (t: any) => {
  if (t.status === "ON HOLD" || t.status === "On Hold" || (t.status || "").toUpperCase() === "ON HOLD") {
    return t.holdReason || t.remarks || t.holdRemarks || "—";
  }
  if (t.comments && t.comments.length > 0) {
    const sorted = [...t.comments].sort((a: any, b: any) => {
      const dateA = new Date(a.at || a.createdAt);
      const dateB = new Date(b.at || b.createdAt);
      const timeA = isNaN(dateA.getTime()) ? 0 : dateA.getTime();
      const timeB = isNaN(dateB.getTime()) ? 0 : dateB.getTime();
      return timeB - timeA;
    });
    return sorted[0]?.text || t.remarks || "—";
  }
  return t.lastRemark || t.remarks || "—";
};

const getStatusOptions = (subModule?: string) => {
  if (subModule === "services") {
    return ["READ", "IN PROGRESS", "ON HOLD", "COMPLETED"];
  }
  return ["Read", "In Progress", "On Hold", "Completed"];
};

const getApplicationTypeStyle = (appType?: string) => {
  if (!appType) return {};
  const t = appType.trim().toLowerCase();
  let color = "";
  if (t === "home" || t === "non - faceless" || t === "non-faceless") color = "#1e293b";
  else if (t === "faceless") color = "#1e40af";
  else if (t === "out of bhavnagar") color = "#991b1b";
  else if (t === "cng") color = "#065f46";
  else if (t === "out of bhavnagar to bhavnagar" || t === "out of bhavanagr to bhavnagar") color = "#9a3412";

  if (color) {
    return {
      borderBottom: `3px solid ${color}`,
      borderLeft: `4px solid ${color}`,
    };
  }
  return {};
};

function formatDate(iso?: string) {
  return formatDateDDMMYYYY(iso);
}

function isOverdue(t: Task) {
  return !!t.dueDate && !t.done && new Date(t.dueDate).getTime() < Date.now();
}

function getStatusCounts(tasks: Task[]): Record<TaskStatus, number> {
  const counts: Record<TaskStatus, number> = {
    Assigned: 0,
    Read: 0,
    "In Progress": 0,
    Completed: 0,
    "On Hold": 0,
    READ: 0,
    "IN PROGRESS": 0,
    "ON HOLD": 0,
    COMPLETED: 0,
  };
  for (const task of tasks) {
    if (counts[task.status] !== undefined) {
      counts[task.status]++;
    }
  }
  return counts;
}

function ServiceMultiSelectFilter({
  availableServices,
  selectedServices,
  onChange,
}: {
  availableServices: Array<{ name: string; count: number }>;
  selectedServices: string[];
  onChange: (selected: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside, true);
    return () => document.removeEventListener("click", handleClickOutside, true);
  }, []);

  const filtered = availableServices.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleOption = (serviceName: string) => {
    if (selectedServices.includes(serviceName)) {
      onChange(selectedServices.filter((s) => s !== serviceName));
    } else {
      onChange([...selectedServices, serviceName]);
    }
  };

  const handleSelectAll = () => {
    onChange(availableServices.map((s) => s.name));
  };

  const handleClearAll = () => {
    onChange([]);
  };

  return (
    <div className="relative inline-block text-left w-full" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 text-xs font-medium border rounded-md bg-white hover:bg-slate-50 transition-all h-9",
          selectedServices.length > 0
            ? "border-blue-500 text-blue-900 bg-blue-50/60 font-semibold shadow-sm"
            : "border-input text-muted-foreground"
        )}
      >
        <span className="truncate">
          {selectedServices.length === 0
            ? "All Services"
            : `${selectedServices.length} Service${selectedServices.length > 1 ? "s" : ""} Selected`}
        </span>
        <ChevronDown className="w-3.5 h-3.5 opacity-60 ml-1 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2.5 space-y-2 text-xs animate-in fade-in duration-100">
          <div className="flex items-center justify-between px-1 pb-1 border-b border-slate-100">
            <span className="font-bold text-slate-900 text-xs">Filter Services</span>
            <div className="flex items-center gap-2 text-[10px]">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-blue-600 font-bold hover:underline"
              >
                Select All
              </button>
              <span className="text-slate-300">•</span>
              <button
                type="button"
                onClick={handleClearAll}
                className="text-rose-600 font-bold hover:underline"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search service..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
            {filtered.length === 0 ? (
              <div className="p-2 text-center text-slate-400 italic text-[11px]">No services found</div>
            ) : (
              filtered.map((srv) => {
                const isChecked = selectedServices.includes(srv.name);
                return (
                  <label
                    key={srv.name}
                    className={cn(
                      "flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-colors text-xs select-none",
                      isChecked ? "bg-blue-50 text-blue-900 font-semibold" : "hover:bg-slate-100 text-slate-700"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOption(srv.name)}
                        className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className="truncate">{srv.name}</span>
                    </div>
                    {srv.count > 0 && (
                      <span className="text-[10px] bg-slate-200/80 text-slate-600 px-1.5 py-0.2 rounded-full font-mono">
                        {srv.count}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>

          {selectedServices.length > 0 && (
            <div className="pt-1.5 border-t border-slate-100 flex justify-between items-center text-[11px]">
              <span className="text-slate-500 font-medium">{selectedServices.length} selected</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-2.5 py-1 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-sm"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TasksPage() {
  const [session] = useState(() => getSession());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<RegistryRecord[]>([]);
  const [leads, setLeads] = useState<RegistryRecord[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [v2Services, setV2Services] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [accountingMap, setAccountingMap] = useState<Map<string, AccountingRecord>>(new Map());

  const isAdmin = session?.role === "admin" || session?.role === "manager";
  const canSeeAllTasks = true;

  // view and filters
  const [viewTab, setViewTab] = useState<"my" | "all">(() => {
    const sess = getSession();
    const isAd = sess?.role === "admin" || sess?.role === "manager";
    return isAd ? "all" : "my";
  });
  const location = useLocation();
  const [activeSubModule, setActiveSubModule] = useState<SubModuleType>("services");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sub = params.get("subModule");
    if (sub && (sub === "services" || sub === "licence" || sub === "driving_school" || sub === "insurance" || sub === "form5")) {
      setActiveSubModule(sub as SubModuleType);
    }
  }, [location.search]);

  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [associationFilter, setAssociationFilter] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<string>("all");
  const [appTypeFilter, setAppTypeFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [allAppsForGroups, setAllAppsForGroups] = useState<any[]>([]);
  const [selectedServiceFilters, setSelectedServiceFilters] = useState<string[]>([]);
  const [sort, setSort] = useState<SortMode>("latest");

  // dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  // Add Remark Quick Dialog State
  const [remarkTaskId, setRemarkTaskId] = useState<string | null>(null);
  const [quickRemarkText, setQuickRemarkText] = useState("");
  const [savingRemark, setSavingRemark] = useState(false);

  useEffect(() => {
    const u1 = subscribeToTasks(activeSubModule, setTasks);
    const u2 = subscribeToAllClients((items) => {
      const parsedClients = items.filter((c) => c.type === "client").map((c) => ({
        ...c,
        mo: c.mobile || "",
        status: "In Progress",
        mvNo: c.vehicles?.join(", ") || "",
        work: c.allServices?.map((s) => s.work || s.application).join(", ") || "",
      }));
      const parsedLeads = items.filter((c) => c.type === "lead").map((c) => ({
        ...c,
        mo: c.mobile || "",
        status: "In Progress",
        mvNo: c.vehicles?.join(", ") || "",
        work: c.allServices?.map((s) => s.work || s.application).join(", ") || "",
      }));
      setClients(parsedClients as any);
      setLeads(parsedLeads as any);
    });
    const u4 = onSnapshot(collection(db, "registry_vehicles_v2"), (snap) => {
      setVehicles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const u5 = onSnapshot(collection(db, "users"), (snap) => {
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const u6 = onSnapshot(query(collection(db, "registry_services_v2"), where("subModule", "==", activeSubModule)), (snap) => {
      const services = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setV2Services(services);
    });
    const u7 = onSnapshot(query(collection(db, "registry_applications_v1"), where("subModule", "==", activeSubModule)), (snap) => {
      const apps = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setApplications(apps);
    });
    const u8 = subscribeAccountingRecords(setAccountingMap);
    const u9 = onSnapshot(collection(db, "registry_applications_v1"), (snap) => {
      setAllAppsForGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      u1();
      u2();
      u4();
      u5();
      u6();
      u7();
      u8();
      u9();
    };
  }, [activeSubModule]);

  const availableGroups = useMemo(() => {
    const groupsSet = new Set<string>();
    allAppsForGroups.forEach((app) => {
      const g = app.groupName || app.vehicleDetails?.groupName || (app as any).vehicleDetails?.groupName || "";
      if (g.trim()) {
        groupsSet.add(g.trim());
      }
    });
    return Array.from(groupsSet).sort((a, b) => a.localeCompare(b));
  }, [allAppsForGroups]);

  const allTasks = useMemo(() => {
    // Helper to get linked application
    const getLinkedApp = (t: any) => {
      const tDocId = t.applicationDocId || t.parentApplicationId || "";
      return applications.find((a: any) => {
        return (
          (tDocId && a.id === tDocId) ||
          (t.id && t.id.replace("task-app-", "") === a.id) ||
          a.taskId === t.id
        );
      });
    };

    // 1. Get manual tasks enriched with service info & application subModule
    const manualTasksMapped = tasks.map((t) => {
      const linkedApp = getLinkedApp(t);
      
      // If task is linked to an application but the application has been deleted, exclude it
      const isLinkedToApp = !!(t.applicationId || (t as any).applicationDocId || (t as any).parentApplicationId || t.id.startsWith("task-app-"));
      if (isLinkedToApp && !linkedApp) {
        return null;
      }

      const resolvedSubModule =
        (t as any).subModule ||
        linkedApp?.subModule ||
        (linkedApp?.licenseDetails ? "licence" : linkedApp ? "services" : "services"); // Default to services if not specified

      return {
        ...t,
        subModule: resolvedSubModule,
        licenseDetails: (t as any).licenseDetails || linkedApp?.licenseDetails,
        applicationId: t.applicationId || linkedApp?.applicationId || "",
        applicationType: t.applicationType || linkedApp?.applicationType || "",
        appointmentDate: t.appointmentDate || linkedApp?.appointmentDate || "",
        amount: linkedApp?.amount ?? (t as any).amount ?? 0,
        totalPaid: linkedApp?.totalPaid ?? (t as any).totalPaid ?? 0,
        pendingAmount: linkedApp ? (typeof linkedApp.pendingAmount === "number" ? linkedApp.pendingAmount : Math.max(0, (linkedApp.amount || 0) - (linkedApp.totalPaid || 0))) : (t as any).pendingAmount ?? 0,
        paymentStatus: linkedApp?.paymentStatus || (t as any).paymentStatus || "Pending",
        clientName: linkedApp?.ownerName || (t as any).clientName || (t as any).ownerName || "",
        mobileNumber: linkedApp?.mobileNumber || (t as any).mobileNumber || (t as any).phone || "",
        reference: linkedApp?.reference || linkedApp?.applicationId || (t as any).reference || t.id,
        groupName: linkedApp?.groupName || linkedApp?.vehicleDetails?.groupName || (linkedApp as any)?.vehicleDetails?.groupName || (t as any).groupName || "",
      };
    }).filter(Boolean) as Task[];

    // 2. Generate task objects dynamically from registry_services_v2 joined with vehicles and clients/leads
    const serviceTasks: Task[] = v2Services.map((s: any) => {
      if (s.id?.startsWith("task-app-")) {
        return null;
      }
      if (!s.title && !s.serviceType && !s.serviceName) {
        return null;
      }

      const linkedApp = getLinkedApp(s);
      const isLinkedToApp = !!(s.applicationId || s.id?.startsWith("task-app-") || s.recordId?.startsWith("task-app-") || s.applicationDocId?.startsWith("task-app-"));
      if (isLinkedToApp && !linkedApp) {
        return null;
      }

      const vehicle = s.vehicleId ? vehicles.find((v) => v.id === s.vehicleId) : null;
      const vehicleNo = vehicle?.vehicleNumber || "";
      const clientId = s.clientId || vehicle?.clientId || "";
      const client = clients.find((c) => c.id === clientId) || leads.find((l) => l.id === clientId);

      const resolvedSubModule =
        s.subModule ||
        linkedApp?.subModule ||
        (linkedApp?.licenseDetails ? "licence" : linkedApp ? "services" : "services");

      const clientName = linkedApp?.ownerName || client?.name || s.clientName || "Unknown Client";
      const mobNo = linkedApp?.mobileNumber || s.mobileNumber || s.phone || client?.mo || "";
      const isLicense = s.serviceType === "License New" || s.serviceType === "License Renew" || resolvedSubModule === "licence";
      const taskTitle = s.title || (isLicense ? `${s.serviceType || "License Service"} - ${clientName}` : `${s.serviceType || "Service"} - ${vehicleNo || "—"}`);
      const taskDesc = s.description || (isLicense ? `Client: ${clientName}. Status: ${s.taskStatus || s.status || "Pending"}. Notes: ${s.notes || s.remarks || "—"}` : `Vehicle: ${vehicleNo || "—"}. Status: ${s.taskStatus || s.status || "Pending"}. Remarks: ${s.remarks || "—"}`);

      const rawStatus = (s.taskStatus || s.status || "").toUpperCase();
      const isRecordCompleted = ["COMPLETED", "RTO", "IN RTO", "PASS", "FAIL", "RETEST", "APPROVED", "INWARD"].includes(rawStatus) || s.done === true;
      if (isRecordCompleted) {
        return null;
      }

      return {
        id: s.id,
        title: taskTitle,
        serviceName: s.serviceType || "",
        description: taskDesc,
        assignee: s.assignedTo || s.employeeId || s.assignee || "",
        assignedEmployeeId: s.employeeId || s.assignedTo || s.assignedStaff || s.assignee || "",
        assignedEmployeeName: s.assignedEmployeeName || s.assignedStaff || s.assignee || "",
        status: (() => {
          const raw = s.taskStatus || s.status || "Read";
          return (raw === "Assigned" ? "Read" : raw) as TaskStatus;
        })(),
        priority: (s.priority || "Medium") as TaskPriority,
        done: s.taskStatus === "Completed" || s.done === true,
        createdAt: s.createdAt || s.startDate || new Date().toISOString(),
        createdBy: s.createdBy || "System",
        dueDate: s.dueDate || s.startDate || "",
        associationType: (client?.isDeleted ? "lead" : "client") as AssociationType,
        bucket: client?.isDeleted ? "leads" : "clients",
        recordId: clientId,
        clientId: clientId,
        clientName: clientName,
        mobileNumber: mobNo,
        phone: mobNo,
        manual: false,
        progress: s.taskStatus === "Completed" ? 100 : s.taskStatus === "In Progress" ? 50 : 0,
        reminderMinutes: s.reminderMinutes || 0,
        remarks: s.remarks || "",
        applicationId: s.applicationId || linkedApp?.applicationId || "",
        applicationType: s.applicationType || linkedApp?.applicationType || "",
        appointmentDate: s.appointmentDate || s.dueDate || "",
        subModule: resolvedSubModule,
        licenseDetails: linkedApp?.licenseDetails,
        amount: linkedApp?.amount ?? s.serviceAmount ?? 0,
        totalPaid: linkedApp?.totalPaid ?? s.amountReceived ?? 0,
        pendingAmount: linkedApp ? (typeof linkedApp.pendingAmount === "number" ? linkedApp.pendingAmount : Math.max(0, (linkedApp.amount || 0) - (linkedApp.totalPaid || 0))) : s.pendingAmount ?? 0,
        paymentStatus: linkedApp?.paymentStatus || "Pending",
        reference: linkedApp?.reference || linkedApp?.applicationId || s.reference || s.id,
        subtasks: s.subtasks || [],
        groupName: linkedApp?.groupName || linkedApp?.vehicleDetails?.groupName || (linkedApp as any)?.vehicleDetails?.groupName || s.groupName || "",
      };
    }).filter(Boolean) as Task[];

    // 3. Generate task objects dynamically from registry_applications_v1 (1 application per row)
    const appTasks: Task[] = [];
    applications.forEach((app: any) => {
      const srvList: string[] = app.services || [];
      const servicesCombined = srvList.length > 0 ? srvList.join(", ") : "General Service";
      const appNum = app.applicationId || app.id || "";
      const vehNo = app.vehicleNumber || "";
      const clientName = app.ownerName || "Unknown Client";
      const mobNo = app.mobileNumber || "";
      const assignedEmp = app.assignedEmployeeName || "Unassigned";

      const taskId = `task-app-${app.id}`;
      const appCurrentStep = app.licenseDetails?.currentStep || app.currentStep || 1;
      const appStepAppts = app.licenseDetails?.stepAppointments || app.stepAppointments || {};
      const appStepHist = app.licenseDetails?.stepHistory || app.stepHistory || {};
      const appApptDate = appStepAppts[appCurrentStep] || app.appointmentDate || "";

      const rawAppStatus = (app.applicationStatus || app.status || "").toUpperCase();
      const isAppDone = rawAppStatus === "COMPLETED" || rawAppStatus === "COMPLETE" || rawAppStatus === "APPROVED";
      const isAppHold = rawAppStatus === "ON HOLD" || rawAppStatus === "ONHOLD";
      const appStatus = isAppDone ? "Completed" : (isAppHold ? "On Hold" : "Read");

      appTasks.push({
        id: taskId,
        taskId,
        title: `${servicesCombined} - ${vehNo || appNum}`,
        serviceName: servicesCombined,
        serviceType: servicesCombined,
        description: `Application for ${servicesCombined} on vehicle ${vehNo}`,
        assignee: assignedEmp,
        assignedEmployeeId: assignedEmp,
        assignedEmployeeName: assignedEmp,
        assignedEmployeeUid: assignedEmp,
        status: appStatus as TaskStatus,
        priority: (app.priority || "Medium") as TaskPriority,
        done: isAppDone,
        createdAt: app.createdAt || new Date().toISOString(),
        createdBy: app.createdBy || "System",
        dueDate: app.expiryDate || "",
        associationType: "client",
        bucket: "clients",
        recordId: app.id,
        clientId: app.id,
        clientName: clientName,
        manual: false,
        progress: isAppDone ? 100 : 0,
        reminderMinutes: 0,
        remarks: app.remarks || "",
        applicationId: appNum,
        applicationType: app.subModule === "licence" ? "Licence" : app.applicationType || "Home",
        subModule: app.subModule || (app.licenseDetails ? "licence" : "services"),
        licenseDetails: app.licenseDetails,
        currentStep: appCurrentStep,
        stepAppointments: appStepAppts,
        stepHistory: appStepHist,
        amount: app.amount || 0,
        totalPaid: app.totalPaid || 0,
        pendingAmount: typeof app.pendingAmount === "number" ? app.pendingAmount : Math.max(0, (app.amount || 0) - (app.totalPaid || 0)),
        paymentStatus: app.paymentStatus || (app.totalPaid >= app.amount && app.amount > 0 ? "Paid" : app.totalPaid > 0 ? "Partial" : "Pending"),
        appointmentDate: appApptDate,
        vehicleNumber: vehNo,
        mobileNumber: mobNo,
        phone: mobNo,
        reference: app.reference || appNum || (vehNo ? `${appNum} - ${vehNo}` : appNum),
        issueDate: app.createdAt || "",
        subtasks: [],
        groupName: app.groupName || app.vehicleDetails?.groupName || (app as any).vehicleDetails?.groupName || "",
      } as any);
    });

    // Map strictly by unique immutable applicationDocId or Task ID to prevent duplicates
    const map = new Map<string, Task>();

    const getMergeKey = (item: any): string => {
      const linkedApp = getLinkedApp(item);
      if (linkedApp) {
        return `app-doc-${linkedApp.id}`;
      }
      const appDocId = item.applicationDocId || item.parentApplicationId || "";
      if (appDocId) {
        return `app-doc-${appDocId}`;
      }
      if (item.id && typeof item.id === "string" && item.id.startsWith("task-app-")) {
        return `app-doc-${item.id.replace("task-app-", "")}`;
      }
      return `task-${item.id}`;
    };

    // 1. First add application-generated tasks
    appTasks.forEach((appTask: any) => {
      const key = getMergeKey(appTask);
      map.set(key, appTask);
    });

    // 2. Add manual tasks & service tasks, merging into existing application task if Application Doc ID matches
    [...manualTasksMapped.filter(Boolean), ...serviceTasks.filter(Boolean)].forEach((item: any) => {
      const key = getMergeKey(item);

      if (map.has(key)) {
        const existing = map.get(key)!;
        const mergedCurrentStep = item.currentStep || (existing as any).currentStep || 1;
        const mergedStepAppts = { ...((existing as any).stepAppointments || {}), ...(item.stepAppointments || {}) };
        const mergedStepHist = { ...((existing as any).stepHistory || {}), ...(item.stepHistory || {}) };
        const mergedApptDate = mergedStepAppts[mergedCurrentStep] || item.appointmentDate || existing.appointmentDate || "";

        const merged = {
          ...existing,
          ...item,
          status: item.status !== undefined ? item.status : existing.status,
          done: item.done !== undefined ? item.done : existing.done,
          assignee: item.assignee || existing.assignee,
          assignedEmployeeName: item.assignedEmployeeName || existing.assignedEmployeeName,
          remarks: item.remarks || existing.remarks,
          currentStep: mergedCurrentStep,
          stepAppointments: mergedStepAppts,
          stepHistory: mergedStepHist,
          appointmentDate: mergedApptDate,
          applicationId: item.applicationId || existing.applicationId,
          applicationType: item.applicationType || existing.applicationType,
          vehicleNumber: existing.vehicleNumber || item.vehicleNumber,
          clientName: existing.clientName || item.clientName,
          subModule: item.subModule || existing.subModule || "services",
        };
        map.set(key, merged);
      } else {
        map.set(key, item);
      }
    });

    return Array.from(map.values()).filter((t: any) => {
      const s = (t.status || "").trim().toUpperCase();
      const isCompleted = s === "COMPLETED" || s === "COMPLETE" || s === "PASS" || s === "FAIL" || s === "RETEST" || t.done === true;
      return !isCompleted;
    });
  }, [tasks, v2Services, vehicles, clients, leads, applications]);

  const detailsTask = allTasks.find((t) => t.id === detailsId) ?? null;

  // Separate task lists for tab counting
  const myTasks = useMemo(() => {
    if (!session) return [];
    return allTasks.filter((t) => isTaskAssignedToUser(t, session));
  }, [allTasks, session]);

  // Apply filters based on view tab
  const baseList = useMemo(() => {
    if (viewTab === "my") return myTasks;
    if (viewTab === "all" && canSeeAllTasks) return allTasks;
    return [];
  }, [viewTab, myTasks, allTasks, canSeeAllTasks]);

  const availableServicesList = useMemo(() => {
    const counts: Record<string, number> = {};
    const base = viewTab === "my" ? myTasks : allTasks;
    base.forEach((t) => {
      const raw = t.serviceName || t.title || "";
      const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
      parts.forEach((p) => {
        counts[p] = (counts[p] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [viewTab, myTasks, allTasks]);

  // Apply all filters to base list
  const visible = useMemo(() => {
    if (!session) return [];
    let list = baseList;

    if (activeSubModule === "driving_school") return [];

    list = list.filter((t) => {
      const tSub = (t as any).subModule || "services";
      return tSub === activeSubModule;
    });

    console.log("🐛 [DEBUG TASKS] --- Filtering Start ---");
    console.log("🐛 Current User Session:", session);
    console.log("🐛 Current Employee ID (uid):", session.uid, " | employeeId:", session.employeeId);
    console.log("🐛 Current Employee Name:", session.name);
    console.log("🐛 Base List Count:", baseList.length);
    console.log("🐛 All Tasks Count (total in Firestore/state):", tasks.length);
    baseList.forEach((t) => {
      console.log(`  - Task: "${t.title}" | Assignee: "${t.assignee}" | Assigned ID: "${t.assignedEmployeeId}" | Assigned Name: "${t.assignedEmployeeName}"`);
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) => {
        const info = getTaskInfoHelper(t, clients, leads, vehicles);
        const titleMatch = t.title.toLowerCase().includes(q);
        const descMatch = (t.description ?? "").toLowerCase().includes(q);
        const empMatch = (t.assignedEmployeeName || t.assignee || "").toLowerCase().includes(q);
        const vehicleMatch = (info.vehicleNum || t.vehicleId || "").toLowerCase().includes(q);
        const appNoMatch = (t.applicationId || "").toLowerCase().includes(q);
        const clientMatch = (info.clientName || t.clientName || "").toLowerCase().includes(q);
        const phoneMatch = (info.clientPhone || "").toLowerCase().includes(q);
        const refMatch = (t.reference || t.title || "").toLowerCase().includes(q);

        return (
          titleMatch ||
          descMatch ||
          empMatch ||
          vehicleMatch ||
          appNoMatch ||
          clientMatch ||
          phoneMatch ||
          refMatch
        );
      });
    }
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (priorityFilter !== "all") list = list.filter((t) => t.priority === priorityFilter);
    if (assigneeFilter !== "all") {
      list = list.filter(
        (t) =>
          t.assignee === assigneeFilter ||
          t.assignedEmployeeId === assigneeFilter ||
          t.assignedEmployeeName === assigneeFilter
      );
    }
    if (associationFilter !== "all")
      list = list.filter((t) => t.associationType === associationFilter);

    if (appTypeFilter !== "all") {
      list = list.filter(
        (t) => (t.applicationType || "").toLowerCase() === appTypeFilter.toLowerCase()
      );
    }

    if (groupFilter !== "all") {
      list = list.filter((t) => (t as any).groupName === groupFilter);
    }

    if (selectedServiceFilters.length > 0) {
      list = list.filter((t) => {
        const fullText = (
          (t.serviceName || "") +
          " " +
          (t.title || "") +
          " " +
          (t.description || "")
        ).toLowerCase();
        return selectedServiceFilters.some((srv) => fullText.includes(srv.toLowerCase()));
      });
    }

    if (dueFilter !== "all") {
      const now = Date.now();
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      const weekEnd = endOfToday.getTime() + 6 * 86400_000;
      list = list.filter((t) => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate).getTime();
        if (dueFilter === "overdue") return d < now && !t.done;
        if (dueFilter === "today") return d <= endOfToday.getTime() && d >= now - 86400_000;
        if (dueFilter === "week") return d <= weekEnd;
        return true;
      });
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "priority") {
        const pDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        if (pDiff !== 0) return pDiff;
        return compareAppointmentDatesDescending(a, b);
      }
      if (sort === "due") {
        const da = a.dueDate ? +new Date(a.dueDate) : Infinity;
        const db = b.dueDate ? +new Date(b.dueDate) : Infinity;
        if (da !== db) return da - db;
        return compareAppointmentDatesDescending(a, b);
      }
      if (sort === "oldest") {
        const timeA = parseAppointmentDateToTime(a.appointmentDate);
        const timeB = parseAppointmentDateToTime(b.appointmentDate);
        if (timeA !== timeB) {
          if (timeA === -Infinity) return 1;
          if (timeB === -Infinity) return -1;
          return timeA - timeB;
        }
        return +new Date(a.createdAt || 0) - +new Date(b.createdAt || 0);
      }
      // "latest" / default order: Latest Appointment Date -> Oldest Appointment Date
      return compareAppointmentDatesDescending(a, b);
    });
    console.log("🐛 [DEBUG TASKS] Filtered List Count:", sorted.length);
    console.log("🐛 [DEBUG TASKS] --- Filtering End ---");
    return sorted;
  }, [
    baseList,
    session,
    searchQuery,
    statusFilter,
    priorityFilter,
    assigneeFilter,
    associationFilter,
    dueFilter,
    appTypeFilter,
    selectedServiceFilters,
    sort,
    activeSubModule,
    groupFilter,
  ]);

  const stats = useMemo(
    () => {
      const tabTasks = viewTab === "my" ? myTasks : allTasks;
      return {
        my: myTasks.length,
        all: allTasks.length,
        visible: visible.length,
        pending: tabTasks.filter((t) => !t.done).length,
        overdue: tabTasks.filter(isOverdue).length,
        completed: tabTasks.filter((t) => t.done).length,
        statusCounts: getStatusCounts(tabTasks),
      };
    },
    [visible, myTasks, allTasks, viewTab],
  );

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (t: Task) => {
    setEditing(t);
    setFormOpen(true);
  };

  const handleQuickAddRemark = async () => {
    if (!remarkTaskId || !quickRemarkText.trim()) return;
    setSavingRemark(true);
    try {
      await addComment(remarkTaskId, session?.username || "system", quickRemarkText.trim());
      toast.success("Remark added!");
      setQuickRemarkText("");
      setRemarkTaskId(null);
    } catch (err: any) {
      toast.error("Failed to add remark");
    } finally {
      setSavingRemark(false);
    }
  };

  const handleDuplicateTask = async (task: Task) => {
    try {
      await duplicateTask(task.id, session?.username || "system");
      toast.success("Task duplicated successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to duplicate task");
    }
  };

  // Vahaan specific Hold/Complete popup states
  const [showVahaanHoldModal, setShowVahaanHoldModal] = useState(false);
  const [vahaanHoldTask, setVahaanHoldTask] = useState<Task | null>(null);
  const [vahaanHoldReason, setVahaanHoldReason] = useState("");
  const [vahaanHoldDate, setVahaanHoldDate] = useState("");

  const [showVahaanCompleteModal, setShowVahaanCompleteModal] = useState(false);
  const [vahaanCompleteTask, setVahaanCompleteTask] = useState<Task | null>(null);
  const [vahaanRtoReceiptNo, setVahaanRtoReceiptNo] = useState("");
  const [vahaanEChallanAmount, setVahaanEChallanAmount] = useState("");
  const [vahaanChallanQty, setVahaanChallanQty] = useState("");
  const [vahaanChallanAmount, setVahaanChallanAmount] = useState("");
  const [vahaanAppointmentDate, setVahaanAppointmentDate] = useState("");

  const handleSaveVahaanHold = async () => {
    if (!vahaanHoldTask) return;
    if (!vahaanHoldReason.trim()) {
      toast.error("Reason is required");
      return;
    }
    if (!vahaanHoldDate) {
      toast.error("Date is required");
      return;
    }
    try {
      await updateTask(
        vahaanHoldTask.id,
        {
          status: "ON HOLD" as TaskStatus,
          done: false,
          holdReason: vahaanHoldReason.trim(),
          holdDate: vahaanHoldDate,
        },
        session?.username || "system",
        `Status → ON HOLD`
      );
      toast.success("Task updated to ON HOLD");
      setShowVahaanHoldModal(false);
      setVahaanHoldTask(null);
      setVahaanHoldReason("");
      setVahaanHoldDate("");
    } catch (err: any) {
      toast.error("Failed to set task on hold");
    }
  };

  const handleSaveVahaanComplete = async () => {
    if (!vahaanCompleteTask) return;
    if (!vahaanRtoReceiptNo.trim()) {
      toast.error("RTO Receipt Amount is required");
      return;
    }
    if (!vahaanAppointmentDate) {
      toast.error("Appointment Date is required");
      return;
    }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(vahaanAppointmentDate)) {
      toast.error("Appointment Date must be in DD/MM/YYYY format");
      return;
    }

    try {
      let appDocId = (vahaanCompleteTask as any).applicationDocId || (vahaanCompleteTask as any).parentApplicationId || vahaanCompleteTask.recordId || vahaanCompleteTask.id.replace("task-app-", "");
      const rtoReceiptAmountVal = parseFloat(vahaanRtoReceiptNo.trim()) || 0;
      const eChallanAmountVal = parseFloat(vahaanEChallanAmount.trim()) || 0;
      const challanQtyVal = parseInt(vahaanChallanQty.trim()) || 0;
      const challanAmountVal = parseFloat(vahaanChallanAmount.trim()) || 0;

      let appData: any = {};
      if (appDocId) {
        const appSnap = await getDoc(doc(db, "registry_applications_v1", appDocId));
        if (appSnap.exists()) {
          appData = appSnap.data();
        }
      }

      // If not found by doc id, attempt lookup by applicationId or vehicleNumber
      if (!appData.id && vahaanCompleteTask.applicationId) {
        const qApp = query(collection(db, "registry_applications_v1"), where("applicationId", "==", vahaanCompleteTask.applicationId.trim()));
        const snapApp = await getDocs(qApp);
        if (!snapApp.empty) {
          appDocId = snapApp.docs[0].id;
          appData = snapApp.docs[0].data();
        }
      }

      let accData: any = {};
      if (appDocId) {
        const accSnap = await getDoc(doc(db, "registry_accounting", appDocId));
        if (accSnap.exists()) {
          accData = accSnap.data();
        }
      }

      const subModule = vahaanCompleteTask.subModule || appData.subModule || (appData.licenseDetails ? "licence" : "services");
      const destServiceId = (vahaanCompleteTask as any).sourceTaskId || ((vahaanCompleteTask.id && !vahaanCompleteTask.id.startsWith("task-app-")) ? vahaanCompleteTask.id : appDocId ? `service-${appDocId}` : vahaanCompleteTask.id);

      const totalCharges = Number(accData.totalCharges ?? accData.totalPayment ?? appData.amount ?? (vahaanCompleteTask as any).totalCharges ?? 0) || 0;
      const advancePaid = Number(accData.advancePaid ?? accData.advancePayment ?? appData.totalPaid ?? (vahaanCompleteTask as any).advancePaid ?? 0) || 0;
      const outstanding = Math.max(0, totalCharges - advancePaid);
      const paymentStatus = accData.paymentStatus || appData.paymentStatus || (outstanding <= 0 && totalCharges > 0 ? "Paid" : advancePaid > 0 ? "Partial" : "Pending");

      const serviceRef = doc(db, "registry_services_v2", destServiceId);
      const serviceRecord = removeUndefined({
        id: destServiceId,
        serviceId: destServiceId,
        sourceTaskId: vahaanCompleteTask.id,
        status: "Completed",
        taskStatus: "Completed",
        done: true,
        appointmentDate: vahaanAppointmentDate,
        rtoReceiptAmount: rtoReceiptAmountVal,
        rtoReceipt: rtoReceiptAmountVal,
        rtoReceiptNo: String(rtoReceiptAmountVal),
        eChallanAmount: eChallanAmountVal,
        rtoExpense: rtoReceiptAmountVal + eChallanAmountVal,
        challanQty: challanQtyVal,
        challanAmount: challanAmountVal,
        updatedAt: new Date().toISOString(),
        createdAt: vahaanCompleteTask.createdAt || appData.createdAt || new Date().toISOString(),
        
        applicationDocId: appDocId || "",
        clientId: appDocId || vahaanCompleteTask.clientId || vahaanCompleteTask.recordId || "",
        clientName: vahaanCompleteTask.clientName || appData.ownerName || appData.clientName || "",
        ownerName: appData.ownerName || vahaanCompleteTask.clientName || "",
        phone: appData.mobileNumber || vahaanCompleteTask.phone || vahaanCompleteTask.mobileNumber || "",
        mobileNumber: appData.mobileNumber || vahaanCompleteTask.mobileNumber || "",
        
        vehicleId: vahaanCompleteTask.vehicleId || appData.vehicleId || "",
        vehicleNumber: vahaanCompleteTask.vehicleNumber || appData.vehicleNumber || "",
        
        subModule: subModule,
        applicationId: vahaanCompleteTask.applicationId || appData.applicationId || "",
        applicationType: vahaanCompleteTask.applicationType || appData.applicationType || "Home",
        
        serviceName: vahaanCompleteTask.serviceName || (appData.services && appData.services.join(", ")) || vahaanCompleteTask.title || "",
        serviceType: vahaanCompleteTask.serviceType || vahaanCompleteTask.serviceName || "",
        services: appData.services || (vahaanCompleteTask as any).services || [],
        
        assignee: vahaanCompleteTask.assignee || "",
        assignedEmployeeId: vahaanCompleteTask.assignedEmployeeId || "",
        assignedEmployeeUid: vahaanCompleteTask.assignedEmployeeUid || "",
        assignedEmployeeName: vahaanCompleteTask.assignedEmployeeName || "",
        assignedEmployeeRole: vahaanCompleteTask.assignedEmployeeRole || "",
        assignedStaff: vahaanCompleteTask.assignee || "",
        
        activity: vahaanCompleteTask.activity || [],
        activityLogs: vahaanCompleteTask.activityLogs || [],
        totalCharges: totalCharges,
        advancePaid: advancePaid,
        serviceAmount: totalCharges,
        amountReceived: advancePaid,
        advancePayment: advancePaid,
        amount: totalCharges,
        totalPaid: advancePaid,
        pendingAmount: outstanding,
        paymentStatus: paymentStatus,
      });

      await setDoc(serviceRef, serviceRecord, { merge: true });

      if (appDocId) {
        await syncAccountingRecord(appDocId, {
          rtoReceipt: rtoReceiptAmountVal,
          rtoExpense: rtoReceiptAmountVal + eChallanAmountVal,
          eChallanAmount: eChallanAmountVal,
          challanQty: challanQtyVal,
          challanAmount: challanAmountVal,
          employeeName: vahaanCompleteTask.assignee || vahaanCompleteTask.assignedEmployeeName
        }).catch(console.error);

        const appRef = doc(db, "registry_applications_v1", appDocId);
        await updateDoc(appRef, {
          applicationStatus: "COMPLETED",
          rtoReceiptNo: String(rtoReceiptAmountVal),
          rtoReceiptAmount: rtoReceiptAmountVal,
          rtoExpense: rtoReceiptAmountVal + eChallanAmountVal,
          eChallanAmount: eChallanAmountVal,
          appointmentDate: vahaanAppointmentDate || undefined,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      }

      const { deleteDoc } = await import("firebase/firestore");
      if (vahaanCompleteTask.id && !vahaanCompleteTask.id.startsWith("task-app-")) {
        await deleteDoc(doc(db, "registry_tasks", vahaanCompleteTask.id)).catch(() => {});
      }
      if ((vahaanCompleteTask as any).taskId && (vahaanCompleteTask as any).taskId !== vahaanCompleteTask.id && !(vahaanCompleteTask as any).taskId.startsWith("task-app-")) {
        await deleteDoc(doc(db, "registry_tasks", (vahaanCompleteTask as any).taskId)).catch(() => {});
      }

      toast.success("Task completed!");
      setShowVahaanCompleteModal(false);
      setVahaanCompleteTask(null);
      setVahaanRtoReceiptNo("");
      setVahaanEChallanAmount("");
      setVahaanChallanQty("");
      setVahaanChallanAmount("");
      setVahaanAppointmentDate("");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to complete task");
    }
  };

  // On Hold Modal State
  const [holdTask, setHoldTask] = useState<Task | null>(null);
  const [holdReason, setHoldReason] = useState("");
  const [holdRemarks, setHoldRemarks] = useState("");
  const [savingHold, setSavingHold] = useState(false);

  // Complete Task Modal State
  const [completeModalTask, setCompleteModalTask] = useState<Task | null>(null);
  const [completeAppointmentDate, setCompleteAppointmentDate] = useState("");
  const [completeRtoExpense, setCompleteRtoExpense] = useState<string>("");
  const [completeEChallanAmount, setCompleteEChallanAmount] = useState<string>("");
  const [completeChallanQty, setCompleteChallanQty] = useState<string>("");
  const [completeChallanAmount, setCompleteChallanAmount] = useState<string>("");
  const [completeRemarks, setCompleteRemarks] = useState("");
  const [completeNewDob, setCompleteNewDob] = useState("");
  const [completeApplicationId, setCompleteApplicationId] = useState("");
  const [completeApplicationType, setCompleteApplicationType] = useState("Home");
  const [savingComplete, setSavingComplete] = useState(false);

  const handleQuickChangeStatus = async (task: Task, s: TaskStatus) => {
    const sUpper = s.toUpperCase();
    if (activeSubModule === "services") {
      if (sUpper === "ON HOLD" || sUpper === "ONHOLD") {
        setVahaanHoldTask(task);
        setVahaanHoldReason(task.holdReason || "");
        setVahaanHoldDate((task as any).holdDate || new Date().toISOString().split("T")[0]);
        setShowVahaanHoldModal(true);
        return;
      }
      if (sUpper === "COMPLETED") {
        setVahaanCompleteTask(task);
        setVahaanRtoReceiptNo((task as any).rtoReceiptNo || "");
        setVahaanAppointmentDate(task.appointmentDate || new Date().toISOString().split("T")[0]);
        setShowVahaanCompleteModal(true);
        return;
      }
    }
    if (sUpper === "ON HOLD" || sUpper === "ONHOLD") {
      setHoldTask(task);
      setHoldReason(task.holdReason || "");
      setHoldRemarks(task.holdRemarks || task.remarks || "");
      return;
    }
    if (sUpper === "COMPLETED") {
      setCompleteModalTask(task);
      setCompleteAppointmentDate(task.appointmentDate || "");
      setCompleteRtoExpense(task.rtoExpense ? String(task.rtoExpense) : "");
      setCompleteEChallanAmount((task as any).eChallanAmount ? String((task as any).eChallanAmount) : "");
      setCompleteChallanQty((task as any).challanQty ? String((task as any).challanQty) : "");
      setCompleteChallanAmount((task as any).challanAmount ? String((task as any).challanAmount) : "");
      setCompleteRemarks(task.remarks || "");
      setCompleteApplicationId(task.applicationId || "");
      setCompleteApplicationType(task.applicationType || "Home");
      return;
    }

    try {
      await updateTask(
        task.id,
        { status: s, done: false },
        session?.username || "system",
        `Status → ${s}`,
      );
      toast.success(`Status updated to ${s}`);
    } catch (err: any) {
      toast.error("Failed to update status");
    }
  };

  const handleSaveHoldStatus = async () => {
    if (!holdTask) return;
    if (!holdReason.trim()) {
      toast.error("Hold Reason is required");
      return;
    }
    if (!holdRemarks.trim()) {
      toast.error("Remarks are required");
      return;
    }

    setSavingHold(true);
    try {
      await updateTask(
        holdTask.id,
        {
          status: "On Hold",
          done: false,
          holdReason: holdReason.trim(),
          holdRemarks: holdRemarks.trim(),
          remarks: holdRemarks.trim(),
        },
        session?.username || "system",
        `Status → On Hold (Reason: ${holdReason.trim()})`,
      );
      toast.success("Task updated to On Hold");
      setHoldTask(null);
      setHoldReason("");
      setHoldRemarks("");
    } catch (err: any) {
      toast.error("Failed to set task on hold");
    } finally {
      setSavingHold(false);
    }
  };

  const handleSaveCompleteStatus = async () => {
    if (!completeModalTask) return;

    setSavingComplete(true);
    try {
      if (completeAppointmentDate && !/^\d{2}\/\d{2}\/\d{4}$/.test(completeAppointmentDate)) {
        throw new Error("Appointment Date must be in DD/MM/YYYY format.");
      }
      if (completeNewDob && !/^\d{2}\/\d{2}\/\d{4}$/.test(completeNewDob)) {
        throw new Error("New Date of Birth must be in DD/MM/YYYY format.");
      }
      const expNum = parseFloat(completeRtoExpense) || 0;
      const eChallanNum = parseFloat(completeEChallanAmount) || 0;
      const challanQtyNum = parseInt(completeChallanQty) || 0;
      const challanAmountNum = parseFloat(completeChallanAmount) || 0;
      const appDocId = (completeModalTask as any).applicationDocId || completeModalTask.recordId || completeModalTask.id.replace("task-app-", "");

      let appData: any = {};
      if (appDocId) {
        const appSnap = await getDoc(doc(db, "registry_applications_v1", appDocId));
        if (appSnap.exists()) {
          appData = appSnap.data();
        }
      }

      let accData: any = {};
      let totalCharges = 0;
      let advancePaid = 0;
      let rtoExpense = 0;
      if (appDocId) {
        const accRef = doc(db, "registry_accounting", appDocId);
        const accSnap = await getDoc(accRef);
        if (accSnap.exists()) {
          accData = accSnap.data();
          totalCharges = Number(accData.totalCharges) || 0;
          // Add challanAmount to totalCharges
          totalCharges = totalCharges + challanAmountNum;
          advancePaid = Number(accData.advancePaid) || 0;
          rtoExpense = Number(accData.rtoExpense) || 0;
        } else {
          totalCharges = Number((completeModalTask as any).totalCharges) || 0;
          advancePaid = Number((completeModalTask as any).advancePaid) || 0;
        }
      }

      const rtoReceipt = expNum;
      if (rtoReceipt < 0) {
        throw new Error("RTO Receipt Amount cannot be negative.");
      }
      if (rtoReceipt > totalCharges) {
        throw new Error(`RTO Receipt Amount (₹${rtoReceipt}) cannot exceed Outstanding + Advance (₹${totalCharges}).`);
      }

      const outstanding = Math.max(0, totalCharges - advancePaid);
      const profit = outstanding - rtoReceipt - rtoExpense;

      if (appDocId) {
        await syncAccountingRecord(appDocId, {
          rtoReceipt: rtoReceipt,
          rtoExpense: expNum + eChallanNum,
          eChallanAmount: eChallanNum,
          employeeName: completeModalTask.assignedEmployeeName || completeModalTask.assignee,
          vehicleNumber: (completeModalTask as any).vehicleNumber,
          ownerName: (completeModalTask as any).ownerName || (completeModalTask as any).clientName
        }).catch(console.error);
      }

      const subModule = completeModalTask.subModule || appData.subModule || (appData.licenseDetails ? "licence" : "services");

      const destServiceId = (completeModalTask as any).sourceTaskId || ((completeModalTask.id && !completeModalTask.id.startsWith("task-app-")) ? completeModalTask.id : appDocId ? `service-${appDocId}` : completeModalTask.id);
      const serviceRef = doc(db, "registry_services_v2", destServiceId);
      const serviceRecord = removeUndefined({
        id: destServiceId,
        serviceId: destServiceId,
        sourceTaskId: completeModalTask.id,
        status: "Completed",
        taskStatus: "Completed",
        done: true,
        appointmentDate: completeAppointmentDate,
        rtoReceiptAmount: expNum,
        rtoReceiptNo: String(expNum),
        eChallanAmount: eChallanNum,
        rtoExpense: expNum + eChallanNum,
        challanQty: challanQtyNum,
        challanAmount: challanAmountNum,
        updatedAt: new Date().toISOString(),
        createdAt: completeModalTask.createdAt || appData.createdAt || new Date().toISOString(),
        remarks: completeRemarks.trim(),
        notes: completeRemarks.trim(),

        applicationDocId: appDocId || "",
        clientId: appDocId || completeModalTask.clientId || completeModalTask.recordId || "",
        clientName: completeModalTask.clientName || appData.ownerName || appData.clientName || "",
        ownerName: appData.ownerName || completeModalTask.clientName || "",
        phone: appData.mobileNumber || completeModalTask.phone || completeModalTask.mobileNumber || "",
        mobileNumber: appData.mobileNumber || completeModalTask.mobileNumber || "",
        
        vehicleId: completeModalTask.vehicleId || appData.vehicleId || "",
        vehicleNumber: completeModalTask.vehicleNumber || appData.vehicleNumber || "",
        
        subModule: subModule,
        applicationId: completeApplicationId.trim() || appData.applicationId || "",
        applicationType: completeApplicationType || appData.applicationType || "Home",
        
        serviceName: completeModalTask.serviceName || (appData.services && appData.services.join(", ")) || completeModalTask.title || "",
        serviceType: completeModalTask.serviceType || completeModalTask.serviceName || "",
        services: appData.services || (completeModalTask as any).services || [],
        
        assignee: completeModalTask.assignee || "",
        assignedEmployeeId: completeModalTask.assignedEmployeeId || "",
        assignedEmployeeUid: completeModalTask.assignedEmployeeUid || "",
        assignedEmployeeName: completeModalTask.assignedEmployeeName || "",
        assignedEmployeeRole: completeModalTask.assignedEmployeeRole || "",
        assignedStaff: completeModalTask.assignee || "",
        
        activity: completeModalTask.activity || [],
        activityLogs: completeModalTask.activityLogs || [],
        totalCharges: totalCharges,
        advancePaid: advancePaid,
        serviceAmount: totalCharges,
        amountReceived: advancePaid,
        advancePayment: advancePaid,
        amount: totalCharges,
        totalPaid: advancePaid,
        pendingAmount: outstanding,
        paymentStatus: outstanding <= 0 ? "Paid" : advancePaid > 0 ? "Partial" : "Pending",
      });

      await setDoc(serviceRef, serviceRecord, { merge: true });

      if (appDocId) {
        const appRef = doc(db, "registry_applications_v1", appDocId);
        const appSnap = await getDoc(appRef);
        if (appSnap.exists()) {
          const appUpdates: any = {
            applicationId: completeApplicationId.trim(),
            applicationType: completeApplicationType,
            applicationStatus: "COMPLETED",
            rtoReceiptAmount: expNum,
            rtoReceiptNo: String(expNum),
            updatedAt: new Date().toISOString(),
          };
          if (completeAppointmentDate) {
            appUpdates.appointmentDate = completeAppointmentDate;
          }
          if (completeNewDob) {
            appUpdates["licenseDetails.dateOfBirth"] = completeNewDob;
          }
          await updateDoc(appRef, appUpdates);
          if (completeNewDob) {
            toast.success(`Applicant Date of Birth updated to ${completeNewDob}!`);
          }
        }
      }

      const { deleteDoc } = await import("firebase/firestore");
      // Delete original task from Firestore tasks collection if exists
      if (completeModalTask.id && !completeModalTask.id.startsWith("task-app-")) {
        await deleteDoc(doc(db, "registry_tasks", completeModalTask.id)).catch(() => {});
      }
      if ((completeModalTask as any).taskId && (completeModalTask as any).taskId !== completeModalTask.id && !(completeModalTask as any).taskId.startsWith("task-app-")) {
        await deleteDoc(doc(db, "registry_tasks", (completeModalTask as any).taskId)).catch(() => {});
      }

      toast.success("Task completed and transferred to Services!");
      setCompleteModalTask(null);
      setCompleteAppointmentDate("");
      setCompleteRtoExpense("");
      setCompleteEChallanAmount("");
      setCompleteChallanQty("");
      setCompleteChallanAmount("");
      setCompleteRemarks("");
      setCompleteNewDob("");
    } catch (err: any) {
      toast.error(err.message || "Failed to complete task");
    } finally {
      setSavingComplete(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tasks</h2>
          <p className="text-sm text-muted-foreground">
            {stats.visible} shown • {stats.pending} pending • {stats.overdue} overdue •{" "}
            {stats.completed} done
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <div className="flex border rounded-lg overflow-hidden bg-slate-50">
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                className={`rounded-none px-3 h-9 ${viewMode === "table" ? "bg-white border shadow-sm font-semibold text-primary" : ""}`}
                onClick={() => setViewMode("table")}
                title="Table View"
              >
                <List className="size-4 mr-1" /> Table
              </Button>
              <Button
                variant={viewMode === "card" ? "secondary" : "ghost"}
                size="sm"
                className={`rounded-none px-3 h-9 ${viewMode === "card" ? "bg-white border shadow-sm font-semibold text-primary" : ""}`}
                onClick={() => setViewMode("card")}
                title="Card View"
              >
                <LayoutGrid className="size-4 mr-1" /> Cards
              </Button>
            </div>
            {isAdmin && (
              <Button onClick={openCreate}>
                <Plus className="size-4 mr-1" />
                Add task
              </Button>
            )}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2 bg-white border border-slate-200 rounded-lg text-[10px] md:text-xs font-semibold text-slate-600 shadow-sm">
            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider mr-1">Application Type Legend</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-white border border-slate-300 shadow-xs inline-block" />
              <span>HOME</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-blue-500 inline-block" />
              <span>FACELESS</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-red-500 inline-block" />
              <span>OUT OF BHAVNAGAR</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" />
              <span>CNG</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-orange-500 inline-block" />
              <span>OUT OF BHAVNAGAR TO BHAVNAGAR</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3 Main Sub Module Services, Licence, Driving School Tabs */}
      <div>
        <SubModuleTabs activeTab={activeSubModule} onChange={setActiveSubModule} />
      </div>

      {/* Tab Navigation */}
      <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as "my" | "all")}>
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="my">My Tasks ({stats.my})</TabsTrigger>
          <TabsTrigger value="all">
            All Tasks ({stats.all})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my" className="space-y-3">
          {/* Search + filters */}
          <div className="rounded-xl border bg-card p-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by Vehicle No, Application No, Client Name, Reference, Employee, Phone…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  {TASK_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priority</SelectItem>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All staff</SelectItem>
                  {employees
                    .filter((e) => e.status === "active" && !e.isDeleted)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.fullName || s.name || s.username}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              <ServiceMultiSelectFilter
                availableServices={availableServicesList}
                selectedServices={selectedServiceFilters}
                onChange={setSelectedServiceFilters}
              />

              <Select value={appTypeFilter} onValueChange={setAppTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="App Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All App Types</SelectItem>
                  {activeSubModule === "licence" ? (
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

              <Select value={groupFilter} onValueChange={setGroupFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Group Name" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ALL GROUPS</SelectItem>
                  {availableGroups.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={associationFilter} onValueChange={setAssociationFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Linked to" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All links</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="none">Standalone</SelectItem>
                </SelectContent>
              </Select>

              <Select value={dueFilter} onValueChange={setDueFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Due date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any due date</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="today">Due today</SelectItem>
                  <SelectItem value="week">Due this week</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">Latest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="priority">Priority (high → low)</SelectItem>
                  <SelectItem value="due">Due date (soonest)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status counts */}
          <div className="rounded-xl border bg-card p-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge className="bg-cyan-100 text-cyan-700 border-cyan-200">
                  {stats.statusCounts["Read"]}
                </Badge>
                <span className="text-muted-foreground">Read</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">
                  {stats.statusCounts["In Progress"]}
                </Badge>
                <span className="text-muted-foreground">In Progress</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  {stats.statusCounts["Completed"]}
                </Badge>
                <span className="text-muted-foreground">Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-zinc-100 text-zinc-700 border-zinc-200">
                  {stats.statusCounts["On Hold"]}
                </Badge>
                <span className="text-muted-foreground">On Hold</span>
              </div>
            </div>
          </div>

          {/* Task Grid Table or Card View */}
          {viewMode === "card" ? (
            <TaskCards
              tasks={visible}
              clients={clients}
              leads={leads}
              vehicles={vehicles}
              isAdmin={!!isAdmin}
              session={session}
              onView={(t) => setDetailsId(t.id)}
              onEdit={openEdit}
              onDelete={(t) => {
                setTaskToDelete(t);
                setDeleteOpen(true);
              }}
              onToggleDone={(t, v) => setTaskDone(t.id, v, session?.username ?? "system")}
              onAddRemark={(t) => setRemarkTaskId(t.id)}
              onChangeStatus={handleQuickChangeStatus}
              onDuplicate={handleDuplicateTask}
              activeSubModule={activeSubModule}
            />
          ) : (
            <TaskTable
              tasks={visible}
              clients={clients}
              leads={leads}
              vehicles={vehicles}
              isAdmin={!!isAdmin}
              session={session}
              applications={applications}
              onView={(t) => setDetailsId(t.id)}
              onEdit={openEdit}
              activeSubModule={activeSubModule}
              onDelete={(t) => {
                setTaskToDelete(t);
                setDeleteOpen(true);
              }}
              onToggleDone={(t, v) => setTaskDone(t.id, v, session?.username ?? "system")}
              onAddRemark={(t) => setRemarkTaskId(t.id)}
              onChangeStatus={handleQuickChangeStatus}
              onDuplicate={handleDuplicateTask}
            />
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-3">
          {/* Search + filters */}
          <div className="rounded-xl border bg-card p-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search tasks by title, description, assignee…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  {TASK_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priority</SelectItem>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All staff</SelectItem>
                  {employees
                    .filter((e) => e.status === "active" && !e.isDeleted)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.fullName || s.name || s.username}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              <ServiceMultiSelectFilter
                availableServices={availableServicesList}
                selectedServices={selectedServiceFilters}
                onChange={setSelectedServiceFilters}
              />

              <Select value={appTypeFilter} onValueChange={setAppTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="App Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All App Types</SelectItem>
                  {activeSubModule === "licence" ? (
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

              <Select value={groupFilter} onValueChange={setGroupFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Group Name" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ALL GROUPS</SelectItem>
                  {availableGroups.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={associationFilter} onValueChange={setAssociationFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Linked to" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All links</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="none">Standalone</SelectItem>
                </SelectContent>
              </Select>

              <Select value={dueFilter} onValueChange={setDueFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Due date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any due date</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="today">Due today</SelectItem>
                  <SelectItem value="week">Due this week</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">Latest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="priority">Priority (high → low)</SelectItem>
                  <SelectItem value="due">Due date (soonest)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status counts */}
          <div className="rounded-xl border bg-card p-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge className="bg-cyan-50 text-cyan-700 border-cyan-200/80 rounded-full font-bold">
                  {stats.statusCounts["Read"]}
                </Badge>
                <span className="text-slate-600 font-medium">Read</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-purple-50 text-purple-700 border-purple-200/80 rounded-full font-bold">
                  {stats.statusCounts["In Progress"]}
                </Badge>
                <span className="text-slate-600 font-medium">In Progress</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200/80 rounded-full font-bold">
                  {stats.statusCounts["Completed"]}
                </Badge>
                <span className="text-slate-600 font-medium">Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-amber-50 text-amber-700 border-amber-200/80 rounded-full font-bold">
                  {stats.statusCounts["On Hold"]}
                </Badge>
                <span className="text-slate-600 font-medium">On Hold</span>
              </div>
            </div>
          </div>

          {/* Task Grid Table or Card View */}
          {viewMode === "card" ? (
            <TaskCards
              tasks={visible}
              clients={clients}
              leads={leads}
              vehicles={vehicles}
              isAdmin={!!isAdmin}
              session={session}
              onView={(t) => setDetailsId(t.id)}
              onEdit={openEdit}
              onDelete={(t) => {
                setTaskToDelete(t);
                setDeleteOpen(true);
              }}
              onToggleDone={(t, v) => setTaskDone(t.id, v, session?.username ?? "system")}
              onAddRemark={(t) => setRemarkTaskId(t.id)}
              onChangeStatus={handleQuickChangeStatus}
              onDuplicate={handleDuplicateTask}
              accountingMap={accountingMap}
              activeSubModule={activeSubModule}
            />
          ) : (
            <TaskTable
              tasks={visible}
              clients={clients}
              leads={leads}
              vehicles={vehicles}
              isAdmin={!!isAdmin}
              session={session}
              applications={applications}
              onView={(t) => setDetailsId(t.id)}
              onEdit={openEdit}
              onDelete={(t) => {
                setTaskToDelete(t);
                setDeleteOpen(true);
              }}
              onToggleDone={(t, v) => setTaskDone(t.id, v, session?.username ?? "system")}
              onAddRemark={(t) => setRemarkTaskId(t.id)}
              onChangeStatus={handleQuickChangeStatus}
              onDuplicate={handleDuplicateTask}
              activeSubModule={activeSubModule}
              accountingMap={accountingMap}
            />
          )}
        </TabsContent>
      </Tabs>

      <TaskFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        clients={clients}
        leads={leads}
        vehicles={vehicles}
        employees={employees}
        actor={session?.username ?? "system"}
        isAdmin={!!isAdmin}
        activeSubModule={activeSubModule}
      />

      {detailsTask && (
        <TaskDetailsSheet
          open={!!detailsId}
          onClose={() => setDetailsId(null)}
          task={detailsTask}
          clients={clients}
          leads={leads}
          vehicles={vehicles}
          employees={employees}
          v2Services={v2Services}
          actor={session?.username ?? "system"}
          isAdmin={!!isAdmin}
          onEdit={openEdit}
          activeSubModule={activeSubModule}
          onTriggerHoldModal={(t) => handleQuickChangeStatus(t, "On Hold")}
          onTriggerCompleteModal={(t) => handleQuickChangeStatus(t, "Completed")}
        />
      )}

      {taskToDelete && (
        <DeleteTaskDialog
          open={deleteOpen}
          onOpenChange={(v) => {
            if (!v) {
              setDeleteOpen(false);
              setTaskToDelete(null);
            }
          }}
          taskId={taskToDelete.id}
          taskTitle={taskToDelete.title}
          userRole={isAdmin ? "admin" : "staff"}
          username={session?.username ?? "system"}
        />
      )}

      {/* Add Remark Modal */}
      {remarkTaskId && (
        <Dialog open={!!remarkTaskId} onOpenChange={(v) => !v && setRemarkTaskId(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Task Remark</DialogTitle>
              <DialogDescription>
                Record operational updates or comments directly on the task timeline.
              </DialogDescription>
            </DialogHeader>

            <div className="py-2 space-y-2">
              <Label htmlFor="remarkText" className="text-xs uppercase font-bold text-gray-500">
                Remark Text *
              </Label>
              <Textarea
                id="remarkText"
                rows={4}
                placeholder="Type operational update remarks here..."
                value={quickRemarkText}
                onChange={(e) => setQuickRemarkText(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={() => setRemarkTaskId(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleQuickAddRemark}
                disabled={savingRemark || !quickRemarkText.trim()}
              >
                {savingRemark ? <Loader2 className="size-4 animate-spin" /> : "Save Remark"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Vahaan On Hold Modal */}
      {vahaanHoldTask && (
        <Dialog open={showVahaanHoldModal} onOpenChange={setShowVahaanHoldModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Put Task On Hold</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Hold Reason *</Label>
                <Input value={vahaanHoldReason} onChange={(e) => setVahaanHoldReason(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input type="date" value={vahaanHoldDate} onChange={(e) => setVahaanHoldDate(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowVahaanHoldModal(false)}>Cancel</Button>
              <Button onClick={handleSaveVahaanHold}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Vahaan Complete Modal */}
      {vahaanCompleteTask && (
        <Dialog open={showVahaanCompleteModal} onOpenChange={setShowVahaanCompleteModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Complete Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>RTO Receipt Amount *</Label>
                <Input type="number" placeholder="₹ 5,000" value={vahaanRtoReceiptNo} onChange={(e) => setVahaanRtoReceiptNo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>E-Challan Amount</Label>
                <Input type="number" placeholder="₹ 0" value={vahaanEChallanAmount} onChange={(e) => setVahaanEChallanAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Appointment Date (DD/MM/YYYY) *</Label>
                <Input
                  type="text"
                  placeholder="DD/MM/YYYY"
                  value={vahaanAppointmentDate}
                  onChange={(e) => {
                    let val = e.target.value.replace(/\D/g, "");
                    if (val.length > 8) val = val.slice(0, 8);
                    if (val.length > 4) {
                      val = `${val.slice(0, 2)}/${val.slice(2, 4)}/${val.slice(4)}`;
                    } else if (val.length > 2) {
                      val = `${val.slice(0, 2)}/${val.slice(2)}`;
                    }
                    setVahaanAppointmentDate(val);
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowVahaanCompleteModal(false)}>Cancel</Button>
              <Button onClick={handleSaveVahaanComplete}>Complete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Status = On Hold Modal */}
      {holdTask && (
        <Dialog open={!!holdTask} onOpenChange={(v) => !v && setHoldTask(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-amber-700 flex items-center gap-2">
                <AlertTriangle className="size-5" /> Put Task On Hold
              </DialogTitle>
              <DialogDescription>
                Please provide the required hold reason and remarks before setting task to On Hold.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="holdReason" className="text-xs uppercase font-bold text-gray-600">
                  Hold Reason *
                </Label>
                <Input
                  id="holdReason"
                  placeholder="e.g. Waiting for Client Documents, RTO Query..."
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="holdRemarks" className="text-xs uppercase font-bold text-gray-600">
                  Remarks *
                </Label>
                <Textarea
                  id="holdRemarks"
                  rows={3}
                  placeholder="Additional details regarding why task is on hold..."
                  value={holdRemarks}
                  onChange={(e) => setHoldRemarks(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setHoldTask(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveHoldStatus}
                disabled={savingHold || !holdReason.trim() || !holdRemarks.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {savingHold ? <Loader2 className="size-4 animate-spin" /> : "Save On Hold Status"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Status = Complete Task Modal (Matching closing popup UI) */}
      {completeModalTask && (
        <Dialog open={!!completeModalTask} onOpenChange={(v) => !v && setCompleteModalTask(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-slate-900 font-bold text-lg">Complete Task</DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Fill in the closing details
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                  APPOINTMENT DATE (DD/MM/YYYY)
                </Label>
                <Input
                  type="text"
                  placeholder="DD/MM/YYYY"
                  value={completeAppointmentDate}
                  onChange={(e) => {
                    let val = e.target.value.replace(/\D/g, "");
                    if (val.length > 8) val = val.slice(0, 8);
                    if (val.length > 4) {
                      val = `${val.slice(0, 2)}/${val.slice(2, 4)}/${val.slice(4)}`;
                    } else if (val.length > 2) {
                      val = `${val.slice(0, 2)}/${val.slice(2)}`;
                    }
                    setCompleteAppointmentDate(val);
                  }}
                  className="bg-slate-50 font-medium text-slate-900"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                  RTO RECEIPT AMOUNT
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">₹</span>
                  <Input
                    type="number"
                    placeholder="Enter RTO Receipt Amount"
                    value={completeRtoExpense}
                    onChange={(e) => setCompleteRtoExpense(e.target.value)}
                    className="pl-8 bg-slate-50 font-medium text-slate-900"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                  E-CHALLAN AMOUNT
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">₹</span>
                  <Input
                    type="number"
                    placeholder="Enter E-Challan Amount"
                    value={completeEChallanAmount}
                    onChange={(e) => setCompleteEChallanAmount(e.target.value)}
                    className="pl-8 bg-slate-50 font-medium text-slate-900"
                  />
                </div>
              </div>

              {(completeModalTask.serviceName?.toLowerCase().includes("change date of birth") || completeModalTask.title?.toLowerCase().includes("change date of birth") || (completeModalTask as any).licenseDetails?.generalLicenceServices?.selectedServices?.includes("Change Date Of Birth In DL")) && (
                <div className="space-y-1.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <Label className="text-[10px] uppercase font-bold tracking-wider text-amber-800">
                    NEW DATE OF BIRTH (REQUIRED FOR THIS SERVICE) *
                  </Label>
                  <Input
                    type="text"
                    placeholder="DD/MM/YYYY"
                    value={completeNewDob}
                    onChange={(e) => {
                      let val = e.target.value.replace(/\D/g, "");
                      if (val.length > 8) val = val.slice(0, 8);
                      if (val.length > 4) {
                        val = `${val.slice(0, 2)}/${val.slice(2, 4)}/${val.slice(4)}`;
                      } else if (val.length > 2) {
                        val = `${val.slice(0, 2)}/${val.slice(2)}`;
                      }
                      setCompleteNewDob(val);
                    }}
                    className="bg-white font-medium text-slate-900 border-amber-300"
                  />
                  <p className="text-[10px] text-amber-700">
                    Completing this task will automatically update the applicant's Date of Birth in the License application record.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border rounded-xl">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Application No.</Label>
                  <Input
                    type="text"
                    placeholder="APL-XXXX-XXXX"
                    value={completeApplicationId}
                    onChange={(e) => setCompleteApplicationId(e.target.value)}
                    className="bg-white text-xs font-semibold text-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Application Type</Label>
                  <Select value={completeApplicationType} onValueChange={setCompleteApplicationType}>
                    <SelectTrigger className="bg-white text-xs font-semibold text-slate-900 h-9">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {(completeModalTask?.applicationType === "Licence" || (completeModalTask as any)?.subModule === "licence") ? (
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
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                  REMARKS
                </Label>
                <Textarea
                  rows={3}
                  placeholder="Add closing remarks..."
                  value={completeRemarks}
                  onChange={(e) => setCompleteRemarks(e.target.value)}
                  className="bg-slate-50 text-slate-900 text-xs"
                />
              </div>
            </div>
            <DialogFooter className="flex sm:justify-between gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setCompleteModalTask(null)}
                className="w-full sm:w-auto rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveCompleteStatus}
                disabled={savingComplete}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-500/20"
              >
                {savingComplete ? <Loader2 className="size-4 animate-spin" /> : "Transfer to Services"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function getTaskInfoHelper(t: Task, clients: RegistryRecord[], leads: RegistryRecord[], vehicles: any[]) {
  let clientName = (t as any).ownerName || (t as any).clientName || "";
  let clientPhone = (t as any).ownerPhone || (t as any).mobileNumber || (t as any).phone || "";
  
  if (!clientName && (t.clientId || t.recordId)) {
    const targetId = t.clientId || t.recordId;
    const foundClient = clients.find((c) => c.id === targetId);
    if (foundClient) {
      clientName = foundClient.name;
      if (!clientPhone) clientPhone = (foundClient as any).phone || (foundClient as any).mobile || (foundClient as any).mo || "";
    } else {
      const foundLead = leads.find((l) => l.id === targetId);
      if (foundLead) {
        clientName = foundLead.name;
        if (!clientPhone) clientPhone = (foundLead as any).phone || (foundLead as any).mobile || (foundLead as any).mo || "";
      }
    }
  }

  let taskName = t.reference || t.title || "Application Task";
  let service = t.serviceName || t.serviceType || t.description || "";

  if (
    taskName.startsWith("Client:") ||
    taskName.startsWith("Lead:")
  ) {
    const parts = taskName.split("—");
    if (parts.length > 1) {
      const extracted = parts[parts.length - 1].trim();
      taskName = extracted;
      if (!service) {
        service = extracted;
      }
    } else {
      taskName = service || "Application Task";
    }
  }

  // Resolve vehicle details if linked
  let vehicleNum = (t as any).vehicleNumber || "";
  if (!vehicleNum && t.vehicleId) {
    const found = vehicles.find((v) => v.id === t.vehicleId);
    if (found) {
      vehicleNum = found.vehicleNumber || found.id || "";
    } else {
      vehicleNum = t.vehicleId;
    }
  }

  if (!vehicleNum && t.title) {
    const match = t.title.match(/[A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,3}\s*\d{1,4}/i);
    if (match) {
      vehicleNum = match[0].toUpperCase();
    }
  }

  return { taskName, clientName, clientPhone, service, vehicleNum };
}

// ─── Professional Task Table Component ──────────────────────────────────────
function TaskTable({
  tasks,
  clients,
  leads,
  vehicles,
  isAdmin,
  session,
  onView,
  onEdit,
  onDelete,
  onToggleDone,
  onAddRemark,
  onChangeStatus,
  onDuplicate,
  activeSubModule = "services",
  accountingMap,
  applications = [],
}: {
  tasks: Task[];
  clients: RegistryRecord[];
  leads: RegistryRecord[];
  vehicles: any[];
  isAdmin: boolean;
  session: any;
  onView: (t: Task) => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  onToggleDone: (t: Task, v: boolean) => void;
  onAddRemark: (t: Task) => void;
  onChangeStatus: (t: Task, s: TaskStatus) => void;
  onDuplicate: (t: Task) => void;
  activeSubModule?: SubModuleType;
  accountingMap?: Map<string, AccountingRecord>;
  applications?: any[];
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const totalPages = Math.ceil(tasks.length / pageSize);
  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return tasks.slice(start, start + pageSize);
  }, [tasks, currentPage]);

  const getTaskInfo = (t: Task) => {
    return getTaskInfoHelper(t, clients, leads, vehicles);
  };

  const isLicenceSubModule = activeSubModule === "licence";

  // Unique dynamic license service expiry column names
  const licenseExpiryCols = useMemo(() => {
    if (!isLicenceSubModule) return [];
    return Array.from(
      new Set(
        tasks.flatMap((t: any) => {
          const sName = t.serviceName || t.title || "License Service";
          return sName.split(",").map((s: string) => s.trim()).filter(Boolean);
        })
      )
    );
  }, [tasks, isLicenceSubModule]);
  const taskTableRef = useRef<HTMLDivElement>(null);
  const taskMirrorRef = useRef<HTMLDivElement>(null);
  const taskMirrorInnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const table = taskTableRef.current;
    const mirror = taskMirrorRef.current;
    const mirrorInner = taskMirrorInnerRef.current;
    if (!table || !mirror || !mirrorInner) return;

    // Sync scroll positions
    const syncTable = () => { mirror.scrollLeft = table.scrollLeft; };
    const syncMirror = () => { table.scrollLeft = mirror.scrollLeft; };
    table.addEventListener('scroll', syncTable);
    mirror.addEventListener('scroll', syncMirror);

    // Keep mirror inner width = actual table scroll width
    const ro = new ResizeObserver(() => {
      mirrorInner.style.width = table.scrollWidth + 'px';
    });
    ro.observe(table);
    mirrorInner.style.width = table.scrollWidth + 'px';

    return () => {
      table.removeEventListener('scroll', syncTable);
      mirror.removeEventListener('scroll', syncMirror);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="border rounded-xl bg-white shadow-sm">
        {/* Mirror scrollbar at top */}
        <div ref={taskMirrorRef} style={{overflowX: 'auto', overflowY: 'hidden', height: '14px', borderBottom: '1px solid #e2e8f0'}}>
          <div ref={taskMirrorInnerRef} style={{height: '1px', minWidth: '100%'}} />
        </div>
        <div ref={taskTableRef} className="max-h-[60vh] overflow-y-auto overflow-x-auto relative [&::-webkit-scrollbar]:hidden" style={{scrollbarWidth: 'none', msOverflowStyle: 'none'}}>
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-50 text-gray-600 uppercase font-bold text-xs tracking-wider border-b z-10">
              <tr>
                <th className="p-3 text-center">SR NO</th>
                {activeSubModule === "form5" ? (
                  <>
                    <th className="p-3">Name</th>
                    <th className="p-3">Date Of Birth</th>
                    <th className="p-3 font-bold text-slate-900 text-sm">Application No</th>
                    <th className="p-3">Adhar No</th>
                    <th className="p-3">LL NO</th>
                    <th className="p-3">DL NO</th>
                    <th className="p-3">Expire date</th>
                    <th className="p-3">nt validity</th>
                    <th className="p-3">tr validity</th>
                  </>
                ) : activeSubModule === "insurance" ? (
                  <>
                    <th className="p-3">CLIENT NAME</th>
                    <th className="p-3">DOB</th>
                    <th className="p-3">MOBILE NUMBER</th>
                    <th className="p-3">VEHICLE NUMBER</th>
                    <th className="p-3">INSURANCE COMPANY</th>
                    <th className="p-3">POLICY NUMBER</th>
                    <th className="p-3">EXPIRY DATE</th>
                    <th className="p-3">કુલ રકમ</th>
                    <th className="p-3">કુલ જમા</th>
                    <th className="p-3">બાકી</th>
                    <th className="p-3">PAYMENT STATUS</th>
                    <th className="p-3">STATUS OF TASK</th>
                    <th className="p-3">LATEST REMARK</th>
                    <th className="p-3">ASSIGNED TO</th>
                  </>
                ) : isLicenceSubModule ? (
                  <>
                    <th className="p-3 font-bold text-slate-900 text-sm">APPLICATION NO</th>
                    <th className="p-3">CLIENT NAME</th>
                    <th className="p-3">DOB</th>
                    <th className="p-3">MOBILE NUMBER</th>
                    {licenseExpiryCols.length > 0
                      ? licenseExpiryCols.map((srv) => (
                          <th key={srv} className="p-3">
                            {srv} EXPIRE DATE
                          </th>
                        ))
                      : <th className="p-3">SERVICE EXPIRE DATE</th>}
                    <th className="p-3">કુલ રકમ</th>
                    <th className="p-3">કુલ જમા</th>
                    <th className="p-3">બાકી</th>
                    <th className="p-3">PAYMENT STATUS</th>
                    <th className="p-3">STATUS OF TASK</th>
                    <th className="p-3">LATEST REMARK</th>
                  </>
                ) : (
                  <>
                    <th className="p-3">TASK CREATED DATE</th>
                    <th className="p-3">VEHICLE NUMBER</th>
                    <th className="p-3">SERVICES</th>
                    <th className="p-3">CLIENT NAME</th>
                    <th className="p-3">NUMBER</th>
                    <th className="p-3">TASK STATUS</th>
                    <th className="p-3">LATEST REMARK</th>
                    <th className="p-3 font-bold text-slate-900 text-sm">APPLICATION NO.</th>
                    <th className="p-3">REFERENCE</th>
                    <th className="p-3">ASSIGNED EMPLOYEE</th>
                    <th className="p-3">PUC EXPIRY</th>
                    <th className="p-3">TAX EXPIRY</th>
                    <th className="p-3">FITNESS EXPIRY</th>
                    {activeSubModule !== "services" && <th className="p-3">INSURANCE EXPIRY</th>}
                    <th className="p-3">NATIONAL PERMIT EXPIRY</th>
                    <th className="p-3">GUJARAT PERMIT EXPIRY</th>
                    <th className="p-3 font-bold text-slate-900">કુલ રકમ</th>
                    <th className="p-3 font-bold text-emerald-700">કુલ જમા</th>
                    <th className="p-3">APPLICATION TYPE</th>
                  </>
                )}
                <th className="p-3 text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y text-gray-700 font-medium">
              {paginatedTasks.map((t, idx) => {
                const info = getTaskInfo(t);
                const srNo = (currentPage - 1) * pageSize + idx + 1;
                const creationDate = formatDateDDMMYYYY(t.createdDate || t.createdAt);

                if (activeSubModule === "form5") {
                  const targetAppKey = (t as any).applicationDocId || t.applicationId || (t as any).recordId || t.id;
                  const linkedApp = applications?.find((a: any) => a.id === targetAppKey || a.applicationId === t.applicationId);
                  const fd = (t as any).form5Details || linkedApp?.form5Details || {};

                  const nameVal = fd.name || "—";
                  const dobVal = formatDateDDMMYYYY(fd.dateOfBirth);
                  const appNoVal = fd.applicationNo || "—";
                  const aadhaarVal = fd.aadhaarNumber || "—";
                  const llVal = fd.llNumber || "—";
                  const dlVal = fd.dlNumber || "—";
                  const llExpiryVal = formatDateDDMMYYYY(fd.llExpiryDate);
                  const ntVal = formatDateDDMMYYYY(fd.ntValidityDate);
                  const trVal = formatDateDDMMYYYY(fd.trValidityDate);

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3 text-center font-mono text-slate-400 font-semibold">{srNo}</td>
                      <td className="p-3 font-bold text-blue-900">{nameVal}</td>
                      <td className="p-3 font-mono text-slate-600">{dobVal}</td>
                      <td className="p-3 font-mono text-slate-600 font-bold">{appNoVal}</td>
                      <td className="p-3 font-mono text-slate-600">{aadhaarVal}</td>
                      <td className="p-3 font-mono text-slate-600">{llVal}</td>
                      <td className="p-3 font-mono text-slate-600">{dlVal}</td>
                      <td className="p-3 font-mono text-slate-600">{llExpiryVal}</td>
                      <td className="p-3 font-mono text-slate-600">{ntVal}</td>
                      <td className="p-3 font-mono text-slate-600">{trVal}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onView(t)}
                            title="View Detail"
                          >
                            <Eye className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit(t)}
                            title="Edit Task"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDuplicate(t)}
                            title="Duplicate Task"
                            className="text-emerald-600 hover:bg-emerald-50"
                          >
                            <Copy className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                if (activeSubModule === "insurance") {
                  const targetAppKey = (t as any).applicationDocId || t.applicationId || (t as any).recordId || t.id;
                  const linkedApp = applications?.find((a: any) => a.id === targetAppKey || a.applicationId === t.applicationId);
                  const insDetails = (t as any).insuranceDetails || linkedApp?.vehicleDetails?.insuranceDetails || {};
                  const clientDob = formatDateDDMMYYYY((t as any).dateOfBirth || (t as any).licenseDetails?.dateOfBirth || linkedApp?.dateOfBirth || linkedApp?.licenseDetails?.dateOfBirth);
                  
                  const acc = accountingMap?.get(targetAppKey) || accountingMap?.get(t.applicationId || "");
                  const totalPay = acc?.totalPayment ?? ((t as any).amount || (t as any).totalAmount || 0);
                  const advPay = acc?.advancePayment ?? ((t as any).totalPaid || (t as any).advanceAmount || 0);
                  const remPay = acc?.remainingPayment ?? (typeof (t as any).pendingAmount === "number" ? (t as any).pendingAmount : Math.max(0, totalPay - advPay));
                  const rawStatus = acc?.paymentStatus ?? (t as any).paymentStatus ?? (remPay <= 0 ? "Paid" : advPay > 0 ? "Partially Paid" : "Pending");
                  const pStatus = rawStatus === "Partially Paid" ? "Partial" : rawStatus;

                  const latestComment = getLatestTaskComment(t);

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3 text-center font-mono text-slate-400 font-semibold">{srNo}</td>
                      <td className="p-3 font-bold text-blue-900">{info.clientName || linkedApp?.ownerName || "—"}</td>
                      <td className="p-3 font-mono text-slate-600">{clientDob}</td>
                      <td className="p-3 font-mono text-slate-700">{info.clientPhone || linkedApp?.mobileNumber || "—"}</td>
                      <td className="p-3 font-mono text-slate-700">{t.vehicleNumber || linkedApp?.vehicleNumber || "—"}</td>
                      <td className="p-3 font-semibold text-slate-800">{insDetails.company || "—"}</td>
                      <td className="p-3 font-mono text-slate-600">{insDetails.policyNumber || "—"}</td>
                      <td className="p-3 font-mono text-slate-600">{formatDateDDMMYYYY(insDetails.expiryDate)}</td>
                      <td className="p-3 font-bold text-slate-900 font-mono">
                        ₹{Number(totalPay).toLocaleString("en-IN")}
                      </td>
                      <td className="p-3 font-bold text-emerald-700 font-mono">
                        ₹{Number(advPay).toLocaleString("en-IN")}
                      </td>
                      <td className="p-3 font-bold text-amber-700 font-mono">
                        ₹{Number(remPay).toLocaleString("en-IN")}
                      </td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                            pStatus === "Paid" && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                            pStatus === "Pending" && "bg-amber-50 text-amber-700 border border-amber-200",
                            pStatus === "Partial" && "bg-blue-50 text-blue-700 border border-blue-200"
                          )}
                        >
                          {formatPaymentStatus(pStatus)}
                        </span>
                      </td>
                      <td className="p-3">
                        <select
                          value={t.status}
                          onChange={(e) => onChangeStatus(t, e.target.value as TaskStatus)}
                          className={cn(
                            "px-2 py-1 rounded text-[10px] font-bold border bg-transparent cursor-pointer",
                            statusBadgeClass(t.status)
                          )}
                        >
                          {TASK_STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3 max-w-[150px] truncate text-slate-500 text-[11px]" title={latestComment}>
                        {latestComment}
                      </td>
                      <td className="p-3 text-slate-700 font-semibold">{t.assignee || t.assignedEmployeeName || "—"}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onView(t)}
                            title="View Detail"
                          >
                            <Eye className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit(t)}
                            title="Edit Task"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                if (isLicenceSubModule) {
                  const ld = (t as any).licenseDetails;
                  const clientDob = formatDateDDMMYYYY(ld?.dateOfBirth);
                  
                  const targetAppKey = (t as any).applicationDocId || t.applicationId || (t as any).recordId || t.id;
                  const acc = accountingMap?.get(targetAppKey) || accountingMap?.get(t.applicationId || "");
                  const totalPay = acc?.totalPayment ?? ((t as any).amount || (t as any).totalAmount || 0);
                  const advPay = acc?.advancePayment ?? ((t as any).totalPaid || (t as any).advanceAmount || 0);
                  const remPay = acc?.remainingPayment ?? (typeof (t as any).pendingAmount === "number" ? (t as any).pendingAmount : Math.max(0, totalPay - advPay));
                  const rawStatus = acc?.paymentStatus ?? (t as any).paymentStatus ?? (remPay <= 0 ? "Paid" : advPay > 0 ? "Partially Paid" : "Pending");
                  const pStatus = rawStatus === "Partially Paid" ? "Partial" : rawStatus;
                  const refCode = t.applicationId || (t as any).reference || t.id;

                  const getExpiryForService = (srvName: string) => {
                    if (!ld) return t.dueDate || (t as any).expiryDate || "—";
                    if (srvName.includes("Learning") || srvName.includes("New Learning")) {
                      return ld.newLearningLicence?.step1?.expiryDate || ld.newLearningLicence?.appointmentDate || t.dueDate || "—";
                    }
                    if (srvName.includes("Endorsement")) {
                      return ld.dlNewLlEndorsement?.step2?.expiryDate || ld.dlNewLlEndorsement?.step3?.validityDate || t.dueDate || "—";
                    }
                    if (srvName.includes("Renew")) {
                      return ld.llRenewClass?.step1?.expiryDate || ld.llRenewClass?.step3?.validityDate || t.dueDate || "—";
                    }
                    return t.dueDate || (t as any).expiryDate || "—";
                  };

                  const appType = (t as any).applicationType || acc?.applicationType || "Home";
                  const latestComment = getLatestTaskComment(t);

                  return (
                    <tr key={t.id} style={getApplicationTypeStyle(appType)} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3 text-center font-mono text-slate-400 font-semibold">{srNo}</td>
                      <td className="p-3 font-mono text-slate-700 font-semibold">{refCode}</td>
                      <td className="p-3 font-bold text-blue-900">{info.clientName || "—"}</td>
                      <td className="p-3 font-mono text-slate-600">{clientDob}</td>
                      <td className="p-3 font-mono text-slate-700">{info.clientPhone || "—"}</td>
                      {licenseExpiryCols.length > 0
                        ? licenseExpiryCols.map((srv) => (
                            <td key={srv} className="p-3 font-mono text-slate-600">
                              {formatDateDDMMYYYY(getExpiryForService(srv))}
                            </td>
                          ))
                        : (
                          <td className="p-3 font-mono text-slate-600">
                            {formatDateDDMMYYYY(t.dueDate || (t as any).expiryDate)}
                          </td>
                        )}
                      <td className="p-3 font-bold text-slate-900 font-mono">
                        ₹{Number(totalPay).toLocaleString("en-IN")}
                      </td>
                      <td className="p-3 font-bold text-emerald-700 font-mono">
                        ₹{Number(advPay).toLocaleString("en-IN")}
                      </td>
                      <td className="p-3 font-bold text-amber-700 font-mono">
                        ₹{Number(remPay).toLocaleString("en-IN")}
                      </td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                            pStatus === "Paid" && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                            pStatus === "Pending" && "bg-amber-50 text-amber-700 border border-amber-200",
                            pStatus === "Partial" && "bg-blue-50 text-blue-700 border border-blue-200"
                          )}
                        >
                          {formatPaymentStatus(pStatus)}
                        </span>
                      </td>
                      <td className="p-3">
                        <select
                          value={t.status}
                          onChange={(e) => onChangeStatus(t, e.target.value as TaskStatus)}
                          className={cn(
                            "px-2 py-1 rounded text-[10px] font-bold border bg-transparent cursor-pointer",
                            statusBadgeClass(t.status)
                          )}
                        >
                          {TASK_STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3 max-w-[150px] truncate text-slate-500 text-[11px]" title={latestComment}>
                        {latestComment}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onView(t)}
                            title="View Detail"
                          >
                            <Eye className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit(t)}
                            title="Edit Task"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDuplicate(t)}
                            title="Duplicate Task"
                            className="text-emerald-600 hover:bg-emerald-50"
                          >
                            <Copy className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                const tRaw = t as any;
                const cleanVeh = tRaw.vehicleNumber || tRaw.vehicleId;
                const cleanVehNo = cleanVeh ? cleanVeh.trim().toUpperCase().replace(/[\s-]/g, "") : "";

                const linkedApp = applications.find((a: any) => {
                  const aAppId = a.applicationId ? a.applicationId.trim().toUpperCase() : "";
                  const tAppId = tRaw.applicationId ? tRaw.applicationId.trim().toUpperCase() : "";
                  const aVeh = a.vehicleNumber ? a.vehicleNumber.trim().toUpperCase().replace(/[\s-]/g, "") : "";
                  
                  return (
                    (tAppId && aAppId === tAppId) ||
                    a.id === tRaw.recordId ||
                    a.id === tRaw.applicationDocId ||
                    (tRaw.id && tRaw.id.replace("task-app-", "") === a.id) ||
                    (cleanVehNo && aVeh === cleanVehNo)
                  );
                });
                const appRaw = linkedApp as any || {};
                const v = appRaw.vehicleDetails || appRaw.vehicleMaster || appRaw || {};
                
                const appCreatedDate = linkedApp?.createdAt || tRaw.createdDate || tRaw.createdAt;
                const taskCreatedDateStr = formatDateDDMMYYYY(appCreatedDate);
                
                const vehicleNumber = tRaw.vehicleNumber || tRaw.vehicleId || linkedApp?.vehicleNumber || "—";
                const ownerName = tRaw.clientName || tRaw.ownerName || linkedApp?.ownerName || "—";
                
                const srvList = linkedApp?.services || (tRaw.serviceName ? tRaw.serviceName.split(",").map((s: string) => s.trim()).filter(Boolean) : []);
                const totalServices = srvList.length || 1;
                
                const assignedEmployee = tRaw.assignedEmployeeName || tRaw.assignee || linkedApp?.assignedEmployeeName || "Unassigned";

                const latestComment = getLatestTaskComment(t);
                
                const pucExp = formatDateDDMMYYYY(appRaw.pucExpiryDate || v.pucExpiryDate || v.pucDetails?.expiryDate);
                const taxExp = formatDateDDMMYYYY(appRaw.taxExpiryDate || v.taxExpiryDate || v.taxDetails?.expiryDate);
                const fitExp = formatDateDDMMYYYY(appRaw.fitnessExpiryDate || v.fitnessExpiryDate || v.fitnessDetails?.expiryDate);
                const insExp = formatDateDDMMYYYY(appRaw.insuranceExpiryDate || v.insuranceExpiryDate || v.insuranceDetails?.expiryDate);
                const natPermitExp = formatDateDDMMYYYY(appRaw.nationalPermitExpiryDate || v.nationalPermitExpiryDate || v.permitDetails?.nationalPermitExpiryDate);
                const gujPermitExp = formatDateDDMMYYYY(appRaw.gujaratPermitExpiryDate || v.gujaratPermitExpiryDate || v.permitDetails?.gujaratPermitExpiryDate);
                
                const acc = accountingMap?.get(linkedApp?.id || "") || accountingMap?.get(tRaw.applicationId || "") || accountingMap?.get(tRaw.id);
                const totalPay = acc?.totalPayment ?? linkedApp?.amount ?? tRaw.amount ?? 0;
                const advPay = acc?.advancePayment ?? linkedApp?.totalPaid ?? tRaw.totalPaid ?? 0;
                
                const appNo = tRaw.applicationId || linkedApp?.applicationId || "—";
                const appType = tRaw.applicationType || linkedApp?.applicationType || "Home";
                const clientNumber = tRaw.clientPhone || tRaw.ownerPhone || tRaw.mobileNumber || tRaw.phone || linkedApp?.mobileNumber || linkedApp?.phone || linkedApp?.ownerPhone || "—";
                const reference = tRaw.reference || linkedApp?.reference || "—";

                return (
                  <tr key={t.id} style={getApplicationTypeStyle(appType)} className="hover:bg-slate-50/40 border-b border-slate-100 transition-colors">
                    <td className="p-3 font-mono text-gray-500 font-semibold text-center">{srNo}</td>
                    <td className="p-3 font-mono">{taskCreatedDateStr}</td>
                    <td className="p-3 font-mono text-[11px] text-gray-600">
                      {vehicleNumber !== "—" ? (
                        <span className="flex items-center gap-1 font-bold">
                          <Car className="size-3 text-muted-foreground" /> {vehicleNumber}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3 text-xs font-semibold text-slate-800" title={srvList.join(", ")}>
                      <div className="max-w-[120px] truncate">
                        {srvList.join(", ")}
                      </div>
                    </td>
                    <td className="p-3 font-bold text-slate-900" title={ownerName}>
                      {ownerName}
                    </td>
                    <td className="p-3 font-mono text-slate-700">
                      {clientNumber}
                    </td>
                    <td className="p-3">
                      <select
                        value={t.status}
                        onChange={(e) => onChangeStatus(t, e.target.value as TaskStatus)}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold border bg-transparent cursor-pointer",
                          statusBadgeClass(t.status),
                        )}
                      >
                        {TASK_STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 max-w-[150px] truncate text-slate-500 text-[11px]" title={latestComment}>
                      {latestComment}
                    </td>
                    <td className="p-3 font-bold text-blue-600 font-mono text-sm tracking-wide">
                      {appNo}
                    </td>
                    <td className="p-3 font-mono text-slate-600 truncate max-w-[100px]" title={reference}>
                      {reference}
                    </td>
                    <td className="p-3 text-slate-700 font-semibold" title={assignedEmployee}>
                      {assignedEmployee}
                    </td>
                    <td className="p-3 font-mono text-slate-600">{pucExp}</td>
                    <td className="p-3 font-mono text-slate-600">{taxExp}</td>
                    <td className="p-3 font-mono text-slate-600">{fitExp}</td>
                    {activeSubModule !== "services" && <td className="p-3 font-mono text-slate-600">{insExp}</td>}
                    <td className="p-3 font-mono text-slate-600">{natPermitExp}</td>
                    <td className="p-3 font-mono text-slate-600">{gujPermitExp}</td>
                    <td className="p-3 font-bold text-slate-900 font-mono">
                      ₹{Number(totalPay).toLocaleString("en-IN")}
                    </td>
                    <td className="p-3 font-bold text-emerald-700 font-mono">
                      ₹{Number(advPay).toLocaleString("en-IN")}
                    </td>
                    <td className="p-3">
                      <ApplicationTypeBadge appType={appType} />
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onView(t)}
                          title="View Detail"
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        {(() => {
                          const canEdit = true;
                          return canEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onEdit(t)}
                              title="Edit Task"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                          );
                        })()}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDuplicate(t)}
                          title="Duplicate Task"
                          className="text-emerald-600 hover:bg-emerald-50"
                        >
                          <Copy className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onAddRemark(t)}
                          title="Add Remark"
                        >
                          <MessageSquare className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginatedTasks.length === 0 && (
                <tr>
                  <td colSpan={25} className="p-6 text-center text-muted-foreground">
                    No tasks match the active filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="p-3 bg-slate-50 border-t flex items-center justify-between text-xs text-muted-foreground select-none">
            <span>
              Page {currentPage} of {totalPages} ({tasks.length} total tasks)
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Professional Task Cards Component ──────────────────────────────────────
function TaskCards({
  tasks,
  clients,
  leads,
  vehicles,
  isAdmin,
  session,
  onView,
  onEdit,
  onDelete,
  onToggleDone,
  onAddRemark,
  onChangeStatus,
  onDuplicate,
  accountingMap,
  activeSubModule = "services",
}: {
  tasks: Task[];
  clients: RegistryRecord[];
  leads: RegistryRecord[];
  vehicles: any[];
  isAdmin: boolean;
  session: any;
  onView: (t: Task) => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  onToggleDone: (t: Task, v: boolean) => void;
  onAddRemark: (t: Task) => void;
  onChangeStatus: (t: Task, s: TaskStatus) => void;
  onDuplicate: (t: Task) => void;
  accountingMap?: Map<string, AccountingRecord>;
  activeSubModule?: SubModuleType;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 9; // 3 columns * 3 rows looks best

  const totalPages = Math.ceil(tasks.length / pageSize);
  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return tasks.slice(start, start + pageSize);
  }, [tasks, currentPage]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {paginatedTasks.map((t) => {
          const info = getTaskInfoHelper(t, clients, leads, vehicles);
          const latestRemark = t.remarks || "No Remarks";
          const displayRemark = latestRemark.length > 70 ? latestRemark.slice(0, 70) + "..." : latestRemark;
          
          return (
            <div key={t.id} style={getApplicationTypeStyle(t.applicationType)} className="border rounded-xl p-4 shadow-sm hover:shadow-md transition flex flex-col justify-between gap-3 min-h-[220px]">
              <div className="space-y-2">
                {/* Header status and priority badges */}
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold border", priorityBadgeClass(t.priority))}>
                    {t.priority}
                  </span>
                  <select
                    value={t.status}
                    onChange={(e) => onChangeStatus(t, e.target.value as TaskStatus)}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-bold border bg-transparent cursor-pointer",
                      statusBadgeClass(t.status),
                    )}
                  >
                    {TASK_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Task Name */}
                <h4 className="font-semibold text-gray-900 text-sm truncate" title={info.taskName}>
                  {info.taskName}
                </h4>

                {/* Details list */}
                <div className="text-xs space-y-1 text-gray-600">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Client:</span>
                    <span className="font-bold text-primary max-w-[150px] truncate" title={info.clientName}>{info.clientName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Service:</span>
                    <span className="font-semibold truncate max-w-[150px]" title={info.service}>{info.service}</span>
                  </div>
                  {info.vehicleNum && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vehicle:</span>
                      <span className="font-mono text-[10px]">{info.vehicleNum}</span>
                    </div>
                  )}
                  {t.applicationId && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">App ID:</span>
                      <span className="font-mono font-semibold">{t.applicationId}</span>
                    </div>
                  )}
                  {t.applicationType && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">App Type:</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border" style={getApplicationTypeStyle(t.applicationType)}>
                        {t.applicationType}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Assignee:</span>
                    <span>{t.assignedEmployeeName || "Former Employee"}</span>
                  </div>
                  {t.appointmentDate && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Appt Date:</span>
                      <span className="font-mono text-primary font-semibold">{formatDateDDMMYYYY(t.appointmentDate)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Due Date:</span>
                    <span className="font-mono">{formatDateDDMMYYYY(t.dueDate)}</span>
                  </div>
                </div>

                {/* Remarks section */}
                <div className="border-t pt-2 mt-2">
                  <div className="text-[10px] uppercase font-bold text-gray-400">Remarks</div>
                  <p className="text-xs text-gray-600 italic mt-0.5 cursor-help" title={latestRemark}>
                    {displayRemark}
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="border-t pt-2 flex items-center justify-between gap-1 mt-auto">
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onView(t)} title="View Detail">
                    <Eye className="size-3.5" />
                  </Button>
                  {(() => {
                    const canEdit = true;
                    return canEdit && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onEdit(t)} title="Edit Task">
                        <Pencil className="size-3.5" />
                      </Button>
                    );
                  })()}
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50" onClick={() => onDuplicate(t)} title="Duplicate Task">
                    <Copy className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onAddRemark(t)} title="Add Remark">
                    <MessageSquare className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {paginatedTasks.length === 0 && (
        <div className="p-6 text-center text-muted-foreground border rounded-xl bg-white shadow-sm">
          No tasks match the active filters.
        </div>
      )}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="p-3 bg-slate-50 border rounded-xl flex items-center justify-between text-xs text-muted-foreground select-none">
          <span>
            Page {currentPage} of {totalPages} ({tasks.length} total tasks)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(currentPage - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Task Form Dialog ────────────────────────────────────────────────────────
function TaskFormDialog({
  open,
  onClose,
  editing,
  clients,
  leads,
  vehicles,
  employees,
  actor,
  isAdmin,
  activeSubModule,
}: {
  open: boolean;
  onClose: () => void;
  editing: Task | null;
  clients: RegistryRecord[];
  leads: RegistryRecord[];
  vehicles: any[];
  employees: any[];
  actor: string;
  isAdmin: boolean;
  activeSubModule: SubModuleType;
}) {
  const [title, setTitle] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [assignedEmployeeId, setAssignedEmployeeId] = useState("");
  const [assignedEmployeeName, setAssignedEmployeeName] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [status, setStatus] = useState<TaskStatus>("Read");
  const [associationType, setAssociationType] = useState<AssociationType>("client");
  const [recordId, setRecordId] = useState<string>("");
  const [vehicleId, setVehicleId] = useState<string>("");
  const [recordSearch, setRecordSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [dueDate, setDueDate] = useState<string>("");
  const [dueTime, setDueTime] = useState<string>("");
  const [appointmentDate, setAppointmentDate] = useState<string>("");
  const [reminderMinutes, setReminderMinutes] = useState<string>("0");
  const [saving, setSaving] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [applicationType, setApplicationType] = useState("Home");

  // Subtasks and Templates
  const [checklist, setChecklist] = useState<TaskSubtask[]>([]);
  const [newSubtaskInput, setNewSubtaskInput] = useState("");
  const [dbTemplates, setDbTemplates] = useState<TaskTemplate[]>([]);

  useEffect(() => {
    if (!open) return;
    const unsub = subscribeToTemplates((data) => {
      setDbTemplates(data);
    });
    return unsub;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setServiceName(editing.serviceName ?? "");
      setDescription(editing.description ?? "");
      setRemarks(editing.remarks ?? "");
      setApplicationId(editing.applicationId ?? "");
      setApplicationType(editing.applicationType ?? "Home");
      const activeEmployees = employees.filter((e) => e.status === "active" && !e.isDeleted);
      const matchedEmp = activeEmployees.find(e =>
        e.id === editing.assignee ||
        e.employeeId === editing.assignee ||
        e.username === editing.assignee ||
        e.fullName === editing.assignee
      );
      setAssignee(matchedEmp?.id || editing.assignee || "");
      setAssignedEmployeeId(matchedEmp?.employeeId || editing.assignedEmployeeId || matchedEmp?.id || "");
      setAssignedEmployeeName(matchedEmp?.fullName || matchedEmp?.name || matchedEmp?.username || editing.assignedEmployeeName || "");
      setPriority(editing.priority);
      setStatus(editing.status);
      setAssociationType(editing.associationType);
      setRecordId(editing.recordId ?? "");
      setVehicleId(editing.vehicleId ?? "");
      const existingName = editing.clientName ||
        (editing.associationType === "client" ? clients : leads).find(c => c.id === editing.recordId)?.name || "";
      setRecordSearch(existingName);
      if (editing.dueDate) {
        const d = new Date(editing.dueDate);
        setDueDate(d.toISOString().slice(0, 10));
        setDueTime(d.toTimeString().slice(0, 5));
      } else {
        setDueDate("");
        setDueTime("");
      }
      setAppointmentDate(editing.appointmentDate ? editing.appointmentDate.slice(0, 10) : "");
      setReminderMinutes(String(editing.reminderMinutes ?? 0));
      setChecklist(editing.subtasks ?? []);
    } else {
      setTitle("");
      setServiceName("");
      setDescription("");
      setRemarks("");
      setApplicationId("");
      setApplicationType("Home");
      const activeEmployees = employees.filter((e) => e.status === "active" && !e.isDeleted);
      const defaultEmp = activeEmployees.find((e) => e.role === "admin" || e.username === "admin") || activeEmployees[0];
      setAssignee(defaultEmp?.id || "");
      setAssignedEmployeeId(defaultEmp?.employeeId || defaultEmp?.id || "");
      setAssignedEmployeeName(defaultEmp?.fullName || defaultEmp?.name || defaultEmp?.username || "");
      setPriority("Medium");
      setStatus("Read");
      setAssociationType("client");
      setRecordId("");
      setVehicleId("");
      setRecordSearch("");
      setDueDate("");
      setDueTime("");
      setAppointmentDate("");
      setReminderMinutes("0");
      setChecklist([]);
    }
  }, [open, editing, employees, clients, leads]);

  const templatesList = useMemo(() => {
    if (dbTemplates.length > 0) return dbTemplates;
    return DEFAULT_TEMPLATES_SPEC.map((s, i) => ({
      id: `fallback-spec-${i}`,
      templateName: s.templateName,
      serviceType: s.serviceType,
      subtasks: s.subtasks,
      isDefault: true,
      createdBy: "system",
      createdAt: new Date().toISOString()
    })) as TaskTemplate[];
  }, [dbTemplates]);

  // Handle service templates lookup
  const handleServiceSelect = (val: string) => {
    setServiceName(val);
    if (!title.trim()) {
      setTitle(`${val} Processing`);
    }
    const selectedTpl = templatesList.find((t) => t.templateName === val);
    if (selectedTpl && selectedTpl.subtasks) {
      const generated: TaskSubtask[] = selectedTpl.subtasks.map((sub) => ({
        id: crypto.randomUUID(),
        title: sub,
        completed: false,
      }));
      setChecklist(generated);
    }
  };

  const clientVehicles = useMemo(() => {
    if (!recordId) return [];
    return vehicles.filter((v) => v.clientId === recordId);
  }, [recordId, vehicles]);

  const recordOptions = useMemo(() => {
    const src = associationType === "client" ? clients : associationType === "lead" ? leads : [];
    const q = recordSearch.toLowerCase().trim();
    if (!q) return src.slice(0, 30);
    return src
      .filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.mvNo.toLowerCase().includes(q) ||
          r.work.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [associationType, clients, leads, recordSearch]);

  const addManualSubtask = () => {
    if (!newSubtaskInput.trim()) return;
    const item: TaskSubtask = {
      id: crypto.randomUUID(),
      title: newSubtaskInput.trim(),
      completed: false,
    };
    setChecklist([...checklist, item]);
    setNewSubtaskInput("");
  };

  const removeSubtaskItem = (index: number) => {
    setChecklist(checklist.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!title.trim() || !assignee) return;
    if (associationType === "none" || !recordId) {
      toast.error("Connecting a Client or Lead is required.");
      return;
    }
    setSaving(true);
    try {
      const dueIso = dueDate
        ? new Date(`${dueDate}T${dueTime || "09:00"}:00`).toISOString()
        : undefined;
      const bucket: Bucket | undefined =
        associationType === "client" ? "clients" : associationType === "lead" ? "leads" : undefined;
      const rec = recordId || undefined;
      const activeClientName = (associationType === "client" ? clients : associationType === "lead" ? leads : [])
        .find(c => c.id === rec)?.name || "";

      if (editing) {
        await updateTask(
          editing.id,
          {
            title: title.trim(),
            serviceName: serviceName.trim(),
            description,
            assignee,
            priority,
            status,
            done: status === "Completed",
            dueDate: dueIso,
            appointmentDate: appointmentDate ? new Date(appointmentDate).toISOString() : undefined,
            reminderMinutes: Number(reminderMinutes) || 0,
            associationType,
            bucket,
            recordId: rec,
            vehicleId: vehicleId || undefined,
            assignedEmployeeId,
            assignedEmployeeName,
            clientName: activeClientName,
            serviceType: serviceName.trim(),
            remarks: remarks.trim(),
            applicationId: applicationId.trim(),
            applicationType: applicationType,
            subModule: activeSubModule,
          },
          actor,
          "Task edited",
        );
      } else {
        await createManualTask({
          title: title.trim(),
          serviceName: serviceName.trim(),
          description,
          assignee,
          priority,
          status,
          dueDate: dueIso,
          appointmentDate: appointmentDate ? new Date(appointmentDate).toISOString() : undefined,
          reminderMinutes: Number(reminderMinutes) || 0,
          associationType,
          bucket,
          recordId: rec,
          vehicleId: vehicleId || undefined,
          createdBy: actor,
          subtasks: checklist,
          assignedEmployeeId,
          assignedEmployeeName,
          clientId: rec,
          clientName: activeClientName,
          serviceType: serviceName.trim(),
          remarks: remarks.trim(),
          applicationId: applicationId.trim(),
          applicationType: applicationType,
          subModule: activeSubModule,
        });
      }
      onClose();
    } catch (error) {
      console.error("❌ Task operation failed:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`Failed to ${editing ? "update" : "create"} task:\n\n${message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit task" : "Create new task"}</DialogTitle>
          <DialogDescription>
            {isAdmin
              ? "Assign work to a staff member and link it to a client or lead."
              : "Update this task's details."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Predefined Task Selector Dropdown */}
          <div className="grid gap-1.5">
            <Label>Predefined Task (Pre-populates Checklist)</Label>
            <Select value={serviceName} onValueChange={handleServiceSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Choose predefined task..." />
              </SelectTrigger>
              <SelectContent>
                {templatesList.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.templateName}>
                    {tpl.templateName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Task title *</Label>
            <Input
              required
              placeholder="Enter task name (e.g. Insurance Renewal Processing)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Description</Label>
            <Textarea
              placeholder="Details of the job…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Remarks</Label>
            <Textarea
              placeholder="Remarks or latest status updates..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Application Number</Label>
            <Input
              placeholder="e.g. APL-2026-9926 (Enter manually or leave empty)"
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-3">
            <div className="grid gap-1.5">
              <Label>Link connection *</Label>
              <Select
                value={associationType}
                onValueChange={(v) => {
                  setAssociationType(v as AssociationType);
                  setRecordId("");
                  setRecordSearch("");
                  setVehicleId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Link to Client</SelectItem>
                  <SelectItem value="lead">Link to Lead</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5 relative">
              <Label>Search & select {associationType} *</Label>
              <div className="relative">
                <Input
                  placeholder="Type to search registry…"
                  value={recordSearch}
                  onChange={(e) => {
                    setRecordSearch(e.target.value);
                    setShowDropdown(true);
                    if (recordId) {
                      setRecordId("");
                      setVehicleId("");
                    }
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => {
                    setTimeout(() => setShowDropdown(false), 200);
                  }}
                  className="pr-8"
                />
                {recordSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecordSearch("");
                      setRecordId("");
                      setVehicleId("");
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 size-4 flex items-center justify-center rounded-full hover:bg-slate-100 transition"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>

              {showDropdown && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl divide-y divide-slate-50">
                  {recordOptions.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                      }}
                      onClick={() => {
                        setRecordId(o.id);
                        setRecordSearch(o.name);
                        setVehicleId("");
                        setShowDropdown(false);
                      }}
                      className={`w-full text-left px-3.5 py-2.5 text-xs hover:bg-slate-50 transition flex flex-col gap-0.5 ${
                        recordId === o.id ? "bg-slate-50 font-semibold" : "text-gray-700"
                      }`}
                    >
                      <span className="font-semibold text-gray-900 flex items-center gap-1.5">
                        {o.name}
                        {recordId === o.id && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-extrabold bg-green-100 text-green-800">
                            Selected
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {o.mvNo ? `🚘 ${o.mvNo}` : ""} {o.work ? `• ⚙️ ${o.work}` : ""}
                      </span>
                    </button>
                  ))}
                  {recordOptions.length === 0 && (
                    <div className="p-3 text-center text-xs text-muted-foreground italic">
                      No matching {associationType}s found
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Vehicle Dropdown */}
          {associationType === "client" && recordId && (
            <div className="grid gap-1.5 border-t pt-3">
              <Label>Link Vehicle (Optional)</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select linked vehicle..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Vehicle Linked</SelectItem>
                  {clientVehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.vehicleNumber} {v.makeModel ? `— ${v.makeModel}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Checklist configurator preview / edit */}
          <div className="p-3 bg-slate-50 border rounded-lg space-y-2.5">
            <span className="text-[10px] uppercase font-bold text-gray-500 block">
              Configure Subtask Checklist
            </span>

            {/* Quick append input */}
            <div className="flex gap-2">
              <Input
                placeholder="Add custom subtask item..."
                value={newSubtaskInput}
                onChange={(e) => setNewSubtaskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addManualSubtask();
                  }
                }}
              />
              <Button type="button" size="sm" onClick={addManualSubtask}>
                Add
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-xs text-gray-600 max-h-40 overflow-y-auto pr-1">
              {checklist.map((st, i) => (
                <div
                  key={st.id || i}
                  className="flex items-center justify-between gap-2 bg-white p-1.5 rounded border"
                >
                  <span className="truncate">
                    {i + 1}. {st.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSubtaskItem(i)}
                    className="text-red-500 hover:text-red-800"
                  >
                    <Trash2 className="size-3 shrink-0" />
                  </button>
                </div>
              ))}
              {checklist.length === 0 && (
                <span className="text-xs text-muted-foreground italic col-span-2">
                  No checklist items configured
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-3">
            <div className="grid gap-1.5">
              <Label>Assignee *</Label>
              <Select value={assignee} onValueChange={(val) => {
                setAssignee(val);
                const activeEmployees = employees.filter((e) => e.status === "active" && !e.isDeleted);
                const emp = activeEmployees.find(e => e.id === val);
                if (emp) {
                  setAssignedEmployeeId(emp.employeeId || emp.id || "");
                  setAssignedEmployeeName(emp.fullName || emp.name || emp.username || "");
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select assignee..." />
                </SelectTrigger>
                <SelectContent>
                  {employees
                    .filter((e) => e.status === "active" && !e.isDeleted)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.fullName || s.name || s.username}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {editing && (
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-3">
            <div className="grid gap-1.5">
              <Label>Appointment Date (Optional)</Label>
              <Input
                type="date"
                value={appointmentDate}
                onChange={(e) => setAppointmentDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-3">
            <div className="grid gap-1.5">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Due time</Label>
              <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Reminder</Label>
              <Select value={reminderMinutes} onValueChange={setReminderMinutes}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No reminder</SelectItem>
                  <SelectItem value="15">15 minutes before</SelectItem>
                  <SelectItem value="30">30 minutes before</SelectItem>
                  <SelectItem value="60">1 hour before</SelectItem>
                  <SelectItem value="1440">1 day before</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-3 mt-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : editing ? (
              "Save Changes"
            ) : (
              "Create Task"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Task Details Sheet ──────────────────────────────────────────────────────
function TaskDetailsSheet({
  open,
  onClose,
  task: initialTask,
  clients,
  leads,
  vehicles,
  employees,
  v2Services = [],
  actor,
  isAdmin,
  onEdit,
  activeSubModule = "services",
  onTriggerCompleteModal,
  onTriggerHoldModal,
}: {
  open: boolean;
  onClose: () => void;
  task: Task;
  clients: RegistryRecord[];
  leads: RegistryRecord[];
  vehicles: any[];
  employees: any[];
  v2Services?: any[];
  actor: string;
  isAdmin: boolean;
  onEdit: (t: Task) => void;
  activeSubModule?: SubModuleType;
  onTriggerCompleteModal?: (t: Task) => void;
  onTriggerHoldModal?: (t: Task) => void;
}) {
  const [activeTab, setActiveTab] = useState<"details" | "comments" | "attachments" | "activity">("details");
  const [remarkInput, setRemarkInput] = useState("");
  const [comment, setComment] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [liveTask, setLiveTask] = useState<Task | null>(null);
  
  const [expectedDate, setExpectedDate] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [sheetApplicationId, setSheetApplicationId] = useState("");
  const [sheetApplicationType, setSheetApplicationType] = useState("Home");
  const [licenseForm, setLicenseForm] = useState<any>(null);

  const updateLicenseField = (path: string, value: any) => {
    setLicenseForm((prev: any) => {
      const updated = prev ? { ...prev } : {};
      const parts = path.split(".");
      let current = updated;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          current[parts[i]] = {};
        }
        current[parts[i]] = { ...current[parts[i]] };
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
      return updated;
    });
  };
  
  // Vahaan specific states
  const [showVahaanHoldModal, setShowVahaanHoldModal] = useState(false);
  const [vahaanHoldTask, setVahaanHoldTask] = useState<Task | null>(null);
  const [vahaanHoldReason, setVahaanHoldReason] = useState("");
  const [vahaanHoldDate, setVahaanHoldDate] = useState("");
  const [showVahaanCompleteModal, setShowVahaanCompleteModal] = useState(false);
  const [vahaanCompleteTask, setVahaanCompleteTask] = useState<Task | null>(null);
  const [vahaanRtoReceiptNo, setVahaanRtoReceiptNo] = useState("");
  const [vahaanAppointmentDate, setVahaanAppointmentDate] = useState("");

  const [showLicenseStepModal, setShowLicenseStepModal] = useState(false);
  const [licenseStepDate, setLicenseStepDate] = useState("");
  const [licenseStepModalData, setLicenseStepModalData] = useState<{
    currentStep: number;
    nextStep: number;
  } | null>(null);

  const [sheetApptDate, setSheetApptDate] = useState("");

  const assignedEmp = useMemo(() => {
    return (
      employees.find(
        (e) =>
          e.id === (liveTask?.assignee || initialTask.assignee) ||
          e.employeeId === (liveTask?.assignee || initialTask.assignee) ||
          e.username === (liveTask?.assignee || initialTask.assignee) ||
          e.fullName === (liveTask?.assignee || initialTask.assignee)
      ) ?? null
    );
  }, [liveTask, initialTask.assignee, employees]);

  const [linkedApp, setLinkedApp] = useState<any>(null);
  const [fullAppModalOpen, setFullAppModalOpen] = useState(false);

  useEffect(() => {
    if (!open || !initialTask.id) return;
    setLiveTask(null);
    setLinkedApp(null);
    setLicenseForm(null);
    setRemarkInput("");
    
    setSelectedStatus(initialTask.status || "Read");
    setSheetApplicationId(initialTask.applicationId || "");
    setSheetApplicationType(initialTask.applicationType || "Home");
    const initCurrentStep = (initialTask as any).currentStep || 1;
    const initStepAppts = (initialTask as any).stepAppointments || {};
    const initAppt = initStepAppts[initCurrentStep] || initialTask.appointmentDate || "";
    setSheetApptDate(initAppt ? ensureYYYYMMDD(initAppt) : "");

    if (initialTask.dueDate) {
      const d = new Date(initialTask.dueDate);
      if (!isNaN(d.getTime())) {
        setExpectedDate(d.toISOString().slice(0, 10));
      } else {
        setExpectedDate("");
      }
    } else {
      setExpectedDate("");
    }

    const unsubTasks = onSnapshot(doc(db, "registry_tasks", initialTask.id), (snap) => {
      let currentTask: Task | null = null;
      if (snap.exists()) {
        currentTask = { id: snap.id, ...snap.data() } as Task;
      } else {
        currentTask = initialTask;
      }

      setLiveTask(currentTask);
      setSelectedStatus(currentTask.status || "Read");
      setSheetApplicationId(currentTask.applicationId || "");
      setSheetApplicationType(currentTask.applicationType || "Home");
      const cStep = (currentTask as any).currentStep || 1;
      const stepAppts = (currentTask as any).stepAppointments || {};
      const appt = stepAppts[cStep] || currentTask.appointmentDate || "";
      setSheetApptDate(appt ? ensureYYYYMMDD(appt) : "");

      if (currentTask.dueDate) {
        const d = new Date(currentTask.dueDate);
        if (!isNaN(d.getTime())) {
          setExpectedDate(d.toISOString().slice(0, 10));
        } else {
          setExpectedDate("");
        }
      } else {
        setExpectedDate("");
      }

      const targetAppId = (currentTask as any).applicationDocId || currentTask.recordId || currentTask.applicationId || currentTask.id.replace("task-app-", "");
      if (targetAppId) {
        getDoc(doc(db, "registry_applications_v1", targetAppId)).then((aSnap) => {
          if (aSnap.exists()) {
            const appData: any = { id: aSnap.id, ...aSnap.data() };
            setLinkedApp(appData);
            setLicenseForm(appData.licenseDetails || {});
          }
        }).catch(console.error);
      }
    });

    return () => unsubTasks();
  }, [open, initialTask.id]);

  const activeTask = useMemo(() => {
    const base = liveTask || initialTask;
    const svc = v2Services.find(
      (s: any) =>
        s.id === (base as any).serviceId ||
        s.id === base.id ||
        (s.vehicleId === base.vehicleId && s.serviceType === base.serviceName),
    );
    const cStep = (base as any).currentStep || 1;
    const stepAppts = (base as any).stepAppointments || {};
    const stepAppt = stepAppts[cStep] || base.appointmentDate || svc?.appointmentDate || "";

    return {
      ...base,
      applicationId: base.applicationId || svc?.applicationId || "",
      applicationType: base.applicationType || svc?.applicationType || "",
      appointmentDate: stepAppt,
      currentStep: cStep,
      stepAppointments: stepAppts,
      stepHistory: (base as any).stepHistory || {},
    };
  }, [liveTask, initialTask, v2Services]);

  const handleSaveProgress = async () => {
    try {
      if (activeSubModule === "services" && selectedStatus === "ON HOLD") {
        setVahaanHoldTask(activeTask);
        setVahaanHoldReason(activeTask.holdReason || "");
        setVahaanHoldDate((activeTask as any).holdDate || new Date().toISOString().split("T")[0]);
        setShowVahaanHoldModal(true);
        return;
      }
      if (activeSubModule === "services" && selectedStatus === "COMPLETED") {
        setVahaanCompleteTask(activeTask);
        setVahaanRtoReceiptNo((activeTask as any).rtoReceiptNo || "");
        setVahaanAppointmentDate(activeTask.appointmentDate || new Date().toISOString().split("T")[0]);
        setShowVahaanCompleteModal(true);
        return;
      }
      
      const isLicenceTask = (activeTask.applicationType === "Licence" || (activeTask as any).subModule === "licence");
      const currentStep = (activeTask as any).currentStep || 1;
      let formattedApptDate = sheetApptDate ? formatDateDDMMYYYY(sheetApptDate) : "";

      const existingStepAppts = (activeTask as any).stepAppointments || {};
      const updatedStepAppts = {
        ...existingStepAppts,
        [currentStep]: formattedApptDate || existingStepAppts[currentStep] || "",
      };

      const updates: any = {
        status: selectedStatus,
        done: selectedStatus === "Completed" || selectedStatus === "COMPLETED",
        applicationId: sheetApplicationId.trim(),
        applicationType: sheetApplicationType,
        licenseDetails: licenseForm || {},
        currentStep: currentStep,
        stepAppointments: updatedStepAppts,
      };

      if (formattedApptDate) {
        updates.appointmentDate = formattedApptDate;
      }

      const appDocId = (activeTask as any).applicationDocId || activeTask.recordId || activeTask.id.replace("task-app-", "");
      if (appDocId) {
        const appRef = doc(db, "registry_applications_v1", appDocId);
        const appUpdates: any = {
          applicationId: sheetApplicationId.trim(),
          applicationType: sheetApplicationType,
          licenseDetails: licenseForm || {},
          "licenseDetails.currentStep": currentStep,
          "licenseDetails.stepAppointments": updatedStepAppts,
          updatedAt: new Date().toISOString(),
        };
        if (formattedApptDate) {
          appUpdates.appointmentDate = formattedApptDate;
        }
        await setDoc(appRef, appUpdates, { merge: true }).catch(() => {});
        await syncAccountingRecord(appDocId, {
          applicationId: sheetApplicationId.trim()
        }).catch(console.error);
      }
      
      if (expectedDate) {
        const d = new Date(expectedDate);
        if (!isNaN(d.getTime())) {
          updates.dueDate = d.toISOString();
        }
      }
      if (selectedStatus === "Completed") {
        const now = new Date().toISOString();
        updates.completedAt = now;
        updates.completedOn = now;
        updates.completedBy = actor;
      }
      
      if (remarkInput.trim()) {
        await addComment(activeTask.id, actor, remarkInput.trim());
        setRemarkInput("");
      }
      
      await updateTask(activeTask.id, updates, actor, isLicenceTask && formattedApptDate ? `Updated Step ${currentStep} Appointment Date: ${formattedApptDate}` : "Progress updated");
      toast.success("Progress saved successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save progress");
    }
  };

  const handleMarkCompleted = async () => {
    try {
      const isLicenceTask = (activeTask.applicationType === "Licence" || (activeTask as any).subModule === "licence");
      const lic = (activeTask as any).licenseDetails || linkedApp?.licenseDetails || {};
      const maxSteps = isLicenceTask ? getLicenseMaxSteps(lic) : 1;
      const currentStep = (activeTask as any).currentStep || 1;

      if (isLicenceTask && currentStep < maxSteps) {
        const nextStep = currentStep + 1;
        setLicenseStepModalData({
          currentStep,
          nextStep,
        });
        const existingNextAppt = (activeTask as any).stepAppointments?.[nextStep] || "";
        setLicenseStepDate(existingNextAppt ? ensureYYYYMMDD(existingNextAppt) : new Date().toISOString().slice(0, 10));
        setShowLicenseStepModal(true);
        return;
      }

      const now = new Date().toISOString();
      const statusVal = activeSubModule === "services" ? "COMPLETED" : "Completed";
      const updates: any = {
        status: statusVal as TaskStatus,
        done: true,
        completedAt: now,
        completedOn: now,
        completedBy: actor,
      };
      
      if (isLicenceTask) {
        const existingHistory = (activeTask as any).stepHistory || {};
        updates.stepHistory = {
          ...existingHistory,
          [currentStep]: {
            stepNumber: currentStep,
            completedAt: now,
            completedBy: actor,
            appointmentDate: activeTask.appointmentDate || "",
            status: "Completed",
          }
        };
      }

      if (activeSubModule === "services") {
        setVahaanCompleteTask(activeTask);
        setVahaanRtoReceiptNo((activeTask as any).rtoReceiptNo || "");
        setVahaanAppointmentDate(activeTask.appointmentDate || new Date().toISOString().split("T")[0]);
        setShowVahaanCompleteModal(true);
        return;
      }
      
      if (remarkInput.trim()) {
        await addComment(activeTask.id, actor, remarkInput.trim());
        setRemarkInput("");
      }
      
      await updateTask(activeTask.id, updates, actor, isLicenceTask ? `Step ${currentStep} completed. Final Licence Step Completed.` : "Marked task as completed");
      toast.success("Task marked as completed!");
    } catch (err: any) {
      toast.error(err.message || "Failed to mark completed");
    }
  };

  const handleTriggerCompleteFlow = () => {
    const isLicenceTask = (activeTask.applicationType === "Licence" || (activeTask as any).subModule === "licence");
    const lic = (activeTask as any).licenseDetails || linkedApp?.licenseDetails || {};
    const maxSteps = isLicenceTask ? getLicenseMaxSteps(lic) : 1;
    const currentStep = (activeTask as any).currentStep || 1;

    if (isLicenceTask && currentStep < maxSteps) {
      handleMarkCompleted();
    } else {
      if (onTriggerCompleteModal) {
        onTriggerCompleteModal(activeTask);
      }
    }
  };

  const linked = useMemo(() => {
    if (!activeTask.recordId) return null;
    const src = activeTask.bucket === "leads" ? leads : clients;
    return src.find((r) => r.id === activeTask.recordId) ?? null;
  }, [activeTask, clients, leads]);

  const linkedVehicle = useMemo(() => {
    if (!activeTask.vehicleId) return null;
    return vehicles.find((v) => v.id === activeTask.vehicleId) ?? null;
  }, [activeTask, vehicles]);

  const sortedComments = useMemo(() => {
    return [...(activeTask.comments ?? [])].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }, [activeTask.comments]);

  const onFile = (file: File) => {
    setUploading(true);
    setUploadPct(0);
    const storageKey = `tasks/${activeTask.id}/${crypto.randomUUID()}-${file.name}`;
    const fileRef = ref(storage, storageKey);
    const uploadTask = uploadBytesResumable(fileRef, file);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        setUploadPct(pct);
      },
      (error) => {
        console.error("Upload failed:", error);
        alert("Upload failed. Please try again.");
        setUploading(false);
      },
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
        const attachment: TaskAttachment = {
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          type: file.type,
          storageKey,
          downloadUrl,
          addedAt: new Date().toISOString(),
          addedBy: actor,
        };
        await addAttachment(activeTask.id, attachment);
        setUploading(false);
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="pr-8">{activeTask.title}</SheetTitle>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-1.5 pt-1">
            <Badge variant="outline" className={cn("border", priorityBadgeClass(activeTask.priority))}>
              {activeTask.priority}
            </Badge>
            <Badge variant="outline" className={cn("border", statusBadgeClass(activeTask.status))}>
              {activeTask.status}
            </Badge>
            {activeTask.recordId && (
              <Badge
                variant="outline"
                className="border bg-primary/10 text-primary border-primary/20"
              >
                <Link2 className="size-3 mr-1" />
                {activeTask.bucket}
              </Badge>
            )}
            {linkedVehicle && (
              <Badge
                variant="outline"
                className="border bg-slate-100 text-slate-700 border-slate-200"
              >
                <Car className="size-3 mr-1" />
                {linkedVehicle.vehicleNumber}
              </Badge>
            )}
          </div>
        </SheetHeader>

        <div className="flex gap-2 mt-4 mb-4">
          <Button variant="outline" size="sm" onClick={() => generateTaskPDF(activeTask)}>
            <Download className="size-4 mr-1" />
            Export PDF
          </Button>
          <Button variant="outline" size="sm" onClick={printWindow}>
            <Printer className="size-4 mr-1" />
            Print
          </Button>
        </div>

        <div className="space-y-6">
          {/* Quick status & reassignment */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={activeTask.status}
                onValueChange={(v) => {
                  const s = v as TaskStatus;
                  if (activeSubModule === "services" && s === "ON HOLD") {
                    setVahaanHoldTask(activeTask);
                    setVahaanHoldReason(activeTask.holdReason || "");
                    setVahaanHoldDate((activeTask as any).holdDate || new Date().toISOString().split("T")[0]);
                    setShowVahaanHoldModal(true);
                    return;
                  }
                  if (activeSubModule === "services" && s === "COMPLETED") {
                    setVahaanCompleteTask(activeTask);
                    setVahaanRtoReceiptNo((activeTask as any).rtoReceiptNo || "");
                    setVahaanAppointmentDate(activeTask.appointmentDate || new Date().toISOString().split("T")[0]);
                    setShowVahaanCompleteModal(true);
                    return;
                  }
                  if (s === "On Hold") {
                    if (onTriggerHoldModal) onTriggerHoldModal(activeTask);
                    return;
                  }
                  if (s === "Completed") {
                    if (onTriggerCompleteModal) onTriggerCompleteModal(activeTask);
                    return;
                  }
                  updateTask(
                    activeTask.id,
                    { status: s, done: (s as string) === "Completed" || s === "COMPLETED" },
                    actor,
                    `Status → ${s}`,
                  );
                  if ((s as string) === "Completed" || s === "COMPLETED") setTaskDone(activeTask.id, true, actor);
                }}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getStatusOptions(activeSubModule).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(() => {
                const canEdit = true;
                return canEdit && (
                  <Button variant="outline" size="sm" onClick={() => onEdit(activeTask)}>
                    <Pencil className="size-4 mr-1" />
                    Edit
                  </Button>
                );
              })()}
            </div>

            {isAdmin && <ReassignmentSection task={activeTask} actor={actor} />}
          </div>

          {/* 1. Task Progress Section */}
          <CollapsibleSection title="Task Progress" defaultOpen={true}>
            <div className="space-y-4">
              {/* Application Details */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border rounded-xl">
                <div className="space-y-1">
                  <Label className="text-xs uppercase font-bold text-gray-400">Application Number</Label>
                  <Input
                    type="text"
                    placeholder="APL-XXXX-XXXX"
                    value={sheetApplicationId}
                    onChange={(e) => setSheetApplicationId(e.target.value)}
                    className="bg-white text-xs font-semibold text-slate-900 h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase font-bold text-gray-400">Application Type</Label>
                  <Select value={sheetApplicationType} onValueChange={setSheetApplicationType}>
                    <SelectTrigger className="bg-white text-xs font-semibold text-slate-900 h-9">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {(activeTask.applicationType === "Licence" || (activeTask as any).subModule === "licence") ? (
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
              </div>

              {/* Appointment Date for Active Step (Licence only) */}
              {(activeTask.applicationType === "Licence" || (activeTask as any).subModule === "licence") && (
                <div className="grid gap-1.5">
                  <Label className="text-xs uppercase font-bold text-gray-400">
                    Appointment Date (Step {(activeTask as any).currentStep || 1})
                  </Label>
                  <Input
                    type="date"
                    value={sheetApptDate}
                    onChange={(e) => setSheetApptDate(e.target.value)}
                    className="bg-white text-xs font-semibold text-slate-900"
                  />
                </div>
              )}

              {/* Task Step Detail (Only for License SubModule Tasks with active License step details) */}
              {((activeTask.applicationType === "Licence" || (activeTask as any).subModule === "licence") &&
                (activeTask as any).licenseDetails &&
                ((activeTask as any).licenseDetails?.newLearningLicence?.enabled ||
                  (activeTask as any).licenseDetails?.dlNewLlEndorsement?.enabled ||
                  (activeTask as any).licenseDetails?.llRenewClass?.enabled ||
                  (activeTask as any).licenseDetails?.dlRenewRetest?.enabled ||
                  (activeTask as any).licenseDetails?.changeDobDl?.enabled)) && (
                <CollapsibleSection title="Task Step Detail (License Workflow)" defaultOpen={true}>
                  <div className="space-y-3 p-3 bg-blue-50/50 border border-blue-100 rounded-xl text-xs">
                    {(() => {
                      const lic = licenseForm || (activeTask as any).licenseDetails || linkedApp?.licenseDetails || {};
                      const currentStep = (activeTask as any).currentStep || 1;
                      const stepAppts = (activeTask as any).stepAppointments || {};
                      const stepHist = (activeTask as any).stepHistory || {};
                      
                      // Render 2 steps for New Learning Licence or 3 steps for DL New LL Endorsement / Renewals
                      return (
                        <div className="space-y-4">
                          {/* Application Numbers summary */}
                          {(lic.newLearningLicence?.applicationNo || lic.dlNewLlEndorsement?.applicationNo || lic.llRenewClass?.applicationNo || lic.dlRenewRetest?.applicationNo) && (
                            <div className="bg-blue-100/50 p-2.5 rounded-lg border border-blue-200 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                              {lic.newLearningLicence?.enabled && lic.newLearningLicence?.applicationNo && (
                                <div><span className="font-semibold text-slate-600">New Learning Licence App No:</span> <span className="font-mono font-bold text-slate-800">{lic.newLearningLicence.applicationNo}</span></div>
                              )}
                              {lic.dlNewLlEndorsement?.enabled && lic.dlNewLlEndorsement?.applicationNo && (
                                <div><span className="font-semibold text-slate-600">DL Endorsement App No:</span> <span className="font-mono font-bold text-slate-800">{lic.dlNewLlEndorsement.applicationNo}</span></div>
                              )}
                              {lic.llRenewClass?.enabled && lic.llRenewClass?.applicationNo && (
                                <div><span className="font-semibold text-slate-600">LL Renew Class App No:</span> <span className="font-mono font-bold text-slate-800">{lic.llRenewClass.applicationNo}</span></div>
                              )}
                              {lic.dlRenewRetest?.enabled && lic.dlRenewRetest?.applicationNo && (
                                <div><span className="font-semibold text-slate-600">DL Renew + Retest App No:</span> <span className="font-mono font-bold text-slate-800">{lic.dlRenewRetest.applicationNo}</span></div>
                              )}
                            </div>
                          )}
                          {/* Step 1 */}
                          <div className={cn(
                            "p-3 rounded-lg border shadow-sm space-y-2 transition-all bg-white",
                            currentStep === 1 ? "border-blue-400 ring-1 ring-blue-300" : currentStep > 1 ? "border-emerald-300 bg-emerald-50/20" : "border-slate-200 opacity-75"
                          )}>
                            <div className="flex items-center gap-2 font-bold text-blue-900 text-xs">
                              <span className={cn(
                                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                                currentStep > 1 ? "bg-emerald-600 text-white" : currentStep === 1 ? "bg-blue-600 text-white" : "bg-slate-300 text-slate-700"
                              )}>
                                {currentStep > 1 ? "✓" : "1"}
                              </span>
                              <span>STEP 1: LEARNING / DL DETAILS</span>
                              {currentStep === 1 && <span className="ml-auto text-[9px] bg-blue-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold shadow-sm">Active</span>}
                              {currentStep > 1 && <span className="ml-auto text-[9px] bg-emerald-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold shadow-sm">Completed</span>}
                            </div>

                            {/* Step 1 Appointment & Completion Info */}
                            {(stepAppts[1] || stepHist[1]?.completedAt) && (
                              <div className="flex flex-wrap gap-4 text-[11px] bg-slate-50 p-2 rounded border text-slate-600">
                                {stepAppts[1] && (
                                  <div><span className="font-semibold text-slate-500">Appointment Date:</span> <span className="font-bold text-slate-800">{stepAppts[1]}</span></div>
                                )}
                                {stepHist[1]?.completedAt && (
                                  <div><span className="font-semibold text-slate-500">Completed At:</span> <span className="font-bold text-emerald-700">{new Date(stepHist[1].completedAt).toLocaleString("en-IN")}</span></div>
                                )}
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px] text-slate-700">
                              <div>
                                <span className="font-semibold text-slate-500 block mb-0.5">LL / DL NO:</span>
                                <Input
                                  className="h-7 text-xs bg-slate-50"
                                  value={lic.newLearningLicence?.step1?.llNumber || lic.dlNewLlEndorsement?.step1?.dlNumber || ""}
                                  onChange={(e) => {
                                    if (lic.newLearningLicence?.enabled) {
                                      updateLicenseField("newLearningLicence.step1.llNumber", e.target.value);
                                    } else {
                                      updateLicenseField("dlNewLlEndorsement.step1.dlNumber", e.target.value);
                                    }
                                  }}
                                />
                              </div>
                              <div>
                                <span className="font-semibold text-slate-500 block mb-0.5">ISSUE DATE:</span>
                                <Input
                                  type="date"
                                  className="h-7 text-xs bg-slate-50"
                                  value={ensureYYYYMMDD(lic.newLearningLicence?.step1?.issueDate || lic.dlNewLlEndorsement?.step1?.issueDate || "")}
                                  onChange={(e) => {
                                    if (lic.newLearningLicence?.enabled) {
                                      updateLicenseField("newLearningLicence.step1.issueDate", e.target.value);
                                    } else {
                                      updateLicenseField("dlNewLlEndorsement.step1.issueDate", e.target.value);
                                    }
                                  }}
                                />
                              </div>
                              <div>
                                <span className="font-semibold text-slate-500 block mb-0.5">EXPIRE DATE:</span>
                                <Input
                                  type="date"
                                  className="h-7 text-xs bg-slate-50"
                                  value={ensureYYYYMMDD(lic.newLearningLicence?.step1?.expiryDate || lic.dlNewLlEndorsement?.step1?.validityDate || "")}
                                  onChange={(e) => {
                                    if (lic.newLearningLicence?.enabled) {
                                      updateLicenseField("newLearningLicence.step1.expiryDate", e.target.value);
                                    } else {
                                      updateLicenseField("dlNewLlEndorsement.step1.validityDate", e.target.value);
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Step 2 */}
                          <div className={cn(
                            "p-3 rounded-lg border shadow-sm space-y-2 transition-all bg-white",
                            currentStep === 2 ? "border-blue-400 ring-1 ring-blue-300" : currentStep > 2 ? "border-emerald-300 bg-emerald-50/20" : "border-slate-200 opacity-75"
                          )}>
                            <div className="flex items-center gap-2 font-bold text-blue-900 text-xs">
                              <span className={cn(
                                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                                currentStep > 2 ? "bg-emerald-600 text-white" : currentStep === 2 ? "bg-blue-600 text-white" : "bg-slate-300 text-slate-700"
                              )}>
                                {currentStep > 2 ? "✓" : "2"}
                              </span>
                              <span>STEP 2: DRIVING LICENCE DETAILS</span>
                              {currentStep === 2 && <span className="ml-auto text-[9px] bg-blue-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold shadow-sm">Active</span>}
                              {currentStep > 2 && <span className="ml-auto text-[9px] bg-emerald-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold shadow-sm">Completed</span>}
                              {currentStep < 2 && <span className="ml-auto text-[9px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">Not Started</span>}
                            </div>

                            {/* Step 2 Appointment & Completion Info */}
                            {(stepAppts[2] || stepHist[2]?.completedAt) && (
                              <div className="flex flex-wrap gap-4 text-[11px] bg-slate-50 p-2 rounded border text-slate-600">
                                {stepAppts[2] && (
                                  <div><span className="font-semibold text-slate-500">Appointment Date:</span> <span className="font-bold text-slate-800">{stepAppts[2]}</span></div>
                                )}
                                {stepHist[2]?.completedAt && (
                                  <div><span className="font-semibold text-slate-500">Completed At:</span> <span className="font-bold text-emerald-700">{new Date(stepHist[2].completedAt).toLocaleString("en-IN")}</span></div>
                                )}
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px] text-slate-700">
                              <div>
                                <span className="font-semibold text-slate-500 block mb-0.5">DL NO:</span>
                                <Input
                                  className="h-7 text-xs bg-slate-50"
                                  value={lic.newLearningLicence?.step2?.dlNumber || lic.dlNewLlEndorsement?.step2?.llNumber || ""}
                                  onChange={(e) => {
                                    if (lic.newLearningLicence?.enabled) {
                                      updateLicenseField("newLearningLicence.step2.dlNumber", e.target.value);
                                    } else {
                                      updateLicenseField("dlNewLlEndorsement.step2.llNumber", e.target.value);
                                    }
                                  }}
                                />
                              </div>
                              <div>
                                <span className="font-semibold text-slate-500 block mb-0.5">ISSUE DATE:</span>
                                <Input
                                  type="date"
                                  className="h-7 text-xs bg-slate-50"
                                  value={ensureYYYYMMDD(lic.newLearningLicence?.step2?.issueDate || lic.dlNewLlEndorsement?.step2?.issueDate || "")}
                                  onChange={(e) => {
                                    if (lic.newLearningLicence?.enabled) {
                                      updateLicenseField("newLearningLicence.step2.issueDate", e.target.value);
                                    } else {
                                      updateLicenseField("dlNewLlEndorsement.step2.issueDate", e.target.value);
                                    }
                                  }}
                                />
                              </div>
                              <div>
                                <span className="font-semibold text-slate-500 block mb-0.5">EXPIRE DATE:</span>
                                <Input
                                  type="date"
                                  className="h-7 text-xs bg-slate-50"
                                  value={ensureYYYYMMDD(lic.newLearningLicence?.step2?.validityDate || lic.dlNewLlEndorsement?.step2?.expiryDate || "")}
                                  onChange={(e) => {
                                    if (lic.newLearningLicence?.enabled) {
                                      updateLicenseField("newLearningLicence.step2.validityDate", e.target.value);
                                    } else {
                                      updateLicenseField("dlNewLlEndorsement.step2.expiryDate", e.target.value);
                                    }
                                  }}
                                />
                              </div>
                              <div className="col-span-1 sm:col-span-3">
                                <span className="font-semibold text-slate-500 block mb-0.5">VEHICLE TYPE:</span> 
                                <div className="flex gap-4 items-center mt-1 text-xs">
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      className="size-3.5 accent-blue-600 rounded"
                                      checked={!!(lic.newLearningLicence?.step2?.vehicleTypes?.nt || lic.dlNewLlEndorsement?.step1?.vehicleTypes?.nt)}
                                      onChange={(e) => {
                                        if (lic.newLearningLicence?.enabled) {
                                          updateLicenseField("newLearningLicence.step2.vehicleTypes.nt", e.target.checked);
                                        } else {
                                          updateLicenseField("dlNewLlEndorsement.step1.vehicleTypes.nt", e.target.checked);
                                        }
                                      }}
                                    />
                                    NT
                                  </label>
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      className="size-3.5 accent-blue-600 rounded"
                                      checked={!!(lic.newLearningLicence?.step2?.vehicleTypes?.tr || lic.dlNewLlEndorsement?.step1?.vehicleTypes?.tr)}
                                      onChange={(e) => {
                                        if (lic.newLearningLicence?.enabled) {
                                          updateLicenseField("newLearningLicence.step2.vehicleTypes.tr", e.target.checked);
                                        } else {
                                          updateLicenseField("dlNewLlEndorsement.step1.vehicleTypes.tr", e.target.checked);
                                        }
                                      }}
                                    />
                                    TR
                                  </label>
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      className="size-3.5 accent-blue-600 rounded"
                                      checked={!!(lic.newLearningLicence?.step2?.vehicleTypes?.hazardous || lic.dlNewLlEndorsement?.step1?.vehicleTypes?.hazardous)}
                                      onChange={(e) => {
                                        if (lic.newLearningLicence?.enabled) {
                                          updateLicenseField("newLearningLicence.step2.vehicleTypes.hazardous", e.target.checked);
                                        } else {
                                          updateLicenseField("dlNewLlEndorsement.step1.vehicleTypes.hazardous", e.target.checked);
                                        }
                                      }}
                                    />
                                    Hazardous
                                  </label>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Step 3 (For 3-step License Services) */}
                          {(lic.dlNewLlEndorsement?.enabled || lic.llRenewClass?.enabled || lic.dlRenewRetest?.enabled) && (
                            <div className={cn(
                              "p-3 rounded-lg border shadow-sm space-y-2 transition-all bg-white",
                              currentStep === 3 ? "border-blue-400 ring-1 ring-blue-300" : currentStep > 3 ? "border-emerald-300 bg-emerald-50/20" : "border-slate-200 opacity-75"
                            )}>
                              <div className="flex items-center gap-2 font-bold text-blue-900 text-xs">
                                <span className={cn(
                                  "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                                  currentStep > 3 ? "bg-emerald-600 text-white" : currentStep === 3 ? "bg-blue-600 text-white" : "bg-slate-300 text-slate-700"
                                )}>
                                  {currentStep > 3 ? "✓" : "3"}
                                </span>
                                <span>STEP 3: FINAL DL DETAILS & ENDORSEMENT</span>
                                {currentStep === 3 && <span className="ml-auto text-[9px] bg-blue-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold shadow-sm">Active</span>}
                                {currentStep > 3 && <span className="ml-auto text-[9px] bg-emerald-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold shadow-sm">Completed</span>}
                                {currentStep < 3 && <span className="ml-auto text-[9px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">Not Started</span>}
                              </div>

                              {/* Step 3 Appointment & Completion Info */}
                              {(stepAppts[3] || stepHist[3]?.completedAt) && (
                                <div className="flex flex-wrap gap-4 text-[11px] bg-slate-50 p-2 rounded border text-slate-600">
                                  {stepAppts[3] && (
                                    <div><span className="font-semibold text-slate-500">Appointment Date:</span> <span className="font-bold text-slate-800">{stepAppts[3]}</span></div>
                                  )}
                                  {stepHist[3]?.completedAt && (
                                    <div><span className="font-semibold text-slate-500">Completed At:</span> <span className="font-bold text-emerald-700">{new Date(stepHist[3].completedAt).toLocaleString("en-IN")}</span></div>
                                  )}
                                </div>
                              )}

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px] text-slate-700">
                                <div>
                                  <span className="font-semibold text-slate-500 block mb-0.5">DL NO:</span>
                                  <Input
                                    className="h-7 text-xs bg-slate-50"
                                    value={lic.dlNewLlEndorsement?.step3?.dlNumber || lic.dlRenewRetest?.step3?.dlNumber || ""}
                                    onChange={(e) => {
                                      if (lic.dlNewLlEndorsement?.enabled) {
                                        updateLicenseField("dlNewLlEndorsement.step3.dlNumber", e.target.value);
                                      } else {
                                        updateLicenseField("dlRenewRetest.step3.dlNumber", e.target.value);
                                      }
                                    }}
                                  />
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-500 block mb-0.5">ISSUE DATE:</span>
                                  <Input
                                    type="date"
                                    className="h-7 text-xs bg-slate-50"
                                    value={ensureYYYYMMDD(lic.dlNewLlEndorsement?.step3?.issueDate || lic.dlRenewRetest?.step3?.issueDate || "")}
                                    onChange={(e) => {
                                      if (lic.dlNewLlEndorsement?.enabled) {
                                        updateLicenseField("dlNewLlEndorsement.step3.issueDate", e.target.value);
                                      } else {
                                        updateLicenseField("dlRenewRetest.step3.issueDate", e.target.value);
                                      }
                                    }}
                                  />
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-500 block mb-0.5">EXPIRE DATE:</span>
                                  <Input
                                    type="date"
                                    className="h-7 text-xs bg-slate-50"
                                    value={ensureYYYYMMDD(lic.dlNewLlEndorsement?.step3?.validityDate || lic.dlRenewRetest?.step3?.validityDate || "")}
                                    onChange={(e) => {
                                      if (lic.dlNewLlEndorsement?.enabled) {
                                        updateLicenseField("dlNewLlEndorsement.step3.validityDate", e.target.value);
                                      } else {
                                        updateLicenseField("dlRenewRetest.step3.validityDate", e.target.value);
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </CollapsibleSection>
              )}

              {/* Expected Completion Date */}
              <div className="grid gap-1.5">
                <Label className="text-xs uppercase font-bold text-gray-400">Expected Completion Date</Label>
                <Input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                />
              </div>

              {/* Remarks Field */}
              <div className="grid gap-1.5">
                <Label className="text-xs uppercase font-bold text-gray-400">Add Remark / Update Progress</Label>
                <Textarea
                  placeholder="Enter latest status update remarks..."
                  value={remarkInput}
                  onChange={(e) => setRemarkInput(e.target.value)}
                />
              </div>

              {/* Save & Complete Buttons */}
              <div className="flex gap-2 border-t pt-3">
                <Button type="button" onClick={handleSaveProgress} className="flex-1">
                  Save Progress
                </Button>
                <Button type="button" variant="secondary" onClick={handleMarkCompleted} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                  Mark Completed
                </Button>
              </div>
            </div>
          </CollapsibleSection>

          {/* 2. Subtasks Collapsible Section */}
          {activeTask.subtasks && activeTask.subtasks.length > 0 && (
            <CollapsibleSection title="Subtasks checklist" defaultOpen={true}>
              <div className="space-y-4">
                {/* Progress bar character blocks tracker */}
                {(() => {
                  const currentStep = (activeTask as any).currentStep || 1;
                  const isLicenceTask = activeTask.applicationType === "Licence" || (activeTask as any).subModule === "licence";
                  const rawItems = activeTask.subtasks ?? [];
                  const items = isLicenceTask ? filterSubtasksByStep(rawItems, currentStep) : rawItems;
                  const completedCount = items.filter((s) => s.completed).length;
                  const remainingCount = items.length - completedCount;
                  const pct = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;
                  const blockCount = Math.round(pct / 10);
                  const blockString = "█".repeat(blockCount) + "░".repeat(10 - blockCount);
                  
                  return (
                    <div className="bg-slate-50 p-4 rounded-xl border grid grid-cols-2 gap-4 text-xs font-semibold text-gray-600">
                      <div>
                        <span className="text-muted-foreground uppercase text-[10px] block">Overall Status</span>
                        <span className="text-sm font-bold text-gray-800">{activeTask.status}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground uppercase text-[10px] block">Progress</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-primary">{pct}%</span>
                          <span className="font-mono text-gray-400">{blockString}</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground uppercase text-[10px] block">Completed</span>
                        <span className="text-sm font-bold text-emerald-600">{completedCount} / {items.length}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground uppercase text-[10px] block">Remaining</span>
                        <span className="text-sm font-bold text-amber-600">{remainingCount}</span>
                      </div>
                    </div>
                  );
                })()}

                <SubtasksSection task={activeTask} actor={actor} isAdmin={isAdmin} onCompleteTrigger={handleTriggerCompleteFlow} />
              </div>
            </CollapsibleSection>
          )}

          {/* 3. Task Information Section */}
          <CollapsibleSection title="Task Information" defaultOpen={true}>
            <div className="space-y-4">
              <div>
                <Label className="text-xs uppercase font-bold text-gray-400">Description</Label>
                <p className="text-sm text-gray-700 bg-slate-50 p-3 rounded-lg border whitespace-pre-wrap mt-1">
                  {activeTask.description?.trim() ? activeTask.description : "No description."}
                </p>
              </div>

              <div>
                <Label className="text-xs uppercase font-bold text-gray-400">Details</Label>
                <dl className="grid grid-cols-2 gap-3 text-sm mt-1 bg-white p-3 rounded-lg border">
                  <Meta label="Application Number" value={linkedApp?.applicationId || activeTask.applicationId || "—"} />
                  <Meta label="Vehicle Number" value={linkedApp?.vehicleNumber || linkedVehicle?.vehicleNumber || (getTaskInfoHelper(activeTask, clients, leads, vehicles)).vehicleNum || "—"} />
                  <Meta label="Client Name" value={linkedApp?.ownerName || (getTaskInfoHelper(activeTask, clients, leads, vehicles)).clientName || "—"} />
                  <Meta label="Mobile Number" value={linkedApp?.mobileNumber || (getTaskInfoHelper(activeTask, clients, leads, vehicles)).clientPhone || "—"} />
                  <Meta label="Service" value={(linkedApp?.services && linkedApp.services.join(", ")) || (getTaskInfoHelper(activeTask, clients, leads, vehicles)).service || "—"} />
                  <Meta label="Assigned Employee" value={linkedApp?.assignedEmployeeName || activeTask.assignedEmployeeName || activeTask.assignee || "Unassigned"} />
                  {activeTask.appointmentDate && (
                    <Meta label="Appointment Date" value={formatDate(activeTask.appointmentDate)} />
                  )}
                  {activeTask.status === "On Hold" && activeTask.holdReason && (
                    <Meta label="Hold Reason" value={activeTask.holdReason} />
                  )}
                  {activeTask.status === "On Hold" && activeTask.holdRemarks && (
                    <Meta label="Hold Remarks" value={activeTask.holdRemarks} />
                  )}
                  {activeTask.remarks && (
                    <Meta label="Remarks" value={activeTask.remarks} />
                  )}
                  {activeTask.rtoExpense !== undefined && activeTask.rtoExpense > 0 && (
                    <Meta label="RTO Receipt" value={`₹${activeTask.rtoExpense}`} />
                  )}
                  <Meta label="Due Date" value={activeTask.dueDate ? formatDate(activeTask.dueDate) : "—"} />

                  {/* Remaining Details */}
                  {assignedEmp && (
                    <>
                      <Meta label="Role" value={assignedEmp.role ? (assignedEmp.role.charAt(0).toUpperCase() + assignedEmp.role.slice(1)) : "—"} />
                      <Meta label="Email" value={assignedEmp.email || "—"} />
                    </>
                  )}
                  <Meta label="Created by" value={staffLabel(activeTask.createdBy) || activeTask.createdBy} />
                  <Meta
                    label="Reminder"
                    value={activeTask.reminderMinutes ? `${activeTask.reminderMinutes} min before` : "None"}
                  />
                  <Meta label="Created" value={new Date(activeTask.createdAt).toLocaleString()} />
                  <Meta label="Type" value={activeTask.manual ? "Manual" : "Auto from record"} />
                  {activeTask.readBy && (
                    <>
                      <Meta label="Read By" value={staffLabel(activeTask.readBy) || activeTask.readBy} />
                      <Meta
                        label="Read On"
                        value={activeTask.readAt ? new Date(activeTask.readAt).toLocaleString() : "—"}
                      />
                    </>
                  )}
                  {activeTask.lastUpdatedBy && activeTask.lastUpdatedAt && (
                    <>
                      <Meta
                        label="Last Updated By"
                        value={staffLabel(activeTask.lastUpdatedBy) || activeTask.lastUpdatedBy}
                      />
                      <Meta
                        label="Last Updated At"
                        value={new Date(activeTask.lastUpdatedAt).toLocaleString()}
                      />
                    </>
                  )}
                </dl>
              </div>

              {/* Full Application & Vehicle Specification Details */}
              {(linkedVehicle || linkedApp) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase font-bold text-gray-400 block">Application Specifications</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFullAppModalOpen(true)}
                      className="h-7 text-[11px] font-bold text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100"
                    >
                      <Eye className="size-3 mr-1" /> View Full Form Details
                    </Button>
                  </div>
                  {linkedVehicle && (
                    <div className="bg-slate-50 p-3.5 rounded-lg border text-xs space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div><span className="text-gray-400">Father/Husband:</span> <span className="font-semibold text-gray-800">{linkedVehicle.fatherHusbandName || "—"}</span></div>
                        <div><span className="text-gray-400">CO (C/O):</span> <span className="font-semibold text-gray-800">{linkedVehicle.coName || "—"}</span></div>
                        <div><span className="text-gray-400">Group Name:</span> <span className="font-semibold text-gray-800">{linkedVehicle.groupName || "—"}</span></div>
                        <div><span className="text-gray-400">Chassis No:</span> <span className="font-mono font-semibold text-gray-800">{linkedVehicle.chassisNumber || "—"}</span></div>
                        <div><span className="text-gray-400">Engine No:</span> <span className="font-mono font-semibold text-gray-800">{linkedVehicle.engineNumber || "—"}</span></div>
                        <div><span className="text-gray-400">Fuel Type:</span> <span className="font-semibold text-gray-800">{linkedVehicle.fuelType || "—"}</span></div>
                        <div><span className="text-gray-400">Maker Name:</span> <span className="font-semibold text-gray-800">{linkedVehicle.makerName || "—"}</span></div>
                        <div><span className="text-gray-400">Model Name:</span> <span className="font-semibold text-gray-800">{linkedVehicle.modelName || "—"}</span></div>
                        <div><span className="text-gray-400">Vehicle Class:</span> <span className="font-semibold text-gray-800">{linkedVehicle.vehicleClass || "—"}</span></div>
                        <div><span className="text-gray-400">Seating Cap:</span> <span className="font-semibold text-gray-800">{linkedVehicle.seatingCapacity || "—"}</span></div>
                      </div>
                      <div className="border-t pt-2 grid grid-cols-2 gap-2 text-[10px]">
                        <div><span className="text-gray-400 uppercase font-semibold">Insurance Expiry:</span> <span className="font-mono font-bold text-slate-800 block">{linkedVehicle.insuranceDetails?.expiryDate || "—"}</span></div>
                        <div><span className="text-gray-400 uppercase font-semibold">Fitness Expiry:</span> <span className="font-mono font-bold text-slate-800 block">{linkedVehicle.fitnessDetails?.expiryDate || "—"}</span></div>
                        <div><span className="text-gray-400 uppercase font-semibold">Permit Expiry:</span> <span className="font-mono font-bold text-slate-800 block">{linkedVehicle.permitDetails?.expiryDate || "—"}</span></div>
                        <div><span className="text-gray-400 uppercase font-semibold">Tax Expiry:</span> <span className="font-mono font-bold text-slate-800 block">{linkedVehicle.taxDetails?.expiryDate || "—"}</span></div>
                        <div><span className="text-gray-400 uppercase font-semibold">PUC Expiry:</span> <span className="font-mono font-bold text-slate-800 block">{linkedVehicle.pucExpiryDate || "—"}</span></div>
                        <div><span className="text-gray-400 uppercase font-semibold">Reg Validity:</span> <span className="font-mono font-bold text-slate-800 block">{linkedVehicle.registrationDetails?.registrationValidity || "—"}</span></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <ApplicationFullDetailsModal
                open={fullAppModalOpen}
                onOpenChange={setFullAppModalOpen}
                application={linkedApp}
                vehicle={linkedVehicle || linkedApp?.vehicleDetails || linkedApp?.vehicleMaster || linkedApp}
              />

              {activeTask.recordId && (
                <ClientRelationshipPanel clientId={activeTask.recordId} />
              )}
            </div>
          </CollapsibleSection>

          {/* Remarks collapsible section */}
          <CollapsibleSection title="Remarks & Note History" defaultOpen={false}>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a note…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && comment.trim()) {
                      addComment(activeTask.id, actor, comment.trim());
                      setComment("");
                    }
                  }}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (comment.trim()) {
                      addComment(activeTask.id, actor, comment.trim());
                      setComment("");
                    }
                  }}
                >
                  <Send className="size-4" />
                </Button>
              </div>

              <div className="space-y-3 divide-y divide-dashed">
                {sortedComments.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No remarks yet.</p>
                ) : (
                  sortedComments.map((c, i) => (
                    <div
                      key={c.id}
                      className={cn(
                        "text-sm pt-3 first:pt-0 border-none",
                        i > 0 && "border-t border-gray-100",
                      )}
                    >
                      <p className="font-semibold text-gray-800">{c.text}</p>
                      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                        <span className="font-bold text-primary">
                          {staffLabel(c.author) || c.author}
                        </span>
                        <span>
                          {formatDateDDMMYYYY(c.at)} •{" "}
                          {new Date(c.at).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CollapsibleSection>

          {/* Attachments collapsible section */}
          <CollapsibleSection title="Attachments" defaultOpen={false}>
            <div className="space-y-3">
              {(activeTask.attachments ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No attachments yet.</p>
              )}
              {(activeTask.attachments ?? []).map((a) => (
                <a
                  key={a.id}
                  href={a.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline border bg-slate-50 p-2.5 rounded-lg"
                >
                  <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-bold text-gray-700">{a.name}</p>
                    <span className="text-[10px] text-muted-foreground block font-medium">
                      {Math.round(a.size / 1024)} KB • {a.addedBy ? staffLabel(a.addedBy) : "System"}
                    </span>
                  </div>
                  <ExternalLink className="size-3.5 text-muted-foreground shrink-0" />
                </a>
              ))}

              {uploading && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Uploading… {uploadPct}%
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${uploadPct}%` }}
                    />
                  </div>
                </div>
              )}

              <label
                className={cn(
                  "inline-flex items-center gap-2 text-sm cursor-pointer text-primary border border-dashed rounded-lg p-3 hover:bg-slate-50/50 justify-center w-full mt-1.5",
                  uploading && "opacity-50 pointer-events-none",
                )}
              >
                <Paperclip className="size-4 text-muted-foreground" />
                <span className="text-xs font-bold text-gray-600">Attach file</span>
                <input
                  type="file"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          </CollapsibleSection>

          {/* Timeline / Activity Log collapsible section */}
          <CollapsibleSection title="Timeline & Activity Log" defaultOpen={false}>
            <ol className="relative border-l pl-4 space-y-4">
              {(activeTask.activityLogs ?? []).length > 0
                ? (activeTask.activityLogs ?? []).map((log) => (
                    <li key={log.id} className="text-sm relative">
                      <span className="absolute -left-[21px] mt-1.5 w-2.5 h-2.5 rounded-full bg-primary" />
                      <div className="font-semibold text-gray-800 leading-tight">{log.action}</div>
                      {log.field && (log.oldValue !== undefined || log.newValue !== undefined) && (
                        <div className="text-xs text-muted-foreground mt-0.5 font-medium">
                          {log.field}: {log.oldValue || "—"} → {log.newValue || "—"}
                        </div>
                      )}
                      <div className="text-[10px] text-gray-400 font-bold mt-1">
                        {staffLabel(log.actor) || log.actor} • {new Date(log.timestamp).toLocaleString("en-IN")}
                      </div>
                    </li>
                  ))
                : (activeTask.activity ?? []).map((a) => (
                    <li key={a.id} className="text-sm relative">
                      <span className="absolute -left-[21px] mt-1.5 w-2.5 h-2.5 rounded-full bg-primary" />
                      <div className="text-gray-800 leading-tight">{a.message}</div>
                      <div className="text-[10px] text-gray-400 font-bold mt-1">
                        {staffLabel(a.actor) || a.actor} • {new Date(a.at).toLocaleString("en-IN")}
                      </div>
                    </li>
                  ))}
            </ol>
          </CollapsibleSection>
        </div>

        {showLicenseStepModal && licenseStepModalData && (
          <Dialog open={showLicenseStepModal} onOpenChange={setShowLicenseStepModal}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Complete Step {licenseStepModalData.currentStep}</DialogTitle>
                <DialogDescription>
                  Step {licenseStepModalData.currentStep} completed! Please select the appointment date for Step {licenseStepModalData.nextStep}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Appointment Date *</Label>
                  <Input
                    type="date"
                    value={licenseStepDate}
                    onChange={(e) => setLicenseStepDate(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowLicenseStepModal(false)}>Cancel</Button>
                <Button onClick={async () => {
                  if (!activeTask) return;
                  try {
                    const formattedDate = licenseStepDate ? formatDateDDMMYYYY(licenseStepDate) : "";
                    const now = new Date().toISOString();

                    const existingStepAppts = (activeTask as any).stepAppointments || {};
                    const updatedStepAppts = {
                      ...existingStepAppts,
                      [licenseStepModalData.nextStep]: formattedDate,
                    };

                    const existingHistory = (activeTask as any).stepHistory || {};
                    const updatedHistory = {
                      ...existingHistory,
                      [licenseStepModalData.currentStep]: {
                        stepNumber: licenseStepModalData.currentStep,
                        completedAt: now,
                        completedBy: actor,
                        appointmentDate: activeTask.appointmentDate || existingStepAppts[licenseStepModalData.currentStep] || "",
                        status: "Completed",
                      }
                    };

                    const updates: any = {
                      currentStep: licenseStepModalData.nextStep,
                      appointmentDate: formattedDate,
                      stepAppointments: updatedStepAppts,
                      stepHistory: updatedHistory,
                      status: "In Progress" as TaskStatus,
                      done: false,
                    };

                    const appDocId = (activeTask as any).applicationDocId || activeTask.recordId || activeTask.id.replace("task-app-", "");
                    if (appDocId) {
                      const appRef = doc(db, "registry_applications_v1", appDocId);
                      await setDoc(appRef, {
                        appointmentDate: formattedDate,
                        "licenseDetails.currentStep": licenseStepModalData.nextStep,
                        "licenseDetails.stepAppointments": updatedStepAppts,
                        "licenseDetails.stepHistory": updatedHistory,
                        updatedAt: now,
                      }, { merge: true }).catch(() => {});
                    }

                    if (remarkInput.trim()) {
                      await addComment(activeTask.id, actor, remarkInput.trim());
                      setRemarkInput("");
                    }

                    await updateTask(
                      activeTask.id,
                      updates,
                      actor,
                      `Step ${licenseStepModalData.currentStep} completed. Started Step ${licenseStepModalData.nextStep}.`
                    );
                    toast.success(`Step ${licenseStepModalData.currentStep} completed! Started Step ${licenseStepModalData.nextStep}.`);
                    setShowLicenseStepModal(false);
                    setLicenseStepModalData(null);
                  } catch (err: any) {
                    toast.error(err.message || "Failed to update step");
                  }
                }}>Save & Continue</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-xl bg-white shadow-sm overflow-hidden mb-3">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3.5 bg-slate-50/50 hover:bg-slate-50 transition border-b"
      >
        <span className="font-semibold text-xs text-gray-500 uppercase tracking-wider">{title}</span>
        <span className="text-gray-400 text-xs transition-transform duration-200" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          ▶
        </span>
      </button>
      {isOpen && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground font-medium">{label}</dt>
      <dd className="text-sm font-semibold text-foreground mt-0.5">{value}</dd>
    </div>
  );
}

function ReassignmentSection({ task, actor }: { task: Task; actor: string }) {
  const [employees, setEmployees] = useState<any[]>([]);

  useEffect(() => {
    return onSnapshot(collection(db, "users"), (snap: any) => {
      setEmployees(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  return (
    <div className="flex items-center gap-2 border bg-slate-50 p-2.5 rounded-lg max-w-sm">
      <Users className="size-4 text-muted-foreground shrink-0" />
      <div className="flex-1 text-xs font-semibold">Assignee</div>
      <Select value={task.assignee} onValueChange={(v) => reassignTask(task.id, v, actor)}>
        <SelectTrigger className="w-36 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {employees
            .filter((e) => e.status === "active" && !e.isDeleted)
            .map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">
                {s.fullName || s.name || s.username}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SubtasksSection({ task, actor, isAdmin, onCompleteTrigger }: { task: Task; actor: string; isAdmin: boolean; onCompleteTrigger?: () => void }) {
  const [employees, setEmployees] = useState<any[]>([]);

  useEffect(() => {
    return onSnapshot(collection(db, "users"), (snap: any) => {
      setEmployees(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    });
  }, []);



  const calculateProgress = (subs: any[]) => {
    if (!subs.length) return 0;
    const comp = subs.filter((s) => s.completed).length;
    return Math.round((comp / subs.length) * 100);
  };

  const currentStep = (task as any).currentStep || 1;
  const isLicenceTask = task.applicationType === "Licence" || (task as any).subModule === "licence";
  const items = useMemo(() => {
    const allItems = task.subtasks ?? [];
    if (isLicenceTask) {
      return filterSubtasksByStep(allItems, currentStep);
    }
    return allItems;
  }, [task.subtasks, isLicenceTask, currentStep]);
  const completed = items.filter((s) => s.completed).length;
  const pct = calculateProgress(items);

  // Subtask form & remarks modal states
  const [editingSub, setEditingSub] = useState<TaskSubtask | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAssignedTo, setEditAssignedTo] = useState("");
  const [editDueDate, setEditDueDate] = useState("");

  const [remarkingSub, setRemarkingSub] = useState<TaskSubtask | null>(null);
  const [subRemarkText, setSubRemarkText] = useState("");

  const [newTitle, setNewTitle] = useState("");
  const [newAssignedTo, setNewAssignedTo] = useState("");
  const [newDueDate, setNewDueDate] = useState("");

  // Progress Bar Character Blocks helper
  const blockCount = Math.round(pct / 10);
  const blockString = "█".repeat(blockCount) + "░".repeat(10 - blockCount);

  const getProgressColor = (percent: number) => {
    if (percent <= 25) return "text-red-500 bg-red-500";
    if (percent <= 50) return "text-orange-500 bg-orange-500";
    if (percent <= 75) return "text-blue-500 bg-blue-500";
    return "text-green-500 bg-green-500";
  };

  const handleStatusChange = async (sub: TaskSubtask, nextStatus: "Pending" | "In Progress" | "Completed") => {
    const nextCompleted = nextStatus === "Completed";
    const updated = items.map((s) => {
      if (s.id === sub.id) {
        return {
          ...s,
          status: nextStatus,
          completed: nextCompleted,
          completedBy: nextCompleted ? actor : undefined,
          completedOn: nextCompleted ? new Date().toISOString() : undefined,
          completedAt: nextCompleted ? new Date().toISOString() : undefined,
          updatedBy: actor,
          updatedAt: new Date().toISOString(),
        };
      }
      return s;
    });
    await updateSubtasks(task.id, updated, actor);
    toast.success(`Subtask status updated to ${nextStatus}!`);
    const allCompleted = updated.every(s => s.completed);
    if (allCompleted && onCompleteTrigger) {
      onCompleteTrigger();
    }
  };

  // Add Subtask
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newSub: TaskSubtask = {
      id: crypto.randomUUID(),
      title: newTitle.trim(),
      completed: false,
      assignedTo: newAssignedTo || undefined,
      dueDate: newDueDate || undefined,
      createdBy: actor,
      createdAt: new Date().toISOString(),
      remarks: [],
    };

    const updated = [...items, newSub];
    await updateSubtasks(task.id, updated, actor);
    setNewTitle("");
    setNewAssignedTo("");
    setNewDueDate("");
    toast.success("Subtask added successfully!");
  };

  // Toggle Completion
  const handleToggle = async (sub: TaskSubtask) => {
    const updated = items.map((s) => {
      if (s.id === sub.id) {
        const nextCompleted = !s.completed;
        return {
          ...s,
          completed: nextCompleted,
          completedBy: nextCompleted ? actor : undefined,
          completedOn: nextCompleted ? new Date().toISOString() : undefined,
          completedAt: nextCompleted ? new Date().toISOString() : undefined,
          updatedBy: actor,
          updatedAt: new Date().toISOString(),
        };
      }
      return s;
    });
    await updateSubtasks(task.id, updated, actor);
    toast.success(sub.completed ? "Subtask reopened" : "Subtask completed!");
    const allCompleted = updated.every(s => s.completed);
    if (allCompleted && onCompleteTrigger) {
      onCompleteTrigger();
    }
  };

  // Edit Subtask Dialog Save
  const handleSaveEdit = async () => {
    if (!editingSub || !editTitle.trim()) return;
    const updated = items.map((s) => {
      if (s.id === editingSub.id) {
        return {
          ...s,
          title: editTitle.trim(),
          assignedTo: editAssignedTo || undefined,
          dueDate: editDueDate || undefined,
          updatedBy: actor,
          updatedAt: new Date().toISOString(),
        };
      }
      return s;
    });
    await updateSubtasks(task.id, updated, actor);
    setEditingSub(null);
    toast.success("Subtask updated successfully!");
  };

  // Delete Subtask
  const handleDelete = async (subId: string) => {
    if (!confirm("Are you sure you want to delete this subtask?")) return;
    const updated = items.filter((s) => s.id !== subId);
    await updateSubtasks(task.id, updated, actor);
    toast.success("Subtask deleted!");
  };

  // Add Subtask Remark
  const handleAddSubRemark = async () => {
    if (!remarkingSub || !subRemarkText.trim()) return;
    const remarkObj = {
      id: crypto.randomUUID(),
      text: subRemarkText.trim(),
      author: actor,
      at: new Date().toISOString(),
    };
    const updated = items.map((s) => {
      if (s.id === remarkingSub.id) {
        return {
          ...s,
          remarks: [...(s.remarks || []), remarkObj],
          updatedBy: actor,
          updatedAt: new Date().toISOString(),
        };
      }
      return s;
    });
    await updateSubtasks(task.id, updated, actor);
    setSubRemarkText("");
    setRemarkingSub(null);
    toast.success("Subtask remark logged!");
  };

  // Move Subtask (Reorder Up/Down)
  const handleMove = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const list = [...items];
    const [moved] = list.splice(index, 1);
    list.splice(targetIndex, 0, moved);

    await updateSubtasks(task.id, list, actor);
  };

  return (
    <CollapsibleSection title="Subtask Workflow Tracker" defaultOpen={true}>
      <div className="space-y-4">
        {/* Professional Progress Segment */}
        <div className="bg-slate-50 p-3.5 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Progress Tracker
            </span>
            <div className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <span
                className={cn(
                  "font-mono font-bold text-xs px-2 py-0.5 rounded text-white",
                  getProgressColor(pct).split(" ")[1],
                )}
              >
                {pct}%
              </span>
              <span className="text-xs font-mono text-gray-600 tracking-wider font-semibold">
                {blockString}
              </span>
            </div>
          </div>
          <div className="text-xs text-slate-500 text-right font-medium">
            <strong>{completed}</strong> of <strong>{items.length}</strong> Tasks Completed
          </div>
        </div>

        {/* Subtasks checklist items */}
        <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
          {items.map((st, index) => {
            const hasRemarks = (st.remarks || []).length > 0;
            return (
              <div
                key={st.id}
                className={cn(
                  "border rounded-xl p-3 bg-white hover:border-slate-300 transition shadow-sm",
                  st.completed && "bg-slate-50/50 border-slate-200",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <Checkbox
                      checked={st.status === "Completed" || st.completed}
                      onCheckedChange={(checked) => handleStatusChange(st, checked ? "Completed" : "Pending")}
                      className="mt-1 size-4.5 rounded cursor-pointer"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p
                        className={cn(
                          "text-xs font-bold text-gray-800 leading-tight truncate",
                          (st.status === "Completed" || st.completed) && "line-through text-muted-foreground",
                        )}
                      >
                        {index + 1}. {st.title}
                      </p>

                      {/* Professional metadata tracker */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] text-gray-500 font-semibold mt-1 items-center">
                        <span>
                          Assigned:{" "}
                          <strong className="text-gray-700">
                            {st.assignedTo ? staffLabel(st.assignedTo) : "Unassigned"}
                          </strong>
                        </span>
                        {st.dueDate && (
                          <span>
                            Due:{" "}
                            <strong className="text-amber-700">
                              {formatDateDDMMYYYY(st.dueDate)}
                            </strong>
                          </span>
                        )}
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">Status:</span>
                          <select
                            value={st.status || (st.completed ? "Completed" : "Pending")}
                            onChange={(e) => handleStatusChange(st, e.target.value as any)}
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-bold border bg-transparent cursor-pointer",
                              (st.status === "Completed" || st.completed) && "text-emerald-700 bg-emerald-50 border-emerald-200",
                              st.status === "In Progress" && "text-indigo-700 bg-indigo-50 border-indigo-200",
                              (st.status === "Pending" || (!st.status && !st.completed)) && "text-amber-700 bg-amber-50 border-amber-200"
                            )}
                          >
                            <option value="Pending">Pending</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                          </select>
                        </div>
                      </div>

                      {/* Subtask Remarks History Timeline inside Row */}
                      {hasRemarks && (
                        <div className="bg-slate-50 border rounded-lg p-2 mt-2 space-y-1.5">
                          <span className="text-[9px] uppercase font-bold text-gray-400 block tracking-wide">
                            Remarks History
                          </span>
                          <div className="space-y-1.5 divide-y divide-dashed">
                             {(st.remarks || []).map((rem: any) => (
                              <div
                                key={rem.id}
                                className="text-[10px] text-gray-600 pt-1 first:pt-0 border-none"
                              >
                                <p className="font-medium">{rem.text}</p>
                                <div className="text-[8px] text-gray-400 mt-0.5 flex justify-between font-bold">
                                  <span>{staffLabel(rem.author) || rem.author}</span>
                                  <span>
                                    {formatDateDDMMYYYY(rem.at)} •{" "}
                                    {new Date(rem.at).toLocaleTimeString("en-IN", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Operational actions: Edit, Reorder, Add Remark, Delete */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setRemarkingSub(st)}
                      className="text-gray-400 hover:text-primary p-1 rounded hover:bg-slate-100"
                      title="Add Remark"
                    >
                      <MessageSquare className="size-3.5" />
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSub(st);
                            setEditTitle(st.title);
                            setEditAssignedTo(st.assignedTo || "");
                            setEditDueDate(st.dueDate || "");
                          }}
                          className="text-gray-400 hover:text-primary p-1 rounded hover:bg-slate-100"
                          title="Edit Subtask"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMove(index, "up")}
                          className="text-gray-400 hover:text-gray-800 disabled:opacity-30 p-1 rounded hover:bg-slate-100"
                          title="Move Up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={index === items.length - 1}
                          onClick={() => handleMove(index, "down")}
                          className="text-gray-400 hover:text-gray-800 disabled:opacity-30 p-1 rounded hover:bg-slate-100"
                          title="Move Down"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(st.id)}
                          className="text-red-400 hover:text-red-700 p-1 rounded hover:bg-red-50"
                          title="Delete Subtask"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="text-center py-10 border border-dashed rounded-xl bg-slate-50/50 p-4">
              <CheckCircle className="size-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-500 italic font-medium">
                No subtasks have been created for this task. You can complete this task directly using the Task Progress section below.
              </p>
            </div>
          )}
        </div>

        {/* Add Subtask Form */}
        {isAdmin && (
          <form onSubmit={handleAdd} className="border-t pt-3.5 space-y-2">
            <span className="text-[10px] uppercase font-bold text-gray-500 block">
              Add New Checklist Item
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-3">
                <Input
                  required
                  placeholder="Enter subtask workflow name (e.g. Collect RC Copy)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>
              <div>
                <Select value={newAssignedTo} onValueChange={setNewAssignedTo}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Assign Employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {employees
                      .filter((e) => e.status === "active" && !e.isDeleted)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.fullName || s.name || s.username}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Input
                  type="date"
                  className="h-9 text-xs"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                />
              </div>
              <Button type="submit" size="sm" className="h-9 gap-1 text-xs">
                <Plus className="size-3.5" /> Add Subtask
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Edit Subtask Modal Dialog */}
      {editingSub && (
        <Dialog open={!!editingSub} onOpenChange={(v) => !v && setEditingSub(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Subtask Settings</DialogTitle>
              <DialogDescription>
                Modify operational details for this checklist process item.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="editSubTitle" className="text-xs uppercase font-bold text-gray-500">
                  Subtask Title *
                </Label>
                <Input
                  id="editSubTitle"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor="editSubAssign"
                  className="text-xs uppercase font-bold text-gray-500"
                >
                  Assigned Employee
                </Label>
                <Select value={editAssignedTo} onValueChange={setEditAssignedTo}>
                  <SelectTrigger id="editSubAssign">
                    <SelectValue placeholder="Select staff..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {employees
                      .filter((e) => e.status === "active" && !e.isDeleted)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.fullName || s.name || s.username}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="editSubDue" className="text-xs uppercase font-bold text-gray-500">
                  Due Date
                </Label>
                <Input
                  id="editSubDue"
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={() => setEditingSub(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Subtask Remark Dialog */}
      {remarkingSub && (
        <Dialog open={!!remarkingSub} onOpenChange={(v) => !v && setRemarkingSub(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Log Subtask Remark</DialogTitle>
              <DialogDescription>
                Add operational remark history for subtask: <strong>{remarkingSub.title}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="py-2 space-y-2">
              <Label htmlFor="subRemarkText" className="text-xs uppercase font-bold text-gray-500">
                Remark Text *
              </Label>
              <Textarea
                id="subRemarkText"
                rows={3}
                required
                placeholder="e.g. Hard copy received."
                value={subRemarkText}
                onChange={(e) => setSubRemarkText(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={() => setRemarkingSub(null)}>
                Cancel
              </Button>
              <Button onClick={handleAddSubRemark} disabled={!subRemarkText.trim()}>
                Log Remark
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </CollapsibleSection>
  );
}

function ClientRelationshipPanel({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<any>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);

    const unsubClient = onSnapshot(doc(db, "registry_clients_v2", clientId), (snap: any) => {
      if (snap.exists()) {
        setClient({ id: snap.id, ...snap.data() });
      }
    });

    const unsubVehicles = onSnapshot(
      query(collection(db, "registry_vehicles_v2"), where("clientId", "==", clientId)),
      (snap: any) => {
        const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        setVehicles(list);
      }
    );

    const unsubServices = onSnapshot(
      collection(db, "registry_services_v2"),
      (snap: any) => {
        const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        setServices(list);
      }
    );

    const unsubInvoices = onSnapshot(
      query(collection(db, "billing_invoices"), where("clientId", "==", clientId)),
      (snap: any) => {
        const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        setInvoices(list);
      }
    );

    const unsubDocs = onSnapshot(
      query(collection(db, "registry_client_docs"), where("clientId", "==", clientId)),
      (snap: any) => {
        const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        setDocuments(list);
      }
    );

    const unsubActivity = onSnapshot(
      query(collection(db, "client_activity_logs"), where("clientId", "==", clientId)),
      (snap: any) => {
        const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        setActivity(list.sort((a: any, b: any) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime()));
      }
    );

    setLoading(false);

    return () => {
      unsubClient();
      unsubVehicles();
      unsubServices();
      unsubInvoices();
      unsubDocs();
      unsubActivity();
    };
  }, [clientId]);

  if (loading) return <div className="text-sm text-muted-foreground p-3 border rounded-lg bg-muted/20">Loading client relationships...</div>;
  if (!client) return <div className="text-sm text-muted-foreground p-3 border rounded-lg bg-muted/20">No linked client details found.</div>;

  // Filter services that belong to client's vehicles
  const vehicleIds = vehicles.map((v) => v.id);
  const clientServices = services.filter((s) => vehicleIds.includes(s.vehicleId));

  // Calculate outstanding amount
  const outstandingAmount = invoices.reduce((sum, inv) => sum + ((inv.totalAmount || 0) - (inv.totalPaid || 0)), 0);

  return (
    <div className="space-y-4 border-t pt-4">
      <h4 className="text-xs uppercase font-bold text-gray-500 tracking-wide">Client Relationship Profile</h4>
      
      {/* Client Meta */}
      <div className="bg-muted/40 p-3 rounded-lg border text-sm space-y-1.5">
        <div><strong>Name:</strong> {client.name}</div>
        <div><strong>Mobile:</strong> {client.mobile || "—"}</div>
        {client.email && <div><strong>Email:</strong> {client.email}</div>}
        {client.address && <div><strong>Address:</strong> {client.address}</div>}
        {client.companyName && <div><strong>Company:</strong> {client.companyName}</div>}

      </div>

      {/* Vehicles */}
      {vehicles.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground uppercase">Vehicles ({vehicles.length})</span>
          <div className="grid grid-cols-1 gap-2">
            {vehicles.map((v) => (
              <div key={v.id} className="bg-white border rounded p-2 text-xs">
                <div className="font-semibold text-primary">{v.vehicleNumber} ({v.vehicleType || "Commercial"})</div>
                {v.chassisNumber && <div>Chassis: {v.chassisNumber}</div>}
                {v.engineNumber && <div>Engine: {v.engineNumber}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Services */}
      {clientServices.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground uppercase">Active Services ({clientServices.length})</span>
          <div className="grid grid-cols-1 gap-2">
            {clientServices.map((s) => (
              <div key={s.id} className="bg-white border rounded p-2 text-xs flex justify-between items-center">
                <div>
                  <div className="font-semibold">{s.serviceType}</div>
                  <div className="text-muted-foreground">Due: {s.dueDate || "—"}</div>
                </div>
                <Badge variant="outline">{s.taskStatus}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground uppercase">Invoices ({invoices.length})</span>
          <div className="grid grid-cols-1 gap-2">
            {invoices.map((inv) => (
              <div key={inv.id} className="bg-white border rounded p-2 text-xs flex justify-between items-center">
                <div>
                  <div className="font-semibold">{inv.invoiceNumber}</div>
                  <div className="text-muted-foreground">Date: {inv.invoiceDate || "—"}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">₹{inv.totalAmount}</div>
                  <Badge variant="outline" className={inv.status === "Paid" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200"}>
                    {inv.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents */}
      {documents.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground uppercase">Client Documents ({documents.length})</span>
          <div className="grid grid-cols-1 gap-1">
            {documents.map((doc) => (
              <a
                key={doc.id}
                href={doc.downloadURL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-1.5 bg-white border rounded text-xs text-primary hover:underline"
              >
                <Paperclip className="size-3.5" />
                <span className="truncate">{doc.name} ({doc.type})</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {activity.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground uppercase">Recent Activity</span>
          <div className="bg-white border rounded p-2 text-[11px] max-h-36 overflow-y-auto space-y-1">
            {activity.slice(0, 5).map((act) => (
              <div key={act.id} className="border-b last:border-0 pb-1">
                <span className="font-semibold">{act.performedBy}:</span> {act.action} {act.fieldName && `(${act.fieldName})`}
                <div className="text-[10px] text-muted-foreground">{new Date(act.performedAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
