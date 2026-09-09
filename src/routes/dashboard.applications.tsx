import { createFileRoute, useLocation } from "@tanstack/react-router";
import { WhatsAppDialogContent } from "@/components/WhatsAppDialogContent";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  FileText,
  Search,
  Plus,
  Upload,
  Calendar,
  X,
  Building2,
  Car,
  Shield,
  FileCheck,
  User,
  FileSpreadsheet,
  DollarSign,
  Receipt,
  Eye,
  CheckCircle,
  Pencil,
  Trash2,
  GraduationCap,
  FolderOpen,
  Printer,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import {
  subscribeApplications,
  subscribeAccountingRecords,
  saveApplicationAndVehicle,
  deleteApplication,
  fetchVehicleByNumber,
  computePermitExpiry,
  type ApplicationRecord,
  type VehicleMaster,
  type ServiceAccountingItem,
  type AccountingRecord,
  type Form5DetailsData,
} from "@/lib/applications";
import { getSession } from "@/lib/auth";
import { verifyAdminPin } from "@/lib/adminSecurity";
import {
  saveDrivingSchoolApplication,
  subscribeDrivingSchoolApplications,
  deleteDrivingSchoolApplication,
  exportDrivingSchoolToCSV,
  exportDrivingSchoolToExcel,
  exportDrivingSchoolToPDF,
  type DrivingSchoolApplication,
} from "@/lib/drivingSchool";
import { fetchAllUsers } from "@/lib/userService";
import { subscribeToTemplates, type TaskTemplate } from "@/lib/tasks";
import { createInvoice } from "@/lib/billing";
import { getInsuranceGstPercentage } from "@/lib/capitalize-settings";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Timestamp } from "firebase/firestore";
import { useApplicationAutoFill } from "@/hooks/useApplicationAutoFill";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatPaymentStatus, formatDateDDMMYYYY } from "@/lib/formatting";

const toDateString = (ts: any) => {
  if (!ts) return "";
  if (typeof ts === "string") return ts.split("T")[0];
  if (ts.toDate && typeof ts.toDate === "function") {
    try {
      return ts.toDate().toISOString().split("T")[0];
    } catch (e) {
      return "";
    }
  }
  if (ts.seconds) {
    try {
      return new Date(ts.seconds * 1000).toISOString().split("T")[0];
    } catch (e) {
      return "";
    }
  }
  return "";
};

const compressImageBase64 = (base64Str: string, callback: (compressed: string) => void) => {
  if (!base64Str || !base64Str.startsWith("data:image/")) {
    callback(base64Str);
    return;
  }
  const img = new Image();
  img.src = base64Str;
  img.onload = () => {
    const canvas = document.createElement("canvas");
    let width = img.width;
    let height = img.height;
    const MAX_WIDTH = 800;
    const MAX_HEIGHT = 800;
    if (width > height) {
      if (width > MAX_WIDTH) {
        height *= MAX_WIDTH / width;
        width = MAX_WIDTH;
      }
    } else {
      if (height > MAX_HEIGHT) {
        width *= MAX_HEIGHT / height;
        height = MAX_HEIGHT;
      }
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      callback(base64Str);
      return;
    }
    ctx.drawImage(img, 0, 0, width, height);
    const compressedData = canvas.toDataURL("image/jpeg", 0.35);
    callback(compressedData);
  };
  img.onerror = () => {
    callback(base64Str);
  };
};

export const DEFAULT_APP_TYPES = [
  "Non - Faceless",
  "Faceless",
  "Out Of Bhavnagar",
  "Out Of Bhavnagar To Bhavnagar",
];

export function getAppTypeBadgeColor(appType?: string) {
  if (!appType) return "bg-transparent text-slate-800 border-slate-500";
  const clean = appType.trim().toLowerCase();
  if (clean === "home" || clean === "non - faceless" || clean === "non-faceless") return "bg-transparent text-slate-700 border-slate-500";
  if (clean === "faceless") return "bg-transparent text-blue-700 border-blue-600";
  if (clean === "out of bhavnagar") return "bg-transparent text-rose-700 border-rose-600";
  if (clean === "out of bhavnagar to bhavnagar") return "bg-transparent text-amber-700 border-amber-600";
  return "bg-transparent text-slate-700 border-slate-500";
}

const SERVICE_GROUPS = [
  {
    category: "RC",
    items: [
      "Transfer of Ownership",
      "Duplicate RC",
      "Change Address",
      "Registration Renewal",
      "RC Particular(Screen Report)",
      "Correction of vehical(Vahaan ma sudharo vadharo)",
      "Backlog",
    ],
  },
  {
    category: "HYPOTHECATION",
    items: [
      "Hypothecation Addition",
      "Hypothecation Terminate",
      "Hypothecation Continue",
      "No Objection Certificate(Issue Other State)",
    ],
  },
  {
    category: "FITNESS",
    items: ["Fitness Renewal RTO", "Fitness Renewal ATS", "Duplicate Fitness Certificate"],
  },
  {
    category: "PERMITS",
    items: [
      "Gujarat Permit",
      "National Permit(Gujrat Permit)",
      "Gujarat Permit Renewal",
      "National Permit(Gujrat Permit) Renewal",
    ],
  },
  {
    category: "VEHICLE",
    items: ["Vehicle Alteration", "Vehicle Conversion"],
  },
  {
    category: "COMPLIANCE / OTHER",
    items: ["Tax", "PUC", "Tax Detail Update (Glitch)", "RMA(other state to gujarat)"],
  },
];

export const Route = createFileRoute("/dashboard/applications")({
  component: ApplicationsPage,
});

import { SubModuleTabs, type SubModuleType } from "@/components/SubModuleTabs";

function ApplicationsPage() {
  const session = getSession();
  const isAdmin = session?.role === "admin" || session?.role === "manager";
  const location = useLocation();
  const [activeSubModule, setActiveSubModule] = useState<SubModuleType>("services");

  const [courseTypes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("driving_school_course_types");
      return saved ? JSON.parse(saved) : ["15 Days", "21 Days", "26 Days", "45 Days", "60 Days"];
    } catch {
      return ["15 Days", "21 Days", "26 Days", "45 Days", "60 Days"];
    }
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sub = params.get("subModule");
    if (sub && (sub === "services" || sub === "licence" || sub === "driving_school" || sub === "insurance" || sub === "form5")) {
      setActiveSubModule(sub as SubModuleType);
    }
  }, [location.search]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<ApplicationRecord | null>(null);
  const [viewingApp, setViewingApp] = useState<ApplicationRecord | null>(null);

  // Delete modal state
  const [deletingApp, setDeletingApp] = useState<ApplicationRecord | null>(null);
  const [deletePasscode, setDeletePasscode] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
    const isPinValid = await verifyAdminPin(deletePasscode);
    if (!isPinValid) {
      toast.error("Invalid passcode!");
      return;
    }
    if (!deletingApp) return;

    setDeleting(true);
    try {
      await deleteApplication(deletingApp.id);
      toast.success("Application deleted successfully!");
      setDeletingApp(null);
      setDeletePasscode("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete application");
    } finally {
      setDeleting(false);
    }
  };

  const [accountingMap, setAccountingMap] = useState<Map<string, AccountingRecord>>(new Map());
  const [drivingSchoolApps, setDrivingSchoolApps] = useState<DrivingSchoolApplication[]>([]);
  const [dsCourseFilter, setDsCourseFilter] = useState("all");
  const [dsEmployeeFilter, setDsEmployeeFilter] = useState("all");
  const [dsStatusFilter, setDsStatusFilter] = useState("all");

  useEffect(() => {
    const unsubApps = subscribeApplications((data) => {
      setApplications(data);
      setLoading(false);
    });
    const unsubAcc = subscribeAccountingRecords((map) => {
      setAccountingMap(map);
    });
    const unsubDS = subscribeDrivingSchoolApplications((data) => {
      setDrivingSchoolApps(data);
    });
    return () => {
      unsubApps();
      unsubAcc();
      unsubDS();
    };
  }, []);

  const availableGroups = useMemo(() => {
    const groupsSet = new Set<string>();
    applications.forEach((app) => {
      const g = app.groupName || app.vehicleDetails?.groupName || (app as any).vehicleDetails?.groupName || "";
      if (g.trim()) {
        groupsSet.add(g.trim());
      }
    });
    drivingSchoolApps.forEach((app: any) => {
      const g = app.groupName || app.vehicleDetails?.groupName || (app as any).vehicleDetails?.groupName || "";
      if (g.trim()) {
        groupsSet.add(g.trim());
      }
    });
    return Array.from(groupsSet).sort((a, b) => a.localeCompare(b));
  }, [applications, drivingSchoolApps]);

  const handlePrintPDF = () => {
    const tableEl = document.querySelector("table");
    if (!tableEl) {
      toast.error("No data available to print");
      return;
    }

    let printWindow = window.open("", "_blank");
    if (!printWindow) {
      // Fallback: create hidden iframe for printing
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);
      printWindow = iframe.contentWindow as any;
      if (!printWindow) {
        toast.error("Failed to open print window. Please allow popups or use another browser.");
        return;
      }
    }

    const clonedTable = tableEl.cloneNode(true) as HTMLTableElement;

    const headers = clonedTable.querySelectorAll("thead th");
    const lastHeader = headers[headers.length - 1];
    if (lastHeader && lastHeader.textContent?.toLowerCase().includes("action")) {
      lastHeader.remove();
    }
    const rows = clonedTable.querySelectorAll("tbody tr");
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (cells.length > 0) {
        const lastCell = cells[cells.length - 1];
        lastCell.remove();
      }
    });

    const activeTabLabel = activeSubModule.toUpperCase();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${activeTabLabel} Applications Report</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            padding: 24px;
            color: #1e293b;
            background-color: #ffffff;
          }
          .header {
            margin-bottom: 24px;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 16px;
          }
          .title {
            font-size: 20px;
            font-weight: 700;
            color: #0f172a;
            margin: 0 0 6px 0;
            text-transform: uppercase;
          }
          .meta {
            font-size: 11px;
            color: #64748b;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
            text-align: left;
          }
          th {
            background-color: #f8fafc;
            color: #475569;
            font-weight: 600;
            padding: 8px 10px;
            border-bottom: 2px solid #e2e8f0;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          td {
            padding: 8px 10px;
            border-bottom: 1px solid #f1f5f9;
            color: #334155;
            font-weight: 500;
          }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">${activeTabLabel} APPLICATIONS REPORT</h1>
          <div class="meta">Generated on ${new Date().toLocaleString("en-IN")}</div>
        </div>
        ${clonedTable.outerHTML}
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleExportExcel = () => {
    const tableEl = document.querySelector("table");
    if (!tableEl) {
      toast.error("No data available to export");
      return;
    }

    const headers: string[] = [];
    const headerCols = tableEl.querySelectorAll("thead th");
    headerCols.forEach((th, idx) => {
      if (idx < headerCols.length - 1 || !th.textContent?.toLowerCase().includes("action")) {
        headers.push(`"${th.textContent?.trim().replace(/"/g, '""') || ""}"`);
      }
    });

    const rows: string[][] = [];
    const bodyRows = tableEl.querySelectorAll("tbody tr");
    bodyRows.forEach((tr) => {
      const cells = tr.querySelectorAll("td");
      const rowData: string[] = [];
      cells.forEach((td, idx) => {
        if (idx < cells.length - 1 || !headerCols[idx]?.textContent?.toLowerCase().includes("action")) {
          let val = td.textContent?.trim() || "";
          val = val.replace(/\s+/g, " ");
          rowData.push(`"${val.replace(/"/g, '""')}"`);
        }
      });
      if (rowData.length > 0) {
        rows.push(rowData);
      }
    });

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${activeSubModule}_applications_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Excel file downloaded successfully!");
  };

  const filteredApps = applications.filter((app) => {
    if (activeSubModule === "driving_school") return false;

    let appSubModule = app.subModule;
    if (!appSubModule) {
      const isForm5App = app.subModule === "form5";
      const isLicenceApp =
        app.subModule === "licence" ||
        app.applicationType === "Licence" ||
        (app.licenseDetails &&
          (app.licenseDetails.newLearningLicence?.enabled ||
            app.licenseDetails.dlNewLlEndorsement?.enabled ||
            app.licenseDetails.llRenewClass?.enabled ||
            app.licenseDetails.dlRenewRetest?.enabled ||
            (app.licenseDetails.generalLicenceServices?.selectedServices &&
              app.licenseDetails.generalLicenceServices.selectedServices.length > 0)));
      const isInsuranceApp =
        app.subModule === "insurance" ||
        (app.services || []).includes("Insurance");

      if (isForm5App) appSubModule = "form5";
      else if (isLicenceApp) appSubModule = "licence";
      else if (isInsuranceApp) appSubModule = "insurance";
      else appSubModule = "services";
    }

    if (activeSubModule !== appSubModule) {
      return false;
    }

    const term = searchTerm.toLowerCase();
    const matchSearch =
      app.vehicleNumber.toLowerCase().includes(term) ||
      app.ownerName.toLowerCase().includes(term) ||
      app.mobileNumber.toLowerCase().includes(term) ||
      app.applicationId.toLowerCase().includes(term);

    const matchStatus = statusFilter === "all" || app.applicationStatus === statusFilter;
    const matchPayment = paymentFilter === "all" || app.paymentStatus === paymentFilter;
    const appGroup = app.groupName || app.vehicleDetails?.groupName || (app as any).vehicleDetails?.groupName || "";
    const matchGroup = groupFilter === "all" || appGroup === groupFilter;

    return matchSearch && matchStatus && matchPayment && matchGroup;
  });

  const filteredDrivingSchoolApps = useMemo(() => {
    return drivingSchoolApps.filter((ds) => {
      const term = searchTerm.toLowerCase().trim();
      const matchSearch =
        !term ||
        ds.studentName.toLowerCase().includes(term) ||
        (ds.mobileNumber && ds.mobileNumber.includes(term)) ||
        (ds.courseType && ds.courseType.toLowerCase().includes(term)) ||
        (ds.applicationId && ds.applicationId.toLowerCase().includes(term)) ||
        (ds.drivingLicence && ds.drivingLicence.classes && ds.drivingLicence.classes.some((c: string) => c.toLowerCase().includes(term))) ||
        (ds.learningLicence && ds.learningLicence.classes && ds.learningLicence.classes.some((c: string) => c.toLowerCase().includes(term)));

      const matchPayment = paymentFilter === "all" || ds.paymentStatus === paymentFilter;
      const matchCourse = dsCourseFilter === "all" || ds.courseType === dsCourseFilter;
      const matchEmployee = dsEmployeeFilter === "all" || ds.assignedEmployee === dsEmployeeFilter;
      const matchStatus = dsStatusFilter === "all" || ds.status === dsStatusFilter;
      const matchGroup = groupFilter === "all" || (ds as any).groupName === groupFilter;

      return matchSearch && matchPayment && matchCourse && matchEmployee && matchStatus && matchGroup;
    });
  }, [drivingSchoolApps, searchTerm, paymentFilter, dsCourseFilter, dsEmployeeFilter, dsStatusFilter, groupFilter]);

  return (
    <div className="p-6 space-y-6 bg-slate-50/50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {activeSubModule === "driving_school" ? "Driving School Applications" : "Applications"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {activeSubModule === "driving_school" ? drivingSchoolApps.length : applications.length} total records • updated a moment ago
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrintPDF}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm transition-all shadow-sm active:scale-[0.98]"
          >
            <Printer className="w-4 h-4 text-rose-500" />
            Print / PDF
          </button>
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm transition-all shadow-sm active:scale-[0.98]"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
            Excel
          </button>
          {isAdmin && (
            <button
              onClick={() => {
                setEditingApp(null);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-all shadow-md shadow-blue-500/20 active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              New Application
            </button>
          )}
        </div>
      </div>

      {/* 3 Main Sub Module Services, Licence, Driving School Tabs */}
      <div>
        <SubModuleTabs activeTab={activeSubModule} onChange={setActiveSubModule} />
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={activeSubModule === "driving_school" ? "Search student, mobile, course..." : "Search vehicle, owner, mobile..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
          {activeSubModule === "driving_school" ? (
            <>
              <select
                value={dsCourseFilter}
                onChange={(e) => setDsCourseFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">All Courses</option>
                {courseTypes.map((course) => (
                  <option key={course} value={course}>
                    {course}
                  </option>
                ))}
              </select>
              <select
                value={dsStatusFilter}
                onChange={(e) => setDsStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Completed">Completed</option>
                <option value="On Hold">On Hold</option>
              </select>
            </>
          ) : (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Submitted">Submitted</option>
              <option value="In Review">In Review</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="On Hold">On Hold</option>
            </select>
          )}

          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="all">All</option>
            <option value="Paid">Total jama</option>
            <option value="Pending">Badha baki</option>
            <option value="Partial">Thoda Baki</option>
          </select>

          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="all">ALL GROUPS</option>
            {availableGroups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Applications Table - Dynamic Column View according to SubModule */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-4 text-center">SR No</th>
                {activeSubModule === "driving_school" ? (
                  <>
                    <th className="py-3.5 px-4 font-bold text-slate-900">Student Name</th>
                    <th className="py-3.5 px-4">Mobile Number</th>
                    <th className="py-3.5 px-4">Date of Birth</th>
                    <th className="py-3.5 px-4">Course</th>
                    <th className="py-3.5 px-4">Joining Date</th>
                    <th className="py-3.5 px-4">Course End Date</th>
                    <th className="py-3.5 px-4">Duration</th>
                    <th className="py-3.5 px-4 font-bold text-slate-900">કુલ રકમ</th>
                    <th className="py-3.5 px-4 font-bold text-emerald-700">કુલ જમા</th>
                    <th className="py-3.5 px-4 font-bold text-amber-700">બાકી</th>
                    <th className="py-3.5 px-4">Payment Status</th>
                    <th className="py-3.5 px-4">Assigned Employee</th>
                    <th className="py-3.5 px-4">Status</th>
                  </>
                ) : activeSubModule === "form5" ? (
                  <>
                    <th className="py-3.5 px-4 font-bold text-slate-900">Name</th>
                    <th className="py-3.5 px-4">Date Of Birth</th>
                    <th className="py-3.5 px-4 font-bold text-slate-900">Application No</th>
                    <th className="py-3.5 px-4">Adhar No</th>
                    <th className="py-3.5 px-4">LL NO</th>
                    <th className="py-3.5 px-4">DL NO</th>
                    <th className="py-3.5 px-4">Expire date</th>
                    <th className="py-3.5 px-4">nt expire date</th>
                    <th className="py-3.5 px-4">tr expire date</th>
                  </>
                ) : activeSubModule === "licence" ? (
                  <>
                    <th className="py-3.5 px-4">Client Name</th>
                    <th className="py-3.5 px-4">DOB</th>
                    <th className="py-3.5 px-4">Mobile Number</th>
                    {/* Dynamic service expiries */}
                    {Array.from(
                      new Set(
                        filteredApps.flatMap((app) => {
                          const services: string[] = app.services || [];
                          if (services.length > 0) return services;
                          const licServices: string[] = [];
                          const ld = app.licenseDetails;
                          if (ld?.newLearningLicence?.enabled) licServices.push("New Learning Licence");
                          if (ld?.dlNewLlEndorsement?.enabled) licServices.push("DL New LL Endorsement");
                          if (ld?.llRenewClass?.enabled) licServices.push("LL Renew Class");
                          if (ld?.dlRenewRetest?.enabled) licServices.push("DL Renew / Retest");
                          if (ld?.generalLicenceServices?.selectedServices) {
                            licServices.push(...ld.generalLicenceServices.selectedServices);
                          }
                          return licServices.length > 0 ? licServices : ["License Service"];
                        })
                      )
                    ).map((srvName) => (
                      <th key={srvName} className="py-3.5 px-4">
                        {srvName} Expire Date
                      </th>
                    ))}
                    <th className="py-3.5 px-4 font-bold text-slate-900">કુલ રકમ</th>
                    <th className="py-3.5 px-4 font-bold text-emerald-700">કુલ જમા</th>
                    <th className="py-3.5 px-4 font-bold text-amber-700">બાકી</th>
                    <th className="py-3.5 px-4">Payment Status</th>
                    <th className="py-3.5 px-4 font-mono text-slate-600">Reference</th>
                  </>
                ) : activeSubModule === "insurance" ? (
                  <>
                    <th className="py-3.5 px-4 font-bold text-slate-900">Vehicle Number</th>
                    <th className="py-3.5 px-4">Owner Name</th>
                    <th className="py-3.5 px-4">Phone Number</th>
                    <th className="py-3.5 px-4">Issue Date</th>
                    <th className="py-3.5 px-4">Expiry Date</th>
                    <th className="py-3.5 px-4">Total Premium</th>
                    <th className="py-3.5 px-4">Net Commission</th>
                    <th className="py-3.5 px-4 font-bold text-slate-900">કુલ રકમ</th>
                    <th className="py-3.5 px-4 font-bold text-emerald-700">કુલ જમા</th>
                  </>
                ) : (
                  <>
                    <th className="py-3.5 px-4 font-bold text-slate-900">Vehicle Number</th>
                    <th className="py-3.5 px-4">Owner Name</th>
                    <th className="py-3.5 px-4">Phone Number</th>
                    <th className="py-3.5 px-4">Maker Name</th>
                    <th className="py-3.5 px-4">Model Name</th>
                    <th className="py-3.5 px-4">PUC Expiry</th>
                    <th className="py-3.5 px-4">Tax Expiry</th>
                    <th className="py-3.5 px-4">Fitness Expiry</th>
                    {activeSubModule !== "services" && <th className="py-3.5 px-4">Insurance Expiry</th>}
                    <th className="py-3.5 px-4">National Permit(Gujrat Permit) Expiry</th>
                    <th className="py-3.5 px-4">Gujarat Permit Expiry</th>
                    <th className="py-3.5 px-4">NP Authorization Expiry</th>
                    <th className="py-3.5 px-4">Registration Renewal Expiry</th>
                    <th className="py-3.5 px-4 text-center">Total Services</th>
                    <th className="py-3.5 px-4 font-bold text-slate-900">કુલ રકમ</th>
                    <th className="py-3.5 px-4 font-bold text-emerald-700">કુલ જમા</th>
                  </>
                )}
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={25} className="py-12 text-center text-slate-400">
                    Loading applications...
                  </td>
                </tr>
              ) : activeSubModule === "driving_school" ? (
                filteredDrivingSchoolApps.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="py-12 text-center text-slate-400">
                      No Driving School Applications Found.
                    </td>
                  </tr>
                ) : (
                  filteredDrivingSchoolApps.map((ds, index) => {
                    const totFee = Number(ds.totalCourseFees) || 0;
                    const advFee = Number(ds.advancePaid) || 0;
                    const remFee = typeof ds.remainingFees === "number" ? ds.remainingFees : Math.max(0, totFee - advFee);
                    const pStatus = remFee <= 0 && totFee > 0 ? "Paid" : advFee > 0 ? "Partial" : "Pending";

                    let durationStr = "—";
                    if (ds.courseStartDate && ds.courseEndDate) {
                      const start = new Date(ds.courseStartDate);
                      const end = new Date(ds.courseEndDate);
                      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                        const diffTime = Math.abs(end.getTime() - start.getTime());
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                        durationStr = `${diffDays} Days`;
                      }
                    }

                    return (
                      <tr
                        key={ds.id}
                        onClick={() => {
                          setViewingApp({
                            ...ds,
                            ownerName: ds.studentName,
                            subModule: "driving_school",
                          } as any);
                        }}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-4 text-center text-slate-400 font-mono">{index + 1}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">{ds.studentName}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">{ds.mobileNumber || "—"}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">{ds.dateOfBirth || "—"}</td>
                        <td className="py-3.5 px-4 font-semibold text-blue-600">{ds.courseType || "—"}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">{ds.joiningDate || "—"}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">{ds.courseEndDate || "—"}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-700">{durationStr}</td>
                        <td className="py-3.5 px-4 font-bold font-mono text-slate-900">₹{totFee.toLocaleString("en-IN")}</td>
                        <td className="py-3.5 px-4 font-bold font-mono text-emerald-700">₹{advFee.toLocaleString("en-IN")}</td>
                        <td className="py-3.5 px-4 font-bold font-mono text-amber-700">₹{remFee.toLocaleString("en-IN")}</td>
                        <td className="py-3.5 px-4">
                          <span
                            className={cn(
                              "px-2.5 py-1 rounded-full text-[10px] font-bold border",
                              pStatus === "Paid"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : pStatus === "Partial"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-rose-50 text-rose-700 border-rose-200"
                            )}
                          >
                            {formatPaymentStatus(pStatus)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">{ds.assignedEmployee || "Unassigned"}</td>
                        <td className="py-3.5 px-4">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-md text-[10px] font-semibold",
                              ds.status === "Completed"
                                ? "bg-slate-100 text-slate-600"
                                : "bg-blue-50 text-blue-700"
                            )}
                          >
                            {ds.status || "Active"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setEditingApp({
                                    ...ds,
                                    id: ds.id,
                                    applicationId: ds.applicationId || ds.id,
                                    vehicleNumber: ds.vehicleNumber || "",
                                    ownerName: ds.studentName,
                                    mobileNumber: ds.mobileNumber,
                                    subModule: "driving_school",
                                    dateOfBirth: ds.dateOfBirth,
                                    joiningDate: ds.joiningDate,
                                    courseStartDate: ds.courseStartDate,
                                    courseEndDate: ds.courseEndDate,
                                    courseType: ds.courseType,
                                    totalCourseFees: ds.totalCourseFees,
                                    advancePaid: ds.advancePaid,
                                    remainingFees: ds.remainingFees,
                                    assignedEmployee: ds.assignedEmployee,
                                    reminderDate: ds.reminderDate,
                                    priority: ds.priority,
                                    employeeNotes: ds.employeeNotes,
                                    documents: ds.documents,
                                    status: ds.status,
                                    bloodGroup: ds.bloodGroup,
                                    gender: ds.gender,
                                    address: ds.address,
                                    drivingLicenceStatus: ds.drivingLicenceStatus,
                                    drivingLicence: ds.drivingLicence,
                                    learningLicence: ds.learningLicence,
                                  } as any);
                                  setIsModalOpen(true);
                                }}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 transition-colors"
                                title="Edit Application"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                onClick={async () => {
                                  if (window.confirm(`Delete Driving School application for ${ds.studentName}?`)) {
                                    try {
                                      await deleteDrivingSchoolApplication(ds.id);
                                      toast.success("Driving School application deleted.");
                                    } catch (err) {
                                      toast.error("Failed to delete application.");
                                    }
                                  }
                                }}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-rose-600 transition-colors"
                                title="Delete Application"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )
              ) : filteredApps.length === 0 ? (
                <tr>
                  <td colSpan={25} className="py-12 text-center text-slate-400">
                    No applications found.
                  </td>
                </tr>
              ) : (
                filteredApps.map((app, index) => {
                  if (activeSubModule === "form5") {
                    const fd = (app.form5Details || {}) as Form5DetailsData;
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
                      <tr
                        key={app.id}
                        onClick={() => setViewingApp(app)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-4 text-center text-slate-400 font-mono">{index + 1}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">{nameVal}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">{dobVal}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-600 font-bold">{appNoVal}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">{aadhaarVal}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">{llVal}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">{dlVal}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">{llExpiryVal}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">{ntVal}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">{trVal}</td>
                        <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setViewingApp(app)}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-blue-600 transition-all"
                              title="View Application Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingApp(app);
                                setIsModalOpen(true);
                              }}
                              className="p-1.5 hover:bg-amber-50 rounded-lg text-amber-600 transition-all"
                              title="Edit Application"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setDeletingApp(app);
                                setDeletePasscode("");
                              }}
                              className="p-1.5 hover:bg-rose-50 rounded-lg text-rose-600 transition-all"
                              title="Delete Application"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  if (activeSubModule === "insurance") {
                    const appRaw = app as any;
                    const v = appRaw.vehicleDetails || appRaw.vehicleMaster || appRaw || {};
                    const insDetails = appRaw.insuranceDetails || v.insuranceDetails || {};
                    const acc = accountingMap.get(app.id) || accountingMap.get(app.applicationId);
                    const totalPay = app.amount || app.serviceAccounting?.Insurance?.totalAmount || (acc?.totalCharges ?? acc?.totalPayment ?? 0);
                    const advPay = app.totalPaid || app.serviceAccounting?.Insurance?.advancePayment || (acc?.advancePaid ?? acc?.advancePayment ?? 0);

                    const ownerName = app.ownerName || appRaw.clientName || v.ownerName || "—";
                    const phoneNo = app.mobileNumber || appRaw.phone || appRaw.phoneNo || v.phone || v.mobileNumber || "—";
                    const vehNo = app.vehicleNumber || app.vehicleId || "—";

                    const issueDate = insDetails.issueDate || appRaw.insuranceIssueDate || "—";
                    const expiryDate = insDetails.expiryDate || appRaw.insuranceExpiryDate || "—";
                    const totalPremium = insDetails.totalPremium ?? insDetails.amount ?? appRaw.totalPremium ?? "—";
                    const netCommission = insDetails.netCommission ?? appRaw.netCommission ?? "—";

                    return (
                      <tr
                        key={app.id}
                        onClick={() => setViewingApp(app)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-4 text-center text-slate-400 font-mono">{index + 1}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900 font-mono">
                          {vehNo}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-800">
                          {ownerName}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-700">
                          {phoneNo}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">{issueDate}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">{expiryDate}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">
                          {typeof totalPremium === "number" ? `₹${totalPremium.toLocaleString("en-IN")}` : totalPremium}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">
                          {typeof netCommission === "number" ? `₹${netCommission.toLocaleString("en-IN")}` : netCommission}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900 font-mono">
                          ₹{totalPay.toLocaleString("en-IN")}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-emerald-700 font-mono">
                          ₹{advPay.toLocaleString("en-IN")}
                        </td>
                        <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setViewingApp(app)}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-blue-600 transition-all"
                              title="View Application Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setEditingApp(app);
                                  setIsModalOpen(true);
                                }}
                                className="p-1.5 hover:bg-amber-50 rounded-lg text-amber-600 transition-all"
                                title="Edit Application"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setDeletingApp(app);
                                  setDeletePasscode("");
                                }}
                                className="p-1.5 hover:bg-rose-50 rounded-lg text-rose-600 transition-all"
                                title="Delete Application"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  if (activeSubModule === "licence") {
                    const ld = app.licenseDetails;
                    const clientDob = formatDateDDMMYYYY(ld?.dateOfBirth);
                    const acc = accountingMap.get(app.id) || accountingMap.get(app.applicationId);
                    const totalPay = acc?.totalPayment ?? app.amount ?? 0;
                    const advPay = acc?.advancePayment ?? app.totalPaid ?? 0;
                    const remPay = acc?.remainingPayment ?? (typeof app.pendingAmount === "number" ? app.pendingAmount : Math.max(0, totalPay - advPay));
                    const rawStatus = acc?.paymentStatus ?? app.paymentStatus ?? (remPay <= 0 ? "Paid" : advPay > 0 ? "Partially Paid" : "Pending");
                    const pStatus = rawStatus === "Partially Paid" ? "Partial" : rawStatus;
                    const refCode = app.applicationId || (app as any).reference || "—";

                    // Compute dynamic services list & exps
                    const allUniqueServices = Array.from(
                      new Set(
                        filteredApps.flatMap((a) => {
                          const services: string[] = a.services || [];
                          if (services.length > 0) return services;
                          const licServices: string[] = [];
                          const l = a.licenseDetails;
                          if (l?.newLearningLicence?.enabled) licServices.push("New Learning Licence");
                          if (l?.dlNewLlEndorsement?.enabled) licServices.push("DL New LL Endorsement");
                          if (l?.llRenewClass?.enabled) licServices.push("LL Renew Class");
                          if (l?.dlRenewRetest?.enabled) licServices.push("DL Renew / Retest");
                          if (l?.generalLicenceServices?.selectedServices) {
                            licServices.push(...l.generalLicenceServices.selectedServices);
                          }
                          return licServices.length > 0 ? licServices : ["License Service"];
                        })
                      )
                    );

                    const getExpiryForService = (srvName: string) => {
                      if (!ld) return app.expiryDate || "—";
                      if (srvName.includes("Learning") || srvName.includes("New Learning")) {
                        return ld.newLearningLicence?.step1?.expiryDate || ld.newLearningLicence?.appointmentDate || app.expiryDate || "—";
                      }
                      if (srvName.includes("Endorsement")) {
                        return ld.dlNewLlEndorsement?.step2?.expiryDate || ld.dlNewLlEndorsement?.step3?.validityDate || app.expiryDate || "—";
                      }
                      if (srvName.includes("Renew")) {
                        return ld.llRenewClass?.step1?.expiryDate || ld.llRenewClass?.step3?.validityDate || app.expiryDate || "—";
                      }
                      return app.expiryDate || "—";
                    };

                    return (
                      <tr
                        key={app.id}
                        onClick={() => setViewingApp(app)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-4 text-center text-slate-400 font-mono">{index + 1}</td>
                        <td className="py-3.5 px-4 font-bold text-blue-900">{app.ownerName}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">{clientDob}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-700">{app.mobileNumber}</td>
                        {allUniqueServices.map((srvName) => (
                          <td key={srvName} className="py-3.5 px-4 font-mono text-slate-600">
                            {formatDateDDMMYYYY(getExpiryForService(srvName))}
                          </td>
                        ))}
                        <td className="py-3.5 px-4 font-bold text-slate-900 font-mono">
                          ₹{totalPay.toLocaleString("en-IN")}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-emerald-700 font-mono">
                          ₹{advPay.toLocaleString("en-IN")}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-amber-700 font-mono">
                          ₹{remPay.toLocaleString("en-IN")}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={cn(
                              "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                              pStatus === "Paid" && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                              pStatus === "Pending" && "bg-amber-50 text-amber-700 border border-amber-200",
                              pStatus === "Partial" && "bg-blue-50 text-blue-700 border border-blue-200"
                            )}
                          >
                            {formatPaymentStatus(pStatus)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-700 font-semibold">{refCode}</td>
                        <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setViewingApp(app)}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-blue-600 transition-all"
                              title="View Application Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setEditingApp(app);
                                  setIsModalOpen(true);
                                }}
                                className="p-1.5 hover:bg-amber-50 rounded-lg text-amber-600 transition-all"
                                title="Edit Application"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setDeletingApp(app);
                                  setDeletePasscode("");
                                }}
                                className="p-1.5 hover:bg-rose-50 rounded-lg text-rose-600 transition-all"
                                title="Delete Application"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  const appRaw = app as any;
                  const v = appRaw.vehicleDetails || appRaw.vehicleMaster || appRaw || {};
                  const acc = accountingMap.get(app.id) || accountingMap.get(app.applicationId);
                  const regTotalPay = acc?.totalCharges ?? acc?.totalPayment ?? app.amount ?? 0;
                  const regAdvPay = acc?.advancePaid ?? acc?.advancePayment ?? app.totalPaid ?? 0;

                  const srvs = app.services || [];
                  const ownerName = app.ownerName || appRaw.clientName || v.ownerName || "—";
                  const phoneNo = app.mobileNumber || appRaw.phone || appRaw.phoneNo || v.phone || v.mobileNumber || "—";
                  const makerName = v.makerName || appRaw.makerName || "—";
                  const modelName = v.modelName || appRaw.modelName || "—";

                  const pucExp = appRaw.pucExpiryDate || v.pucExpiryDate || v.pucDetails?.expiryDate || "—";
                  const taxExp = appRaw.taxExpiryDate || v.taxExpiryDate || v.taxDetails?.expiryDate || "—";
                  const fitExp = appRaw.fitnessExpiryDate || v.fitnessExpiryDate || v.fitnessDetails?.expiryDate || "—";
                  const insExp = appRaw.insuranceExpiryDate || v.insuranceExpiryDate || v.insuranceDetails?.expiryDate || "—";
                  const natPermitExp = appRaw.nationalPermitExpiryDate || v.nationalPermitExpiryDate || v.permitDetails?.nationalPermitExpiryDate || "—";
                  const gujPermitExp = appRaw.gujaratPermitExpiryDate || v.gujaratPermitExpiryDate || v.permitDetails?.gujaratPermitExpiryDate || "—";
                  const npAuthExp = appRaw.npAuthExpiryDate || v.npAuthExpiryDate || v.permitDetails?.nationalAuthExpiryDate || "—";
                  const regValidity = appRaw.registrationRenewalExpiryDate || v.registrationRenewalExpiryDate || v.registrationDetails?.registrationValidity || "—";

                  return (
                    <tr
                      key={app.id}
                      onClick={() => setViewingApp(app)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4 text-center text-slate-400 font-mono">{index + 1}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-900 font-mono">
                        {app.vehicleNumber}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-800">
                        {ownerName}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700">
                        {phoneNo}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">
                        {makerName}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">
                        {modelName}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">{pucExp}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">{taxExp}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">{fitExp}</td>
                      {activeSubModule !== "services" && <td className="py-3.5 px-4 font-mono text-slate-600">{insExp}</td>}
                      <td className="py-3.5 px-4 font-mono text-slate-600">{natPermitExp}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">{gujPermitExp}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">{npAuthExp}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">{regValidity}</td>
                      <td className="py-3.5 px-4 text-center font-bold text-slate-800">
                        {srvs.length}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900 font-mono">
                        ₹{regTotalPay.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-emerald-700 font-mono">
                        ₹{regAdvPay.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setViewingApp(app)}
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-blue-600 transition-all"
                            title="View Application Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => {
                                setEditingApp(app);
                                setIsModalOpen(true);
                              }}
                              className="p-1.5 hover:bg-amber-50 rounded-lg text-amber-600 transition-all"
                              title="Edit Application"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => {
                                setDeletingApp(app);
                                setDeletePasscode("");
                              }}
                              className="p-1.5 hover:bg-rose-50 rounded-lg text-rose-600 transition-all"
                              title="Delete Application"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Passcode Confirmation Dialog */}
      {deletingApp && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-lg font-bold text-slate-900">Delete Application</h3>
              <button
                onClick={() => setDeletingApp(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to delete application for vehicle{" "}
              <strong className="text-slate-900 font-mono">{deletingApp.vehicleNumber}</strong>?
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Enter Passcode to Confirm</label>
              <input
                type="password"
                placeholder="Enter Passcode"
                value={deletePasscode}
                onChange={(e) => setDeletePasscode(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeletingApp(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="px-4 py-2 text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow transition disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete Application"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New / Edit Application Modal */}
      {isModalOpen && (
        <ApplicationFormModal
          initialSubModule={activeSubModule}
          editingApp={editingApp}
          applications={applications}
          onClose={() => {
            setIsModalOpen(false);
            setEditingApp(null);
          }}
        />
      )}

      {/* View Application Details Popup Modal */}
      {viewingApp && <ApplicationDetailsModal app={viewingApp} onClose={() => setViewingApp(null)} />}
    </div>
  );
}

function InlineDocUpload({
  label,
  docName,
  uploadedDocs,
  setUploadedDocs,
  setPreviewDoc,
}: {
  label: string;
  docName: string;
  uploadedDocs: Record<string, string>;
  setUploadedDocs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setPreviewDoc: (doc: { name: string; url: string } | null) => void;
}) {
  let docUrl = uploadedDocs[docName];
  if (!docUrl) {
    if (docName === "Registration RC Document" || docName === "Tax RC Document") {
      docUrl = uploadedDocs["RC Book"];
    }
    if (docName === "Tax Receipt Document" || docName === "Tax RC Document") {
      docUrl = docUrl || uploadedDocs["Tax Receipt"];
    }
    if (docName === "Fitness Document") {
      docUrl = uploadedDocs["Fitness"];
    }
    if (docName === "Gujarat Permit Document") {
      docUrl = uploadedDocs["Gujarat Permit"];
    }
    if (docName === "National Permit(Gujrat Permit) Document") {
      docUrl = uploadedDocs["National Permit(Gujrat Permit)"];
    }
    if (docName === "National Permit Authorization Document") {
      docUrl = uploadedDocs["National Permit Authorization"];
    }
    if (docName === "PUC Document") {
      docUrl = uploadedDocs["PUC"];
    }
    if (docName === "Insurance Document") {
      docUrl = uploadedDocs["Insurance"];
    }
  }
  const isUploaded = !!docUrl;

  const printDoc = (url: string, name: string) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Print ${name}</title>
          <style>
            body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
            img, iframe { max-width: 100%; max-height: 100%; object-fit: contain; }
          </style>
        </head>
        <body>
    `);
    if (url.startsWith("data:application/pdf")) {
      printWindow.document.write(`<iframe src="${url}" width="100%" height="100%" style="border: none;"></iframe>`);
    } else {
      printWindow.document.write(`<img src="${url}" onload="window.print(); window.close();" />`);
    }
    printWindow.document.write(`
        </body>
      </html>
    `);
    printWindow.document.close();
    if (url.startsWith("data:application/pdf")) {
      setTimeout(() => {
        printWindow.print();
      }, 1000);
    }
  };

  return (
    <div className={cn(
      "flex flex-col gap-1 p-2.5 border rounded-xl",
      isUploaded
        ? "bg-emerald-50/40 border-emerald-200"
        : "bg-rose-50/60 border-rose-200"
    )}>
      <span className={cn("text-[10px] font-bold uppercase tracking-wider", isUploaded ? "text-emerald-700" : "text-rose-600")}>{label}</span>
      <div className="flex items-center gap-2 mt-1">
        {isUploaded ? (
          <div className="flex items-center justify-between w-full bg-emerald-50/60 border border-emerald-200 p-1.5 rounded-lg">
            <span className="text-xs font-semibold text-emerald-800 truncate max-w-[120px]">{docName}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPreviewDoc({ name: docName, url: docUrl })}
                className="text-[9px] font-bold text-blue-600 hover:bg-blue-100/50 px-1.5 py-0.5 rounded transition"
              >
                View
              </button>
              <button
                type="button"
                onClick={() => printDoc(docUrl, docName)}
                className="text-[9px] font-bold text-emerald-600 hover:bg-emerald-100/50 px-1.5 py-0.5 rounded transition"
              >
                Print
              </button>
              <button
                type="button"
                onClick={() => {
                  setUploadedDocs((prev) => {
                    const next = { ...prev };
                    delete next[docName];
                    if (docName === "Registration RC Document" || docName === "Tax RC Document") {
                      delete next["RC Book"];
                    }
                    if (docName === "Tax Receipt Document" || docName === "Tax RC Document") {
                      delete next["Tax Receipt"];
                    }
                    if (docName === "Fitness Document") {
                      delete next["Fitness"];
                    }
                    if (docName === "Gujarat Permit Document") {
                      delete next["Gujarat Permit"];
                    }
                    if (docName === "National Permit(Gujrat Permit) Document") {
                      delete next["National Permit(Gujrat Permit)"];
                    }
                    if (docName === "National Permit Authorization Document") {
                      delete next["National Permit Authorization"];
                    }
                    if (docName === "PUC Document") {
                      delete next["PUC"];
                    }
                    if (docName === "Insurance Document") {
                      delete next["Insurance"];
                    }
                    return next;
                  });
                }}
                className="text-[9px] font-bold text-rose-600 hover:bg-rose-100/50 px-1.5 py-0.5 rounded transition"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-1.5 w-full border border-dashed border-rose-300 hover:border-rose-400 p-1.5 rounded-lg cursor-pointer transition hover:bg-rose-100/40 text-rose-600 bg-rose-50/60">
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.type === "application/pdf" && file.size > 200 * 1024) {
                  toast.error("PDF file size must be under 200KB to fit database limit");
                  return;
                }
                const reader = new FileReader();
                reader.onload = (evt) => {
                  const result = evt.target?.result as string;
                  compressImageBase64(result, (compressed) => {
                    setUploadedDocs((prev) => ({ ...prev, [docName]: compressed }));
                    toast.success(`${docName} uploaded!`);
                  });
                };
                reader.readAsDataURL(file);
              }}
            />
            <Upload className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-[10px] font-bold text-rose-600">Upload Document</span>
          </label>
        )}
      </div>
    </div>
  );
}

function VehicleClassMultiSelect({
  selectedClasses,
  onChange,
  label,
}: {
  selectedClasses: string[];
  onChange: (classes: string[]) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => [
    "Motor Cycle without Gear (Non Transport) (MCWOG)",
    "Motor Cycle with Gear (Non Transport) (MCWG)",
    "LIGHT MOTOR VEHICLE (LMV)",
    "Adapted Vehicle (ADPVEH)",
    "MCWG", "MCWOG", "LMV", "LMV-NT", "LMV-TR", "HMV", "HGMV", "HPMV", "HPV",
    "Transport", "Tractor", "Trailer", "Road Roller", "Excavator", "Crane", "Other"
  ], []);

  const filtered = useMemo(() => {
    return options.filter(opt => opt.toLowerCase().includes(search.toLowerCase()));
  }, [options, search]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = (opt: string) => {
    if (selectedClasses.includes(opt)) {
      onChange(selectedClasses.filter(c => c !== opt));
    } else {
      onChange([...selectedClasses, opt]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
        setActiveIndex(0);
      }
      return;
    }

    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(prev => (filtered.length > 0 ? (prev + 1) % filtered.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(prev => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filtered.length) {
        handleToggle(filtered[activeIndex]);
      }
    }
  };

  return (
    <div className="relative text-xs w-full" ref={containerRef}>
      <label className="font-semibold text-slate-700 block mb-1 uppercase tracking-wider">{label} <span className="text-rose-500">*</span></label>
      <div
        tabIndex={0}
        onClick={() => {
          setOpen(!open);
          if (!open) setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          "min-h-[42px] p-1.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap gap-1.5 items-center cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all",
          open && "border-blue-300 bg-white"
        )}
      >
        {selectedClasses.length === 0 ? (
          <span className="text-slate-400 pl-2">Select vehicle classes...</span>
        ) : (
          selectedClasses.map(cls => (
            <span
              key={cls}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-800 text-[10px] font-bold rounded-lg border border-blue-100"
              onClick={(e) => {
                e.stopPropagation();
                onChange(selectedClasses.filter(c => c !== cls));
              }}
            >
              {cls}
              <span className="text-blue-500 hover:text-blue-700 font-bold ml-0.5">×</span>
            </span>
          ))
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 space-y-2.5 max-h-[250px] overflow-y-auto">
          <input
            type="text"
            placeholder="Search classes..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setActiveIndex(0);
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
            className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-300"
          />
          <div className="grid grid-cols-2 gap-1.5">
            {filtered.length === 0 ? (
              <div className="col-span-2 p-2 text-center text-slate-400 italic">No classes found</div>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = selectedClasses.includes(opt);
                const isActive = idx === activeIndex;
                return (
                  <label
                    key={opt}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-xl border cursor-pointer font-semibold text-[11px] transition-all select-none",
                      isSelected
                        ? "bg-blue-50 border-blue-200 text-blue-900"
                        : "bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-700",
                      isActive && "ring-2 ring-blue-400"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggle(opt);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => { }}
                      className="w-3.5 h-3.5 text-blue-600 rounded cursor-pointer"
                    />
                    <span>{opt}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ApplicationFormModal({
  initialSubModule = "services",
  editingApp,
  applications = [],
  onClose,
}: {
  initialSubModule?: SubModuleType;
  editingApp?: ApplicationRecord | null;
  applications?: ApplicationRecord[];
  onClose: () => void;
}) {
  const [activeSubModule, setActiveSubModule] = useState<SubModuleType>(
    editingApp?.subModule || initialSubModule
  );

  const gstPercentage = getInsuranceGstPercentage();
  const [showLicenseDocsSection, setShowLicenseDocsSection] = useState(true);
  const [newGroupInput, setNewGroupInput] = useState("");

  // Unique suggestions collected from existing application records
  const coNameSuggestions = useMemo(() => {
    return Array.from(new Set(
      applications
        .map((app) => app.vehicleDetails?.coName || "")
        .map((val) => val.trim())
        .filter((val) => val.length > 0)
    ));
  }, [applications]);

  const groupNameSuggestions = useMemo(() => {
    return Array.from(new Set(
      applications
        .map((app) => app.vehicleDetails?.groupName || (app as any).groupName || "")
        .map((val) => val.trim())
        .filter((val) => val.length > 0)
    ));
  }, [applications]);

  const vehicleClassSuggestions = useMemo(() => {
    return Array.from(new Set(
      applications
        .map((app) => app.vehicleDetails?.vehicleClass || "")
        .map((val) => val.trim())
        .filter((val) => val.length > 0)
    ));
  }, [applications]);

  const makerNameSuggestions = useMemo(() => {
    return Array.from(new Set(
      applications
        .map((app) => app.vehicleDetails?.makerName || "")
        .map((val) => val.trim())
        .filter((val) => val.length > 0)
    ));
  }, [applications]);

  const modelNameSuggestions = useMemo(() => {
    return Array.from(new Set(
      applications
        .map((app) => app.vehicleDetails?.modelName || "")
        .map((val) => val.trim())
        .filter((val) => val.length > 0)
    ));
  }, [applications]);

  const colourSuggestions = useMemo(() => {
    return Array.from(new Set(
      applications
        .map((app) => app.vehicleDetails?.colour || "")
        .map((val) => val.trim())
        .filter((val) => val.length > 0)
    ));
  }, [applications]);

  const bodyTypeSuggestions = useMemo(() => {
    return Array.from(new Set(
      applications
        .map((app) => app.vehicleDetails?.bodyType || "")
        .map((val) => val.trim())
        .filter((val) => val.length > 0)
    ));
  }, [applications]);

  // Driving School State
  const [courseTypes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("driving_school_course_types");
      return saved ? JSON.parse(saved) : ["15 Days", "21 Days", "26 Days", "45 Days", "60 Days"];
    } catch {
      return ["15 Days", "21 Days", "26 Days", "45 Days", "60 Days"];
    }
  });
  const [dsGender, setDsGender] = useState<"Male" | "Female" | "Other">((editingApp as any)?.gender || "Male");

  const initialDlStatus = (editingApp as any)?.drivingLicenceStatus
    ? (editingApp as any).drivingLicenceStatus
    : (((editingApp as any)?.hasDrivingLicence || (editingApp as any)?.drivingLicence) ? "WITH_DL" : "WITHOUT_DL");
  const [dsDlStatus, setDsDlStatus] = useState<"WITH_DL" | "WITHOUT_DL">(initialDlStatus);

  // WITH DL state variables
  const [dsDlNumber, setDsDlNumber] = useState<string>((editingApp as any)?.drivingLicence?.number || (editingApp as any)?.drivingLicenceNumber || "");
  const [dsDlIssueDate, setDsDlIssueDate] = useState<string>(toDateString((editingApp as any)?.drivingLicence?.issueDate));
  const [dsDlExpiryDate, setDsDlExpiryDate] = useState<string>(toDateString((editingApp as any)?.drivingLicence?.expiryDate));
  const [dsDlClasses, setDsDlClasses] = useState<string[]>((editingApp as any)?.drivingLicence?.classes || []);

  // WITHOUT DL state variables
  const [dsLlNumber, setDsLlNumber] = useState<string>((editingApp as any)?.learningLicence?.number || "");
  const [dsLlIssueDate, setDsLlIssueDate] = useState<string>(toDateString((editingApp as any)?.learningLicence?.issueDate));
  const [dsLlExpiryDate, setDsLlExpiryDate] = useState<string>(toDateString((editingApp as any)?.learningLicence?.expiryDate));
  const [dsLlClasses, setDsLlClasses] = useState<string[]>((editingApp as any)?.learningLicence?.classes || []);

  const [dsBloodGroup, setDsBloodGroup] = useState<string>((editingApp as any)?.bloodGroup || "");
  const [dsJoiningDate, setDsJoiningDate] = useState<string>((editingApp as any)?.joiningDate || new Date().toISOString().split("T")[0]);
  const [dsCourseStartDate, setDsCourseStartDate] = useState<string>((editingApp as any)?.courseStartDate || new Date().toISOString().split("T")[0]);
  const [dsCourseEndDate, setDsCourseEndDate] = useState<string>(
    (editingApp as any)?.courseEndDate || new Date(Date.now() + 15 * 86400000).toISOString().split("T")[0]
  );
  const [dsCourseType, setDsCourseType] = useState<string>((editingApp as any)?.courseType || courseTypes[0] || "15 Days");
  const [dsTotalCourseFees, setDsTotalCourseFees] = useState<number | string>((editingApp as any)?.totalCourseFees || 9500);
  const [dsAdvancePaid, setDsAdvancePaid] = useState<number | string>((editingApp as any)?.advancePaid || 4000);

  const handleDlStatusChange = (newStatus: "WITH_DL" | "WITHOUT_DL") => {
    setDsDlStatus(newStatus);
    if (newStatus === "WITHOUT_DL") {
      setDsDlNumber("");
      setDsDlIssueDate("");
      setDsDlExpiryDate("");
      setDsDlClasses([]);
    } else {
      setDsLlNumber("");
      setDsLlIssueDate("");
      setDsLlExpiryDate("");
      setDsLlClasses([]);
    }
  };

  // License Applicant Details
  const [dateOfBirth, setDateOfBirth] = useState(
    editingApp?.dateOfBirth || editingApp?.licenseDetails?.dateOfBirth || ""
  );
  const [isDrivingSchoolHolder, setIsDrivingSchoolHolder] = useState(
    editingApp?.licenseDetails?.isDrivingSchoolHolder ?? false
  );
  const [groupOptions, setGroupOptions] = useState<string[]>(["Select group", "Self", "Company Fleet"]);
  const [showAddGroupInput, setShowAddGroupInput] = useState(false);

  useEffect(() => {
    if (groupNameSuggestions && groupNameSuggestions.length > 0) {
      setGroupOptions((prev) => {
        const set = new Set([...prev, ...groupNameSuggestions]);
        return Array.from(set);
      });
    }
  }, [groupNameSuggestions]);
  const [suggestedClasses, setSuggestedClasses] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("custom_vehicle_classes");
      return saved ? JSON.parse(saved) : [
        "Motor Cycle without Gear (Non Transport) (MCWOG)",
        "Motor Cycle with Gear (Non Transport) (MCWG)",
        "LIGHT MOTOR VEHICLE (LMV)",
        "Adapted Vehicle (ADPVEH)",
        "MCWG",
        "LMV",
        "TRANS",
        "MCWOG",
        "3W-DET",
        "HGMV",
        "HPMV"
      ];
    } catch (e) {
      return [
        "Motor Cycle without Gear (Non Transport) (MCWOG)",
        "Motor Cycle with Gear (Non Transport) (MCWG)",
        "LIGHT MOTOR VEHICLE (LMV)",
        "Adapted Vehicle (ADPVEH)",
        "MCWG",
        "LMV",
        "TRANS",
        "MCWOG",
        "3W-DET",
        "HGMV",
        "HPMV"
      ];
    }
  });
  const [showClassDropdown, setShowClassDropdown] = useState(false);
  const [customClassInput, setCustomClassInput] = useState("");
  const [showLlRenewS1Dropdown, setShowLlRenewS1Dropdown] = useState(false);
  const [showLlRenewS2Dropdown, setShowLlRenewS2Dropdown] = useState(false);
  const [showLlRenewS3Dropdown, setShowLlRenewS3Dropdown] = useState(false);
  const [customClassInputS1, setCustomClassInputS1] = useState("");
  const [customClassInputS2, setCustomClassInputS2] = useState("");
  const [customClassInputS3, setCustomClassInputS3] = useState("");

  // License Services State
  const [newLL, setNewLL] = useState({
    enabled: editingApp?.licenseDetails?.newLearningLicence?.enabled ?? false,
    appointmentDate: editingApp?.licenseDetails?.newLearningLicence?.appointmentDate || "",
    applicationNo: editingApp?.licenseDetails?.newLearningLicence?.applicationNo || "",
    classOfVehicle: editingApp?.licenseDetails?.newLearningLicence?.classOfVehicle || [],
    totalAmount: editingApp?.licenseDetails?.newLearningLicence?.totalAmount || "",
    advanceAmount: editingApp?.licenseDetails?.newLearningLicence?.advanceAmount || "",
    step1: {
      llNumber: editingApp?.licenseDetails?.newLearningLicence?.step1?.llNumber || "",
      issueDate: editingApp?.licenseDetails?.newLearningLicence?.step1?.issueDate || "",
      expiryDate: editingApp?.licenseDetails?.newLearningLicence?.step1?.expiryDate || "",
    },
    step2: {
      dlNumber: editingApp?.licenseDetails?.newLearningLicence?.step2?.dlNumber || "",
      issueDate: editingApp?.licenseDetails?.newLearningLicence?.step2?.issueDate || "",
      validityDate: editingApp?.licenseDetails?.newLearningLicence?.step2?.validityDate || "",
      vehicleTypes: editingApp?.licenseDetails?.newLearningLicence?.step2?.vehicleTypes || { nt: false, tr: false, hazardous: false },
      classOfVehicle: editingApp?.licenseDetails?.newLearningLicence?.step2?.classOfVehicle || [],
    },
  });

  const [dlEndorsement, setDlEndorsement] = useState({
    enabled: editingApp?.licenseDetails?.dlNewLlEndorsement?.enabled ?? false,
    applicationNo: editingApp?.licenseDetails?.dlNewLlEndorsement?.applicationNo || "",
    totalAmount: editingApp?.licenseDetails?.dlNewLlEndorsement?.totalAmount || "",
    advanceAmount: editingApp?.licenseDetails?.dlNewLlEndorsement?.advanceAmount || "",
    step1: {
      dlNumber: editingApp?.licenseDetails?.dlNewLlEndorsement?.step1?.dlNumber || "",
      issueDate: editingApp?.licenseDetails?.dlNewLlEndorsement?.step1?.issueDate || "",
      validityDate: editingApp?.licenseDetails?.dlNewLlEndorsement?.step1?.validityDate || "",
      vehicleTypes: editingApp?.licenseDetails?.dlNewLlEndorsement?.step1?.vehicleTypes || { nt: false, tr: false, hazardous: false },
      classOfVehicle: editingApp?.licenseDetails?.dlNewLlEndorsement?.step1?.classOfVehicle || "",
    },
    step2: {
      llNumber: editingApp?.licenseDetails?.dlNewLlEndorsement?.step2?.llNumber || "",
      issueDate: editingApp?.licenseDetails?.dlNewLlEndorsement?.step2?.issueDate || "",
      expiryDate: editingApp?.licenseDetails?.dlNewLlEndorsement?.step2?.expiryDate || "",
      classOfVehicle: editingApp?.licenseDetails?.dlNewLlEndorsement?.step2?.classOfVehicle || "",
    },
    step3: {
      dlNumber: editingApp?.licenseDetails?.dlNewLlEndorsement?.step3?.dlNumber || "",
      issueDate: editingApp?.licenseDetails?.dlNewLlEndorsement?.step3?.issueDate || "",
      validityDate: editingApp?.licenseDetails?.dlNewLlEndorsement?.step3?.validityDate || "",
      vehicleTypes: editingApp?.licenseDetails?.dlNewLlEndorsement?.step3?.vehicleTypes || { nt: false, tr: false, hazardous: false },
      classOfVehicle: editingApp?.licenseDetails?.dlNewLlEndorsement?.step3?.classOfVehicle || "",
    },
  });

  const [llRenew, setLlRenew] = useState({
    enabled: editingApp?.licenseDetails?.llRenewClass?.enabled ?? false,
    appointmentDate: editingApp?.licenseDetails?.llRenewClass?.appointmentDate || "",
    applicationNo: editingApp?.licenseDetails?.llRenewClass?.applicationNo || "",
    totalAmount: editingApp?.licenseDetails?.llRenewClass?.totalAmount || "",
    advanceAmount: editingApp?.licenseDetails?.llRenewClass?.advanceAmount || "",
    step1: { llNumber: editingApp?.licenseDetails?.llRenewClass?.step1?.llNumber || "", issueDate: editingApp?.licenseDetails?.llRenewClass?.step1?.issueDate || "", expiryDate: editingApp?.licenseDetails?.llRenewClass?.step1?.expiryDate || "", classOfVehicle: editingApp?.licenseDetails?.llRenewClass?.step1?.classOfVehicle || [] },
    step2: { dlNumber: editingApp?.licenseDetails?.llRenewClass?.step2?.dlNumber || "", issueDate: editingApp?.licenseDetails?.llRenewClass?.step2?.issueDate || "", validityDate: editingApp?.licenseDetails?.llRenewClass?.step2?.validityDate || "", classOfVehicle: editingApp?.licenseDetails?.llRenewClass?.step2?.classOfVehicle || [] },
    step3: { dlNumber: editingApp?.licenseDetails?.llRenewClass?.step3?.dlNumber || "", issueDate: editingApp?.licenseDetails?.llRenewClass?.step3?.issueDate || "", validityDate: editingApp?.licenseDetails?.llRenewClass?.step3?.validityDate || "", classOfVehicle: editingApp?.licenseDetails?.llRenewClass?.step3?.classOfVehicle || [] },
  });

  const [dlRenewRetest, setDlRenewRetest] = useState({
    enabled: editingApp?.licenseDetails?.dlRenewRetest?.enabled ?? false,
    applicationNo: editingApp?.licenseDetails?.dlRenewRetest?.applicationNo || "",
    totalAmount: editingApp?.licenseDetails?.dlRenewRetest?.totalAmount || "",
    advanceAmount: editingApp?.licenseDetails?.dlRenewRetest?.advanceAmount || "",
    step1: { dlNumber: editingApp?.licenseDetails?.dlRenewRetest?.step1?.dlNumber || "", issueDate: editingApp?.licenseDetails?.dlRenewRetest?.step1?.issueDate || "", validityDate: editingApp?.licenseDetails?.dlRenewRetest?.step1?.validityDate || "", appNo1: editingApp?.licenseDetails?.dlRenewRetest?.step1?.appNo1 || "" },
    step2: { llNumber: editingApp?.licenseDetails?.dlRenewRetest?.step2?.llNumber || "", issueDate: editingApp?.licenseDetails?.dlRenewRetest?.step2?.issueDate || "", expiryDate: editingApp?.licenseDetails?.dlRenewRetest?.step2?.expiryDate || "", appNo2: editingApp?.licenseDetails?.dlRenewRetest?.step2?.appNo2 || "" },
    step3: { dlNumber: editingApp?.licenseDetails?.dlRenewRetest?.step3?.dlNumber || "", issueDate: editingApp?.licenseDetails?.dlRenewRetest?.step3?.issueDate || "", validityDate: editingApp?.licenseDetails?.dlRenewRetest?.step3?.validityDate || "", appNo1: editingApp?.licenseDetails?.dlRenewRetest?.step3?.appNo1 || "" },
  });

  const [generalLicServices, setGeneralLicServices] = useState<{
    selected: string[];
    accounting: Record<string, { totalAmount: string | number; advanceAmount: string | number }>;
  }>({
    selected: editingApp?.licenseDetails?.generalLicenceServices?.selectedServices || [],
    accounting: editingApp?.licenseDetails?.generalLicenceServices?.serviceAccounting || {},
  });

  const [genDlNumber, setGenDlNumber] = useState(editingApp?.licenseDetails?.generalLicenceServices?.dlNumber || "");
  const [genClassOfVehicle, setGenClassOfVehicle] = useState<string[]>(editingApp?.licenseDetails?.generalLicenceServices?.classOfVehicle || []);
  const [genIssueDate, setGenIssueDate] = useState(editingApp?.licenseDetails?.generalLicenceServices?.issueDate || "");
  const [genValidityDate, setGenValidityDate] = useState(editingApp?.licenseDetails?.generalLicenceServices?.validityDate || "");
  const [genVehicleTypes, setGenVehicleTypes] = useState({
    nt: editingApp?.licenseDetails?.generalLicenceServices?.vehicleTypes?.nt ?? false,
    tr: editingApp?.licenseDetails?.generalLicenceServices?.vehicleTypes?.tr ?? false,
    hazardous: editingApp?.licenseDetails?.generalLicenceServices?.vehicleTypes?.hazardous ?? false,
  });
  const [genNtValidity, setGenNtValidity] = useState(formatDateDDMMYYYY(editingApp?.licenseDetails?.generalLicenceServices?.ntValidity) || "");
  const [genTrValidity, setGenTrValidity] = useState(formatDateDDMMYYYY(editingApp?.licenseDetails?.generalLicenceServices?.trValidity) || "");
  const [genHazardousValidity, setGenHazardousValidity] = useState(formatDateDDMMYYYY(editingApp?.licenseDetails?.generalLicenceServices?.hazardousValidity) || "");
  const [genHazardousTrainingValidity, setGenHazardousTrainingValidity] = useState(editingApp?.licenseDetails?.generalLicenceServices?.hazardousTrainingValidity || "");
  const [genInternationalLicenceValidity, setGenInternationalLicenceValidity] = useState(editingApp?.licenseDetails?.generalLicenceServices?.internationalLicenceValidity || "");

  const [showGenClassDropdown, setShowGenClassDropdown] = useState(false);
  const [genCustomClassInput, setGenCustomClassInput] = useState("");

  const [form5Details, setForm5Details] = useState<Form5DetailsData>({
    form5Type: editingApp?.form5Details?.form5Type || "",
    name: editingApp?.form5Details?.name || editingApp?.ownerName || "",
    dlNumber: editingApp?.form5Details?.dlNumber || "",
    applicationNo: editingApp?.form5Details?.applicationNo || "",
    dateOfBirth: editingApp?.form5Details?.dateOfBirth || editingApp?.licenseDetails?.dateOfBirth || "",
    llNumber: editingApp?.form5Details?.llNumber || "",
    llIssueDate: editingApp?.form5Details?.llIssueDate || "",
    llExpiryDate: editingApp?.form5Details?.llExpiryDate || "",
    ntValidityDate: editingApp?.form5Details?.ntValidityDate || "",
    trValidityDate: editingApp?.form5Details?.trValidityDate || "",
    aadhaarNumber: editingApp?.form5Details?.aadhaarNumber || "",
  });

  const [saving, setSaving] = useState(false);
  const [vehicleNumber, setVehicleNumber] = useState(editingApp?.vehicleNumber || "");
  const [phone, setPhone] = useState(editingApp?.mobileNumber || editingApp?.vehicleDetails?.phone || "");
  const [ownerName, setOwnerName] = useState(editingApp?.ownerName || editingApp?.vehicleDetails?.ownerName || "");
  const [fatherHusbandName, setFatherHusbandName] = useState(editingApp?.vehicleDetails?.fatherHusbandName || "");
  const [coName, setCoName] = useState(editingApp?.vehicleDetails?.coName || "");
  const [groupName, setGroupName] = useState(editingApp?.vehicleDetails?.groupName || "");
  const [address, setAddress] = useState(editingApp?.vehicleDetails?.address || "");
  const [registrationDate, setRegistrationDate] = useState(editingApp?.vehicleDetails?.registrationDate || "");
  const [chassisNumber, setChassisNumber] = useState(editingApp?.vehicleDetails?.chassisNumber || "");
  const [engineNumber, setEngineNumber] = useState(editingApp?.vehicleDetails?.engineNumber || "");
  const [fuelType, setFuelType] = useState(editingApp?.vehicleDetails?.fuelType || "");
  const [vehicleClass, setVehicleClass] = useState(editingApp?.vehicleDetails?.vehicleClass || "");
  const [makerName, setMakerName] = useState(editingApp?.vehicleDetails?.makerName || "");
  const [modelName, setModelName] = useState(editingApp?.vehicleDetails?.modelName || "");
  const [colour, setColour] = useState(editingApp?.vehicleDetails?.colour || "");
  const [bodyType, setBodyType] = useState(editingApp?.vehicleDetails?.bodyType || "");
  const [seatingCapacity, setSeatingCapacity] = useState<number>(editingApp?.vehicleDetails?.seatingCapacity ?? ("" as any));
  const [grossWeight, setGrossWeight] = useState<number>(editingApp?.vehicleDetails?.grossWeight ?? ("" as any));
  const [unladenWeight, setUnladenWeight] = useState<number>(editingApp?.vehicleDetails?.unladenWeight ?? ("" as any));
  const [payload, setPayload] = useState<number>(editingApp?.vehicleDetails?.payload ?? ("" as any));
  const [horsePower, setHorsePower] = useState(editingApp?.vehicleDetails?.horsePower || "");
  const [cylinderCount, setCylinderCount] = useState<number>(editingApp?.vehicleDetails?.cylinderCount ?? ("" as any));
  const [pucExpiryDate, setPucExpiryDate] = useState(editingApp?.vehicleDetails?.pucExpiryDate || "");

  // Tax Section
  const [isLumpsumTax, setIsLumpsumTax] = useState(editingApp?.vehicleDetails?.taxDetails?.isLumpsum || false);
  const [taxIssueDate, setTaxIssueDate] = useState(editingApp?.vehicleDetails?.taxDetails?.issueDate || "");
  const [taxExpiryDate, setTaxExpiryDate] = useState(editingApp?.vehicleDetails?.taxDetails?.expiryDate || "");
  const [taxAmount, setTaxAmount] = useState<number | string>(editingApp?.vehicleDetails?.taxDetails?.amount ?? "");
  const [taxPeriod, setTaxPeriod] = useState<string>(editingApp?.vehicleDetails?.taxDetails?.period || "");

  const insuranceCompanies = useMemo(() => {
    try {
      const saved = localStorage.getItem("insurance_companies");
      return saved ? JSON.parse(saved) : ["New India", "ICICI Lombard", "HDFC Ergo", "Bajaj Allianz", "TATA AIG", "SBI General", "National Insurance", "United India", "Oriental Insurance"];
    } catch {
      return ["New India", "ICICI Lombard", "HDFC Ergo", "Bajaj Allianz", "TATA AIG", "SBI General", "National Insurance", "United India", "Oriental Insurance"];
    }
  }, []);

  const insuranceAgencies = useMemo(() => {
    try {
      const saved = localStorage.getItem("insurance_agencies");
      return saved ? JSON.parse(saved) : ["Primary Agency", "Branch Agency", "Broker Agency"];
    } catch {
      return ["Primary Agency", "Branch Agency", "Broker Agency"];
    }
  }, []);

  // Fitness Section
  const [fitnessIssueDate, setFitnessIssueDate] = useState(editingApp?.vehicleDetails?.fitnessDetails?.issueDate || "");
  const [fitnessExpiryDate, setFitnessExpiryDate] = useState(editingApp?.vehicleDetails?.fitnessDetails?.expiryDate || "");

  // Insurance Section
  const [insuranceCompany, setInsuranceCompany] = useState(editingApp?.vehicleDetails?.insuranceDetails?.company || "New India");
  const [insurancePolicyNo, setInsurancePolicyNo] = useState(editingApp?.vehicleDetails?.insuranceDetails?.policyNumber || "");
  const [insurancePolicyType, setInsurancePolicyType] = useState(editingApp?.vehicleDetails?.insuranceDetails?.policyType || "Third Party");
  const [insuranceIssueDate, setInsuranceIssueDate] = useState(editingApp?.vehicleDetails?.insuranceDetails?.issueDate || "");
  const [insuranceExpiryDate, setInsuranceExpiryDate] = useState(editingApp?.vehicleDetails?.insuranceDetails?.expiryDate || "");
  const [insuranceAmount, setInsuranceAmount] = useState<number>(editingApp?.vehicleDetails?.insuranceDetails?.amount || 0);
  const [insurancePlace, setInsurancePlace] = useState(editingApp?.vehicleDetails?.insuranceDetails?.insurancePlace || "");

  const [policySubCategory, setPolicySubCategory] = useState(editingApp?.vehicleDetails?.insuranceDetails?.policySubCategory || "Motor / Vehicle");
  const [insVehicleType, setInsVehicleType] = useState(editingApp?.vehicleDetails?.insuranceDetails?.vehicleType || "4 Wheel");
  const [agent, setAgent] = useState(editingApp?.vehicleDetails?.insuranceDetails?.agent || "");
  const [insuranceAgency, setInsuranceAgency] = useState(editingApp?.vehicleDetails?.insuranceDetails?.insuranceAgency || "");
  const [reference, setReference] = useState(editingApp?.vehicleDetails?.insuranceDetails?.reference || "");
  const [insFuelType, setInsFuelType] = useState(editingApp?.vehicleDetails?.insuranceDetails?.fuelType || "Petrol");
  const [insVehicleRegNumber, setInsVehicleRegNumber] = useState(editingApp?.vehicleDetails?.insuranceDetails?.vehicleRegistrationNumber || editingApp?.vehicleNumber || "");
  const [insVehicleModelDetails, setInsVehicleModelDetails] = useState(editingApp?.vehicleDetails?.insuranceDetails?.vehicleModelDetails || "");
  const [premiumExclGst, setPremiumExclGst] = useState<number>(editingApp?.vehicleDetails?.insuranceDetails?.premiumExclGst || 0);
  const [gstAmount, setGstAmount] = useState<number>(editingApp?.vehicleDetails?.insuranceDetails?.gstAmount || 0);
  const [totalPremium, setTotalPremium] = useState<number>(editingApp?.vehicleDetails?.insuranceDetails?.totalPremium || 0);
  const [insurerCommission, setInsurerCommission] = useState<number>(editingApp?.vehicleDetails?.insuranceDetails?.insurerCommission || 0);
  const [clientDiscount, setClientDiscount] = useState<number>(editingApp?.vehicleDetails?.insuranceDetails?.clientDiscount || 0);
  const [netCommission, setNetCommission] = useState<number>(editingApp?.vehicleDetails?.insuranceDetails?.netCommission || 0);
  const [insTotalFees, setInsTotalFees] = useState<number>(editingApp?.amount || (editingApp as any)?.serviceAccounting?.Insurance?.totalAmount || 0);
  const [insAdvancePayment, setInsAdvancePayment] = useState<number>(editingApp?.totalPaid || (editingApp as any)?.serviceAccounting?.Insurance?.advancePayment || 0);

  // Permit Section - 3 Fixed Permits
  const [gujaratPermitIssueDate, setGujaratPermitIssueDate] = useState(
    editingApp?.vehicleDetails?.permitDetails?.gujaratPermitIssueDate ||
    (editingApp?.vehicleDetails?.permitDetails?.permitType === "Gujarat Permit"
      ? editingApp?.vehicleDetails?.permitDetails?.issueDate
      : "") ||
    ""
  );
  const [gujaratPermitExpiryDate, setGujaratPermitExpiryDate] = useState(
    editingApp?.vehicleDetails?.permitDetails?.gujaratPermitExpiryDate ||
    (editingApp?.vehicleDetails?.permitDetails?.permitType === "Gujarat Permit"
      ? editingApp?.vehicleDetails?.permitDetails?.expiryDate
      : "") ||
    ""
  );

  const [nationalPermitIssueDate, setNationalPermitIssueDate] = useState(
    editingApp?.vehicleDetails?.permitDetails?.nationalPermitIssueDate ||
    ((editingApp?.vehicleDetails?.permitDetails?.permitType === "National Permit" || editingApp?.vehicleDetails?.permitDetails?.permitType === "National Permit(Gujrat Permit)")
      ? editingApp?.vehicleDetails?.permitDetails?.issueDate
      : "") ||
    ""
  );
  const [nationalPermitExpiryDate, setNationalPermitExpiryDate] = useState(
    editingApp?.vehicleDetails?.permitDetails?.nationalPermitExpiryDate ||
    ((editingApp?.vehicleDetails?.permitDetails?.permitType === "National Permit" || editingApp?.vehicleDetails?.permitDetails?.permitType === "National Permit(Gujrat Permit)")
      ? editingApp?.vehicleDetails?.permitDetails?.expiryDate
      : "") ||
    ""
  );

  const [nationalAuthIssueDate, setNationalAuthIssueDate] = useState(
    editingApp?.vehicleDetails?.permitDetails?.nationalAuthIssueDate ||
    (editingApp?.vehicleDetails?.permitDetails?.permitType === "National Permit Authorization"
      ? editingApp?.vehicleDetails?.permitDetails?.issueDate
      : "") ||
    ""
  );
  const [nationalAuthExpiryDate, setNationalAuthExpiryDate] = useState(
    editingApp?.vehicleDetails?.permitDetails?.nationalAuthExpiryDate ||
    (editingApp?.vehicleDetails?.permitDetails?.permitType === "National Permit Authorization"
      ? editingApp?.vehicleDetails?.permitDetails?.expiryDate
      : "") ||
    ""
  );

  // Registration Renewal Section
  const [dateOfRegistration, setDateOfRegistration] = useState(editingApp?.vehicleDetails?.registrationDetails?.dateOfRegistration || "");
  const [registrationValidity, setRegistrationValidity] = useState(editingApp?.vehicleDetails?.registrationDetails?.registrationValidity || "");

  // Services Selected
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  // Service Accounting Map (Service Name -> Total Amount & Advance Payment)
  const [serviceAccountingMap, setServiceAccountingMap] = useState<
    Record<string, { totalAmount: number; advancePayment: number }>
  >(() => {
    const map: Record<string, { totalAmount: number; advancePayment: number }> = {};
    if (editingApp?.services) {
      editingApp.services.forEach((srv) => {
        map[srv] = { totalAmount: 0, advancePayment: 0 };
      });
    }
    if (editingApp?.licenseDetails?.generalLicenceServices?.selectedServices) {
      editingApp.licenseDetails.generalLicenceServices.selectedServices.forEach((srv: string) => {
        map[srv] = { totalAmount: 0, advancePayment: 0 };
      });
    }
    if (editingApp?.serviceAccounting) {
      Object.entries(editingApp.serviceAccounting).forEach(([key, item]) => {
        map[key] = { totalAmount: Number(item.totalAmount) || 0, advancePayment: Number(item.advancePayment) || 0 };
      });
    }
    // Rehydrate from sub-module specific fields
    if (editingApp?.licenseDetails?.newLearningLicence?.enabled) {
      map["New Learning Licence"] = {
        totalAmount: Number(editingApp.licenseDetails.newLearningLicence.totalAmount) || 0,
        advancePayment: Number(editingApp.licenseDetails.newLearningLicence.advanceAmount) || 0,
      };
    }
    if (editingApp?.licenseDetails?.dlNewLlEndorsement?.enabled) {
      map["DL New LL Endorsement"] = {
        totalAmount: Number(editingApp.licenseDetails.dlNewLlEndorsement.totalAmount) || 0,
        advancePayment: Number(editingApp.licenseDetails.dlNewLlEndorsement.advanceAmount) || 0,
      };
    }
    if (editingApp?.licenseDetails?.llRenewClass?.enabled) {
      map["LL Renew Class"] = {
        totalAmount: Number(editingApp.licenseDetails.llRenewClass.totalAmount) || 0,
        advancePayment: Number(editingApp.licenseDetails.llRenewClass.advanceAmount) || 0,
      };
    }
    if (editingApp?.licenseDetails?.dlRenewRetest?.enabled) {
      map["DL Renew + Retest"] = {
        totalAmount: Number(editingApp.licenseDetails.dlRenewRetest.totalAmount) || 0,
        advancePayment: Number(editingApp.licenseDetails.dlRenewRetest.advanceAmount) || 0,
      };
    }
    if (editingApp?.licenseDetails?.generalLicenceServices?.serviceAccounting) {
      Object.entries(editingApp.licenseDetails.generalLicenceServices.serviceAccounting).forEach(([key, item]: [string, any]) => {
        map[key] = {
          totalAmount: Number(item.totalAmount) || 0,
          advancePayment: Number(item.advancePayment) || Number(item.advanceAmount) || 0,
        };
      });
    }
    if (editingApp?.subModule === "driving_school") {
      map["Driving School Course"] = {
        totalAmount: Number(editingApp.totalCourseFees) || 0,
        advancePayment: Number(editingApp.advancePaid) || 0,
      };
    }
    if (editingApp?.subModule === "insurance") {
      map["Insurance"] = {
        totalAmount: Number(editingApp.vehicleDetails?.insuranceDetails?.amount) || 0,
        advancePayment: Number(editingApp.totalPaid) || 0,
      };
    }
    return map;
  });

  const isVahaanService = (srv: string) => {
    return SERVICE_GROUPS.some(group => group.items.includes(srv));
  };

  const isLicenceService = (srv: string) => {
    return [
      "Issue Of Duplicate DL",
      "Change Of Address In DL",
      "Change Of Name In DL",
      "Photo & Signature Change",
      "Hazardous Material Endorsement",
      "DL Replacement",
      "DL Extract",
      "Hazardous Training Card",
      "International Driving License",
      "International Licence",
      "Change Date Of Birth In DL",
      "DL Renew",
      "Surrender of License",
      "Surrender Of License"
    ].includes(srv);
  };

  // Sync Vahaan selected services
  useEffect(() => {
    const selected = Object.keys(serviceAccountingMap).filter(isVahaanService);
    setSelectedServices(selected);
  }, [serviceAccountingMap]);

  // Sync Licence general services
  useEffect(() => {
    const selected = Object.keys(serviceAccountingMap).filter(isLicenceService);
    const accounting: Record<string, { totalAmount: number; advanceAmount: number }> = {};
    selected.forEach((srv) => {
      const srvAcc = serviceAccountingMap[srv];
      accounting[srv] = srvAcc
        ? { totalAmount: srvAcc.totalAmount, advanceAmount: srvAcc.advancePayment }
        : { totalAmount: 0, advanceAmount: 0 };
    });
    setGeneralLicServices((prev) => ({
      ...prev,
      selected,
      accounting,
    }));
  }, [serviceAccountingMap]);

  // Sync Form 5 HGV selection
  useEffect(() => {
    const form5Type = Object.keys(serviceAccountingMap).includes("Form 5 New HGV")
      ? "new_hgv"
      : Object.keys(serviceAccountingMap).includes("Form 5A Renew HGV")
        ? "renew_hgv"
        : "";
    setForm5Details(prev => {
      if (prev.form5Type !== form5Type) {
        return { ...prev, form5Type };
      }
      return prev;
    });
  }, [serviceAccountingMap]);

  // Generate Invoice Checkbox
  const [shouldGenerateInvoice, setShouldGenerateInvoice] = useState(!editingApp);

  // Remarks / Internal Notes & Task Assignment
  const [employeeRemarks, setEmployeeRemarks] = useState(editingApp?.remarks || "");
  const [reminder, setReminder] = useState(editingApp?.reminder || "");
  const [dueDate, setDueDate] = useState(editingApp?.dueDate || "");
  const [priority, setPriority] = useState<"Low" | "Medium" | "High" | "Urgent">(editingApp?.priority || "Low");
  const [createTaskAuto, setCreateTaskAuto] = useState(editingApp?.createTaskAuto ?? true);
  const [challanQty, setChallanQty] = useState<string>(editingApp?.challanQty ? String(editingApp.challanQty) : "");
  const [challanAmount, setChallanAmount] = useState<string>(editingApp?.challanAmount ? String(editingApp.challanAmount) : "");
  const [assignedEmployee, setAssignedEmployee] = useState(editingApp?.assignedEmployeeName || "");
  const [activeEmployees, setActiveEmployees] = useState<{ id: string; name: string }[]>([]);
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(editingApp?.templateId || "");

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

  useEffect(() => {
    const unsub = subscribeToTemplates((data) => {
      setTaskTemplates(data);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (selectedTemplateId) {
      const activeTpl = taskTemplates.find(t => t.id === selectedTemplateId);
      if (activeTpl) {
        const tplSub = getTemplateSubModule(activeTpl);
        const parentSub = activeSubModule === "services" ? "vahaan" : activeSubModule;
        if (tplSub.toLowerCase() !== parentSub.toLowerCase()) {
          setSelectedTemplateId("");
        }
      }
    }
  }, [activeSubModule, taskTemplates, selectedTemplateId]);

  // 1. Vahaan Auto Fill
  const vahaanAutoFill = useApplicationAutoFill({
    subModule: "services",
    lookupValues: vehicleNumber,
    isEditing: !!editingApp,
    onFill: (match) => {
      if (match.mobileNumber) setPhone(match.mobileNumber);
      if (match.ownerName) setOwnerName(match.ownerName);

      const v = match.vehicleDetails || {};
      if (v.fatherHusbandName) setFatherHusbandName(v.fatherHusbandName);
      if (v.coName) setCoName(v.coName);
      if (v.groupName) setGroupName(v.groupName);
      if (v.address) setAddress(v.address);
      if (v.registrationDate) setRegistrationDate(v.registrationDate);
      if (v.chassisNumber) setChassisNumber(v.chassisNumber);
      if (v.engineNumber) setEngineNumber(v.engineNumber);
      if (v.fuelType) setFuelType(v.fuelType);
      if (v.vehicleClass) setVehicleClass(v.vehicleClass);
      if (v.makerName) setMakerName(v.makerName);
      if (v.modelName) setModelName(v.modelName);
      if (v.colour) setColour(v.colour);
      if (v.bodyType) setBodyType(v.bodyType);
      if (v.seatingCapacity !== undefined) setSeatingCapacity(v.seatingCapacity);
      if (v.grossWeight !== undefined) setGrossWeight(v.grossWeight);
      if (v.unladenWeight !== undefined) setUnladenWeight(v.unladenWeight);
      if (v.payload !== undefined) setPayload(v.payload);
      if (v.horsePower) setHorsePower(v.horsePower);
      if (v.cylinderCount !== undefined) setCylinderCount(v.cylinderCount);
      if (v.pucExpiryDate) setPucExpiryDate(v.pucExpiryDate);

      if (v.taxDetails) {
        setIsLumpsumTax(v.taxDetails.isLumpsum || false);
        if (v.taxDetails.issueDate) setTaxIssueDate(v.taxDetails.issueDate);
        if (v.taxDetails.expiryDate) setTaxExpiryDate(v.taxDetails.expiryDate);
        if (v.taxDetails.amount !== undefined) setTaxAmount(v.taxDetails.amount);
      }

      if (v.fitnessDetails) {
        if (v.fitnessDetails.issueDate) setFitnessIssueDate(v.fitnessDetails.issueDate);
        if (v.fitnessDetails.expiryDate) setFitnessExpiryDate(v.fitnessDetails.expiryDate);
      }

      if (v.insuranceDetails) {
        if (v.insuranceDetails.company) setInsuranceCompany(v.insuranceDetails.company);
        if (v.insuranceDetails.policyNumber) setInsurancePolicyNo(v.insuranceDetails.policyNumber);
        if (v.insuranceDetails.policyType) setInsurancePolicyType(v.insuranceDetails.policyType);
        if (v.insuranceDetails.issueDate) setInsuranceIssueDate(v.insuranceDetails.issueDate);
        if (v.insuranceDetails.expiryDate) setInsuranceExpiryDate(v.insuranceDetails.expiryDate);
        if (v.insuranceDetails.amount !== undefined) setInsuranceAmount(v.insuranceDetails.amount);
        if (v.insuranceDetails.insurancePlace) setInsurancePlace(v.insuranceDetails.insurancePlace);
        if (v.insuranceDetails.policySubCategory) setPolicySubCategory(v.insuranceDetails.policySubCategory);
        if (v.insuranceDetails.vehicleType) setInsVehicleType(v.insuranceDetails.vehicleType);
      }

      if (v.permitDetails) {
        if (v.permitDetails.gujaratPermitIssueDate) setGujaratPermitIssueDate(v.permitDetails.gujaratPermitIssueDate);
        if (v.permitDetails.gujaratPermitExpiryDate) setGujaratPermitExpiryDate(v.permitDetails.gujaratPermitExpiryDate);
        if (v.permitDetails.nationalPermitIssueDate) setNationalPermitIssueDate(v.permitDetails.nationalPermitIssueDate);
        if (v.permitDetails.nationalPermitExpiryDate) setNationalPermitExpiryDate(v.permitDetails.nationalPermitExpiryDate);
      }

      if (match.remarks) setEmployeeRemarks(match.remarks);
      if (match.reminder) setReminder(match.reminder);
      if (match.dueDate) setDueDate(match.dueDate);
      if (match.priority) setPriority(match.priority);
      if (match.assignedEmployeeName) setAssignedEmployee(match.assignedEmployeeName);
      toast.success("Existing customer found. Details loaded.");
    },
    onClear: () => {
      setPhone("");
      setOwnerName("");
      setFatherHusbandName("");
      setCoName("");
      setGroupName("");
      setAddress("");
      setRegistrationDate("");
      setChassisNumber("");
      setEngineNumber("");
      setFuelType("");
      setVehicleClass("");
      setMakerName("");
      setModelName("");
      setColour("");
      setBodyType("");
      setSeatingCapacity("" as any);
      setGrossWeight("" as any);
      setUnladenWeight("" as any);
      setPayload("" as any);
      setHorsePower("");
      setCylinderCount("" as any);
      setPucExpiryDate("");

      setIsLumpsumTax(false);
      setTaxIssueDate("");
      setTaxExpiryDate("");
      setTaxAmount("");

      setFitnessIssueDate("");
      setFitnessExpiryDate("");

      setInsuranceCompany("New India");
      setInsurancePolicyNo("");
      setInsurancePolicyType("Third Party");
      setInsuranceIssueDate("");
      setInsuranceExpiryDate("");
      setInsuranceAmount(0);
      setInsurancePlace("");
      setPolicySubCategory("Motor / Vehicle");
      setInsVehicleType("4 Wheel");

      setGujaratPermitIssueDate("");
      setGujaratPermitExpiryDate("");
      setNationalPermitIssueDate("");
      setNationalPermitExpiryDate("");

      setEmployeeRemarks("");
      setReminder("");
      setDueDate("");
      setPriority("Low");
      setAssignedEmployee("");
    }
  });

  // 2. Insurance Auto Fill
  const insuranceAutoFill = useApplicationAutoFill({
    subModule: "insurance",
    lookupValues: { name: ownerName, mobile: phone },
    isEditing: !!editingApp,
    onFill: (match) => {
      const v = match.vehicleDetails || {};
      if (v.address) setAddress(v.address);
      if (match.vehicleNumber) setVehicleNumber(match.vehicleNumber);
      if (v.makerName) setMakerName(v.makerName);
      if (v.modelName) setModelName(v.modelName);
      if (v.fuelType) setFuelType(v.fuelType);
      if (v.chassisNumber) setChassisNumber(v.chassisNumber);
      if (v.engineNumber) setEngineNumber(v.engineNumber);
      if (v.registrationDate) setRegistrationDate(v.registrationDate);
      if (v.fatherHusbandName) setFatherHusbandName(v.fatherHusbandName);
      if (v.coName) setCoName(v.coName);
      if (v.groupName) setGroupName(v.groupName);
      if (v.colour) setColour(v.colour);
      if (v.bodyType) setBodyType(v.bodyType);
      if (v.seatingCapacity !== undefined) setSeatingCapacity(v.seatingCapacity);
      if (v.grossWeight !== undefined) setGrossWeight(v.grossWeight);
      if (v.unladenWeight !== undefined) setUnladenWeight(v.unladenWeight);
      if (v.payload !== undefined) setPayload(v.payload);
      if (v.horsePower) setHorsePower(v.horsePower);
      if (v.cylinderCount !== undefined) setCylinderCount(v.cylinderCount);
      toast.success("Existing customer found. Details loaded.");
    },
    onClear: () => {
      setAddress("");
      setVehicleNumber("");
      setMakerName("");
      setModelName("");
      setFuelType("");
      setChassisNumber("");
      setEngineNumber("");
      setRegistrationDate("");
      setFatherHusbandName("");
      setCoName("");
      setGroupName("");
      setColour("");
      setBodyType("");
      setSeatingCapacity("" as any);
      setGrossWeight("" as any);
      setUnladenWeight("" as any);
      setPayload("" as any);
      setHorsePower("");
      setCylinderCount("" as any);
    }
  });

  // 3. License Auto Fill
  const licenseAutoFill = useApplicationAutoFill({
    subModule: "licence",
    lookupValues: { name: ownerName, mobile: phone },
    isEditing: !!editingApp,
    onFill: (match) => {
      const v = match.vehicleDetails || {};
      if (v.address) setAddress(v.address);

      const dob = match.licenseDetails?.dateOfBirth || match.dateOfBirth || "";
      if (dob) setDateOfBirth(dob);

      if (match.gender) setDsGender(match.gender as any);
      if (v.fatherHusbandName) setFatherHusbandName(v.fatherHusbandName);

      const l = match.licenseDetails || {};
      if (l.generalLicenceServices) {
        const g = l.generalLicenceServices;
        if (g.dlNumber) setGenDlNumber(g.dlNumber);
        if (g.classOfVehicle) setGenClassOfVehicle(g.classOfVehicle);
        if (g.issueDate) setGenIssueDate(g.issueDate);
        if (g.validityDate) setGenValidityDate(g.validityDate);
        if (g.vehicleTypes) setGenVehicleTypes(g.vehicleTypes);
      }
      toast.success("Existing customer found. Details loaded.");
    },
    onClear: () => {
      setAddress("");
      setDateOfBirth("");
      setDsGender("Male");
      setFatherHusbandName("");
      setGenDlNumber("");
      setGenClassOfVehicle([]);
      setGenIssueDate("");
      setGenValidityDate("");
      setGenVehicleTypes({ nt: false, tr: false, hazardous: false });
    }
  });

  // 4. Form 5 Auto Fill
  const form5AutoFill = useApplicationAutoFill({
    subModule: "form5",
    lookupValues: { name: ownerName, mobile: phone },
    isEditing: !!editingApp,
    onFill: (match) => {
      const v = match.vehicleDetails || {};
      if (v.address) setAddress(v.address);
      if (match.vehicleNumber) setVehicleNumber(match.vehicleNumber);
      if (v.fatherHusbandName) setFatherHusbandName(v.fatherHusbandName);
      if (v.coName) setCoName(v.coName);
      if (v.groupName) setGroupName(v.groupName);
      if (v.makerName) setMakerName(v.makerName);
      if (v.modelName) setModelName(v.modelName);
      if (v.fuelType) setFuelType(v.fuelType);
      if (v.vehicleClass) setVehicleClass(v.vehicleClass);
      if (v.chassisNumber) setChassisNumber(v.chassisNumber);
      if (v.engineNumber) setEngineNumber(v.engineNumber);
      if (v.registrationDate) setRegistrationDate(v.registrationDate);
      if (match.form5Details) {
        setForm5Details({
          ...match.form5Details,
        });
      }
      toast.success("Existing customer found. Details loaded.");
    },
    onClear: () => {
      setAddress("");
      setVehicleNumber("");
      setFatherHusbandName("");
      setCoName("");
      setGroupName("");
      setMakerName("");
      setModelName("");
      setFuelType("");
      setVehicleClass("");
      setChassisNumber("");
      setEngineNumber("");
      setRegistrationDate("");
      setForm5Details({
        form5Type: "",
        name: "",
        dlNumber: "",
        applicationNo: "",
        dateOfBirth: "",
        llNumber: "",
        llIssueDate: "",
        llExpiryDate: "",
        ntValidityDate: "",
        trValidityDate: "",
        aadhaarNumber: "",
      });
    }
  });

  // 5. Driving School Auto Fill
  const drivingSchoolAutoFill = useApplicationAutoFill({
    subModule: "driving_school",
    lookupValues: { name: ownerName, mobile: phone },
    isEditing: !!editingApp,
    onFill: (match) => {
      if (match.address) setAddress(match.address);
      if (match.dateOfBirth) setDateOfBirth(match.dateOfBirth);
      if (match.gender) setDsGender(match.gender as any);
      if (match.co) {
        setCoName(match.co);
        setFatherHusbandName(match.co);
      }
      if (match.drivingLicenceStatus) setDsDlStatus(match.drivingLicenceStatus);

      if (match.drivingLicence) {
        if (match.drivingLicence.number) setDsDlNumber(match.drivingLicence.number);
        if (match.drivingLicence.issueDate) setDsDlIssueDate(toDateString(match.drivingLicence.issueDate));
        if (match.drivingLicence.expiryDate) setDsDlExpiryDate(toDateString(match.drivingLicence.expiryDate));
        if (match.drivingLicence.classes) setDsDlClasses(match.drivingLicence.classes);
      } else if (match.drivingLicenceNumber) {
        setDsDlNumber(match.drivingLicenceNumber);
      }

      if (match.learningLicence) {
        if (match.learningLicence.number) setDsLlNumber(match.learningLicence.number);
        if (match.learningLicence.issueDate) setDsLlIssueDate(toDateString(match.learningLicence.issueDate));
        if (match.learningLicence.expiryDate) setDsLlExpiryDate(toDateString(match.learningLicence.expiryDate));
        if (match.learningLicence.classes) setDsLlClasses(match.learningLicence.classes);
      }

      if (match.bloodGroup) setDsBloodGroup(match.bloodGroup);
      if (match.vehicleNumber) setVehicleNumber(match.vehicleNumber);
      if (match.assignedEmployee) setAssignedEmployee(match.assignedEmployee);
      toast.success("Existing customer found. Details loaded.");
    },
    onClear: () => {
      setAddress("");
      setDateOfBirth("");
      setDsGender("Male");
      setFatherHusbandName("");
      setCoName("");
      setDsDlStatus("WITHOUT_DL");
      setDsDlNumber("");
      setDsDlIssueDate("");
      setDsDlExpiryDate("");
      setDsDlClasses([]);
      setDsLlNumber("");
      setDsLlIssueDate("");
      setDsLlExpiryDate("");
      setDsLlClasses([]);
      setDsBloodGroup("");
      setVehicleNumber("");
      setAssignedEmployee("");
    }
  });


  // Application Type State
  const [availableAppTypes, setAvailableAppTypes] = useState<string[]>(DEFAULT_APP_TYPES);
  const [appTypeSelect, setAppTypeSelect] = useState<string>(editingApp?.applicationType || "Home");
  const [isCustomAppType, setIsCustomAppType] = useState(false);
  const [customAppTypeInput, setCustomAppTypeInput] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("custom_application_types");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const combined = Array.from(new Set([...DEFAULT_APP_TYPES, ...parsed]));
          setAvailableAppTypes(combined);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (editingApp?.applicationType) {
      if (!DEFAULT_APP_TYPES.includes(editingApp.applicationType)) {
        setAvailableAppTypes((prev) => Array.from(new Set([...prev, editingApp.applicationType!])));
      }
      setAppTypeSelect(editingApp.applicationType);
    }
  }, [editingApp]);

  // Track Expiry Settings (Show on Dashboard Checkboxes, default true)
  const [trackPuc, setTrackPuc] = useState<boolean>(
    editingApp?.trackExpiry?.puc ?? editingApp?.vehicleDetails?.trackExpiry?.puc ?? true
  );
  const [trackTax, setTrackTax] = useState<boolean>(
    editingApp?.trackExpiry?.tax ?? editingApp?.vehicleDetails?.trackExpiry?.tax ?? true
  );
  const [trackInsurance, setTrackInsurance] = useState<boolean>(
    editingApp?.trackExpiry?.insurance ?? editingApp?.vehicleDetails?.trackExpiry?.insurance ?? true
  );
  const [trackPermit, setTrackPermit] = useState<boolean>(
    editingApp?.trackExpiry?.permit ?? editingApp?.vehicleDetails?.trackExpiry?.permit ?? true
  );
  const [trackFitness, setTrackFitness] = useState<boolean>(
    editingApp?.trackExpiry?.fitness ?? editingApp?.vehicleDetails?.trackExpiry?.fitness ?? true
  );

  const [showPucDetails, setShowPucDetails] = useState<boolean>(
    !!editingApp?.pucExpiryDate || !!editingApp?.vehicleDetails?.pucExpiryDate
  );
  const [showTaxDetails, setShowTaxDetails] = useState<boolean>(
    !!editingApp?.taxExpiryDate || !!editingApp?.vehicleDetails?.taxDetails?.expiryDate
  );
  const [showFitnessDetails, setShowFitnessDetails] = useState<boolean>(
    !!editingApp?.fitnessExpiryDate || !!editingApp?.vehicleDetails?.fitnessDetails?.expiryDate
  );
  const [showPermitDetails, setShowPermitDetails] = useState<boolean>(
    !!editingApp?.permitExpiryDate || !!editingApp?.vehicleDetails?.permitDetails?.expiryDate || !!editingApp?.vehicleDetails?.permitDetails?.gujaratPermitExpiryDate
  );
  const [showRegistrationDetails, setShowRegistrationDetails] = useState<boolean>(
    !!editingApp?.registrationRenewalExpiryDate || !!editingApp?.vehicleDetails?.registrationDetails?.registrationValidity
  );

  // Document Uploads State (Simulated upload status map for color backgrounds)
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, string>>(editingApp?.vehicleDetails?.documents || {});
  const [previewDoc, setPreviewDoc] = useState<{ name: string; url: string } | null>(null);

  useEffect(() => {
    fetchAllUsers()
      .then((users) => {
        const active = users
          .filter((u) => u.status === "active" || u.isActive !== false)
          .map((u) => ({ id: u.uid || u.userId, name: u.fullName || u.username }));

        setActiveEmployees(active);
        if (active.length > 0 && !assignedEmployee) {
          setAssignedEmployee(active[0].name);
        }
      })
      .catch(() => {
        const fallbacks = [
          { id: "1", name: "Suresh Kumar" },
          { id: "2", name: "Anita Khan" },
          { id: "3", name: "Rahul Shah" },
          { id: "4", name: "Priya Verma" },
        ];
        setActiveEmployees(fallbacks);
        if (!assignedEmployee) {
          setAssignedEmployee(fallbacks[0].name);
        }
      });
  }, []);

  // Auto-Fill Vehicle Lookup
  const handleVehicleBlur = async () => {
    if (!vehicleNumber.trim()) return;
    const existing = await fetchVehicleByNumber(vehicleNumber);
    if (existing) {
      toast.success("Existing vehicle details auto-populated!");
      setPhone(existing.phone || "");
      setOwnerName(existing.ownerName || "");
      setFatherHusbandName(existing.fatherHusbandName || "");
      setCoName(existing.coName || "");
      setGroupName(existing.groupName || "");
      setAddress(existing.address || "");
      setRegistrationDate(existing.registrationDate || "");
      setChassisNumber(existing.chassisNumber || "");
      setEngineNumber(existing.engineNumber || "");
      setFuelType(existing.fuelType || "Petrol");
      setVehicleClass(existing.vehicleClass || "LMV");
      setMakerName(existing.makerName || "");
      setModelName(existing.modelName || "");
      setColour(existing.colour || "");
      setBodyType(existing.bodyType || "");
      setSeatingCapacity(existing.seatingCapacity || 5);
      setGrossWeight(existing.grossWeight || 0);
      setUnladenWeight(existing.unladenWeight || 0);
      setPayload(existing.payload || 0);
      setHorsePower(existing.horsePower || "");
      setCylinderCount(existing.cylinderCount || 4);
      setPucExpiryDate(existing.pucExpiryDate || "");

      if (existing.taxDetails) {
        setIsLumpsumTax(existing.taxDetails.isLumpsum || false);
        setTaxIssueDate(existing.taxDetails.issueDate || "");
        setTaxExpiryDate(existing.taxDetails.expiryDate || "");
        setTaxAmount(existing.taxDetails.amount ?? "");
      }
      if (existing.fitnessDetails) {
        setFitnessIssueDate(existing.fitnessDetails.issueDate || "");
        setFitnessExpiryDate(existing.fitnessDetails.expiryDate || "");
      }
      if (existing.insuranceDetails) {
        setInsuranceCompany(existing.insuranceDetails.company || "New India");
        setInsurancePolicyNo(existing.insuranceDetails.policyNumber || "");
        setInsurancePolicyType(existing.insuranceDetails.policyType || "Third Party");
        setInsuranceIssueDate(existing.insuranceDetails.issueDate || "");
        setInsuranceExpiryDate(existing.insuranceDetails.expiryDate || "");
        setInsuranceAmount(existing.insuranceDetails.amount || 0);
        setInsurancePlace(existing.insuranceDetails.insurancePlace || "");
        setPolicySubCategory(existing.insuranceDetails.policySubCategory || "Motor / Vehicle");
        setInsVehicleType(existing.insuranceDetails.vehicleType || "4 Wheel");
        setAgent(existing.insuranceDetails.agent || "");
        setInsuranceAgency(existing.insuranceDetails.insuranceAgency || "");
        setReference(existing.insuranceDetails.reference || "");
        setInsFuelType(existing.insuranceDetails.fuelType || existing.fuelType || "Petrol");
        setInsVehicleRegNumber(existing.insuranceDetails.vehicleRegistrationNumber || existing.vehicleNumber || "");
        setInsVehicleModelDetails(existing.insuranceDetails.vehicleModelDetails || `${existing.makerName || ""} ${existing.modelName || ""}`.trim());
        setPremiumExclGst(existing.insuranceDetails.premiumExclGst || 0);
        setGstAmount(existing.insuranceDetails.gstAmount || 0);
        setTotalPremium(existing.insuranceDetails.totalPremium || 0);
        setInsurerCommission(existing.insuranceDetails.insurerCommission || 0);
        setClientDiscount(existing.insuranceDetails.clientDiscount || 0);
        setNetCommission(existing.insuranceDetails.netCommission || 0);
      }
      if (existing.permitDetails) {
        const p = existing.permitDetails;
        const gIss = p.gujaratPermitIssueDate || (p.permitType === "Gujarat Permit" ? p.issueDate : "") || "";
        const gExp = p.gujaratPermitExpiryDate || (p.permitType === "Gujarat Permit" ? p.expiryDate : "") || "";
        const nIss = p.nationalPermitIssueDate || (p.permitType === "National Permit" || p.permitType === "National Permit(Gujrat Permit)" ? p.issueDate : "") || "";
        const nExp = p.nationalPermitExpiryDate || (p.permitType === "National Permit" || p.permitType === "National Permit(Gujrat Permit)" ? p.expiryDate : "") || "";
        const naIss = p.nationalAuthIssueDate || (p.permitType === "National Permit Authorization" ? p.issueDate : "") || "";
        const naExp = p.nationalAuthExpiryDate || (p.permitType === "National Permit Authorization" ? p.expiryDate : "") || "";

        setGujaratPermitIssueDate(gIss);
        setGujaratPermitExpiryDate(gExp);
        setNationalPermitIssueDate(nIss);
        setNationalPermitExpiryDate(nExp);
        setNationalAuthIssueDate(naIss);
        setNationalAuthExpiryDate(naExp);
      }
      if (existing.registrationDetails) {
        setDateOfRegistration(existing.registrationDetails.dateOfRegistration || "");
        setRegistrationValidity(existing.registrationDetails.registrationValidity || "");
      }
      if (existing.documents) {
        setUploadedDocs(existing.documents);
      }
      if (existing.trackExpiry) {
        setTrackPuc(existing.trackExpiry.puc ?? true);
        setTrackTax(existing.trackExpiry.tax ?? true);
        setTrackInsurance(existing.trackExpiry.insurance ?? true);
        setTrackPermit(existing.trackExpiry.permit ?? true);
        setTrackFitness(existing.trackExpiry.fitness ?? true);
      }
    }
  };

  const handleGujaratIssueChange = (dateVal: string) => {
    setGujaratPermitIssueDate(dateVal);
    setGujaratPermitExpiryDate(computePermitExpiry("Gujarat Permit", dateVal));
  };

  const handleNationalIssueChange = (dateVal: string) => {
    setNationalPermitIssueDate(dateVal);
    setNationalPermitExpiryDate(computePermitExpiry("National Permit(Gujrat Permit)", dateVal));
  };

  const handleNationalAuthIssueChange = (dateVal: string) => {
    setNationalAuthIssueDate(dateVal);
    setNationalAuthExpiryDate(computePermitExpiry("National Permit Authorization", dateVal));
  };

  const toggleService = (srv: string) => {
    setSelectedServices((prev) => {
      if (prev.includes(srv)) {
        const next = prev.filter((s) => s !== srv);
        setServiceAccountingMap((oldMap) => {
          const newMap = { ...oldMap };
          delete newMap[srv];
          return newMap;
        });
        return next;
      } else {
        setServiceAccountingMap((oldMap) => ({
          ...oldMap,
          [srv]: { totalAmount: 0, advancePayment: 0 },
        }));
        return [...prev, srv];
      }
    });
  };

  const updateServiceAccounting = (
    srv: string,
    field: "totalAmount" | "advancePayment",
    val: number
  ) => {
    setServiceAccountingMap((prev) => {
      const current = prev[srv] || { totalAmount: 0, advancePayment: 0 };
      const nextTotal = field === "totalAmount" ? val : current.totalAmount;
      const nextAdvance = field === "advancePayment" ? val : current.advancePayment;

      if (nextAdvance > nextTotal && field === "advancePayment") {
        toast.error("Advance cannot exceed Total Amount.");
      }

      return {
        ...prev,
        [srv]: {
          totalAmount: nextTotal,
          advancePayment: nextAdvance,
        },
      };
    });
  };

  const overallTotals = useMemo(() => {
    let totalAmt = 0;
    let totalAdv = 0;

    const extraChallanAmt = parseFloat(challanAmount) || 0;

    if (activeSubModule === "insurance") {
      totalAmt = (Number(insTotalFees) || 0) + extraChallanAmt;
      totalAdv = Number(insAdvancePayment) || 0;
    } else {
      Object.values(serviceAccountingMap).forEach((item) => {
        totalAmt += item.totalAmount || 0;
        totalAdv += item.advancePayment || 0;
      });
      totalAmt += extraChallanAmt;
    }

    const pending = Math.max(0, totalAmt - totalAdv);
    let payStatus: "Paid" | "Pending" | "Partial" = "Pending";
    if (totalAmt > 0 && totalAdv >= totalAmt) payStatus = "Paid";
    else if (totalAdv > 0) payStatus = "Partial";

    return { totalAmt, totalAdv, pending, payStatus };
  }, [serviceAccountingMap, activeSubModule, insTotalFees, insAdvancePayment, challanAmount]);

  const handleDocSimulateUpload = (docName: string) => {
    setUploadedDocs((prev) => ({
      ...prev,
      [docName]: `https://example.com/docs/${docName}.pdf`,
    }));
    toast.success(`${docName} uploaded!`);
  };

  const sanitizeFirestoreData = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (typeof obj === "number") {
      return isNaN(obj) || !isFinite(obj) ? 0 : obj;
    }
    if (typeof obj !== "object") return obj;
    if (Array.isArray(obj)) {
      return obj.map(sanitizeFirestoreData);
    }
    const clean: any = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val !== undefined) {
        clean[key] = sanitizeFirestoreData(val);
      }
    }
    return clean;
  };

  const handleSave = async (status: "Draft" | "Submitted") => {
    if (activeSubModule === "driving_school") {
      if (!ownerName.trim()) {
        toast.error("Student Name is mandatory!");
        return;
      }
      if (!dateOfBirth.trim()) {
        toast.error("Date of Birth is mandatory!");
        return;
      }

      // Driving Licence Status Validation
      if (dsDlStatus === "WITH_DL") {
        if (!dsDlNumber.trim()) {
          toast.error("Driving Licence Number is mandatory!");
          return;
        }
        if (!dsDlIssueDate) {
          toast.error("Licence Issue Date is mandatory!");
          return;
        }
        if (!dsDlExpiryDate) {
          toast.error("Licence Expiry Date is mandatory!");
          return;
        }
        if (dsDlClasses.length === 0) {
          toast.error("At least one Class Of Vehicle must be selected!");
          return;
        }
      } else {
        if (!dsLlNumber.trim()) {
          toast.error("Learning Licence Number is mandatory!");
          return;
        }
        if (!dsLlIssueDate) {
          toast.error("Learning Licence Issue Date is mandatory!");
          return;
        }
        if (!dsLlExpiryDate) {
          toast.error("Learning Licence Expiry Date is mandatory!");
          return;
        }
        if (dsLlClasses.length === 0) {
          toast.error("At least one Class Of Vehicle must be selected!");
          return;
        }
      }

      setSaving(true);
      try {
        const totFee = Number(dsTotalCourseFees) || 0;
        const advFee = Number(dsAdvancePaid) || 0;
        const remFee = Math.max(0, totFee - advFee);
        const pStatus: "Paid" | "Partial" | "Pending" =
          remFee <= 0 ? "Paid" : advFee > 0 ? "Partial" : "Pending";

        const dlPayload = dsDlStatus === "WITH_DL" ? {
          number: dsDlNumber.trim(),
          issueDate: Timestamp.fromDate(new Date(dsDlIssueDate + "T00:00:00")),
          expiryDate: Timestamp.fromDate(new Date(dsDlExpiryDate + "T00:00:00")),
          classes: dsDlClasses,
        } : null;

        const llPayload = dsDlStatus === "WITHOUT_DL" ? {
          number: dsLlNumber.trim(),
          issueDate: Timestamp.fromDate(new Date(dsLlIssueDate + "T00:00:00")),
          expiryDate: Timestamp.fromDate(new Date(dsLlExpiryDate + "T00:00:00")),
          classes: dsLlClasses,
        } : null;

        await saveDrivingSchoolApplication({
          studentName: ownerName.trim(),
          mobileNumber: phone.trim(),
          bloodGroup: dsBloodGroup,
          address: address.trim(),
          dateOfBirth,
          gender: dsGender,
          hasDrivingLicence: dsDlStatus === "WITH_DL",
          drivingLicenceNumber: dsDlStatus === "WITH_DL" ? dsDlNumber.trim() : "",
          drivingLicenceStatus: dsDlStatus,
          drivingLicence: dlPayload,
          learningLicence: llPayload,
          joiningDate: dsJoiningDate,
          courseStartDate: dsCourseStartDate,
          courseEndDate: dsCourseEndDate,
          courseType: dsCourseType,
          totalCourseFees: totFee,
          advancePaid: advFee,
          remainingFees: remFee,
          paymentStatus: pStatus,
          assignedEmployee,
          reminderDate: reminder,
          priority,
          employeeNotes: employeeRemarks,
          documents: uploadedDocs,
          vehicleNumber: vehicleNumber.trim() || undefined,
          status: "Active",
        }, editingApp?.id);

        toast.success("Driving School Application Created Successfully!");
        setSaving(false);
        onClose();
        return;
      } catch (err) {
        console.error("Error creating Driving School application:", err);
        toast.error("Failed to create Driving School application");
        setSaving(false);
        return;
      }
    }

    if (activeSubModule === "insurance") {
      if (!ownerName.trim() || !dateOfBirth.trim()) {
        toast.error("Name and Date of Birth are mandatory for Insurance Applications!");
        return;
      }
      if (!insTotalFees) {
        toast.error("Total Fees is required!");
        return;
      }
    } else if (activeSubModule === "form5") {
      if (!form5Details.name?.trim()) {
        toast.error("Name is mandatory for Form 5 Applications!");
        return;
      }
    } else if (activeSubModule === "licence") {
      if (!ownerName.trim() || !dateOfBirth.trim()) {
        toast.error("Name and Date of Birth are mandatory for License Applications!");
        return;
      }
    } else if (activeSubModule === "services") {
      if (!vehicleNumber.trim()) {
        toast.error("Vehicle Number is required!");
        return;
      }
      if (selectedServices.length === 0) {
        toast.error("Please select at least one service!");
        return;
      }
    }

    // Validate advance payments
    const currentSelected =
      activeSubModule === "licence"
        ? [
          ...(newLL.enabled ? ["New Learning Licence"] : []),
          ...(dlEndorsement.enabled ? ["DL New LL Endorsement"] : []),
          ...(llRenew.enabled ? ["LL Renew Class"] : []),
          ...(dlRenewRetest.enabled ? ["DL Renew + Retest"] : []),
          ...generalLicServices.selected
        ]
        : activeSubModule === "form5"
          ? (form5Details.form5Type ? [form5Details.form5Type === "new_hgv" ? "Form 5 New HGV" : "Form 5A Renew HGV"] : [])
          : activeSubModule === "insurance"
            ? ["Insurance"]
            : (activeSubModule as string) === "driving_school"
              ? ["Driving School Course"]
              : selectedServices;

    for (const srv of currentSelected) {
      const item = serviceAccountingMap[srv] || { totalAmount: 0, advancePayment: 0 };
      if (item.advancePayment > item.totalAmount) {
        toast.error("Advance cannot exceed Total Amount.");
        return;
      }
    }

    setSaving(true);

    const finalVehNo =
      activeSubModule === "insurance"
        ? (insVehicleRegNumber.trim() || `INS-${Date.now().toString().slice(-6)}`)
        : activeSubModule === "form5"
          ? `F5-${Date.now().toString().slice(-6)}`
          : (vehicleNumber.trim() || `LIC-${Date.now().toString().slice(-6)}`);
    const cleanVehNo = finalVehNo.toUpperCase().replace(/[\s-]/g, "");

    const vehicleDetails: VehicleMaster = {
      id: cleanVehNo,
      vehicleNumber: finalVehNo,
      phone,
      ownerName,
      fatherHusbandName,
      coName,
      groupName,
      address,
      registrationDate,
      chassisNumber,
      engineNumber,
      fuelType,
      vehicleClass,
      makerName,
      modelName,
      colour,
      bodyType,
      seatingCapacity,
      grossWeight,
      unladenWeight,
      payload,
      horsePower,
      cylinderCount,
      pucExpiryDate,
      taxDetails: {
        isLumpsum: isLumpsumTax,
        issueDate: taxIssueDate,
        expiryDate: taxExpiryDate,
        amount: taxAmount === "" ? 0 : Number(taxAmount),
      },
      fitnessDetails: {
        issueDate: fitnessIssueDate,
        expiryDate: fitnessExpiryDate,
      },
      insuranceDetails: {
        company: insuranceCompany,
        policyNumber: insurancePolicyNo,
        policyType: insurancePolicyType,
        issueDate: insuranceIssueDate,
        expiryDate: insuranceExpiryDate,
        amount: totalPremium || insuranceAmount,
        insurancePlace,
        policySubCategory,
        vehicleType: insVehicleType,
        agent,
        insuranceAgency,
        reference,
        fuelType: insFuelType,
        vehicleRegistrationNumber: insVehicleRegNumber || vehicleNumber,
        vehicleModelDetails: insVehicleModelDetails || `${makerName || ""} ${modelName || ""}`.trim(),
        premiumExclGst,
        gstAmount,
        totalPremium,
        insurerCommission,
        clientDiscount,
        netCommission,
      },
      permitDetails: {
        permitType: "Fixed Permits",
        issueDate: gujaratPermitIssueDate || nationalPermitIssueDate || nationalAuthIssueDate || "",
        expiryDate: gujaratPermitExpiryDate || nationalPermitExpiryDate || nationalAuthExpiryDate || "",
        gujaratPermitIssueDate,
        gujaratPermitExpiryDate,
        nationalPermitIssueDate,
        nationalPermitExpiryDate,
        nationalAuthIssueDate,
        nationalAuthExpiryDate,
      },
      registrationDetails: {
        dateOfRegistration,
        registrationValidity,
      },
      documents: uploadedDocs,
    };

    const selectedLicServices: string[] = [];
    if (newLL.enabled) selectedLicServices.push("New Learning Licence");
    if (dlEndorsement.enabled) selectedLicServices.push("DL New LL Endorsement");
    if (llRenew.enabled) selectedLicServices.push("LL Renew Class");
    if (dlRenewRetest.enabled) selectedLicServices.push("DL Renew + Retest");
    if (generalLicServices.selected.length > 0) selectedLicServices.push(...generalLicServices.selected);

    const finalServicesList =
      activeSubModule === "licence"
        ? selectedLicServices
        : activeSubModule === "form5"
          ? [form5Details.form5Type === "new_hgv" ? "Form 5 New HGV" : "Form 5A Renew HGV"]
          : activeSubModule === "insurance"
            ? ["Insurance"]
            : selectedServices;

    // Format service accounting details map
    const serviceAccountingPayload: Record<string, ServiceAccountingItem> = {};
    if (activeSubModule === "insurance") {
      serviceAccountingPayload["Insurance"] = {
        serviceName: "Insurance",
        totalAmount: Number(insTotalFees) || 0,
        advancePayment: Number(insAdvancePayment) || 0,
        pendingAmount: Math.max(0, (Number(insTotalFees) || 0) - (Number(insAdvancePayment) || 0)),
      };
    } else {
      finalServicesList.forEach((srv) => {
        const item = serviceAccountingMap[srv] || { totalAmount: 0, advancePayment: 0 };
        serviceAccountingPayload[srv] = {
          serviceName: srv,
          totalAmount: item.totalAmount,
          advancePayment: item.advancePayment,
          pendingAmount: Math.max(0, item.totalAmount - item.advancePayment),
        };
      });
    }

    let generatedInvoiceNumber = "";
    let generatedInvoiceId = "";

    // Connect to Accounting & Generate Invoice if selected
    if (shouldGenerateInvoice) {
      try {
        const session = getSession();
        const clientNameStr = ownerName || (name as any) || finalVehNo || "Client";
        const vehicleNumStr = finalVehNo || "";
        const invoiceItems = finalServicesList.map((srv) => {
          let srvTotal = 0;
          if (activeSubModule === "insurance" && srv === "Insurance") {
            srvTotal = insTotalFees;
          } else {
            const item = serviceAccountingMap[srv] || { totalAmount: 0, advancePayment: 0 };
            srvTotal = item.totalAmount;
          }
          return {
            serviceId: srv,
            serviceName: srv,
            vehicleNumber: vehicleNumStr,
            quantity: 1,
            unitPrice: srvTotal,
            amount: srvTotal,
            tax: 0,
            total: srvTotal,
          };
        });

        if (invoiceItems.length > 0) {
          const createdInv = await createInvoice(
            {
              id: vehicleNumStr.trim().toUpperCase().replace(/[\s-]/g, "") || "CLIENT",
              name: clientNameStr,
              mo: phone,
              application: address,
              mvNo: vehicleNumStr,
              work: finalServicesList.join(", "),
            } as any,
            invoiceItems,
            new Date().toISOString().split("T")[0],
            new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
            session?.name || "System"
          );

          generatedInvoiceNumber = createdInv.invoiceNumber;
          generatedInvoiceId = createdInv.id;
          toast.success(`Invoice ${generatedInvoiceNumber} generated & connected to Accounting!`);
        }
      } catch (invErr: any) {
        console.error("Invoice auto-generation error:", invErr);
      }
    }

    let finalAppType = appTypeSelect;
    if (isCustomAppType && customAppTypeInput.trim()) {
      finalAppType = customAppTypeInput.trim();
      try {
        const saved = localStorage.getItem("custom_application_types");
        const currentList: string[] = saved ? JSON.parse(saved) : [];
        const updatedList = Array.from(new Set([...currentList, finalAppType]));
        localStorage.setItem("custom_application_types", JSON.stringify(updatedList));
      } catch (e) {
        console.error(e);
      }
    }

    try {
      await saveApplicationAndVehicle(
        sanitizeFirestoreData({
          subModule: activeSubModule,
          dateOfBirth: activeSubModule === "form5" ? form5Details.dateOfBirth : (activeSubModule === "licence" || activeSubModule === "insurance" ? dateOfBirth : undefined),
          licenseDetails: activeSubModule === "licence" ? {
            subModule: activeSubModule,
            dateOfBirth,
            isDrivingSchoolHolder,
            newLearningLicence: newLL,
            dlNewLlEndorsement: dlEndorsement,
            llRenewClass: llRenew,
            dlRenewRetest: dlRenewRetest,
            generalLicenceServices: {
              selectedServices: generalLicServices.selected,
              serviceAccounting: generalLicServices.accounting,
              dlNumber: genDlNumber,
              classOfVehicle: genClassOfVehicle,
              issueDate: genIssueDate,
              validityDate: genValidityDate,
              vehicleTypes: genVehicleTypes,
              ntValidity: genNtValidity,
              trValidity: genTrValidity,
              hazardousValidity: genHazardousValidity,
              hazardousTrainingValidity: genHazardousTrainingValidity,
              internationalLicenceValidity: genInternationalLicenceValidity,
            },
          } : undefined,
          form5Details: activeSubModule === "form5" ? form5Details : undefined,
          vehicleId: finalVehNo.toUpperCase().replace(/[\s-]/g, ""),
          vehicleNumber: finalVehNo,
          ownerName: activeSubModule === "form5" ? (form5Details.name || "") : ownerName,
          mobileNumber: phone,
          services: finalServicesList,
          serviceAccounting: serviceAccountingPayload,
          assignedEmployeeName: assignedEmployee,
          applicationStatus: status,
          paymentStatus: overallTotals.payStatus,
          amount: overallTotals.totalAmt,
          totalPaid: overallTotals.totalAdv,
          pendingAmount: overallTotals.pending,
          invoiceId: generatedInvoiceId || undefined,
          invoiceNumber: generatedInvoiceNumber || undefined,
          remarks: employeeRemarks,
          dueDate,
          reminder,
          priority,
          challanQty: parseInt(challanQty) || 0,
          challanAmount: parseFloat(challanAmount) || 0,
          createTaskAuto,
          templateId: selectedTemplateId || undefined,
          documents: uploadedDocs,
          applicationType: finalAppType,
          trackExpiry: {
            puc: activeSubModule === "insurance" ? false : (showPucDetails && !!pucExpiryDate),
            tax: activeSubModule === "insurance" ? false : (showTaxDetails && (!!taxExpiryDate || taxAmount > 0)),
            insurance: activeSubModule === "insurance" ? true : false,
            permit: activeSubModule === "insurance" ? false : (showPermitDetails && (!!gujaratPermitIssueDate || !!nationalPermitIssueDate || !!nationalAuthIssueDate)),
            fitness: activeSubModule === "insurance" ? false : (showFitnessDetails && !!fitnessExpiryDate),
          },
          vehicleDetails: vehicleDetails as any,
        }),
        editingApp?.id
      );

      toast.success(
        editingApp
          ? "Application Updated Successfully!"
          : "Application Created & Connected to Accounting!"
      );
      setSaving(false);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save application");
      setSaving(false);
    }
  };

  const documentItems = [
    "RC Book",
    "Tax Receipt",
    "Fitness",
    "Gujarat Permit",
    "National Permit(Gujrat Permit)",
    "National Permit Authorization",
    "PUC",
    "Insurance",
    "Owner Aadhaar",
    "Buyer Aadhaar",
    "Seller Aadhaar",
    "PAN Card",
    "Other Document 1",
    "Other Document 2",
    "Other Document 3",
  ];

  const licenseDocumentItems = [
    "Aadhaar Card",
    "Date Of Birth Certificate",
    "PAN Card",
    "School Leaving Certificate",
    "Passport",
    "Visa",
    "Air Ticket",
    "Marriage Certificate",
    "Ration Card",
    "Driving Licence",
    "Learning Licence",
    "Election Card",
    "Hazardous Card",
  ];

  const form5DocumentItems = [
    "Document 1",
    "Document 2",
    "Document 3",
    "Document 4",
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm overflow-y-auto flex justify-center p-4 sm:p-6 application-form-modal">
      <div className="bg-slate-50 w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Modal Top Bar */}
        <div className="bg-white px-6 py-4 border-b border-slate-200 flex justify-between items-center sticky top-0 z-20">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {editingApp ? "Edit Application" : "New Application"}
            </h2>
            <p className="text-xs text-slate-500">Services workflow • All in one scroll</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => handleSave("Submitted")}
              disabled={saving}
              className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20 transition-all"
            >
              {saving ? "Saving..." : editingApp ? "Save Application" : "Create Application"}
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Sub Module Tabs Nav Pills */}
          <div>
            <SubModuleTabs activeTab={activeSubModule} onChange={setActiveSubModule} />
          </div>

          {/* LICENCE SUB MODULE FORM */}
          {activeSubModule === "licence" && (
            <div className="space-y-6">
              {/* Applicant Details Section */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <User className="w-5 h-5 text-blue-600" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Applicant Details</h3>
                    <p className="text-[11px] text-slate-400">Only Name and Date of Birth are mandatory.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">NAME *</label>
                    <input
                      type="text"
                      placeholder=""
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      onBlur={licenseAutoFill.handleBlur}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">DATE OF BIRTH *</label>
                    <input
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">MOBILE NUMBER</label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder=""
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        onBlur={licenseAutoFill.handleBlur}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl pr-10"
                      />
                      {licenseAutoFill.loading && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        </div>
                      )}
                    </div>
                    {licenseAutoFill.success && (
                      <p className="text-[10px] text-emerald-600 mt-1 font-semibold">
                        Existing customer found. Details loaded.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">ADDRESS</label>
                    <input
                      type="text"
                      placeholder=""
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">C/O</label>
                    <input
                      type="text"
                      placeholder=""
                      value={fatherHusbandName}
                      onChange={(e) => setFatherHusbandName(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  {/* GROUP NAME DROPDOWN WITH ADD NEW OPTION */}
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">GROUP NAME</label>
                    {!showAddGroupInput ? (
                      <div className="flex gap-2">
                        <select
                          value={groupName}
                          onChange={(e) => {
                            if (e.target.value === "ADD_NEW") {
                              setShowAddGroupInput(true);
                            } else {
                              setGroupName(e.target.value);
                            }
                          }}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800"
                        >
                          {groupOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                          <option value="ADD_NEW">+ Add New Group...</option>
                        </select>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder=""
                          value={newGroupInput}
                          onChange={(e) => setNewGroupInput(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newGroupInput.trim()) {
                              const added = newGroupInput.trim();
                              setGroupOptions((prev) => [...prev, added]);
                              setGroupName(added);
                              setNewGroupInput("");
                              setShowAddGroupInput(false);
                              toast.success(`Group "${added}" added and selected!`);
                            }
                          }}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-semibold"
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-3 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800 p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <input
                        type="checkbox"
                        checked={isDrivingSchoolHolder}
                        onChange={(e) => setIsDrivingSchoolHolder(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>Driving School Holder</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Licence Services Accordions Section */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900">Licence Services</h3>
                  <p className="text-[11px] text-slate-400">Select a service to expand its form</p>
                </div>

                {/* 1. New Learning Licence Service */}
                {/* Unified Vehicle Type Checkboxes & Expiry Dates (NT, TR, Hazardous) */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <label className="font-semibold text-slate-700 block mb-1">VEHICLE TYPE & EXPIRY DATES</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { label: "NT Expiry Date", key: "nt", validity: genNtValidity, setValidity: setGenNtValidity },
                      { label: "TR Expiry Date", key: "tr", validity: genTrValidity, setValidity: setGenTrValidity },
                      { label: "Hazardous Expiry Date", key: "hazardous", validity: genHazardousValidity, setValidity: setGenHazardousValidity },
                    ].map((vtItem) => {
                      const vtKey = vtItem.key as "nt" | "tr" | "hazardous";
                      const checked = !!genVehicleTypes[vtKey];

                      return (
                        <div key={vtItem.key} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 text-xs select-none">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setGenVehicleTypes((prev) => ({
                                  ...prev,
                                  [vtKey]: e.target.checked,
                                }))
                              }
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span>{vtItem.key.toUpperCase()}</span>
                          </label>

                          {checked && (
                            <div>
                              <label className="text-[10px] font-semibold text-slate-500 block mb-1 uppercase">{vtItem.label}</label>
                              <input
                                type="text"
                                placeholder="DD/MM/YYYY"
                                value={vtItem.validity}
                                onChange={(e) => {
                                  let val = e.target.value.replace(/\D/g, "");
                                  if (val.length > 8) val = val.slice(0, 8);
                                  if (val.length > 4) {
                                    val = `${val.slice(0, 2)}/${val.slice(2, 4)}/${val.slice(4)}`;
                                  } else if (val.length > 2) {
                                    val = `${val.slice(0, 2)}/${val.slice(2)}`;
                                  }
                                  vtItem.setValidity(val);
                                }}
                                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/50">
                  <label className="flex items-center gap-3 p-4 bg-white cursor-pointer border-b border-slate-200/80 select-none">
                    <input
                      type="checkbox"
                      checked={newLL.enabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setNewLL((prev) => ({ ...prev, enabled: checked }));
                        if (checked) {
                          setServiceAccountingMap((old) => ({
                            ...old,
                            "New Learning Licence": old["New Learning Licence"] || { totalAmount: 0, advancePayment: 0 },
                          }));
                        } else {
                          setServiceAccountingMap((old) => {
                            const next = { ...old };
                            delete next["New Learning Licence"];
                            return next;
                          });
                        }
                      }}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-bold text-slate-900 text-xs">New Learning Licence</span>
                  </label>

                  {newLL.enabled && (
                    <div className="p-5 space-y-5 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">APPLICATION NO.</label>
                          <input
                            type="text"
                            placeholder=""
                            value={newLL.applicationNo}
                            onChange={(e) => setNewLL((prev) => ({ ...prev, applicationNo: e.target.value }))}
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono"
                          />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">APPOINTMENT DATE</label>
                          <input
                            type="date"
                            value={newLL.appointmentDate}
                            onChange={(prev) => setNewLL((prevVal) => ({ ...prevVal, appointmentDate: prev.target.value }))}
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl"
                          />
                        </div>
                      </div>

                      {/* Step 1: Learning Licence Details */}
                      <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3">
                        <div className="flex items-center gap-2 font-bold text-blue-900 text-xs">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">1</span>
                          <span>LEARNING LICENCE DETAILS</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div>
                            <label className="font-semibold text-slate-600 block mb-1">LL NUMBER</label>
                            <input
                              type="text"
                              placeholder=""
                              value={newLL.step1.llNumber}
                              onChange={(e) => setNewLL((prev) => ({ ...prev, step1: { ...prev.step1, llNumber: e.target.value } }))}
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-600 block mb-1">ISSUE DATE</label>
                            <input
                              type="date"
                              value={newLL.step1.issueDate}
                              onChange={(e) => setNewLL((prev) => ({ ...prev, step1: { ...prev.step1, issueDate: e.target.value } }))}
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-600 block mb-1">EXPIRY DATE</label>
                            <input
                              type="date"
                              value={newLL.step1.expiryDate}
                              onChange={(e) => setNewLL((prev) => ({ ...prev, step1: { ...prev.step1, expiryDate: e.target.value } }))}
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900"
                            />
                          </div>
                          <div className="relative">
                            <label className="font-semibold text-slate-700 block mb-1">CLASS OF VEHICLE (MULTIPLE SELECTION)</label>
                            <div
                              className="min-h-[42px] p-1.5 bg-white border border-slate-200 rounded-xl flex flex-wrap gap-1.5 items-center cursor-pointer select-none text-xs"
                              onClick={() => setShowClassDropdown(!showClassDropdown)}
                            >
                              {newLL.classOfVehicle.length === 0 ? (
                                <span className="text-slate-400 pl-2 text-[11px]">Select Class of Vehicle...</span>
                              ) : (
                                newLL.classOfVehicle.map((val) => (
                                  <span
                                    key={val}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-800 text-[10px] font-bold rounded-lg border border-blue-100"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const next = newLL.classOfVehicle.filter((v) => v !== val);
                                      setNewLL((prevVal) => {
                                        const updated = {
                                          ...prevVal,
                                          classOfVehicle: next,
                                          step2: {
                                            ...prevVal.step2,
                                            classOfVehicle: next,
                                          }
                                        };
                                        return updated;
                                      });
                                    }}
                                  >
                                    {val}
                                    <span className="text-blue-500 hover:text-blue-700 font-bold ml-0.5">×</span>
                                  </span>
                                ))
                              )}
                            </div>

                            {showClassDropdown && (
                              <div className="absolute left-0 right-0 z-30 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 space-y-2.5 max-h-[250px] overflow-y-auto">
                                <div className="grid grid-cols-2 gap-1.5">
                                  {suggestedClasses.map((item) => {
                                    const isSelected = newLL.classOfVehicle.includes(item);
                                    return (
                                      <label
                                        key={item}
                                        className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer font-semibold text-[11px] transition-all select-none ${isSelected ? "bg-blue-50 border-blue-200 text-blue-900" : "bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-700"
                                          }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={(e) => {
                                            const next = e.target.checked
                                              ? [...newLL.classOfVehicle, item]
                                              : newLL.classOfVehicle.filter((v) => v !== item);

                                            setNewLL((prevVal) => {
                                              const updated = {
                                                ...prevVal,
                                                classOfVehicle: next,
                                                step2: {
                                                  ...prevVal.step2,
                                                  classOfVehicle: next,
                                                }
                                              };
                                              return updated;
                                            });
                                          }}
                                          className="w-3.5 h-3.5 text-blue-600 rounded"
                                        />
                                        <span>{item}</span>
                                      </label>
                                    );
                                  })}
                                </div>

                                <div className="border-t pt-2 flex gap-2">
                                  <input
                                    type="text"
                                    placeholder="Add custom class..."
                                    value={customClassInput}
                                    onChange={(e) => setCustomClassInput(e.target.value.toUpperCase())}
                                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const cleaned = customClassInput.trim();
                                      if (cleaned && !suggestedClasses.includes(cleaned)) {
                                        const nextSuggested = [...suggestedClasses, cleaned];
                                        setSuggestedClasses(nextSuggested);
                                        localStorage.setItem("custom_vehicle_classes", JSON.stringify(nextSuggested));

                                        const nextSelected = [...newLL.classOfVehicle, cleaned];
                                        setNewLL((prevVal) => ({
                                          ...prevVal,
                                          classOfVehicle: nextSelected,
                                          step2: {
                                            ...prevVal.step2,
                                            classOfVehicle: nextSelected,
                                          }
                                        }));
                                        setCustomClassInput("");
                                      }
                                    }}
                                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold whitespace-nowrap"
                                  >
                                    + Add
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowClassDropdown(false);
                                    }}
                                    className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold whitespace-nowrap"
                                  >
                                    Close
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Step 2: Driving Licence Details */}
                      <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3">
                        <div className="flex items-center gap-2 font-bold text-blue-900 text-xs">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">2</span>
                          <span>DRIVING LICENCE DETAILS</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label className="font-semibold text-slate-600 block mb-1">DL NUMBER</label>
                            <input
                              type="text"
                              placeholder="GJ01 20260001234"
                              value={newLL.step2.dlNumber}
                              onChange={(e) => setNewLL((prev) => ({ ...prev, step2: { ...prev.step2, dlNumber: e.target.value } }))}
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-600 block mb-1">ISSUE DATE</label>
                            <input
                              type="date"
                              value={newLL.step2.issueDate}
                              onChange={(e) => setNewLL((prev) => ({ ...prev, step2: { ...prev.step2, issueDate: e.target.value } }))}
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-600 block mb-1">CLASS OF VEHICLE</label>
                            <input
                              type="text"
                              disabled
                              value={newLL.step2.classOfVehicle?.join(", ") || ""}
                              className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-xl font-semibold text-slate-500 cursor-not-allowed"
                              placeholder="Auto-taken from step 1"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Accounting Module for New Learning Licence */}
                      <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">TOTAL AMOUNT (₹)</label>
                          <input
                            type="number"
                            placeholder="Enter total amount"
                            value={serviceAccountingMap["New Learning Licence"]?.totalAmount || ""}
                            onChange={(e) => updateServiceAccounting("New Learning Licence", "totalAmount", Number(e.target.value))}
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">ADVANCE AMOUNT (₹)</label>
                          <input
                            type="number"
                            placeholder="Enter advance amount"
                            value={serviceAccountingMap["New Learning Licence"]?.advancePayment || ""}
                            onChange={(e) => updateServiceAccounting("New Learning Licence", "advancePayment", Number(e.target.value))}
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-emerald-700"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. DL New LL Endorsement Service (3 Steps) */}
                <div className="border border-blue-200/80 rounded-2xl overflow-hidden bg-blue-50/20">
                  <label className="flex items-center gap-3 p-4 bg-white cursor-pointer border-b border-slate-200/80 select-none">
                    <input
                      type="checkbox"
                      checked={dlEndorsement.enabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setDlEndorsement((prev) => ({ ...prev, enabled: checked }));
                        if (checked) {
                          setServiceAccountingMap((old) => ({
                            ...old,
                            "DL New LL Endorsement": old["DL New LL Endorsement"] || { totalAmount: 0, advancePayment: 0 },
                          }));
                        } else {
                          setServiceAccountingMap((old) => {
                            const next = { ...old };
                            delete next["DL New LL Endorsement"];
                            return next;
                          });
                        }
                      }}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-bold text-slate-900 text-xs">DL New LL Endorsement</span>
                  </label>

                  {dlEndorsement.enabled && (
                    <div className="p-5 space-y-5 text-xs">
                      {/* General Application Number */}
                      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                        <div className="grid grid-cols-1 gap-4">
                          <div>
                            <label className="font-semibold text-slate-700 block mb-1">APPLICATION NO.</label>
                            <input
                              type="text"
                              placeholder="Enter application number"
                              value={dlEndorsement.applicationNo}
                              onChange={(e) => setDlEndorsement((prev) => ({ ...prev, applicationNo: e.target.value }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Step 1: DL Details */}
                      <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-sm">
                        <div className="flex items-center gap-2 font-bold text-blue-900 text-xs">
                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">1</span>
                          <span className="uppercase tracking-wider">DL DETAILS</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">DL NUMBER</label>
                            <input
                              type="text"
                              value={dlEndorsement.step1.dlNumber}
                              onChange={(e) => setDlEndorsement((prev) => ({ ...prev, step1: { ...prev.step1, dlNumber: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">ISSUE DATE</label>
                            <input
                              type="date"
                              value={dlEndorsement.step1.issueDate}
                              onChange={(e) => setDlEndorsement((prev) => ({ ...prev, step1: { ...prev.step1, issueDate: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">EXPIRE DATE</label>
                            <input
                              type="date"
                              value={dlEndorsement.step1.validityDate}
                              onChange={(e) => setDlEndorsement((prev) => ({ ...prev, step1: { ...prev.step1, validityDate: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">CLASS OF VEHICLE</label>
                            <input
                              type="text"
                              placeholder="Select or enter vehicle class..."
                              value={dlEndorsement.step1.classOfVehicle || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDlEndorsement((prev) => {
                                  const s1 = val;
                                  const s2 = prev.step2.classOfVehicle || "";
                                  const combined = [s1, s2].map(s => s.trim()).filter(Boolean).join(", ");
                                  return {
                                    ...prev,
                                    step1: { ...prev.step1, classOfVehicle: s1 },
                                    step3: { ...prev.step3, classOfVehicle: combined }
                                  };
                                });
                              }}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Step 2: LL Details */}
                      <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-sm">
                        <div className="flex items-center gap-2 font-bold text-blue-900 text-xs">
                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">2</span>
                          <span className="uppercase tracking-wider">LL DETAILS</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">LL NUMBER</label>
                            <input
                              type="text"
                              value={dlEndorsement.step2.llNumber}
                              onChange={(e) => setDlEndorsement((prev) => ({ ...prev, step2: { ...prev.step2, llNumber: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">ISSUE DATE</label>
                            <input
                              type="date"
                              value={dlEndorsement.step2.issueDate}
                              onChange={(e) => setDlEndorsement((prev) => ({ ...prev, step2: { ...prev.step2, issueDate: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">EXPIRY DATE</label>
                            <input
                              type="date"
                              value={dlEndorsement.step2.expiryDate}
                              onChange={(e) => setDlEndorsement((prev) => ({ ...prev, step2: { ...prev.step2, expiryDate: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">CLASS OF VEHICLE</label>
                            <input
                              type="text"
                              placeholder="Select or enter vehicle class..."
                              value={(dlEndorsement.step2 as any).classOfVehicle || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDlEndorsement((prev) => {
                                  const s1 = prev.step1.classOfVehicle || "";
                                  const s2 = val;
                                  const combined = [s1, s2].map(s => s.trim()).filter(Boolean).join(", ");
                                  return {
                                    ...prev,
                                    step2: { ...prev.step2, classOfVehicle: s2 },
                                    step3: { ...prev.step3, classOfVehicle: combined }
                                  };
                                });
                              }}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Step 3: DL Details */}
                      <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-sm">
                        <div className="flex items-center gap-2 font-bold text-blue-900 text-xs">
                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">3</span>
                          <span className="uppercase tracking-wider">DL DETAILS</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">DL NUMBER</label>
                            <input
                              type="text"
                              value={dlEndorsement.step3.dlNumber}
                              onChange={(e) => setDlEndorsement((prev) => ({ ...prev, step3: { ...prev.step3, dlNumber: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">ISSUE DATE</label>
                            <input
                              type="date"
                              value={dlEndorsement.step3.issueDate}
                              onChange={(e) => setDlEndorsement((prev) => ({ ...prev, step3: { ...prev.step3, issueDate: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">EXPIRE DATE</label>
                            <input
                              type="date"
                              value={dlEndorsement.step3.validityDate}
                              onChange={(e) => setDlEndorsement((prev) => ({ ...prev, step3: { ...prev.step3, validityDate: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 pt-2">
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">CLASS OF VEHICLE (COMBINED)</label>
                            <input
                              type="text"
                              disabled={true}
                              placeholder="Combined class of vehicle..."
                              value={(dlEndorsement.step3 as any).classOfVehicle || ""}
                              className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-500 cursor-not-allowed"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Accounting Module for DL New LL Endorsement */}
                      <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">TOTAL AMOUNT (₹)</label>
                          <input
                            type="number"
                            placeholder="Enter total amount"
                            value={serviceAccountingMap["DL New LL Endorsement"]?.totalAmount || ""}
                            onChange={(e) => updateServiceAccounting("DL New LL Endorsement", "totalAmount", Number(e.target.value))}
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">ADVANCE AMOUNT (₹)</label>
                          <input
                            type="number"
                            placeholder="Enter advance amount"
                            value={serviceAccountingMap["DL New LL Endorsement"]?.advancePayment || ""}
                            onChange={(e) => updateServiceAccounting("DL New LL Endorsement", "advancePayment", Number(e.target.value))}
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-emerald-700"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. LL Renew Class (3 Steps + Appointment Date + Class of Vehicle) */}
                <div className="border border-blue-200/80 rounded-2xl overflow-hidden bg-blue-50/20">
                  <label className="flex items-center gap-3 p-4 bg-white cursor-pointer border-b border-slate-200/80 select-none">
                    <input
                      type="checkbox"
                      checked={llRenew.enabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setLlRenew((prev) => ({ ...prev, enabled: checked }));
                        if (checked) {
                          setServiceAccountingMap((old) => ({
                            ...old,
                            "LL Renew Class": old["LL Renew Class"] || { totalAmount: 0, advancePayment: 0 },
                          }));
                        } else {
                          setServiceAccountingMap((old) => {
                            const next = { ...old };
                            delete next["LL Renew Class"];
                            return next;
                          });
                        }
                      }}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-bold text-slate-900 text-xs">LL Renew Class</span>
                  </label>

                  {llRenew.enabled && (
                    <div className="p-5 space-y-5 text-xs">
                      {/* General Application Number */}
                      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                        <div className="grid grid-cols-1 gap-4">
                          <div>
                            <label className="font-semibold text-slate-700 block mb-1">APPLICATION NO.</label>
                            <input
                              type="text"
                              placeholder="Enter application number"
                              value={llRenew.applicationNo}
                              onChange={(e) => setLlRenew((prev) => ({ ...prev, applicationNo: e.target.value }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Step 1: LL DETAILS */}
                      <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-sm">
                        <div className="flex items-center gap-2 font-bold text-blue-900 text-xs">
                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">1</span>
                          <span className="uppercase tracking-wider">LL DETAILS</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">LL NUMBER</label>
                            <input
                              type="text"
                              value={(llRenew as any).step1?.llNumber || ""}
                              onChange={(e) => setLlRenew((prev) => ({ ...prev, step1: { ...prev.step1, llNumber: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">ISSUE DATE</label>
                            <input
                              type="date"
                              value={(llRenew as any).step1?.issueDate || ""}
                              onChange={(e) => setLlRenew((prev) => ({ ...prev, step1: { ...prev.step1, issueDate: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">EXPIRY DATE</label>
                            <input
                              type="date"
                              value={(llRenew as any).step1?.expiryDate || ""}
                              onChange={(e) => setLlRenew((prev) => ({ ...prev, step1: { ...prev.step1, expiryDate: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div className="relative">
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">CLASS OF VEHICLE</label>
                            <div
                              className="min-h-[42px] p-1.5 bg-white border border-slate-200 rounded-xl flex flex-wrap gap-1.5 items-center cursor-pointer select-none text-xs"
                              onClick={() => setShowLlRenewS1Dropdown(!showLlRenewS1Dropdown)}
                            >
                              {((llRenew as any).step1?.classOfVehicle || []).length === 0 ? (
                                <span className="text-slate-400 pl-2 text-[11px]">Select Class of Vehicle...</span>
                              ) : (
                                (llRenew.step1.classOfVehicle || []).map((val: string) => (
                                  <span
                                    key={val}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-800 text-[10px] font-bold rounded-lg border border-blue-100"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const next = (llRenew.step1.classOfVehicle || []).filter((v: string) => v !== val);
                                      setLlRenew((prevVal) => ({
                                        ...prevVal,
                                        step1: { ...prevVal.step1, classOfVehicle: next }
                                      }));
                                    }}
                                  >
                                    {val}
                                    <span className="text-blue-500 hover:text-blue-700 font-bold ml-0.5">×</span>
                                  </span>
                                ))
                              )}
                            </div>

                            {showLlRenewS1Dropdown && (
                              <div className="absolute left-0 right-0 z-30 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 space-y-2.5 max-h-[250px] overflow-y-auto">
                                <div className="grid grid-cols-2 gap-1.5">
                                  {suggestedClasses.map((item) => {
                                    const isSelected = ((llRenew as any).step1?.classOfVehicle || []).includes(item);
                                    return (
                                      <label
                                        key={item}
                                        className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer font-semibold text-[11px] transition-all select-none ${isSelected ? "bg-blue-50 border-blue-200 text-blue-900" : "bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-700"
                                          }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={(e) => {
                                            const next = e.target.checked
                                              ? [...((llRenew as any).step1?.classOfVehicle || []), item]
                                              : ((llRenew as any).step1?.classOfVehicle || []).filter((v: string) => v !== item);

                                            setLlRenew((prevVal) => ({
                                              ...prevVal,
                                              step1: { ...prevVal.step1, classOfVehicle: next }
                                            }));
                                          }}
                                          className="w-3.5 h-3.5 text-blue-600 rounded"
                                        />
                                        <span>{item}</span>
                                      </label>
                                    );
                                  })}
                                </div>

                                <div className="border-t pt-2 flex gap-2">
                                  <input
                                    type="text"
                                    placeholder="Add custom..."
                                    value={customClassInputS1}
                                    onChange={(e) => setCustomClassInputS1(e.target.value.toUpperCase())}
                                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const cleaned = customClassInputS1.trim();
                                      if (cleaned && !suggestedClasses.includes(cleaned)) {
                                        const nextSuggested = [...suggestedClasses, cleaned];
                                        setSuggestedClasses(nextSuggested);
                                        localStorage.setItem("custom_vehicle_classes", JSON.stringify(nextSuggested));

                                        const nextSelected = [...((llRenew as any).step1?.classOfVehicle || []), cleaned];
                                        setLlRenew((prevVal) => ({
                                          ...prevVal,
                                          step1: { ...prevVal.step1, classOfVehicle: nextSelected }
                                        }));
                                        setCustomClassInputS1("");
                                      }
                                    }}
                                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold whitespace-nowrap"
                                  >
                                    + Add
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowLlRenewS1Dropdown(false);
                                    }}
                                    className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold whitespace-nowrap"
                                  >
                                    Close
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Step 2: NEW LL DETAILS */}
                      <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-sm">
                        <div className="flex items-center gap-2 font-bold text-blue-900 text-xs">
                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">2</span>
                          <span className="uppercase tracking-wider">NEW LL DETAILS</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">LL NUMBER</label>
                            <input
                              type="text"
                              value={(llRenew as any).step2?.llNumber || ""}
                              onChange={(e) => setLlRenew((prev) => ({ ...prev, step2: { ...prev.step2, llNumber: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">ISSUE DATE</label>
                            <input
                              type="date"
                              value={(llRenew as any).step2?.issueDate || ""}
                              onChange={(e) => setLlRenew((prev) => ({ ...prev, step2: { ...prev.step2, issueDate: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">EXPIRY DATE</label>
                            <input
                              type="date"
                              value={(llRenew as any).step2?.expiryDate || ""}
                              onChange={(e) => setLlRenew((prev) => ({ ...prev, step2: { ...prev.step2, expiryDate: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div className="relative">
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">CLASS OF VEHICLE</label>
                            <div
                              className="min-h-[42px] p-1.5 bg-white border border-slate-200 rounded-xl flex flex-wrap gap-1.5 items-center cursor-pointer select-none text-xs"
                              onClick={() => setShowLlRenewS2Dropdown(!showLlRenewS2Dropdown)}
                            >
                              {((llRenew as any).step2?.classOfVehicle || []).length === 0 ? (
                                <span className="text-slate-400 pl-2 text-[11px]">Select Class of Vehicle...</span>
                              ) : (
                                (llRenew.step2.classOfVehicle || []).map((val: string) => (
                                  <span
                                    key={val}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-800 text-[10px] font-bold rounded-lg border border-blue-100"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const next = (llRenew.step2.classOfVehicle || []).filter((v: string) => v !== val);
                                      setLlRenew((prevVal) => ({
                                        ...prevVal,
                                        step2: { ...prevVal.step2, classOfVehicle: next }
                                      }));
                                    }}
                                  >
                                    {val}
                                    <span className="text-blue-500 hover:text-blue-700 font-bold ml-0.5">×</span>
                                  </span>
                                ))
                              )}
                            </div>

                            {showLlRenewS2Dropdown && (
                              <div className="absolute left-0 right-0 z-30 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 space-y-2.5 max-h-[250px] overflow-y-auto">
                                <div className="grid grid-cols-2 gap-1.5">
                                  {suggestedClasses.map((item) => {
                                    const isSelected = ((llRenew as any).step2?.classOfVehicle || []).includes(item);
                                    return (
                                      <label
                                        key={item}
                                        className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer font-semibold text-[11px] transition-all select-none ${isSelected ? "bg-blue-50 border-blue-200 text-blue-900" : "bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-700"
                                          }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={(e) => {
                                            const next = e.target.checked
                                              ? [...((llRenew as any).step2?.classOfVehicle || []), item]
                                              : ((llRenew as any).step2?.classOfVehicle || []).filter((v: string) => v !== item);

                                            setLlRenew((prevVal) => ({
                                              ...prevVal,
                                              step2: { ...prevVal.step2, classOfVehicle: next }
                                            }));
                                          }}
                                          className="w-3.5 h-3.5 text-blue-600 rounded"
                                        />
                                        <span>{item}</span>
                                      </label>
                                    );
                                  })}
                                </div>

                                <div className="border-t pt-2 flex gap-2">
                                  <input
                                    type="text"
                                    placeholder="Add custom..."
                                    value={customClassInputS2}
                                    onChange={(e) => setCustomClassInputS2(e.target.value.toUpperCase())}
                                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const cleaned = customClassInputS2.trim();
                                      if (cleaned && !suggestedClasses.includes(cleaned)) {
                                        const nextSuggested = [...suggestedClasses, cleaned];
                                        setSuggestedClasses(nextSuggested);
                                        localStorage.setItem("custom_vehicle_classes", JSON.stringify(nextSuggested));

                                        const nextSelected = [...((llRenew as any).step2?.classOfVehicle || []), cleaned];
                                        setLlRenew((prevVal) => ({
                                          ...prevVal,
                                          step2: { ...prevVal.step2, classOfVehicle: nextSelected }
                                        }));
                                        setCustomClassInputS2("");
                                      }
                                    }}
                                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold whitespace-nowrap"
                                  >
                                    + Add
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Step 3: DL DETAILS */}
                      <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-sm">
                        <div className="flex items-center gap-2 font-bold text-blue-900 text-xs">
                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">3</span>
                          <span className="uppercase tracking-wider">DL DETAILS</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">DL NUMBER</label>
                            <input
                              type="text"
                              value={(llRenew as any).step3?.dlNumber || ""}
                              onChange={(e) => setLlRenew((prev) => ({ ...prev, step3: { ...prev.step3, dlNumber: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">ISSUE DATE</label>
                            <input
                              type="date"
                              value={(llRenew as any).step3?.issueDate || ""}
                              onChange={(e) => setLlRenew((prev) => ({ ...prev, step3: { ...prev.step3, issueDate: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">EXPIRE DATE</label>
                            <input
                              type="date"
                              value={(llRenew as any).step3?.validityDate || ""}
                              onChange={(e) => setLlRenew((prev) => ({ ...prev, step3: { ...prev.step3, validityDate: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">APPOINTMENT DATE</label>
                            <input
                              type="date"
                              value={llRenew.appointmentDate}
                              onChange={(e) => setLlRenew((prev) => ({ ...prev, appointmentDate: e.target.value }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs"
                            />
                          </div>
                          <div className="relative">
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">CLASS OF VEHICLE</label>
                            <div
                              className="min-h-[42px] p-1.5 bg-white border border-slate-200 rounded-xl flex flex-wrap gap-1.5 items-center cursor-pointer select-none text-xs"
                              onClick={() => setShowLlRenewS3Dropdown(!showLlRenewS3Dropdown)}
                            >
                              {((llRenew as any).step3?.classOfVehicle || []).length === 0 ? (
                                <span className="text-slate-400 pl-2 text-[11px]">Select Class of Vehicle...</span>
                              ) : (
                                (llRenew.step3.classOfVehicle || []).map((val: string) => (
                                  <span
                                    key={val}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-800 text-[10px] font-bold rounded-lg border border-blue-100"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const next = (llRenew.step3.classOfVehicle || []).filter((v: string) => v !== val);
                                      setLlRenew((prevVal) => ({
                                        ...prevVal,
                                        step3: { ...prevVal.step3, classOfVehicle: next }
                                      }));
                                    }}
                                  >
                                    {val}
                                    <span className="text-blue-500 hover:text-blue-700 font-bold ml-0.5">×</span>
                                  </span>
                                ))
                              )}
                            </div>

                            {showLlRenewS3Dropdown && (
                              <div className="absolute left-0 right-0 z-30 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 space-y-2.5 max-h-[250px] overflow-y-auto">
                                <div className="grid grid-cols-2 gap-1.5">
                                  {suggestedClasses.map((item) => {
                                    const isSelected = ((llRenew as any).step3?.classOfVehicle || []).includes(item);
                                    return (
                                      <label
                                        key={item}
                                        className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer font-semibold text-[11px] transition-all select-none ${isSelected ? "bg-blue-50 border-blue-200 text-blue-900" : "bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-700"
                                          }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={(e) => {
                                            const next = e.target.checked
                                              ? [...((llRenew as any).step3?.classOfVehicle || []), item]
                                              : ((llRenew as any).step3?.classOfVehicle || []).filter((v: string) => v !== item);

                                            setLlRenew((prevVal) => ({
                                              ...prevVal,
                                              step3: { ...prevVal.step3, classOfVehicle: next }
                                            }));
                                          }}
                                          className="w-3.5 h-3.5 text-blue-600 rounded"
                                        />
                                        <span>{item}</span>
                                      </label>
                                    );
                                  })}
                                </div>

                                <div className="border-t pt-2 flex gap-2">
                                  <input
                                    type="text"
                                    placeholder="Add custom..."
                                    value={customClassInputS3}
                                    onChange={(e) => setCustomClassInputS3(e.target.value.toUpperCase())}
                                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const cleaned = customClassInputS3.trim();
                                      if (cleaned && !suggestedClasses.includes(cleaned)) {
                                        const nextSuggested = [...suggestedClasses, cleaned];
                                        setSuggestedClasses(nextSuggested);
                                        localStorage.setItem("custom_vehicle_classes", JSON.stringify(nextSuggested));

                                        const nextSelected = [...((llRenew as any).step3?.classOfVehicle || []), cleaned];
                                        setLlRenew((prevVal) => ({
                                          ...prevVal,
                                          step3: { ...prevVal.step3, classOfVehicle: nextSelected }
                                        }));
                                        setCustomClassInputS3("");
                                      }
                                    }}
                                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold whitespace-nowrap"
                                  >
                                    + Add
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Accounting Module for LL Renew Class */}
                      <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">TOTAL AMOUNT (₹)</label>
                          <input
                            type="number"
                            placeholder="Enter total amount"
                            value={serviceAccountingMap["LL Renew Class"]?.totalAmount || ""}
                            onChange={(e) => updateServiceAccounting("LL Renew Class", "totalAmount", Number(e.target.value))}
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">ADVANCE AMOUNT (₹)</label>
                          <input
                            type="number"
                            placeholder="Enter advance amount"
                            value={serviceAccountingMap["LL Renew Class"]?.advancePayment || ""}
                            onChange={(e) => updateServiceAccounting("LL Renew Class", "advancePayment", Number(e.target.value))}
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-emerald-700"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. DL Renew + Retest (3 Steps + Application Numbers) */}
                <div className="border border-blue-200/80 rounded-2xl overflow-hidden bg-blue-50/20">
                  <label className="flex items-center gap-3 p-4 bg-white cursor-pointer border-b border-slate-200/80 select-none">
                    <input
                      type="checkbox"
                      checked={dlRenewRetest.enabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setDlRenewRetest((prev) => ({ ...prev, enabled: checked }));
                        if (checked) {
                          setServiceAccountingMap((old) => ({
                            ...old,
                            "DL Renew + Retest": old["DL Renew + Retest"] || { totalAmount: 0, advancePayment: 0 },
                          }));
                        } else {
                          setServiceAccountingMap((old) => {
                            const next = { ...old };
                            delete next["DL Renew + Retest"];
                            return next;
                          });
                        }
                      }}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-bold text-slate-900 text-xs">DL Renew + Retest</span>
                  </label>

                  {dlRenewRetest.enabled && (
                    <div className="p-5 space-y-5 text-xs">
                      {/* General Application Number */}
                      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                        <div className="grid grid-cols-1 gap-4">
                          <div>
                            <label className="font-semibold text-slate-700 block mb-1">APPLICATION NO.</label>
                            <input
                              type="text"
                              placeholder="Enter application number"
                              value={dlRenewRetest.applicationNo}
                              onChange={(e) => setDlRenewRetest((prev) => ({ ...prev, applicationNo: e.target.value }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Step 1: DL DETAILS */}
                      <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-sm">
                        <div className="flex items-center gap-2 font-bold text-blue-900 text-xs">
                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">1</span>
                          <span className="uppercase tracking-wider">DL DETAILS</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">DL NUMBER</label>
                            <input
                              type="text"
                              value={dlRenewRetest.step1.dlNumber}
                              onChange={(e) => setDlRenewRetest((prev) => ({ ...prev, step1: { ...prev.step1, dlNumber: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">ISSUE DATE</label>
                            <input
                              type="date"
                              value={dlRenewRetest.step1.issueDate}
                              onChange={(e) => setDlRenewRetest((prev) => ({ ...prev, step1: { ...prev.step1, issueDate: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">EXPIRE DATE</label>
                            <input
                              type="date"
                              value={dlRenewRetest.step1.validityDate}
                              onChange={(e) => setDlRenewRetest((prev) => ({ ...prev, step1: { ...prev.step1, validityDate: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">APPLICATION NUMBER 1</label>
                            <input
                              type="text"
                              value={dlRenewRetest.step1.appNo1}
                              onChange={(e) => setDlRenewRetest((prev) => ({ ...prev, step1: { ...prev.step1, appNo1: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Step 2: LL DETAILS */}
                      <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-sm">
                        <div className="flex items-center gap-2 font-bold text-blue-900 text-xs">
                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">2</span>
                          <span className="uppercase tracking-wider">LL DETAILS</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">LL NUMBER</label>
                            <input
                              type="text"
                              value={(dlRenewRetest as any).step2?.llNumber || ""}
                              onChange={(e) => setDlRenewRetest((prev) => ({ ...prev, step2: { ...prev.step2, llNumber: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">ISSUE DATE</label>
                            <input
                              type="date"
                              value={(dlRenewRetest as any).step2?.issueDate || ""}
                              onChange={(e) => setDlRenewRetest((prev) => ({ ...prev, step2: { ...prev.step2, issueDate: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">EXPIRY DATE</label>
                            <input
                              type="date"
                              value={(dlRenewRetest as any).step2?.expiryDate || ""}
                              onChange={(e) => setDlRenewRetest((prev) => ({ ...prev, step2: { ...prev.step2, expiryDate: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">APPLICATION NUMBER 2</label>
                            <input
                              type="text"
                              value={(dlRenewRetest as any).step2?.appNo2 || ""}
                              onChange={(e) => setDlRenewRetest((prev) => ({ ...prev, step2: { ...prev.step2, appNo2: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Step 3: DL DETAILS */}
                      <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-sm">
                        <div className="flex items-center gap-2 font-bold text-blue-900 text-xs">
                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">3</span>
                          <span className="uppercase tracking-wider">DL DETAILS</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">DL NUMBER</label>
                            <input
                              type="text"
                              value={(dlRenewRetest as any).step3?.dlNumber || ""}
                              onChange={(e) => setDlRenewRetest((prev) => ({ ...prev, step3: { ...prev.step3, dlNumber: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">ISSUE DATE</label>
                            <input
                              type="date"
                              value={(dlRenewRetest as any).step3?.issueDate || ""}
                              onChange={(e) => setDlRenewRetest((prev) => ({ ...prev, step3: { ...prev.step3, issueDate: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">EXPIRE DATE</label>
                            <input
                              type="date"
                              value={(dlRenewRetest as any).step3?.validityDate || ""}
                              onChange={(e) => setDlRenewRetest((prev) => ({ ...prev, step3: { ...prev.step3, validityDate: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-slate-500 text-[11px] block mb-1 uppercase">APPLICATION NUMBER 1</label>
                            <input
                              type="text"
                              value={(dlRenewRetest as any).step3?.appNo1 || ""}
                              onChange={(e) => setDlRenewRetest((prev) => ({ ...prev, step3: { ...prev.step3, appNo1: e.target.value } }))}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Accounting Module for DL Renew + Retest */}
                      <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">TOTAL AMOUNT (₹)</label>
                          <input
                            type="number"
                            placeholder="Enter total amount"
                            value={serviceAccountingMap["DL Renew + Retest"]?.totalAmount || ""}
                            onChange={(e) => updateServiceAccounting("DL Renew + Retest", "totalAmount", Number(e.target.value))}
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">ADVANCE AMOUNT (₹)</label>
                          <input
                            type="number"
                            placeholder="Enter advance amount"
                            value={serviceAccountingMap["DL Renew + Retest"]?.advancePayment || ""}
                            onChange={(e) => updateServiceAccounting("DL Renew + Retest", "advancePayment", Number(e.target.value))}
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-emerald-700"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* General Licence Services Grid */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900">General Licence Services</h3>
                  <p className="text-[11px] text-slate-400">Select multiple general services</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  {[
                    "Issue Of Duplicate DL",
                    "Change Of Address In DL",
                    "Change Of Name In DL",
                    "Photo & Signature Change",
                    "Hazardous Material Endorsement",
                    "DL Replacement",
                    "DL Extract",
                    "Hazardous Training Card",
                    "International Driving License",
                    "Change Date Of Birth In DL",
                    "DL Renew",
                    "Surrender of License",
                  ].map((srv) => {
                    const isChecked = generalLicServices.selected.includes(srv);
                    return (
                      <label
                        key={srv}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border cursor-pointer font-medium transition-all",
                          isChecked ? "bg-blue-50 border-blue-300 text-blue-900 font-semibold" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...generalLicServices.selected, srv]
                              : generalLicServices.selected.filter((s) => s !== srv);
                            setGeneralLicServices((prev) => ({ ...prev, selected: next }));
                          }}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span>{srv}</span>
                      </label>
                    );
                  })}
                </div>

                {/* 1. DL RECORD (Visible if any general service is selected) */}
                {generalLicServices.selected.length > 0 && (
                  <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-sm text-xs">
                    <div className="flex items-center gap-2 font-bold text-blue-900">
                      <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">1</span>
                      <span className="uppercase tracking-wider">DL RECORD</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <label className="font-semibold text-slate-500 text-[10px] block mb-1 uppercase">DL NUMBER</label>
                        <input
                          type="text"
                          placeholder="GJ01 20260001234"
                          value={genDlNumber}
                          onChange={(e) => setGenDlNumber(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                        />
                      </div>
                      <div className="relative">
                        <label className="font-semibold text-slate-500 text-[10px] block mb-1 uppercase">CLASS OF VEHICLE</label>
                        <div
                          className="min-h-[42px] p-1.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap gap-1.5 items-center cursor-pointer select-none text-xs"
                          onClick={() => setShowGenClassDropdown(!showGenClassDropdown)}
                        >
                          {(genClassOfVehicle || []).length === 0 ? (
                            <span className="text-slate-400 pl-2 text-[11px]">Select Class of Vehicle...</span>
                          ) : (
                            (genClassOfVehicle || []).map((val: string) => (
                              <span
                                key={val}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-800 text-[10px] font-bold rounded-lg border border-blue-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const next = (genClassOfVehicle || []).filter((v: string) => v !== val);
                                  setGenClassOfVehicle(next);
                                }}
                              >
                                {val}
                                <span className="text-blue-500 hover:text-blue-700 font-bold ml-0.5">×</span>
                              </span>
                            ))
                          )}
                        </div>

                        {showGenClassDropdown && (
                          <div className="absolute left-0 right-0 z-30 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 space-y-2.5 max-h-[250px] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-1.5">
                              {suggestedClasses.map((item) => {
                                const isSelected = (genClassOfVehicle || []).includes(item);
                                return (
                                  <label
                                    key={item}
                                    className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer font-semibold text-[11px] transition-all select-none ${isSelected ? "bg-blue-50 border-blue-200 text-blue-900" : "bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-700"
                                      }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={(e) => {
                                        const next = e.target.checked
                                          ? [...(genClassOfVehicle || []), item]
                                          : (genClassOfVehicle || []).filter((v: string) => v !== item);
                                        setGenClassOfVehicle(next);
                                      }}
                                      className="w-3.5 h-3.5 text-blue-600 rounded"
                                    />
                                    <span>{item}</span>
                                  </label>
                                );
                              })}
                            </div>

                            <div className="border-t pt-2 flex gap-2">
                              <input
                                type="text"
                                placeholder="Add custom..."
                                value={genCustomClassInput}
                                onChange={(e) => setGenCustomClassInput(e.target.value.toUpperCase())}
                                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                                onClick={(e) => e.stopPropagation()}
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const cleaned = genCustomClassInput.trim();
                                  if (cleaned && !suggestedClasses.includes(cleaned)) {
                                    const nextSuggested = [...suggestedClasses, cleaned];
                                    setSuggestedClasses(nextSuggested);
                                    localStorage.setItem("custom_vehicle_classes", JSON.stringify(nextSuggested));

                                    const nextSelected = [...(genClassOfVehicle || []), cleaned];
                                    setGenClassOfVehicle(nextSelected);
                                    setGenCustomClassInput("");
                                  }
                                }}
                                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold whitespace-nowrap"
                              >
                                + Add
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="font-semibold text-slate-500 text-[10px] block mb-1 uppercase">ISSUE DATE</label>
                        <input
                          type="date"
                          value={genIssueDate}
                          onChange={(e) => setGenIssueDate(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-slate-500 text-[10px] block mb-1 uppercase">EXPIRE DATE</label>
                        <input
                          type="date"
                          value={genValidityDate}
                          onChange={(e) => setGenValidityDate(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}


                {/* 2. HAZARDOUS TRAINING CARD */}
                {generalLicServices.selected.includes("Hazardous Training Card") && (
                  <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-sm text-xs">
                    <h4 className="font-bold text-slate-800 uppercase tracking-wide">HAZARDOUS TRAINING CARD</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="font-semibold text-slate-500 text-[10px] block mb-1 uppercase">EXPIRE DATE</label>
                        <input
                          type="date"
                          value={genHazardousTrainingValidity}
                          onChange={(e) => setGenHazardousTrainingValidity(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. INTERNATIONAL DRIVING LICENSE */}
                {(generalLicServices.selected.includes("International Driving License") || generalLicServices.selected.includes("International Licence")) && (
                  <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-sm text-xs">
                    <h4 className="font-bold text-slate-800 uppercase tracking-wide">INTERNATIONAL DRIVING LICENSE</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="font-semibold text-slate-500 text-[10px] block mb-1 uppercase">EXPIRE DATE</label>
                        <input
                          type="date"
                          value={genInternationalLicenceValidity}
                          onChange={(e) => setGenInternationalLicenceValidity(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Change Date Of Birth Note Box */}
                {generalLicServices.selected.includes("Change Date Of Birth In DL") && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 font-medium">
                    On task completion a popup will capture the New Date Of Birth and update the applicant profile.
                  </div>
                )}

                {/* Service Wise Amount Fields for General License Services */}
                {generalLicServices.selected.length > 0 && (
                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <h4 className="font-bold text-slate-800 text-xs">Service Wise Accounting (General License Services)</h4>
                    {generalLicServices.selected.map((genSrv) => {
                      const acc = serviceAccountingMap[genSrv] || { totalAmount: 0, advancePayment: 0 };
                      return (
                        <div key={genSrv} className="p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 md:grid-cols-3 gap-3 items-center text-xs">
                          <span className="font-bold text-slate-800">{genSrv}</span>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">TOTAL AMOUNT (₹)</label>
                            <input
                              type="number"
                              placeholder="0"
                              value={acc.totalAmount || ""}
                              onChange={(e) => updateServiceAccounting(genSrv, "totalAmount", Number(e.target.value))}
                              className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">ADVANCE AMOUNT (₹)</label>
                            <input
                              type="number"
                              placeholder="0"
                              value={acc.advancePayment || ""}
                              onChange={(e) => updateServiceAccounting(genSrv, "advancePayment", Number(e.target.value))}
                              className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold text-emerald-700"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* License Accounting Summary Section */}
              <div className="bg-white p-6 rounded-2xl border border-blue-200 shadow-sm space-y-4 bg-blue-50/20">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3">
                    <DollarSign className="w-5 h-5 text-blue-600" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        License Accounting & Invoice Generation
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Specify service charges & advance payments. Connected to Accounting & Invoicing.
                      </p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={shouldGenerateInvoice}
                      onChange={(e) => setShouldGenerateInvoice(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    Auto-Generate Invoice in Accounting
                  </label>
                </div>

                {/* Total Accounting Summary */}
                <div className="p-4 bg-slate-900 text-white rounded-xl flex flex-wrap justify-between items-center text-xs font-medium gap-4">
                  <div>
                    <span className="text-slate-400">Total Charges:</span>{" "}
                    <strong className="text-white text-sm">
                      ₹{overallTotals.totalAmt.toLocaleString("en-IN")}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Total Advance Received:</span>{" "}
                    <strong className="text-emerald-400 text-sm">
                      ₹{overallTotals.totalAdv.toLocaleString("en-IN")}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Net Balance Due:</span>{" "}
                    <strong className="text-amber-400 text-sm">
                      ₹{overallTotals.pending.toLocaleString("en-IN")}
                    </strong>
                  </div>
                  <div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30">
                      Payment Status: {overallTotals.payStatus}
                    </span>
                  </div>
                </div>
              </div>

              {/* License Documents Section */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div
                  className="flex items-center justify-between p-6 cursor-pointer select-none bg-white hover:bg-slate-50/50 transition-colors"
                  onClick={() => setShowLicenseDocsSection(!showLicenseDocsSection)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                      <FolderOpen className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Documents</h3>
                      <p className="text-[11px] text-slate-400">Upload supporting documents</p>
                    </div>
                  </div>
                  {showLicenseDocsSection ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </div>

                {showLicenseDocsSection && (
                  <div className="p-6 pt-0 border-t border-slate-100 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {licenseDocumentItems.map((docName) => {
                        const docUrl = uploadedDocs[docName];
                        const isUploaded = !!docUrl;
                        return (
                          <div
                            key={docName}
                            className={cn(
                              "p-4 rounded-2xl border transition-all flex items-center gap-3.5 relative min-h-[70px]",
                              isUploaded
                                ? "bg-emerald-50/40 border-emerald-200/80"
                                : "bg-rose-50/80 border-rose-200 hover:border-rose-300"
                            )}
                          >
                            {/* Upload Cloud / File Thumbnail */}
                            <label className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors select-none",
                              isUploaded
                                ? "bg-emerald-100/70 text-emerald-700"
                                : "bg-rose-100/70 text-rose-500 border border-rose-200 hover:bg-rose-200 cursor-pointer"
                            )}>
                              {!isUploaded && (
                                <input
                                  type="file"
                                  accept="image/*,application/pdf"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = (evt) => {
                                      const result = evt.target?.result as string;
                                      setUploadedDocs((prev) => ({ ...prev, [docName]: result }));
                                      toast.success(`${docName} uploaded!`);
                                    };
                                    reader.readAsDataURL(file);
                                  }}
                                />
                              )}
                              <Upload className="w-5 h-5" />
                            </label>

                            {/* Info & Actions */}
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                              <span className={cn("text-xs font-bold truncate block leading-tight", isUploaded ? "text-emerald-800" : "text-rose-800")}>
                                {docName}
                              </span>

                              {isUploaded ? (
                                <div className="flex items-center gap-3 mt-1.5 text-[10px] font-bold">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewDoc({ name: docName, url: docUrl })}
                                    className="text-blue-600 hover:text-blue-800 transition uppercase tracking-wider"
                                  >
                                    View
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const printWindow = window.open("", "_blank");
                                      if (!printWindow) return;
                                      printWindow.document.write(`
                                        <html>
                                          <head>
                                            <title>Print ${docName}</title>
                                            <style>
                                              body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
                                              img, iframe { max-width: 100%; max-height: 100%; object-fit: contain; }
                                            </style>
                                          </head>
                                          <body>
                                      `);
                                      if (docUrl.startsWith("data:application/pdf")) {
                                        printWindow.document.write(`<iframe src="${docUrl}" width="100%" height="100%" style="border: none;"></iframe>`);
                                      } else {
                                        printWindow.document.write(`<img src="${docUrl}" onload="window.print(); window.close();" />`);
                                      }
                                      printWindow.document.write(`
                                          </body>
                                        </html>
                                      `);
                                      printWindow.document.close();
                                      if (docUrl.startsWith("data:application/pdf")) {
                                        setTimeout(() => {
                                          printWindow.print();
                                        }, 1000);
                                      }
                                    }}
                                    className="text-emerald-600 hover:text-emerald-800 transition uppercase tracking-wider"
                                  >
                                    Print
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setUploadedDocs((prev) => {
                                        const next = { ...prev };
                                        delete next[docName];
                                        return next;
                                      });
                                      toast.info(`${docName} removed`);
                                    }}
                                    className="text-rose-600 hover:text-rose-800 transition uppercase tracking-wider"
                                  >
                                    Delete
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[10px] text-rose-400 font-semibold block mt-0.5 uppercase tracking-wide">
                                  Click to Upload
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* License Task Assignment & Internal Notes */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <User className="w-5 h-5 text-blue-600" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Task Assignment & Internal Notes</h3>
                    <p className="text-[11px] text-slate-400">Assign employee, set priority, due date, reminder and remarks</p>
                  </div>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="font-semibold text-orange-700 block mb-1 uppercase">Challan Quantity</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="e.g. 4"
                        value={challanQty}
                        onChange={(e) => setChallanQty(e.target.value)}
                        className="w-full p-2.5 bg-orange-50 border border-orange-200 rounded-xl font-medium text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-orange-700 block mb-1 uppercase">Challan Amount (added to total)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400 font-medium text-xs">₹</span>
                        <input
                          type="number"
                          placeholder="0"
                          value={challanAmount}
                          onChange={(e) => setChallanAmount(e.target.value)}
                          className="w-full pl-7 p-2.5 bg-orange-50 border border-orange-200 rounded-xl font-medium text-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      EMPLOYEE REMARKS
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Notes visible to internal team only..."
                      value={employeeRemarks}
                      onChange={(e) => setEmployeeRemarks(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">DUE DATE</label>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">REMINDER</label>
                      <input
                        type="date"
                        value={reminder}
                        onChange={(e) => setReminder(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">PRIORITY</label>
                      <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as any)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Urgent">Urgent</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        ASSIGNED EMPLOYEE
                      </label>
                      <select
                        value={assignedEmployee}
                        onChange={(e) => setAssignedEmployee(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                      >
                        {activeEmployees.map((emp) => (
                          <option key={emp.id} value={emp.name}>
                            {emp.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        TASK TEMPLATE
                      </label>
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                      >
                        <option value="">Select Task Template</option>
                        {taskTemplates.filter(t => getTemplateSubModule(t) === "licence").map((tpl) => (
                          <option key={tpl.id} value={tpl.id}>
                            {tpl.templateName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={createTaskAuto}
                        onChange={(e) => setCreateTaskAuto(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>Create Task Automatically</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FORM 5 SUB MODULE FORM */}
          {activeSubModule === "form5" && (
            <div className="space-y-6">
              {/* Type Selection */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                    <FileCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Application Type Selection</h3>
                    <p className="text-[11px] text-slate-400">Select any one HGV application option.</p>
                  </div>
                </div>
                <div className="flex flex-col gap-4 pt-2">
                  <div className="flex flex-wrap gap-8">
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 text-xs select-none">
                        <input
                          type="checkbox"
                          checked={form5Details.form5Type === "new_hgv"}
                          onChange={(e) => {
                            setForm5Details(prev => ({
                              ...prev,
                              form5Type: e.target.checked ? "new_hgv" : ""
                            }));
                            if (e.target.checked) {
                              setServiceAccountingMap((oldMap) => ({
                                ...oldMap,
                                "Form 5 New HGV": oldMap["Form 5 New HGV"] || { totalAmount: 0, advancePayment: 0 },
                              }));
                            } else {
                              setServiceAccountingMap((oldMap) => {
                                const newMap = { ...oldMap };
                                delete newMap["Form 5 New HGV"];
                                return newMap;
                              });
                            }
                          }}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span>Form 5 New HGV</span>
                      </label>
                      {form5Details.form5Type === "new_hgv" && (
                        <div className="grid grid-cols-2 gap-2 mt-1 p-3 bg-blue-50/50 border border-blue-200 rounded-xl text-xs max-w-sm">
                          <div>
                            <span className="font-semibold text-slate-500 block text-[10px] mb-0.5">Total Amount (₹)</span>
                            <input
                              type="number"
                              placeholder="0"
                              value={serviceAccountingMap["Form 5 New HGV"]?.totalAmount || ""}
                              onChange={(e) => updateServiceAccounting("Form 5 New HGV", "totalAmount", Number(e.target.value))}
                              className="w-full p-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-900 text-xs"
                            />
                          </div>
                          <div>
                            <span className="font-semibold text-slate-500 block text-[10px] mb-0.5">Advance Payment (₹)</span>
                            <input
                              type="number"
                              placeholder="0"
                              value={serviceAccountingMap["Form 5 New HGV"]?.advancePayment || ""}
                              onChange={(e) => updateServiceAccounting("Form 5 New HGV", "advancePayment", Number(e.target.value))}
                              className="w-full p-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-emerald-700 text-xs"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 text-xs select-none">
                        <input
                          type="checkbox"
                          checked={form5Details.form5Type === "renew_hgv"}
                          onChange={(e) => {
                            setForm5Details(prev => ({
                              ...prev,
                              form5Type: e.target.checked ? "renew_hgv" : ""
                            }));
                            if (e.target.checked) {
                              setServiceAccountingMap((oldMap) => ({
                                ...oldMap,
                                "Form 5A Renew HGV": oldMap["Form 5A Renew HGV"] || { totalAmount: 0, advancePayment: 0 },
                              }));
                            } else {
                              setServiceAccountingMap((oldMap) => {
                                const newMap = { ...oldMap };
                                delete newMap["Form 5A Renew HGV"];
                                return newMap;
                              });
                            }
                          }}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span>Form 5A Renew HGV</span>
                      </label>
                      {form5Details.form5Type === "renew_hgv" && (
                        <div className="grid grid-cols-2 gap-2 mt-1 p-3 bg-blue-50/50 border border-blue-200 rounded-xl text-xs max-w-sm">
                          <div>
                            <span className="font-semibold text-slate-500 block text-[10px] mb-0.5">Total Amount (₹)</span>
                            <input
                              type="number"
                              placeholder="0"
                              value={serviceAccountingMap["Form 5A Renew HGV"]?.totalAmount || ""}
                              onChange={(e) => updateServiceAccounting("Form 5A Renew HGV", "totalAmount", Number(e.target.value))}
                              className="w-full p-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-900 text-xs"
                            />
                          </div>
                          <div>
                            <span className="font-semibold text-slate-500 block text-[10px] mb-0.5">Advance Payment (₹)</span>
                            <input
                              type="number"
                              placeholder="0"
                              value={serviceAccountingMap["Form 5A Renew HGV"]?.advancePayment || ""}
                              onChange={(e) => updateServiceAccounting("Form 5A Renew HGV", "advancePayment", Number(e.target.value))}
                              className="w-full p-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-emerald-700 text-xs"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Details Section */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Form 5 Applicant Details</h3>
                    <p className="text-[11px] text-slate-400">Fill the required credentials below.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">NAME *</label>
                    <input
                      type="text"
                      placeholder=""
                      value={form5Details.name || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm5Details(prev => ({ ...prev, name: val }));
                        setOwnerName(val);
                      }}
                      onBlur={form5AutoFill.handleBlur}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">MOBILE NUMBER *</label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder=""
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        onBlur={form5AutoFill.handleBlur}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl pr-10"
                      />
                      {form5AutoFill.loading && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        </div>
                      )}
                    </div>
                    {form5AutoFill.success && (
                      <p className="text-[10px] text-emerald-600 mt-1 font-semibold">
                        Existing customer found. Details loaded.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">DATE OF BIRTH</label>
                    <input
                      type="date"
                      value={form5Details.dateOfBirth || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm5Details(prev => ({ ...prev, dateOfBirth: val }));
                        setDateOfBirth(val);
                      }}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">APPLICATION NO.</label>
                    <input
                      type="text"
                      placeholder=""
                      value={form5Details.applicationNo || ""}
                      onChange={(e) => setForm5Details(prev => ({ ...prev, applicationNo: e.target.value }))}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">AADHAAR NO.</label>
                    <input
                      type="text"
                      placeholder=""
                      value={form5Details.aadhaarNumber || ""}
                      onChange={(e) => setForm5Details(prev => ({ ...prev, aadhaarNumber: e.target.value }))}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">LL NO.</label>
                    <input
                      type="text"
                      placeholder=""
                      value={form5Details.llNumber || ""}
                      onChange={(e) => setForm5Details(prev => ({ ...prev, llNumber: e.target.value }))}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">LL ISSUE DATE</label>
                    <input
                      type="date"
                      value={form5Details.llIssueDate || ""}
                      onChange={(e) => setForm5Details(prev => ({ ...prev, llIssueDate: e.target.value }))}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">LL EXPIRY DATE</label>
                    <input
                      type="date"
                      value={form5Details.llExpiryDate || ""}
                      onChange={(e) => setForm5Details(prev => ({ ...prev, llExpiryDate: e.target.value }))}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">DL NO.</label>
                    <input
                      type="text"
                      placeholder=""
                      value={form5Details.dlNumber || ""}
                      onChange={(e) => setForm5Details(prev => ({ ...prev, dlNumber: e.target.value }))}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">NT EXPIRE DATE</label>
                    <input
                      type="date"
                      value={form5Details.ntValidityDate || ""}
                      onChange={(e) => setForm5Details(prev => ({ ...prev, ntValidityDate: e.target.value }))}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">TR EXPIRE DATE</label>
                    <input
                      type="date"
                      value={form5Details.trValidityDate || ""}
                      onChange={(e) => setForm5Details(prev => ({ ...prev, trValidityDate: e.target.value }))}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Form 5 Documents Section */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div
                  className="flex items-center justify-between p-6 cursor-pointer select-none bg-white hover:bg-slate-50/50 transition-colors"
                  onClick={() => setShowLicenseDocsSection(!showLicenseDocsSection)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                      <FolderOpen className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Documents</h3>
                      <p className="text-[11px] text-slate-400">Upload supporting documents</p>
                    </div>
                  </div>
                  {showLicenseDocsSection ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </div>

                {showLicenseDocsSection && (
                  <div className="p-6 pt-0 border-t border-slate-100 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {form5DocumentItems.map((docName) => {
                        const docUrl = uploadedDocs[docName];
                        const isUploaded = !!docUrl;
                        return (
                          <div
                            key={docName}
                            className={cn(
                              "p-4 rounded-2xl border transition-all flex items-center gap-3.5 relative min-h-[70px]",
                              isUploaded
                                ? "bg-emerald-50/40 border-emerald-200/80"
                                : "bg-rose-50/80 border-rose-200 hover:border-rose-300"
                            )}
                          >
                            {/* Upload Cloud Icon */}
                            <label className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors select-none",
                              isUploaded
                                ? "bg-emerald-100/70 text-emerald-700"
                                : "bg-rose-100/70 text-rose-500 border border-rose-200 hover:bg-rose-200 cursor-pointer"
                            )}>
                              {!isUploaded && (
                                <input
                                  type="file"
                                  accept="image/*,application/pdf"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = (evt) => {
                                      const result = evt.target?.result as string;
                                      setUploadedDocs((prev) => ({ ...prev, [docName]: result }));
                                      toast.success(`${docName} uploaded!`);
                                    };
                                    reader.readAsDataURL(file);
                                  }}
                                />
                              )}
                              <Upload className="w-5 h-5" />
                            </label>

                            {/* Info & Actions */}
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                              <span className={cn("text-xs font-bold truncate block leading-tight", isUploaded ? "text-emerald-800" : "text-rose-800")}>
                                {docName}
                              </span>

                              {isUploaded ? (
                                <div className="flex items-center gap-3 mt-1.5 text-[10px] font-bold">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewDoc({ name: docName, url: docUrl })}
                                    className="text-blue-600 hover:text-blue-800 transition uppercase tracking-wider"
                                  >
                                    View
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const printWindow = window.open("", "_blank");
                                      if (!printWindow) return;
                                      printWindow.document.write(`
                                        <html>
                                          <head>
                                            <title>Print ${docName}</title>
                                            <style>
                                              body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
                                              img, iframe { max-width: 100%; max-height: 100%; object-fit: contain; }
                                            </style>
                                          </head>
                                          <body>
                                      `);
                                      if (docUrl.startsWith("data:application/pdf")) {
                                        printWindow.document.write(`<iframe src="${docUrl}" width="100%" height="100%" style="border: none;"></iframe>`);
                                      } else {
                                        printWindow.document.write(`<img src="${docUrl}" onload="window.print(); window.close();" />`);
                                      }
                                      printWindow.document.write(`
                                          </body>
                                        </html>
                                      `);
                                      printWindow.document.close();
                                      if (docUrl.startsWith("data:application/pdf")) {
                                        setTimeout(() => {
                                          printWindow.print();
                                        }, 1000);
                                      }
                                    }}
                                    className="text-emerald-600 hover:text-emerald-800 transition uppercase tracking-wider"
                                  >
                                    Print
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setUploadedDocs((prev) => {
                                        const next = { ...prev };
                                        delete next[docName];
                                        return next;
                                      });
                                      toast.info(`${docName} removed`);
                                    }}
                                    className="text-rose-600 hover:text-rose-800 transition uppercase tracking-wider"
                                  >
                                    Delete
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[10px] text-rose-400 font-semibold block mt-0.5 uppercase tracking-wide">
                                  Click to Upload
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Task Assignment & Internal Notes */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <User className="w-5 h-5 text-blue-600" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Task Assignment & Internal Notes</h3>
                    <p className="text-[11px] text-slate-400">Assign employee, set priority, due date, reminder and remarks</p>
                  </div>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="font-semibold text-orange-700 block mb-1 uppercase">Challan Quantity</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="e.g. 4"
                        value={challanQty}
                        onChange={(e) => setChallanQty(e.target.value)}
                        className="w-full p-2.5 bg-orange-50 border border-orange-200 rounded-xl font-medium text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-orange-700 block mb-1 uppercase">Challan Amount (added to total)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400 font-medium text-xs">₹</span>
                        <input
                          type="number"
                          placeholder="0"
                          value={challanAmount}
                          onChange={(e) => setChallanAmount(e.target.value)}
                          className="w-full pl-7 p-2.5 bg-orange-50 border border-orange-200 rounded-xl font-medium text-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      EMPLOYEE REMARKS
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Notes visible to internal team only..."
                      value={employeeRemarks}
                      onChange={(e) => setEmployeeRemarks(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">DUE DATE</label>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">REMINDER</label>
                      <input
                        type="date"
                        value={reminder}
                        onChange={(e) => setReminder(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">PRIORITY</label>
                      <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as any)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Urgent">Urgent</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        ASSIGNED EMPLOYEE
                      </label>
                      <select
                        value={assignedEmployee}
                        onChange={(e) => setAssignedEmployee(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                      >
                        {activeEmployees.map((emp) => (
                          <option key={emp.id} value={emp.name}>
                            {emp.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        TASK TEMPLATE
                      </label>
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                      >
                        <option value="">Select Task Template</option>
                        {taskTemplates.filter(t => getTemplateSubModule(t) === "form5").map((tpl) => (
                          <option key={tpl.id} value={tpl.id}>
                            {tpl.templateName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={createTaskAuto}
                        onChange={(e) => setCreateTaskAuto(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>Create Task Automatically</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DRIVING SCHOOL FORM (MATCHING SCREENSHOT 1) */}
          {activeSubModule === "driving_school" && (
            <div className="space-y-6">
              {/* SECTION 1 — STUDENT DETAILS */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Student Details</h3>
                    <p className="text-[11px] text-slate-400">
                      Only Student Name and Date Of Birth are mandatory.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      STUDENT NAME <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder=""
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      onBlur={drivingSchoolAutoFill.handleBlur}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">MOBILE NUMBER</label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder=""
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        onBlur={drivingSchoolAutoFill.handleBlur}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium pr-10"
                      />
                      {drivingSchoolAutoFill.loading && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        </div>
                      )}
                    </div>
                    {drivingSchoolAutoFill.success && (
                      <p className="text-[10px] text-emerald-600 mt-1 font-semibold">
                        Existing customer found. Details loaded.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">BLOOD GROUP</label>
                    <select
                      value={dsBloodGroup}
                      onChange={(e) => setDsBloodGroup(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    >
                      <option value="">Select Blood Group</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="font-semibold text-slate-700 block mb-1">ADDRESS</label>
                    <input
                      type="text"
                      placeholder=""
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      DATE OF BIRTH <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">GENDER</label>
                    <select
                      value={dsGender}
                      onChange={(e) => setDsGender(e.target.value as any)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Driving Licence Status Toggle */}
                <div className="pt-2 border-t border-slate-100">
                  <label className="font-semibold text-slate-700 block mb-2 text-xs uppercase tracking-wider">
                    DRIVING LICENCE STATUS
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <label
                      className={cn(
                        "flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer font-medium transition-all select-none",
                        dsDlStatus === "WITH_DL"
                          ? "bg-blue-50 border-blue-300 text-blue-900 font-semibold"
                          : "bg-slate-50/80 border-slate-200 text-slate-700 hover:bg-slate-100"
                      )}
                    >
                      <input
                        type="radio"
                        name="dsDlStatus"
                        checked={dsDlStatus === "WITH_DL"}
                        onChange={() => handleDlStatusChange("WITH_DL")}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span>With Driving Licence</span>
                    </label>

                    <label
                      className={cn(
                        "flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer font-medium transition-all select-none",
                        dsDlStatus === "WITHOUT_DL"
                          ? "bg-blue-50 border-blue-300 text-blue-900 font-semibold"
                          : "bg-slate-50/80 border-slate-200 text-slate-700 hover:bg-slate-100"
                      )}
                    >
                      <input
                        type="radio"
                        name="dsDlStatus"
                        checked={dsDlStatus === "WITHOUT_DL"}
                        onChange={() => handleDlStatusChange("WITHOUT_DL")}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span>Without Driving Licence</span>
                    </label>
                  </div>

                  {dsDlStatus === "WITH_DL" && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">
                          DRIVING LICENCE NUMBER <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder=""
                          value={dsDlNumber}
                          onChange={(e) => setDsDlNumber(e.target.value)}
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500/20 text-xs"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">
                          LICENCE ISSUE DATE <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={dsDlIssueDate}
                          onChange={(e) => setDsDlIssueDate(e.target.value)}
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">
                          LICENCE EXPIRY DATE <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={dsDlExpiryDate}
                          onChange={(e) => setDsDlExpiryDate(e.target.value)}
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                      <div>
                        <VehicleClassMultiSelect
                          selectedClasses={dsDlClasses}
                          onChange={setDsDlClasses}
                          label="CLASS OF VEHICLE"
                        />
                      </div>
                    </div>
                  )}

                  {dsDlStatus === "WITHOUT_DL" && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">
                          LEARNING LICENCE NUMBER <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. LL-GJ01-2026"
                          value={dsLlNumber}
                          onChange={(e) => setDsLlNumber(e.target.value)}
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500/20 text-xs"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">
                          LEARNING LICENCE ISSUE DATE <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={dsLlIssueDate}
                          onChange={(e) => setDsLlIssueDate(e.target.value)}
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">
                          LEARNING LICENCE EXPIRY DATE <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={dsLlExpiryDate}
                          onChange={(e) => setDsLlExpiryDate(e.target.value)}
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                      <div>
                        <VehicleClassMultiSelect
                          selectedClasses={dsLlClasses}
                          onChange={setDsLlClasses}
                          label="CLASS OF VEHICLE"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 2 — COURSE DETAILS */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Course Details</h3>
                    <p className="text-[11px] text-slate-400">Fees are calculated automatically</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">JOINING DATE</label>
                    <input
                      type="date"
                      value={dsJoiningDate}
                      onChange={(e) => setDsJoiningDate(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">COURSE START DATE</label>
                    <input
                      type="date"
                      value={dsCourseStartDate}
                      onChange={(e) => setDsCourseStartDate(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">COURSE END DATE</label>
                    <input
                      type="date"
                      value={dsCourseEndDate}
                      onChange={(e) => setDsCourseEndDate(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">COURSE TYPE</label>
                    <select
                      value={dsCourseType}
                      onChange={(e) => setDsCourseType(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900"
                    >
                      {courseTypes.map((course) => (
                        <option key={course} value={course}>
                          {course}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">TOTAL COURSE FEES</label>
                    <input
                      type="number"
                      value={dsTotalCourseFees}
                      onChange={(e) => setDsTotalCourseFees(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">ADVANCE PAID</label>
                    <input
                      type="number"
                      value={dsAdvancePaid}
                      onChange={(e) => setDsAdvancePaid(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-emerald-700"
                    />
                  </div>
                </div>

                {/* Auto Calculated Remaining Fees & Payment Status Badge */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div>
                    <span className="font-semibold text-slate-500 block text-[10px] uppercase">
                      REMAINING FEES
                    </span>
                    <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                      ₹
                      {Math.max(
                        0,
                        (Number(dsTotalCourseFees) || 0) - (Number(dsAdvancePaid) || 0)
                      ).toLocaleString("en-IN")}
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                      Auto = Total Fees − Advance Paid
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-600 text-xs">PAYMENT STATUS</span>
                    <span
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider",
                        (Number(dsTotalCourseFees) || 0) - (Number(dsAdvancePaid) || 0) <= 0
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                          : (Number(dsAdvancePaid) || 0) > 0
                            ? "bg-amber-50 text-amber-700 border-amber-300"
                            : "bg-rose-50 text-rose-700 border-rose-300"
                      )}
                    >
                      {(Number(dsTotalCourseFees) || 0) - (Number(dsAdvancePaid) || 0) <= 0
                        ? "Paid"
                        : (Number(dsAdvancePaid) || 0) > 0
                          ? "Partial"
                          : "Pending"}
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 3 — DOCUMENTS */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Documents</h3>
                    <p className="text-[11px] text-slate-400">Upload supporting documents</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {[
                    "Aadhaar",
                    "Driving Licence",
                    "Learning Licence",
                    "Passport Size Photo",
                    "Medical Certificate",
                    "Other Document",
                    "Other Document 1",
                    "Other Document 2",
                  ].map((docName) => {
                    const docUrl = uploadedDocs[docName];
                    const isUploaded = !!docUrl;

                    return (
                      <div
                        key={docName}
                        className={cn(
                          "p-4 rounded-2xl border border-dashed text-center transition-all flex flex-col items-center justify-center gap-2 min-h-[120px] relative group",
                          isUploaded
                            ? "bg-emerald-50/70 border-emerald-300 text-emerald-900"
                            : "bg-rose-50/80 border-rose-200 text-rose-800 hover:bg-rose-100"
                        )}
                      >
                        <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center gap-1.5">
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = (evt) => {
                                const result = evt.target?.result as string;
                                setUploadedDocs((prev) => ({ ...prev, [docName]: result }));
                                toast.success(`${docName} uploaded!`);
                              };
                              reader.readAsDataURL(file);
                            }}
                          />
                          <Upload
                            className={cn(
                              "w-5 h-5",
                              isUploaded ? "text-emerald-600" : "text-rose-500"
                            )}
                          />
                          <span className={cn("text-xs font-bold leading-tight", isUploaded ? "text-emerald-900" : "text-rose-800")}>
                            {docName}
                          </span>
                          <span className={cn("text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full border bg-white/80 uppercase", isUploaded ? "text-emerald-600" : "text-rose-500")}>
                            {isUploaded ? "✓ Uploaded" : "Click to Upload"}
                          </span>
                        </label>

                        {isUploaded && (
                          <div className="flex gap-1 mt-1 z-10">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewDoc({ name: docName, url: docUrl });
                              }}
                              className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 bg-white/90 px-2 py-0.5 rounded border border-emerald-200"
                            >
                              Preview
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setUploadedDocs((prev) => {
                                  const next = { ...prev };
                                  delete next[docName];
                                  return next;
                                });
                                toast.info(`${docName} removed`);
                              }}
                              className="text-[10px] font-bold text-rose-600 hover:text-rose-900 ml-1 bg-white/90 px-2 py-0.5 rounded border border-rose-200"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 4 — INTERNAL NOTES */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Internal Notes</h3>
                    <p className="text-[11px] text-slate-400">Visible to internal team only</p>
                  </div>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="font-semibold text-orange-700 block mb-1 uppercase">Challan Quantity</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="e.g. 4"
                        value={challanQty}
                        onChange={(e) => setChallanQty(e.target.value)}
                        className="w-full p-2.5 bg-orange-50 border border-orange-200 rounded-xl font-medium text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-orange-700 block mb-1 uppercase">Challan Amount (added to total)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400 font-medium text-xs">₹</span>
                        <input
                          type="number"
                          placeholder="0"
                          value={challanAmount}
                          onChange={(e) => setChallanAmount(e.target.value)}
                          className="w-full pl-7 p-2.5 bg-orange-50 border border-orange-200 rounded-xl font-medium text-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      EMPLOYEE NOTES
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Notes visible to internal team only..."
                      value={employeeRemarks}
                      onChange={(e) => setEmployeeRemarks(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        ASSIGNED EMPLOYEE
                      </label>
                      <select
                        value={assignedEmployee}
                        onChange={(e) => setAssignedEmployee(e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                      >
                        {activeEmployees.map((emp) => (
                          <option key={emp.id} value={emp.name}>
                            {emp.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">REMINDER</label>
                      <input
                        type="date"
                        value={reminder}
                        onChange={(e) => setReminder(e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">PRIORITY</label>
                      <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as any)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Urgent">Urgent</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        TASK TEMPLATE
                      </label>
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                      >
                        <option value="">Select Task Template</option>
                        {taskTemplates.filter(t => getTemplateSubModule(t) === "driving_school").map((tpl) => (
                          <option key={tpl.id} value={tpl.id}>
                            {tpl.templateName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSubModule === "insurance" && (
            <div className="space-y-6">
              {/* Section 1: Applicant Details */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <User className="w-5 h-5 text-blue-600" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Applicant Details</h3>
                    <p className="text-[11px] text-slate-400">Only Name and Date of Birth are mandatory.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">NAME *</label>
                    <input
                      type="text"
                      placeholder=""
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      onBlur={insuranceAutoFill.handleBlur}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">DATE OF BIRTH *</label>
                    <input
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">MOBILE NUMBER</label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder=""
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        onBlur={insuranceAutoFill.handleBlur}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl pr-10"
                      />
                      {insuranceAutoFill.loading && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        </div>
                      )}
                    </div>
                    {insuranceAutoFill.success && (
                      <p className="text-[10px] text-emerald-600 mt-1 font-semibold">
                        Existing customer found. Details loaded.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">ADDRESS</label>
                    <input
                      type="text"
                      placeholder=""
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">C/O</label>
                    <input
                      type="text"
                      placeholder=""
                      value={fatherHusbandName}
                      onChange={(e) => setFatherHusbandName(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">GROUP NAME</label>
                    {!showAddGroupInput ? (
                      <div className="flex gap-2">
                        <select
                          value={groupName}
                          onChange={(e) => {
                            if (e.target.value === "ADD_NEW") {
                              setShowAddGroupInput(true);
                            } else {
                              setGroupName(e.target.value);
                            }
                          }}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800"
                        >
                          {groupOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                          <option value="ADD_NEW">+ Add New Group...</option>
                        </select>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder=""
                          value={newGroupInput}
                          onChange={(e) => setNewGroupInput(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newGroupInput.trim()) {
                              const added = newGroupInput.trim();
                              setGroupOptions((prev) => [...prev, added]);
                              setGroupName(added);
                              setNewGroupInput("");
                              setShowAddGroupInput(false);
                              toast.success(`Group "${added}" added and selected!`);
                            }
                          }}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-semibold"
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Section 2: Register Vehicle Insurance */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-blue-600" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Register Vehicle Insurance</h3>
                      <p className="text-[11px] text-slate-400">Policy, premium calculation & commission details</p>
                    </div>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-xl border border-slate-200">
                    <input
                      type="checkbox"
                      checked={trackInsurance}
                      onChange={(e) => setTrackInsurance(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Show Expiry on Dashboard</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">POLICY SUB-CATEGORY *</label>
                    <select
                      value={policySubCategory}
                      onChange={(e) => setPolicySubCategory(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    >
                      <option value="Motor / Vehicle">Motor / Vehicle</option>
                      <option value="Health">Health</option>
                      <option value="Life">Life</option>
                      <option value="General">General</option>
                      <option value="Commercial">Commercial</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">VEHICLE TYPE (IF MOTOR)</label>
                    <select
                      value={insVehicleType}
                      onChange={(e) => setInsVehicleType(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    >
                      <option value="4 Wheel">4 Wheel</option>
                      <option value="2 Wheel">2 Wheel</option>
                      <option value="3 Wheel">3 Wheel</option>
                      <option value="Commercial Vehicle">Commercial Vehicle</option>
                      <option value="Heavy Vehicle">Heavy Vehicle</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">INSURANCE COMPANY *</label>
                    <select
                      value={insuranceCompany}
                      onChange={(e) => setInsuranceCompany(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    >
                      {insuranceCompanies.map((c: string) => (
                        <option key={c} value={c}>
                          {c === "New India" ? "New India Assurance" : c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">AGENT *</label>
                    <select
                      value={agent}
                      onChange={(e) => setAgent(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    >
                      <option value="">Select Agent</option>
                      {activeEmployees.map((emp) => (
                        <option key={emp.id} value={emp.name}>
                          {emp.name}
                        </option>
                      ))}
                      <option value="Direct">Direct</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">INSURANCE AGENCY</label>
                    <select
                      value={insuranceAgency}
                      onChange={(e) => setInsuranceAgency(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    >
                      <option value="">-- Select Agency --</option>
                      {insuranceAgencies.map((a: string) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">REFERENCE</label>
                    <input
                      type="text"
                      placeholder=""
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">POLICY TYPE *</label>
                    <select
                      value={insurancePolicyType}
                      onChange={(e) => setInsurancePolicyType(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    >
                      <option value="Third Party">Third Party</option>
                      <option value="Comprehensive">Comprehensive</option>
                      <option value="Zero Dep">Zero Dep</option>
                      <option value="Standalone Own Damage">Standalone Own Damage</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">FUEL TYPE</label>
                    <select
                      value={insFuelType}
                      onChange={(e) => setInsFuelType(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    >
                      <option value="Petrol">Petrol</option>
                      <option value="Diesel">Diesel</option>
                      <option value="CNG">CNG</option>
                      <option value="Petrol+CNG">Petrol+CNG</option>
                      <option value="Electric">Electric</option>
                      <option value="Hybrid">Hybrid</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">VEHICLE REGISTRATION NUMBER</label>
                    <input
                      type="text"
                      placeholder=""
                      value={insVehicleRegNumber}
                      onChange={(e) => setInsVehicleRegNumber(e.target.value.toUpperCase())}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase"
                    />
                  </div>

                  <div className="md:col-span-2 lg:col-span-3">
                    <label className="font-semibold text-slate-700 block mb-1">VEHICLE MODEL DETAILS</label>
                    <input
                      type="text"
                      placeholder=""
                      value={insVehicleModelDetails}
                      onChange={(e) => setInsVehicleModelDetails(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">POLICY NUMBER</label>
                    <input
                      type="text"
                      placeholder=""
                      value={insurancePolicyNo}
                      onChange={(e) => setInsurancePolicyNo(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">ISSUE DATE</label>
                    <input
                      type="date"
                      value={insuranceIssueDate}
                      onChange={(e) => setInsuranceIssueDate(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">EXPIRY DATE</label>
                    <input
                      type="date"
                      value={insuranceExpiryDate}
                      onChange={(e) => setInsuranceExpiryDate(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">PREMIUM EXCL-GST (INR) *</label>
                    <input
                      type="number"
                      placeholder=""
                      value={premiumExclGst || ""}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setPremiumExclGst(val);
                        const gst = Math.round(val * (gstPercentage / 100));
                        setGstAmount(gst);
                        const tot = val + gst;
                        setTotalPremium(tot);
                        setInsuranceAmount(tot);
                        setInsTotalFees(tot);
                      }}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">GST @{gstPercentage}% (INR)</label>
                    <input
                      type="number"
                      placeholder=""
                      value={gstAmount || ""}
                      onChange={(e) => {
                        const gst = Number(e.target.value);
                        setGstAmount(gst);
                        const tot = (premiumExclGst || 0) + gst;
                        setTotalPremium(tot);
                        setInsuranceAmount(tot);
                        setInsTotalFees(tot);
                      }}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-blue-700"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">TOTAL PREMIUM (INR)</label>
                    <input
                      type="number"
                      placeholder=""
                      value={totalPremium || ""}
                      onChange={(e) => {
                        const tot = Number(e.target.value);
                        setTotalPremium(tot);
                        setInsuranceAmount(tot);
                        setInsTotalFees(tot);
                      }}
                      className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-xl font-bold"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">INSURER COMMISSION (INR)</label>
                    <input
                      type="number"
                      placeholder=""
                      value={insurerCommission || ""}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setInsurerCommission(val);
                        setNetCommission(val - (clientDiscount || 0));
                      }}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">CLIENT DISCOUNT (INR)</label>
                    <input
                      type="number"
                      placeholder=""
                      value={clientDiscount || ""}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setClientDiscount(val);
                        setNetCommission((insurerCommission || 0) - val);
                      }}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">NET COMMISSION (INR)</label>
                    <input
                      type="number"
                      placeholder=""
                      value={netCommission || ""}
                      onChange={(e) => setNetCommission(Number(e.target.value))}
                      className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-xl font-bold text-emerald-700"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InlineDocUpload
                    label="Previous Policy"
                    docName="Previous Policy"
                    uploadedDocs={uploadedDocs}
                    setUploadedDocs={setUploadedDocs}
                    setPreviewDoc={setPreviewDoc}
                  />
                  <InlineDocUpload
                    label="RC Document"
                    docName="RC Document"
                    uploadedDocs={uploadedDocs}
                    setUploadedDocs={setUploadedDocs}
                    setPreviewDoc={setPreviewDoc}
                  />
                </div>

                <div className="border-t border-slate-100 pt-4 mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-slate-800 block mb-1 text-xs uppercase">કુલ રકમ (₹) *</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={insTotalFees || ""}
                      onChange={(e) => setInsTotalFees(Number(e.target.value))}
                      className="w-full p-3 bg-white border-2 border-blue-200 rounded-xl font-bold text-slate-900 text-sm shadow-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-800 block mb-1 text-xs uppercase">કુલ જમા (₹)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={insAdvancePayment || ""}
                      onChange={(e) => setInsAdvancePayment(Number(e.target.value))}
                      className="w-full p-3 bg-white border-2 border-emerald-200 rounded-xl font-bold text-emerald-700 text-sm shadow-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Internal Notes */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <User className="w-5 h-5 text-blue-600" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Internal Notes</h3>
                    <p className="text-[11px] text-slate-400">Visible to internal team only</p>
                  </div>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="font-semibold text-orange-700 block mb-1 uppercase">Challan Quantity</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="e.g. 4"
                        value={challanQty}
                        onChange={(e) => setChallanQty(e.target.value)}
                        className="w-full p-2.5 bg-orange-50 border border-orange-200 rounded-xl font-medium text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-orange-700 block mb-1 uppercase">Challan Amount (added to total)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400 font-medium text-xs">₹</span>
                        <input
                          type="number"
                          placeholder="0"
                          value={challanAmount}
                          onChange={(e) => setChallanAmount(e.target.value)}
                          className="w-full pl-7 p-2.5 bg-orange-50 border border-orange-200 rounded-xl font-medium text-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">EMPLOYEE REMARKS</label>
                    <textarea
                      rows={3}
                      placeholder="Notes visible to internal team only..."
                      value={employeeRemarks}
                      onChange={(e) => setEmployeeRemarks(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">REMINDER</label>
                      <input
                        type="date"
                        value={reminder}
                        onChange={(e) => setReminder(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">PRIORITY</label>
                      <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as any)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Urgent">Urgent</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">ASSIGNED EMPLOYEE</label>
                      <select
                        value={assignedEmployee}
                        onChange={(e) => setAssignedEmployee(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                      >
                        {activeEmployees.map((emp) => (
                          <option key={emp.id} value={emp.name}>
                            {emp.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {activeSubModule === "insurance" && (
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">
                          TASK TEMPLATE
                        </label>
                        <select
                          value={selectedTemplateId}
                          onChange={(e) => setSelectedTemplateId(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                        >
                          <option value="">Select Task Template</option>
                          {taskTemplates.filter(t => getTemplateSubModule(t) === "insurance").map((tpl) => (
                            <option key={tpl.id} value={tpl.id}>
                              {tpl.templateName}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SERVICES SUB MODULE FORM */}
          {activeSubModule === "services" && (
            <div className="space-y-6">
              {/* 1. Vehicle Details Section */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <Car className="w-5 h-5 text-blue-600" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Vehicle Details</h3>
                    <p className="text-[11px] text-slate-400">
                      Only Vehicle Number is mandatory. Rest is optional. Entering existing number auto populates details.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      VEHICLE NUMBER *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder=""
                        value={vehicleNumber}
                        onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                        onBlur={vahaanAutoFill.handleBlur}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 pr-10"
                      />
                      {vahaanAutoFill.loading && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        </div>
                      )}
                    </div>
                    {vahaanAutoFill.success && (
                      <p className="text-[10px] text-emerald-600 mt-1 font-semibold">
                        Existing customer found. Details loaded.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">PHONE</label>
                    <input
                      type="text"
                      placeholder=""
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">OWNER NAME</label>
                    <input
                      type="text"
                      placeholder=""
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      FATHER / HUSBAND NAME
                    </label>
                    <input
                      type="text"
                      placeholder=""
                      value={fatherHusbandName}
                      onChange={(e) => setFatherHusbandName(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">CO (C/O)</label>
                    <input
                      type="text"
                      placeholder=""
                      value={coName}
                      onChange={(e) => setCoName(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      list="co-name-suggestions"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">GROUP NAME</label>
                    {!showAddGroupInput ? (
                      <div className="flex gap-2">
                        <select
                          value={groupName}
                          onChange={(e) => {
                            if (e.target.value === "ADD_NEW") {
                              setShowAddGroupInput(true);
                            } else {
                              setGroupName(e.target.value);
                            }
                          }}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800"
                        >
                          {groupOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                          <option value="ADD_NEW">+ Add New Group...</option>
                        </select>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder=""
                          value={newGroupInput}
                          onChange={(e) => setNewGroupInput(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newGroupInput.trim()) {
                              const added = newGroupInput.trim();
                              setGroupOptions((prev) => [...prev, added]);
                              setGroupName(added);
                              setNewGroupInput("");
                              setShowAddGroupInput(false);
                              toast.success(`Group "${added}" added and selected!`);
                            }
                          }}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-semibold"
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-3">
                    <label className="font-semibold text-slate-700 block mb-1">ADDRESS</label>
                    <input
                      type="text"
                      placeholder=""
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">REGISTRATION DATE</label>
                    <input
                      type="date"
                      value={registrationDate}
                      onChange={(e) => setRegistrationDate(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">CHASSIS NUMBER</label>
                    <input
                      type="text"
                      placeholder=""
                      value={chassisNumber}
                      onChange={(e) => setChassisNumber(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">ENGINE NUMBER</label>
                    <input
                      type="text"
                      placeholder=""
                      value={engineNumber}
                      onChange={(e) => setEngineNumber(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">FUEL TYPE</label>
                    <select
                      value={fuelType}
                      onChange={(e) => setFuelType(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    >
                      <option value="">Select Fuel Type</option>
                      <option value="Petrol">Petrol</option>
                      <option value="Diesel">Diesel</option>
                      <option value="CNG">CNG</option>
                      <option value="Petrol+CNG">Petrol+CNG</option>
                      <option value="Electric">Electric</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">VEHICLE CLASS</label>
                    <input
                      type="text"
                      placeholder=""
                      value={vehicleClass}
                      onChange={(e) => setVehicleClass(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      list="vehicle-class-suggestions"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">MAKER NAME</label>
                    <input
                      type="text"
                      placeholder=""
                      value={makerName}
                      onChange={(e) => setMakerName(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      list="maker-name-suggestions"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">MODEL NAME</label>
                    <input
                      type="text"
                      placeholder=""
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      list="model-name-suggestions"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">COLOUR</label>
                    <input
                      type="text"
                      placeholder=""
                      value={colour}
                      onChange={(e) => setColour(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      list="colour-suggestions"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">BODY TYPE</label>
                    <input
                      type="text"
                      placeholder=""
                      value={bodyType}
                      onChange={(e) => setBodyType(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      list="body-type-suggestions"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">SEATING CAPACITY</label>
                    <input
                      type="number"
                      value={seatingCapacity}
                      onChange={(e) => setSeatingCapacity(Number(e.target.value))}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">GROSS WEIGHT (KG)</label>
                    <input
                      type="number"
                      value={grossWeight}
                      onChange={(e) => {
                        const gw = Number(e.target.value);
                        setGrossWeight(gw);
                        setPayload(Math.max(0, gw - Number(unladenWeight)));
                      }}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">UNLADEN WEIGHT (KG)</label>
                    <input
                      type="number"
                      value={unladenWeight}
                      onChange={(e) => {
                        const uw = Number(e.target.value);
                        setUnladenWeight(uw);
                        setPayload(Math.max(0, Number(grossWeight) - uw));
                      }}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      PAYLOAD (KG)
                    </label>
                    <input
                      type="number"
                      value={payload}
                      readOnly
                      className="w-full p-2.5 bg-blue-50/60 border border-blue-200 rounded-xl font-semibold text-blue-900 cursor-not-allowed"
                      title="Auto-calculated: Gross Weight − Unladen Weight"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">HORSE POWER (CC)</label>
                    <input
                      type="text"
                      placeholder=""
                      value={horsePower}
                      onChange={(e) => setHorsePower(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">NUMBER OF CYLINDERS</label>
                    <input
                      type="number"
                      value={cylinderCount}
                      onChange={(e) => setCylinderCount(Number(e.target.value))}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div className="md:col-span-3 border-t border-slate-100 pt-4 mt-2">
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-900 uppercase">
                      <input
                        type="checkbox"
                        checked={showPucDetails}
                        onChange={(e) => setShowPucDetails(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      PUC Details
                    </label>
                    {showPucDetails && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                        <div>
                          <div className="mb-1">
                            <label className="font-semibold text-slate-700 block">PUC EXPIRY DATE</label>
                          </div>
                          <input
                            type="date"
                            value={pucExpiryDate}
                            onChange={(e) => setPucExpiryDate(e.target.value)}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Tax Details Section */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                  <label className="flex items-center gap-2.5 cursor-pointer text-sm font-bold text-slate-900 uppercase">
                    <input
                      type="checkbox"
                      checked={showTaxDetails}
                      onChange={(e) => setShowTaxDetails(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    Tax Details
                  </label>
                  {showTaxDetails && (
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={isLumpsumTax}
                          onChange={(e) => setIsLumpsumTax(e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        Lumpsum Tax
                      </label>
                    </div>
                  )}
                </div>

                {showTaxDetails && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs transition-all duration-300">
                    {!isLumpsumTax && (
                      <>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">ISSUE DATE</label>
                          <input
                            type="date"
                            value={taxIssueDate}
                            onChange={(e) => setTaxIssueDate(e.target.value)}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                          />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">EXPIRY DATE</label>
                          <input
                            type="date"
                            value={taxExpiryDate}
                            onChange={(e) => setTaxExpiryDate(e.target.value)}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                          />
                        </div>
                      </>
                    )}
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">TAX PERIOD</label>
                      <select
                        value={taxPeriod}
                        onChange={(e) => setTaxPeriod(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
                      >
                        <option value="">Select Period</option>
                        <option value="Quarterly">Quarterly</option>
                        <option value="Yearly">Yearly</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">AMOUNT (₹)</label>
                      <input
                        type="number"
                        placeholder="₹"
                        value={taxAmount}
                        onChange={(e) => setTaxAmount(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
                      />
                    </div>
                    <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                      <InlineDocUpload
                        label="Rc Document"
                        docName="Tax RC Document"
                        uploadedDocs={uploadedDocs}
                        setUploadedDocs={setUploadedDocs}
                        setPreviewDoc={setPreviewDoc}
                      />
                      <InlineDocUpload
                        label="Tax Receipt Document"
                        docName="Tax Receipt Document"
                        uploadedDocs={uploadedDocs}
                        setUploadedDocs={setUploadedDocs}
                        setPreviewDoc={setPreviewDoc}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Fitness Details Section */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                  <label className="flex items-center gap-2.5 cursor-pointer text-sm font-bold text-slate-900 uppercase">
                    <input
                      type="checkbox"
                      checked={showFitnessDetails}
                      onChange={(e) => setShowFitnessDetails(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    Fitness Details
                  </label>
                </div>
                {showFitnessDetails && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs transition-all duration-300">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">ISSUE DATE</label>
                      <input
                        type="date"
                        value={fitnessIssueDate}
                        onChange={(e) => setFitnessIssueDate(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">EXPIRY DATE</label>
                      <input
                        type="date"
                        value={fitnessExpiryDate}
                        onChange={(e) => setFitnessExpiryDate(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div className="md:col-span-2 mt-2">
                      <InlineDocUpload
                        label="Fitness Document"
                        docName="Fitness Document"
                        uploadedDocs={uploadedDocs}
                        setUploadedDocs={setUploadedDocs}
                        setPreviewDoc={setPreviewDoc}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 5. Permit Section - 3 Fixed Permits */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                  <label className="flex items-center gap-2.5 cursor-pointer text-sm font-bold text-slate-900 uppercase">
                    <input
                      type="checkbox"
                      checked={showPermitDetails}
                      onChange={(e) => setShowPermitDetails(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    Permit Details
                  </label>
                </div>

                {showPermitDetails && (
                  <div className="space-y-4 text-xs transition-all duration-300">
                    {/* 1. Gujarat Permit (5 Yrs Gap) */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-xs">Gujarat Permit</span>
                        <span className="text-[10px] font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md">
                          Fixed 5 Years Expiry Gap
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">ISSUE DATE</label>
                          <input
                            type="date"
                            value={gujaratPermitIssueDate}
                            onChange={(e) => handleGujaratIssueChange(e.target.value)}
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl"
                          />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">
                            EXPIRY DATE (+5 YEARS AUTO)
                          </label>
                          <input
                            type="date"
                            value={gujaratPermitExpiryDate}
                            readOnly
                            className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-xl font-bold font-mono text-slate-800"
                          />
                        </div>
                      </div>
                      <div className="mt-2">
                        <InlineDocUpload
                          label="Gujarat Permit Doc"
                          docName="Gujarat Permit Document"
                          uploadedDocs={uploadedDocs}
                          setUploadedDocs={setUploadedDocs}
                          setPreviewDoc={setPreviewDoc}
                        />
                      </div>
                    </div>

                    {/* 2. National Permit */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-xs">National Permit(Gujrat Permit)</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">ISSUE DATE</label>
                          <input
                            type="date"
                            value={nationalPermitIssueDate}
                            onChange={(e) => setNationalPermitIssueDate(e.target.value)}
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl"
                          />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">
                            EXPIRY DATE
                          </label>
                          <input
                            type="date"
                            value={nationalPermitExpiryDate}
                            onChange={(e) => setNationalPermitExpiryDate(e.target.value)}
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold font-mono text-slate-800"
                          />
                        </div>
                      </div>
                      <div className="mt-2">
                        <InlineDocUpload
                          label="National Permit(Gujrat Permit) Doc"
                          docName="National Permit(Gujrat Permit) Document"
                          uploadedDocs={uploadedDocs}
                          setUploadedDocs={setUploadedDocs}
                          setPreviewDoc={setPreviewDoc}
                        />
                      </div>
                    </div>

                    {/* 3. National Permit Authorization (1 Yr Gap) */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-xs">
                          National Permit Authorization
                        </span>
                        <span className="text-[10px] font-semibold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md">
                          Fixed 1 Year Expiry Gap
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">ISSUE DATE</label>
                          <input
                            type="date"
                            value={nationalAuthIssueDate}
                            onChange={(e) => handleNationalAuthIssueChange(e.target.value)}
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl"
                          />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">
                            EXPIRY DATE (+1 YEAR AUTO)
                          </label>
                          <input
                            type="date"
                            value={nationalAuthExpiryDate}
                            readOnly
                            className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-xl font-bold font-mono text-slate-800"
                          />
                        </div>
                      </div>
                      <div className="mt-2">
                        <InlineDocUpload
                          label="National Permit Authorization Box"
                          docName="National Permit Authorization Document"
                          uploadedDocs={uploadedDocs}
                          setUploadedDocs={setUploadedDocs}
                          setPreviewDoc={setPreviewDoc}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 6. Renewal of Registration (NT) Section */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                  <label className="flex items-center gap-2.5 cursor-pointer text-sm font-bold text-slate-900 uppercase">
                    <input
                      type="checkbox"
                      checked={showRegistrationDetails}
                      onChange={(e) => setShowRegistrationDetails(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    Renewal of Registration (NT)
                  </label>
                </div>
                {showRegistrationDetails && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs transition-all duration-300">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        DATE OF REGISTRATION
                      </label>
                      <input
                        type="date"
                        value={dateOfRegistration}
                        onChange={(e) => setDateOfRegistration(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        REGISTRATION VALIDITY
                      </label>
                      <input
                        type="date"
                        value={registrationValidity}
                        onChange={(e) => setRegistrationValidity(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div className="md:col-span-2 mt-2">
                      <InlineDocUpload
                        label="Rc Document"
                        docName="Registration RC Document"
                        uploadedDocs={uploadedDocs}
                        setUploadedDocs={setUploadedDocs}
                        setPreviewDoc={setPreviewDoc}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 7. Documents Section */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3">
                    <Upload className="w-5 h-5 text-blue-600" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Documents Upload</h3>
                      <p className="text-[11px] text-slate-400">
                        Light Red = Missing • Light Green = Uploaded
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {documentItems.map((docName) => {
                    const docUrl = uploadedDocs[docName];
                    let isUploaded = !!docUrl;
                    if (docName === "RC Book" && (uploadedDocs["Registration RC Document"] || uploadedDocs["Tax RC Document"])) {
                      isUploaded = true;
                    }
                    if (docName === "Tax Receipt" && uploadedDocs["Tax RC Document"]) {
                      isUploaded = true;
                    }
                    if (docName === "Fitness" && uploadedDocs["Fitness Document"]) {
                      isUploaded = true;
                    }
                    if (docName === "Gujarat Permit" && uploadedDocs["Gujarat Permit Document"]) {
                      isUploaded = true;
                    }
                    if (docName === "National Permit(Gujrat Permit)" && uploadedDocs["National Permit(Gujrat Permit) Document"]) {
                      isUploaded = true;
                    }
                    if (docName === "National Permit Authorization" && uploadedDocs["National Permit Authorization Document"]) {
                      isUploaded = true;
                    }
                    if (docName === "PUC" && uploadedDocs["PUC Document"]) {
                      isUploaded = true;
                    }
                    if (docName === "Insurance" && uploadedDocs["Insurance Document"]) {
                      isUploaded = true;
                    }
                    return (
                      <div
                        key={docName}
                        className={cn(
                          "p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 min-h-[100px] relative group",
                          isUploaded
                            ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                            : "bg-rose-50/80 border-rose-200 text-rose-800"
                        )}
                      >
                        <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center gap-1">
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.type === "application/pdf" && file.size > 200 * 1024) {
                                toast.error("PDF file size must be under 200KB to fit database limit");
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = (evt) => {
                                const result = evt.target?.result as string;
                                compressImageBase64(result, (compressed) => {
                                  setUploadedDocs((prev) => ({ ...prev, [docName]: compressed }));
                                  toast.success(`${docName} file uploaded!`);
                                });
                              };
                              reader.readAsDataURL(file);
                            }}
                          />
                          <Upload
                            className={cn("w-5 h-5", isUploaded ? "text-emerald-600" : "text-rose-500")}
                          />
                          <span className="text-[11px] font-bold leading-tight px-1">{docName}</span>
                          <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full border bg-white/80">
                            {isUploaded ? "✓ Uploaded" : "Click to Upload"}
                          </span>
                        </label>

                        {isUploaded && (
                          <div className="flex gap-1 mt-1 z-10">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewDoc({ name: docName, url: docUrl });
                              }}
                              className="text-[9px] underline font-bold text-emerald-700 hover:text-emerald-900 bg-white/90 px-1.5 py-0.5 rounded border border-emerald-200"
                            >
                              View File
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setUploadedDocs((prev) => {
                                  const next = { ...prev };
                                  delete next[docName];
                                  return next;
                                });
                                toast.info(`${docName} removed`);
                              }}
                              className="text-[9px] font-bold text-rose-600 hover:text-rose-900 ml-1 bg-white/90 px-1.5 py-0.5 rounded border border-rose-200"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 8. Service Selection Section */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Services Selection</h3>
                    <p className="text-[11px] text-slate-400">Choose services attached to this application</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {SERVICE_GROUPS.map((group) => (
                    <div key={group.category} className="space-y-2">
                      <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        {group.category}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {group.items.map((srv) => {
                          const isSelected = selectedServices.includes(srv);
                          return (
                            <label
                              key={srv}
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all text-xs font-medium",
                                isSelected
                                  ? "bg-blue-50 border-blue-300 text-blue-900 font-semibold"
                                  : "bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100/80"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleService(srv)}
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                              />
                              <span>{srv}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* NEW 9. Service Accounting & Invoice Details Section */}
              {selectedServices.length > 0 && !isDrivingSchoolHolder && (
                <div className="bg-white p-6 rounded-2xl border border-blue-200 shadow-sm space-y-4 bg-blue-50/20">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-3">
                      <DollarSign className="w-5 h-5 text-blue-600" />
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          Service Accounting & Invoice Generation
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          Specify service charges & advance payments. Connected to Accounting & Invoicing.
                        </p>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={shouldGenerateInvoice}
                        onChange={(e) => setShouldGenerateInvoice(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      Auto-Generate Invoice in Accounting
                    </label>
                  </div>

                  <div className="space-y-3">
                    {selectedServices.map((srv) => {
                      const item = serviceAccountingMap[srv] || { totalAmount: 0, advancePayment: 0 };
                      const pending = Math.max(0, item.totalAmount - item.advancePayment);
                      const srvDisplayName = srv === "Hypothecation Removal" ? "Hypothecation Terminate" : srv;

                      return (
                        <div
                          key={srv}
                          className="p-3.5 bg-white border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-3 items-center text-xs"
                        >
                          <div className="font-bold text-slate-900">{srvDisplayName}</div>

                          <div>
                            <label className="font-semibold text-slate-500 block text-[10px] mb-0.5">
                              કુલ રકમ (₹)
                            </label>
                            <input
                              type="number"
                              placeholder="0"
                              value={item.totalAmount || ""}
                              onChange={(e) =>
                                updateServiceAccounting(srv, "totalAmount", Number(e.target.value))
                              }
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-900"
                            />
                          </div>

                          <div>
                            <label className="font-semibold text-slate-500 block text-[10px] mb-0.5">
                              કુલ જમા (₹)
                            </label>
                            <input
                              type="number"
                              placeholder="0"
                              value={item.advancePayment || ""}
                              onChange={(e) =>
                                updateServiceAccounting(srv, "advancePayment", Number(e.target.value))
                              }
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-emerald-700"
                            />
                          </div>

                          <div>
                            <label className="font-semibold text-slate-500 block text-[10px] mb-0.5">
                              બાકી
                            </label>
                            <div className="p-2 bg-slate-100 rounded-lg font-bold font-mono text-amber-700">
                              ₹{pending.toLocaleString("en-IN")}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Total Accounting Summary */}
                  <div className="p-4 bg-slate-900 text-white rounded-xl flex flex-wrap justify-between items-center text-xs font-medium gap-4">
                    <div>
                      <span className="text-slate-400">કુલ રકમ:</span>{" "}
                      <strong className="text-white text-sm">
                        ₹{overallTotals.totalAmt.toLocaleString("en-IN")}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400">કુલ જમા:</span>{" "}
                      <strong className="text-emerald-400 text-sm">
                        ₹{overallTotals.totalAdv.toLocaleString("en-IN")}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400">બાકી:</span>{" "}
                      <strong className="text-amber-400 text-sm">
                        ₹{overallTotals.pending.toLocaleString("en-IN")}
                      </strong>
                    </div>
                    <div>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30">
                        Payment Status: {overallTotals.payStatus}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 10. Internal Notes / Employee Remarks */}
              {(activeSubModule as string) !== "insurance" && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                    <User className="w-5 h-5 text-blue-600" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Internal Notes</h3>
                      <p className="text-[11px] text-slate-400">Visible to internal team only</p>
                    </div>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="font-semibold text-orange-700 block mb-1 uppercase">Challan Quantity</label>
                        <input
                          type="number"
                          min={0}
                          placeholder="e.g. 4"
                          value={challanQty}
                          onChange={(e) => setChallanQty(e.target.value)}
                          className="w-full p-2.5 bg-orange-50 border border-orange-200 rounded-xl font-medium text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-orange-700 block mb-1 uppercase">Challan Amount (added to total)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400 font-medium text-xs">₹</span>
                          <input
                            type="number"
                            placeholder="0"
                            value={challanAmount}
                            onChange={(e) => setChallanAmount(e.target.value)}
                            className="w-full pl-7 p-2.5 bg-orange-50 border border-orange-200 rounded-xl font-medium text-slate-900"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        EMPLOYEE REMARKS
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Notes visible to internal team only..."
                        value={employeeRemarks}
                        onChange={(e) => setEmployeeRemarks(e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">REMINDER</label>
                        <input
                          type="date"
                          value={reminder}
                          onChange={(e) => setReminder(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">PRIORITY</label>
                        <select
                          value={priority}
                          onChange={(e) => setPriority(e.target.value as any)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                          <option value="Urgent">Urgent</option>
                        </select>
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">
                          ASSIGNED EMPLOYEE
                        </label>
                        <select
                          value={assignedEmployee}
                          onChange={(e) => setAssignedEmployee(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                        >
                          {activeEmployees.map((emp) => (
                            <option key={emp.id} value={emp.name}>
                              {emp.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">
                          TASK TEMPLATE
                        </label>
                        <select
                          value={selectedTemplateId}
                          onChange={(e) => setSelectedTemplateId(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                        >
                          <option value="">Select Task Template</option>
                          {taskTemplates.filter(t => getTemplateSubModule(t) === "vahaan").map((tpl) => (
                            <option key={tpl.id} value={tpl.id}>
                              {tpl.templateName}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Document Preview Modal */}
        {previewDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">{previewDoc.name}</h3>
                  <p className="text-[10px] text-slate-500 font-mono">Document Preview</p>
                </div>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 p-4 overflow-auto flex items-center justify-center bg-slate-100 min-h-[350px]">
                {previewDoc.url.startsWith("data:application/pdf") ? (
                  <iframe src={previewDoc.url} className="w-full h-[500px] rounded-xl border" title="PDF Preview" />
                ) : (
                  <img src={previewDoc.url} alt={previewDoc.name} className="max-h-[500px] max-w-full object-contain rounded-xl shadow-md border" />
                )}
              </div>
              <div className="p-3 border-t border-slate-100 flex justify-end bg-slate-50">
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        )}

        <datalist id="co-name-suggestions">
          {coNameSuggestions.map((val) => (
            <option key={val} value={val} />
          ))}
        </datalist>
        <datalist id="group-name-suggestions">
          {groupNameSuggestions.map((val) => (
            <option key={val} value={val} />
          ))}
        </datalist>
        <datalist id="vehicle-class-suggestions">
          {vehicleClassSuggestions.map((val) => (
            <option key={val} value={val} />
          ))}
        </datalist>
        <datalist id="maker-name-suggestions">
          {makerNameSuggestions.map((val) => (
            <option key={val} value={val} />
          ))}
        </datalist>
        <datalist id="model-name-suggestions">
          {modelNameSuggestions.map((val) => (
            <option key={val} value={val} />
          ))}
        </datalist>
        <datalist id="colour-suggestions">
          {colourSuggestions.map((val) => (
            <option key={val} value={val} />
          ))}
        </datalist>
        <datalist id="body-type-suggestions">
          {bodyTypeSuggestions.map((val) => (
            <option key={val} value={val} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

const displayDate = (ts: any) => {
  if (!ts) return "—";
  let d: Date;
  if (typeof ts === "string") {
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(ts.trim())) {
      return ts.trim().replace(/\-/g, "/");
    }
    d = new Date(ts);
  } else if (ts.toDate && typeof ts.toDate === "function") {
    d = ts.toDate();
  } else if (ts.seconds) {
    d = new Date(ts.seconds * 1000);
  } else if (ts instanceof Date) {
    d = ts;
  } else {
    return "—";
  }

  if (isNaN(d.getTime())) return String(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

function ApplicationDetailsModal({
  app,
  onClose,
}: {
  app: any;
  onClose: () => void;
}) {
  const v = app.vehicleDetails || {};
  const [whatsappPreviewOpen, setWhatsappPreviewOpen] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState("");

  const generateDefaultWhatsappMessage = () => {
    const name = app.ownerName || app.clientName || v.ownerName || "Customer";
    const appNo = app.applicationId || app.id || "—";
    const vehNo = app.vehicleNumber || v.vehicleNumber || "—";
    const appType = app.applicationType || v.applicationType || "Home";
    const statusVal = app.applicationStatus || app.status || "Submitted";

    const services = app.services || [];
    const serviceList = services.length > 0
      ? services
      : (app.serviceName ? app.serviceName.split(", ") : []);
    const servicesStr = serviceList.map((s: string) => `• ${s}`).join("\n");

    const total = app.amount || app.serviceAccounting?.Insurance?.totalAmount || 0;
    const adv = app.totalPaid || app.serviceAccounting?.Insurance?.advancePayment || 0;
    const due = Math.max(0, Number(total) - Number(adv));

    return `REGISTRY PRO

Hello ${name},

Your RTO application details are below.

Application No:
${appNo}

Vehicle:
${vehNo}

Application Type:
${appType}

Selected Services:
${servicesStr || "• RTO Service"}

Total Amount:
₹${total}

Advance Paid:
₹${adv}

Balance Due:
₹${due}

Status:
${statusVal}

Thank you.

REGISTRY PRO`;
  };

  const handleOpenWhatsappPreview = () => {
    const resolvedPhone = app.mobileNumber || app.phone || app.ownerPhone || v.mobileNumber || "";
    if (!resolvedPhone.trim()) {
      toast.error("Customer phone number not available");
      return;
    }
    setWhatsappMessage(generateDefaultWhatsappMessage());
    setWhatsappPreviewOpen(true);
  };

  const handleSendWhatsapp = () => {
    const resolvedPhone = app.mobileNumber || app.phone || app.ownerPhone || v.mobileNumber || "";
    const cleanPhone = resolvedPhone.replace(/\D/g, "");
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(whatsappMessage)}`;
    window.open(url, "_blank");
    setWhatsappPreviewOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm overflow-y-auto flex justify-center p-4 sm:p-6">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-mono font-bold tracking-tight text-blue-400">
                {app.vehicleNumber}
              </h2>
              <span className="px-2.5 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-full text-xs font-semibold uppercase">
                {app.applicationStatus}
              </span>
              {app.applicationType && (
                <span
                  className={cn(
                    "px-2.5 py-0.5 rounded-full text-xs font-semibold border",
                    getAppTypeBadgeColor(app.applicationType)
                  )}
                >
                  Type: {app.applicationType}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Owner: {app.ownerName} • Phone: {app.mobileNumber}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleOpenWhatsappPreview}
              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 px-3 rounded-lg border-0 shadow-sm"
            >
              <svg
                className="w-3.5 h-3.5 fill-current"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.713-1.458L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.864-9.864.002-2.637-1.03-5.114-2.905-6.989-1.875-1.875-4.355-2.904-6.993-2.905-5.438 0-9.87 4.424-9.875 9.872-.002 1.776.471 3.5 1.372 5.01L1.874 20.15l4.773-1.252zm11.233-5.69c-.297-.148-1.758-.868-2.031-.967-.272-.099-.47-.148-.667.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.667-1.609-.914-2.204-.24-.577-.484-.499-.667-.508-.172-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347z" />
              </svg>
              <span>SEND WHATSAPP</span>
            </Button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-all flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-700">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Assigned Staff</span>
              <p className="text-xs font-semibold text-slate-900 mt-1">
                {app.assignedEmployeeName || "Unassigned"}
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase">કુલ રકમ</span>
              <p className="text-xs font-semibold text-slate-900 mt-1">
                ₹{(app.amount || app.serviceAccounting?.Insurance?.totalAmount || 0).toLocaleString("en-IN")}
              </p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <span className="text-[10px] font-bold text-emerald-600 uppercase">કુલ જમા</span>
              <p className="text-xs font-semibold text-emerald-800 mt-1">
                ₹{(app.totalPaid || app.serviceAccounting?.Insurance?.advancePayment || 0).toLocaleString("en-IN")}
              </p>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
              <span className="text-[10px] font-bold text-amber-600 uppercase">બાકી</span>
              <p className="text-xs font-semibold text-amber-800 mt-1">
                ₹{(app.pendingAmount || app.serviceAccounting?.Insurance?.pendingAmount || 0).toLocaleString("en-IN")}
              </p>
            </div>
          </div>

          {/* Connected Invoice Banner */}
          {app.invoiceNumber && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-900 font-medium">
                <Receipt className="w-4 h-4 text-blue-600" />
                <span>Connected Invoice: <strong className="font-mono">{app.invoiceNumber}</strong></span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-600 text-white rounded-md">
                Connected to Accounting
              </span>
            </div>
          )}

          {/* Selected Services Accounting Breakdown */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" /> Selected Services & Accounting
            </h3>
            <div className="divide-y divide-slate-200">
              {app.services?.map((srv: string, idx: number) => {
                const sAcc = app.serviceAccounting?.[srv];
                return (
                  <div key={idx} className="py-2 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{srv}</span>
                    {sAcc ? (
                      <div className="flex items-center gap-4 text-slate-600 font-mono text-[11px]">
                        <span>Fee: ₹{sAcc.totalAmount}</span>
                        <span className="text-emerald-700">Adv: ₹{sAcc.advancePayment}</span>
                        <span className="text-amber-700 font-bold">Due: ₹{sAcc.pendingAmount}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 font-mono">Standard Service</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Driving School Details Card */}
          {app.subModule === "driving_school" && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-blue-600" /> Driving School Details
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                <div>
                  <span className="text-slate-400">Student Name:</span>
                  <p className="font-semibold">{app.studentName || app.ownerName || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Mobile Number:</span>
                  <p className="font-semibold font-mono">{app.mobileNumber || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Date Of Birth:</span>
                  <p className="font-semibold">{app.dateOfBirth || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Gender:</span>
                  <p className="font-semibold">{app.gender || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Blood Group:</span>
                  <p className="font-semibold">{app.bloodGroup || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Address:</span>
                  <p className="font-semibold">{app.address || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Licence Status:</span>
                  <p className="font-bold text-blue-800">
                    {app.drivingLicenceStatus === "WITH_DL" ? "With Driving Licence" : "Without Driving Licence"}
                  </p>
                </div>
              </div>

              {app.drivingLicenceStatus === "WITH_DL" && app.drivingLicence && (
                <div className="border-t border-slate-200/60 pt-3 mt-3">
                  <h4 className="font-bold text-slate-800 mb-2">Driving Licence Details</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                    <div>
                      <span className="text-slate-400">DL Number:</span>
                      <p className="font-semibold font-mono">{app.drivingLicence.number || "—"}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Issue Date:</span>
                      <p className="font-semibold">{displayDate(app.drivingLicence.issueDate)}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Expiry Date:</span>
                      <p className="font-semibold">{displayDate(app.drivingLicence.expiryDate)}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Class Of Vehicle:</span>
                      <p className="font-semibold">
                        {app.drivingLicence.classes && Array.isArray(app.drivingLicence.classes)
                          ? app.drivingLicence.classes.join(", ")
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {app.drivingLicenceStatus === "WITHOUT_DL" && app.learningLicence && (
                <div className="border-t border-slate-200/60 pt-3 mt-3">
                  <h4 className="font-bold text-slate-800 mb-2">Learning Licence Details</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                    <div>
                      <span className="text-slate-400">LL Number:</span>
                      <p className="font-semibold font-mono">{app.learningLicence.number || "—"}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Issue Date:</span>
                      <p className="font-semibold">{displayDate(app.learningLicence.issueDate)}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Expiry Date:</span>
                      <p className="font-semibold">{displayDate(app.learningLicence.expiryDate)}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Class Of Vehicle:</span>
                      <p className="font-semibold">
                        {app.learningLicence.classes && Array.isArray(app.learningLicence.classes)
                          ? app.learningLicence.classes.join(", ")
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form 5 Details Card */}
          {app.subModule === "form5" && app.form5Details && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" /> Form 5 Details
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                <div>
                  <span className="text-slate-400">Application Option:</span>
                  <p className="font-bold text-blue-800">
                    {app.form5Details.form5Type === "new_hgv" ? "Form 5 New HGV" : "Form 5A Renew HGV"}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Name:</span>
                  <p className="font-semibold">{app.form5Details.name || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Date Of Birth:</span>
                  <p className="font-semibold">{app.form5Details.dateOfBirth || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Application No:</span>
                  <p className="font-semibold font-mono">{app.form5Details.applicationNo || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Adhar No:</span>
                  <p className="font-semibold font-mono">{app.form5Details.aadhaarNumber || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">LL NO:</span>
                  <p className="font-semibold font-mono">{app.form5Details.llNumber || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">LL Issue Date:</span>
                  <p className="font-semibold">{app.form5Details.llIssueDate || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">LL Expiry Date:</span>
                  <p className="font-semibold">{app.form5Details.llExpiryDate || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">DL NO:</span>
                  <p className="font-semibold font-mono">{app.form5Details.dlNumber || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">nt validity:</span>
                  <p className="font-semibold">{app.form5Details.ntValidityDate || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">tr validity:</span>
                  <p className="font-semibold">{app.form5Details.trValidityDate || "—"}</p>
                </div>
              </div>
            </div>
          )}

          {/* Licence Details Card */}
          {app.subModule === "licence" && (
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4 text-xs">
              <h3 className="font-bold text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-2">
                <FileText className="w-4 h-4 text-blue-600" /> Licence Details
              </h3>

              {/* General Applicant Fields */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                <div>
                  <span className="text-slate-400">Date Of Birth:</span>
                  <p className="font-semibold">{app.licenseDetails?.dateOfBirth || app.dateOfBirth || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Driving School Holder:</span>
                  <p className="font-semibold">{app.licenseDetails?.isDrivingSchoolHolder ? "YES" : "NO"}</p>
                </div>
              </div>

              {/* 1. New Learning Licence Details */}
              {app.licenseDetails?.newLearningLicence?.enabled && (
                <div className="border-t border-slate-200 pt-3 space-y-3">
                  <h4 className="font-bold text-blue-900 text-[11px] uppercase tracking-wider">New Learning Licence</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] bg-white p-3 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-slate-400">Appointment Date:</span>
                      <p className="font-semibold">{displayDate(app.licenseDetails.newLearningLicence.appointmentDate)}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Application No:</span>
                      <p className="font-semibold font-mono">{app.licenseDetails.newLearningLicence.applicationNo || "—"}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Class Of Vehicle:</span>
                      <p className="font-semibold">
                        {Array.isArray(app.licenseDetails.newLearningLicence.classOfVehicle)
                          ? app.licenseDetails.newLearningLicence.classOfVehicle.join(", ")
                          : app.licenseDetails.newLearningLicence.classOfVehicle || "—"}
                      </p>
                    </div>
                  </div>

                  {/* Step 1: LL Details */}
                  {app.licenseDetails.newLearningLicence.step1 && (
                    <div className="pl-3 border-l-2 border-slate-300 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Step 1: LL Details</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                        <div>
                          <span className="text-slate-400">LL Number:</span>
                          <p className="font-semibold font-mono">{app.licenseDetails.newLearningLicence.step1.llNumber || "—"}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Issue Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.newLearningLicence.step1.issueDate)}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Expiry Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.newLearningLicence.step1.expiryDate)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 2: DL Details */}
                  {app.licenseDetails.newLearningLicence.step2 && (
                    <div className="pl-3 border-l-2 border-blue-500 space-y-1.5">
                      <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">Step 2: DL Details</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                        <div>
                          <span className="text-slate-400">DL Number:</span>
                          <p className="font-semibold font-mono">{app.licenseDetails.newLearningLicence.step2.dlNumber || "—"}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Issue Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.newLearningLicence.step2.issueDate)}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Validity Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.newLearningLicence.step2.validityDate)}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Vehicle Types:</span>
                          <p className="font-semibold">
                            {Object.entries(app.licenseDetails.newLearningLicence.step2.vehicleTypes || {})
                              .filter(([_, val]) => val)
                              .map(([key]) => key.toUpperCase())
                              .join(", ") || "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 2. DL New LL Endorsement Details */}
              {app.licenseDetails?.dlNewLlEndorsement?.enabled && (
                <div className="border-t border-slate-200 pt-3 space-y-3">
                  <h4 className="font-bold text-blue-900 text-[11px] uppercase tracking-wider">DL New LL Endorsement</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] bg-white p-3 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-slate-400">Application No:</span>
                      <p className="font-semibold font-mono">{app.licenseDetails.dlNewLlEndorsement.applicationNo || "—"}</p>
                    </div>
                  </div>

                  {/* Step 1: Existing DL */}
                  {app.licenseDetails.dlNewLlEndorsement.step1 && (
                    <div className="pl-3 border-l-2 border-slate-300 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Step 1: Existing DL</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                        <div>
                          <span className="text-slate-400">DL Number:</span>
                          <p className="font-semibold font-mono">{app.licenseDetails.dlNewLlEndorsement.step1.dlNumber || "—"}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Issue Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.dlNewLlEndorsement.step1.issueDate)}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Validity Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.dlNewLlEndorsement.step1.validityDate)}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Vehicle Types:</span>
                          <p className="font-semibold">
                            {Object.entries(app.licenseDetails.dlNewLlEndorsement.step1.vehicleTypes || {})
                              .filter(([_, val]) => val)
                              .map(([key]) => key.toUpperCase())
                              .join(", ") || "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Endorsement LL */}
                  {app.licenseDetails.dlNewLlEndorsement.step2 && (
                    <div className="pl-3 border-l-2 border-slate-300 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Step 2: Endorsement LL</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                        <div>
                          <span className="text-slate-400">LL Number:</span>
                          <p className="font-semibold font-mono">{app.licenseDetails.dlNewLlEndorsement.step2.llNumber || "—"}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Issue Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.dlNewLlEndorsement.step2.issueDate)}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Expiry Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.dlNewLlEndorsement.step2.expiryDate)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 3: New DL */}
                  {app.licenseDetails.dlNewLlEndorsement.step3 && (
                    <div className="pl-3 border-l-2 border-blue-500 space-y-1.5">
                      <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">Step 3: New DL Details</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                        <div>
                          <span className="text-slate-400">DL Number:</span>
                          <p className="font-semibold font-mono">{app.licenseDetails.dlNewLlEndorsement.step3.dlNumber || "—"}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Issue Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.dlNewLlEndorsement.step3.issueDate)}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Validity Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.dlNewLlEndorsement.step3.validityDate)}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Vehicle Types:</span>
                          <p className="font-semibold">
                            {Object.entries(app.licenseDetails.dlNewLlEndorsement.step3.vehicleTypes || {})
                              .filter(([_, val]) => val)
                              .map(([key]) => key.toUpperCase())
                              .join(", ") || "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 3. LL Renew / Class Details */}
              {app.licenseDetails?.llRenewClass?.enabled && (
                <div className="border-t border-slate-200 pt-3 space-y-3">
                  <h4 className="font-bold text-blue-900 text-[11px] uppercase tracking-wider">LL Renew / Class</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] bg-white p-3 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-slate-400">Appointment Date:</span>
                      <p className="font-semibold">{displayDate(app.licenseDetails.llRenewClass.appointmentDate)}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Application No:</span>
                      <p className="font-semibold font-mono">{app.licenseDetails.llRenewClass.applicationNo || "—"}</p>
                    </div>
                  </div>

                  {/* Step 1: Existing LL */}
                  {app.licenseDetails.llRenewClass.step1 && (
                    <div className="pl-3 border-l-2 border-slate-300 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Step 1: Existing LL</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                        <div>
                          <span className="text-slate-400">LL Number:</span>
                          <p className="font-semibold font-mono">{app.licenseDetails.llRenewClass.step1.llNumber || "—"}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Issue Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.llRenewClass.step1.issueDate)}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Expiry Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.llRenewClass.step1.expiryDate)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Existing DL */}
                  {app.licenseDetails.llRenewClass.step2 && (
                    <div className="pl-3 border-l-2 border-slate-300 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Step 2: Existing DL</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                        <div>
                          <span className="text-slate-400">DL Number:</span>
                          <p className="font-semibold font-mono">{app.licenseDetails.llRenewClass.step2.dlNumber || "—"}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Issue Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.llRenewClass.step2.issueDate)}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Validity Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.llRenewClass.step2.validityDate)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 3: New DL */}
                  {app.licenseDetails.llRenewClass.step3 && (
                    <div className="pl-3 border-l-2 border-blue-500 space-y-1.5">
                      <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">Step 3: New DL Details</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                        <div>
                          <span className="text-slate-400">DL Number:</span>
                          <p className="font-semibold font-mono">{app.licenseDetails.llRenewClass.step3.dlNumber || "—"}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Issue Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.llRenewClass.step3.issueDate)}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Validity Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.llRenewClass.step3.validityDate)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 4. DL Renew Retest Details */}
              {app.licenseDetails?.dlRenewRetest?.enabled && (
                <div className="border-t border-slate-200 pt-3 space-y-3">
                  <h4 className="font-bold text-blue-900 text-[11px] uppercase tracking-wider">DL Renew Retest</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] bg-white p-3 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-slate-400">Application No:</span>
                      <p className="font-semibold font-mono">{app.licenseDetails.dlRenewRetest.applicationNo || "—"}</p>
                    </div>
                  </div>

                  {/* Step 1: Existing DL */}
                  {app.licenseDetails.dlRenewRetest.step1 && (
                    <div className="pl-3 border-l-2 border-slate-300 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Step 1: Existing DL</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                        <div>
                          <span className="text-slate-400">DL Number:</span>
                          <p className="font-semibold font-mono">{app.licenseDetails.dlRenewRetest.step1.dlNumber || "—"}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Issue Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.dlRenewRetest.step1.issueDate)}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Validity Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.dlRenewRetest.step1.validityDate)}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Application No:</span>
                          <p className="font-semibold font-mono">{app.licenseDetails.dlRenewRetest.step1.appNo1 || "—"}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Retest LL */}
                  {app.licenseDetails.dlRenewRetest.step2 && (
                    <div className="pl-3 border-l-2 border-slate-300 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Step 2: Retest LL</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                        <div>
                          <span className="text-slate-400">LL Number:</span>
                          <p className="font-semibold font-mono">{app.licenseDetails.dlRenewRetest.step2.llNumber || "—"}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Issue Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.dlRenewRetest.step2.issueDate)}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Expiry Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.dlRenewRetest.step2.expiryDate)}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Application No:</span>
                          <p className="font-semibold font-mono">{app.licenseDetails.dlRenewRetest.step2.appNo2 || "—"}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 3: New DL */}
                  {app.licenseDetails.dlRenewRetest.step3 && (
                    <div className="pl-3 border-l-2 border-blue-500 space-y-1.5">
                      <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">Step 3: New DL Details</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                        <div>
                          <span className="text-slate-400">DL Number:</span>
                          <p className="font-semibold font-mono">{app.licenseDetails.dlRenewRetest.step3.dlNumber || "—"}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Issue Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.dlRenewRetest.step3.issueDate)}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Validity Date:</span>
                          <p className="font-semibold">{displayDate(app.licenseDetails.dlRenewRetest.step3.validityDate)}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Application No:</span>
                          <p className="font-semibold font-mono">{app.licenseDetails.dlRenewRetest.step3.appNo1 || "—"}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 5. General Licence Services Details */}
              {app.licenseDetails?.generalLicenceServices?.selectedServices && app.licenseDetails.generalLicenceServices.selectedServices.length > 0 && (
                <div className="border-t border-slate-200 pt-3 space-y-3">
                  <h4 className="font-bold text-blue-900 text-[11px] uppercase tracking-wider">General Services Details</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] bg-white p-3 rounded-lg border border-slate-100">
                    {app.licenseDetails.generalLicenceServices.dlNumber && (
                      <div>
                        <span className="text-slate-400">DL Number:</span>
                        <p className="font-semibold font-mono">{app.licenseDetails.generalLicenceServices.dlNumber}</p>
                      </div>
                    )}
                    {app.licenseDetails.generalLicenceServices.classOfVehicle && app.licenseDetails.generalLicenceServices.classOfVehicle.length > 0 && (
                      <div>
                        <span className="text-slate-400">Class Of Vehicle:</span>
                        <p className="font-semibold">{app.licenseDetails.generalLicenceServices.classOfVehicle.join(", ")}</p>
                      </div>
                    )}
                    {app.licenseDetails.generalLicenceServices.issueDate && (
                      <div>
                        <span className="text-slate-400">Issue Date:</span>
                        <p className="font-semibold">{displayDate(app.licenseDetails.generalLicenceServices.issueDate)}</p>
                      </div>
                    )}
                    {app.licenseDetails.generalLicenceServices.validityDate && (
                      <div>
                        <span className="text-slate-400">Validity Date:</span>
                        <p className="font-semibold">{displayDate(app.licenseDetails.generalLicenceServices.validityDate)}</p>
                      </div>
                    )}
                    {app.licenseDetails.generalLicenceServices.vehicleTypes && (
                      <div>
                        <span className="text-slate-400">Vehicle Types:</span>
                        <p className="font-semibold">
                          {Object.entries(app.licenseDetails.generalLicenceServices.vehicleTypes)
                            .filter(([_, enabled]) => enabled)
                            .map(([type]) => type.toUpperCase())
                            .join(", ") || "—"}
                        </p>
                      </div>
                    )}
                    {app.licenseDetails.generalLicenceServices.ntValidity && (
                      <div>
                        <span className="text-slate-400">NT Validity:</span>
                        <p className="font-semibold">{displayDate(app.licenseDetails.generalLicenceServices.ntValidity)}</p>
                      </div>
                    )}
                    {app.licenseDetails.generalLicenceServices.trValidity && (
                      <div>
                        <span className="text-slate-400">TR Validity:</span>
                        <p className="font-semibold">{displayDate(app.licenseDetails.generalLicenceServices.trValidity)}</p>
                      </div>
                    )}
                    {app.licenseDetails.generalLicenceServices.hazardousValidity && (
                      <div>
                        <span className="text-slate-400">Hazardous Validity:</span>
                        <p className="font-semibold">{displayDate(app.licenseDetails.generalLicenceServices.hazardousValidity)}</p>
                      </div>
                    )}
                    {app.licenseDetails.generalLicenceServices.hazardousTrainingValidity && (
                      <div>
                        <span className="text-slate-400">Hazardous Training Validity:</span>
                        <p className="font-semibold">{displayDate(app.licenseDetails.generalLicenceServices.hazardousTrainingValidity)}</p>
                      </div>
                    )}
                    {app.licenseDetails.generalLicenceServices.internationalLicenceValidity && (
                      <div>
                        <span className="text-slate-400">International Licence Validity:</span>
                        <p className="font-semibold">{displayDate(app.licenseDetails.generalLicenceServices.internationalLicenceValidity)}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Full Vehicle Technical Details Grid */}
          {app.subModule !== "licence" && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Car className="w-4 h-4 text-blue-600" /> Full Vehicle Specifications
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                <div>
                  <span className="text-slate-400">Father/Husband:</span>
                  <p className="font-semibold">{v.fatherHusbandName || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">CO (C/O):</span>
                  <p className="font-semibold">{v.coName || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Group Name:</span>
                  <p className="font-semibold">{v.groupName || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Chassis No:</span>
                  <p className="font-mono font-semibold">{v.chassisNumber || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Engine No:</span>
                  <p className="font-mono font-semibold">{v.engineNumber || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Fuel Type:</span>
                  <p className="font-semibold">{v.fuelType || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Maker Name:</span>
                  <p className="font-semibold">{v.makerName || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Model Name:</span>
                  <p className="font-semibold">{v.modelName || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Vehicle Class:</span>
                  <p className="font-semibold">{v.vehicleClass || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Gross / Unladen:</span>
                  <p className="font-semibold">
                    {v.grossWeight || 0} kg / {v.unladenWeight || 0} kg
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* All Expiries Section */}
          {(() => {
            const sub = (app.subModule || "").toLowerCase();
            if (sub === "insurance") {
              return (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600" /> All Vehicle Expiry Dates
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                      <span className="text-[10px] text-slate-400 block font-semibold">INSURANCE EXPIRY</span>
                      <span className="font-mono font-bold text-slate-800">
                        {v.insuranceDetails?.expiryDate || "—"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }
            if (sub === "vahaan" || sub === "services") {
              return (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600" /> All Vehicle Expiry Dates
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                      <span className="text-[10px] text-slate-400 block font-semibold">FITNESS EXPIRY</span>
                      <span className="font-mono font-bold text-slate-800">
                        {v.fitnessDetails?.expiryDate || "—"}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                      <span className="text-[10px] text-slate-400 block font-semibold">PERMIT EXPIRY</span>
                      <span className="font-mono font-bold text-slate-800">
                        {v.permitDetails?.expiryDate || "—"}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                      <span className="text-[10px] text-slate-400 block font-semibold">TAX EXPIRY</span>
                      <span className="font-mono font-bold text-slate-800">
                        {v.taxDetails?.isLumpsum ? "Lumpsum Tax" : v.taxDetails?.expiryDate || "—"}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                      <span className="text-[10px] text-slate-400 block font-semibold">PUC EXPIRY</span>
                      <span className="font-mono font-bold text-slate-800">{v.pucExpiryDate || "—"}</span>
                    </div>
                    <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                      <span className="text-[10px] text-slate-400 block font-semibold">
                        REGISTRATION VALIDITY
                      </span>
                      <span className="font-mono font-bold text-slate-800">
                        {v.registrationDetails?.registrationValidity || "—"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {/* Internal Notes */}
          {app.remarks && (
            <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 text-amber-900">
              <h3 className="font-bold text-amber-950 mb-1">Employee Remarks</h3>
              <p className="text-xs">{app.remarks}</p>
            </div>
          )}
        </div>
      </div>

      {/* WhatsApp Message Preview Dialog */}
      <Dialog open={whatsappPreviewOpen} onOpenChange={setWhatsappPreviewOpen}>
        <DialogContent className="max-w-md p-6 bg-white rounded-xl shadow-xl border border-slate-200 text-xs">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-1.5">
              <span>💬 WHATSAPP MESSAGE</span>
            </DialogTitle>
          </DialogHeader>
          <WhatsAppDialogContent
            name={app.ownerName || app.clientName || v.ownerName || "Customer"}
            phone={app.mobileNumber || app.phone || app.ownerPhone || v.mobileNumber || ""}
            defaultMessage={generateDefaultWhatsappMessage()}
            onClose={() => setWhatsappPreviewOpen(false)}
            vehicleNumber={app.vehicleNumber || v.vehicleNumber || ""}
            dueAmount={Math.max(0, Number(app.amount || app.serviceAccounting?.Insurance?.totalAmount || 0) - Number(app.totalPaid || app.serviceAccounting?.Insurance?.advancePayment || 0))}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
