import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  subscribeApplications,
  type ApplicationRecord,
  type VehicleMaster,
} from "@/lib/applications";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { VEHICLES_CENTRIC_COL } from "@/lib/applications";
import {
  Shield,
  FileCheck,
  Calendar,
  Building2,
  FileText,
  Lightbulb,
  AlertCircle,
  Clock,
  ArrowRight,
  Plus,
  Printer,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateDDMMYYYY } from "@/lib/formatting";

import { SubModuleTabs, type SubModuleType } from "@/components/SubModuleTabs";
import { DrivingSchoolDashboard } from "@/components/DrivingSchoolDashboard";
import { subscribeToTargets, type TargetMetrics } from "@/lib/targets";

export const Route = createFileRoute("/dashboard/")({
  component: Overview,
});

interface ExpiryItem {
  vehicleNumber: string;
  ownerName: string;
  phone: string;
  makerName?: string;
  modelName?: string;
  fuelType?: string;
  vehicleClass?: string;
  coName?: string;
  groupName?: string;
  expiryDate: string;
  daysRemaining: number;
  isCritical: boolean;
  appointmentDate?: string;
}

function exportCardToExcel(title: string, items: ExpiryItem[]) {
  const headers = ["Vehicle/Application ID", "Owner/Applicant Name", "Phone", "Category/Class", "Expiry Date", "Days Remaining"];
  const rows = items.map((item) => [
    `"${item.vehicleNumber}"`,
    `"${item.ownerName}"`,
    `"${item.phone}"`,
    `"${item.vehicleClass || ""}"`,
    `"${item.expiryDate}"`,
    item.daysRemaining <= 0 ? `"${Math.abs(item.daysRemaining)} days overdue"` : `"${item.daysRemaining} days left"`
  ]);
  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${title.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportCardToPDF(title: string, items: ExpiryItem[]) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title} Report</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 30px; color: #1e293b; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 20px; }
        h1 { color: #0f172a; font-size: 22px; margin: 0; }
        .meta { color: #64748b; font-size: 12px; margin-top: 5px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
        th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
        th { background-color: #f8fafc; font-weight: bold; color: #475569; }
        .overdue { color: #be123c; font-weight: bold; }
        .left { color: #15803d; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>${title} Report</h1>
          <div class="meta">Generated on ${new Date().toLocaleDateString()} | Total Records: ${items.length}</div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Vehicle/Application ID</th>
            <th>Owner/Applicant Name</th>
            <th>Phone</th>
            <th>Category/Class</th>
            <th>Expiry Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td><strong>${item.vehicleNumber}</strong></td>
              <td>${item.ownerName}</td>
              <td>${item.phone}</td>
              <td>${item.vehicleClass || "—"}</td>
              <td>${item.expiryDate}</td>
              <td class="${item.daysRemaining <= 0 ? "overdue" : "left"}">
                ${item.daysRemaining <= 0 ? `${Math.abs(item.daysRemaining)} days overdue` : `${item.daysRemaining} days left`}
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
      <script>
        window.onload = function() { 
          window.print(); 
          setTimeout(function() { window.close(); }, 500);
        }
      </script>
    </body>
    </html>
  `;
  printWindow.document.write(html);
  printWindow.document.close();
}

function computeDaysRemaining(expiryStr: string): number {
  if (!expiryStr) return 999;
  const exp = new Date(expiryStr);
  if (isNaN(exp.getTime())) return 999;
  const now = new Date();
  const diffTime = exp.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function formatApptDate(dateStr?: string): string {
  if (!dateStr) return "";
  const cleaned = dateStr.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleaned)) return cleaned;
  try {
    const d = new Date(cleaned);
    if (isNaN(d.getTime())) return cleaned;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return cleaned;
  }
}

function DashboardTargetsSection({ activeSubModule }: { activeSubModule: SubModuleType }) {
  const [targets, setTargets] = useState<TargetMetrics[]>([]);

  useEffect(() => {
    const unsub = subscribeToTargets((data) => {
      setTargets(data);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    return targets.filter((t) => (t.submodule || "services") === activeSubModule);
  }, [targets, activeSubModule]);

  if (filtered.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900 capitalize">
            {activeSubModule === "services" ? "Vahaan" : activeSubModule === "licence" ? "Licence" : activeSubModule === "form5" ? "Form 5" : activeSubModule === "driving_school" ? "Driving School" : activeSubModule} Targets
          </h2>
          <p className="text-[11px] text-slate-500">Real-time target performance for the selected sub-module.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((t) => {
          const completedVal = t.completed;
          const targetVal = t.target;
          const pct = targetVal > 0 ? Math.round((completedVal / targetVal) * 100) : 0;
          
          let statusLabel = "Not Started";
          let badgeColor = "bg-slate-100 text-slate-700";
          if (targetVal > 0) {
            if (completedVal === 0) {
              statusLabel = "Not Started";
              badgeColor = "bg-slate-100 text-slate-700";
            } else if (pct > 100) {
              statusLabel = "Exceeded";
              badgeColor = "bg-indigo-100 text-indigo-700";
            } else if (pct === 100) {
              statusLabel = "Target Achieved";
              badgeColor = "bg-emerald-100 text-emerald-700";
            } else {
              statusLabel = "Behind Target";
              badgeColor = "bg-rose-100 text-rose-700";
            }
          }

          const colors = ["#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4", "#6366f1", "#38bdf8", "#14b8a6", "#f97316", "#ef4444"];
          let hash = 0;
          const serviceName = t.service || "";
          for (let i = 0; i < serviceName.length; i++) {
            hash = serviceName.charCodeAt(i) + ((hash << 5) - hash);
          }
          const index = Math.abs(hash) % colors.length;
          const progressColor = t.color || colors[index];

          return (
            <div key={t.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col justify-between space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 font-sans">{t.service}</h4>
                  <p className="text-[10px] text-slate-400 capitalize font-medium">{t.period} Target</p>
                </div>
                <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0", badgeColor)}>
                  {statusLabel}
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-baseline text-xs font-semibold">
                  <span className="font-mono text-slate-700">{completedVal} / {targetVal}</span>
                  <span className="font-mono text-slate-500">{pct}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: progressColor }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Overview() {
  const location = useLocation();
  const [activeSubModule, setActiveSubModule] = useState<SubModuleType>("services");
  const [vehicles, setVehicles] = useState<VehicleMaster[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sub = params.get("subModule");
    if (sub && (sub === "services" || sub === "licence" || sub === "driving_school" || sub === "insurance" || sub === "form5")) {
      setActiveSubModule(sub as SubModuleType);
    }
  }, [location.search]);

  useEffect(() => {
    // 1. Subscribe to master vehicles
    const qV = query(collection(db, VEHICLES_CENTRIC_COL));
    const unsubV = onSnapshot(qV, (snap) => {
      const vList = snap.docs.map((d) => ({ id: d.id, ...d.data() } as VehicleMaster));
      setVehicles(vList);
      setLoading(false);
    });

    // 2. Subscribe to applications
    const unsubA = subscribeApplications((data) => {
      setApplications(data);
    });

    return () => {
      unsubV();
      unsubA();
    };
  }, []);

  const activeVehicles = useMemo(() => {
    const validVehicleNumbers = new Set(
      applications.map((app) =>
        (app.vehicleNumber || app.vehicleId || "")
          .trim()
          .toUpperCase()
          .replace(/[\s-]/g, "")
      )
    );

    return vehicles.filter((v) => {
      const cleanNo = (v.vehicleNumber || v.id || "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]/g, "");
      return validVehicleNumbers.has(cleanNo);
    });
  }, [vehicles, applications]);

  // Compute Expiry Categories according to Active Sub Module
  const expiryCategories = useMemo(() => {
    if (activeSubModule === "driving_school") {
      return [];
    }

    if (activeSubModule === "insurance") {
      const insuranceList: ExpiryItem[] = [];

      applications.forEach((app) => {
        if (app.subModule === "insurance" || (app.services || []).includes("Insurance")) {
          const insExp = app.insuranceExpiryDate || (app as any).vehicleDetails?.insuranceDetails?.expiryDate || app.dueDate;
          if (insExp) {
            const days = computeDaysRemaining(insExp);
            insuranceList.push({
              vehicleNumber: app.vehicleNumber || app.applicationId || app.id,
              ownerName: app.ownerName || "Applicant",
              phone: app.mobileNumber || "—",
              vehicleClass: "Insurance Record",
              expiryDate: insExp,
              daysRemaining: days,
              isCritical: days <= 15,
            });
          }
        }
      });

      const insuranceVehicleNumbers = new Set(
        applications
          .filter(app => app.subModule === "insurance")
          .map(app => (app.vehicleNumber || "").trim().toUpperCase().replace(/[\s-]/g, ""))
      );

      activeVehicles.forEach((v) => {
        const cleanNo = (v.vehicleNumber || v.id || "").trim().toUpperCase().replace(/[\s-]/g, "");
        if (!insuranceVehicleNumbers.has(cleanNo)) return;

        const track = v.trackExpiry || {};
        if (track.insurance !== false && v.insuranceDetails?.expiryDate) {
          const days = computeDaysRemaining(v.insuranceDetails.expiryDate);
          if (!insuranceList.some((item) => item.vehicleNumber === v.vehicleNumber)) {
            insuranceList.push({
              vehicleNumber: v.vehicleNumber || v.id,
              ownerName: v.ownerName || "Unknown Owner",
              phone: v.phone || "—",
              vehicleClass: v.vehicleClass || "Vehicle",
              expiryDate: v.insuranceDetails.expiryDate,
              daysRemaining: days,
              isCritical: days <= 15,
            });
          }
        }
      });

      const sortFn = (a: ExpiryItem, b: ExpiryItem) => a.daysRemaining - b.daysRemaining;

      return [
        {
          title: "Insurance Due",
          icon: Shield,
          items: insuranceList.sort(sortFn),
          color: "text-blue-600 bg-blue-50 border-blue-100",
        },
      ];
    }

    if (activeSubModule === "licence") {
      // License Dashboard: Show 5 License Expiries (4 Compulsory: NT, TR, LL, DL + Hazardous)
      const ntList: ExpiryItem[] = [];
      const trList: ExpiryItem[] = [];
      const hazardousList: ExpiryItem[] = [];
      const llList: ExpiryItem[] = [];
      const dlList: ExpiryItem[] = [];

      applications.forEach((app) => {
        if (app.subModule === "licence" || app.licenseDetails) {
          const lic = app.licenseDetails || {};
          const ownerName = app.ownerName || app.vehicleNumber || "Applicant";
          const phone = app.mobileNumber || "—";
          const baseInfo = {
            vehicleNumber: app.applicationId || app.id,
            ownerName,
            phone,
            vehicleClass: "License Record",
          };

          // Check LL Expiries
          const llExp = lic.newLearningLicence?.step1?.expiryDate || lic.dlNewLlEndorsement?.step2?.expiryDate || lic.llRenewClass?.step1?.expiryDate || lic.dlRenewRetest?.step2?.expiryDate;
          if (llExp) {
            const days = computeDaysRemaining(llExp);
            const rawAppt = lic.newLearningLicence?.appointmentDate || lic.llRenewClass?.appointmentDate || app.appointmentDate || "";
            const apptDate = rawAppt ? formatApptDate(rawAppt) : undefined;
            llList.push({ ...baseInfo, expiryDate: llExp, daysRemaining: days, isCritical: days <= 15, appointmentDate: apptDate });
          }

          // Check DL Expiries
          const dlExp = lic.newLearningLicence?.step2?.validityDate || lic.dlNewLlEndorsement?.step1?.validityDate || lic.llRenewClass?.step2?.validityDate || lic.dlRenewRetest?.step1?.validityDate;
          if (dlExp) {
            const days = computeDaysRemaining(dlExp);
            const rawAppt = app.appointmentDate || "";
            const apptDate = rawAppt ? formatApptDate(rawAppt) : undefined;
            dlList.push({ ...baseInfo, expiryDate: dlExp, daysRemaining: days, isCritical: days <= 15, appointmentDate: apptDate });
          }

          // Check NT, TR, Hazardous validity expiries
          const vTypes = lic.newLearningLicence?.step2?.vehicleTypes || lic.dlNewLlEndorsement?.step1?.vehicleTypes || lic.dlNewLlEndorsement?.step3?.vehicleTypes;
          if (vTypes?.nt && dlExp) {
            const days = computeDaysRemaining(dlExp);
            ntList.push({ ...baseInfo, expiryDate: dlExp, daysRemaining: days, isCritical: days <= 15 });
          }
          if (vTypes?.tr && dlExp) {
            const days = computeDaysRemaining(dlExp);
            trList.push({ ...baseInfo, expiryDate: dlExp, daysRemaining: days, isCritical: days <= 15 });
          }
          if (vTypes?.hazardous && dlExp) {
            const days = computeDaysRemaining(dlExp);
            hazardousList.push({ ...baseInfo, expiryDate: dlExp, daysRemaining: days, isCritical: days <= 15 });
          }
        }
      });

      const sortFn = (a: ExpiryItem, b: ExpiryItem) => a.daysRemaining - b.daysRemaining;

      return [
        { title: "NT License Validity", icon: Shield, items: ntList.sort(sortFn), color: "text-blue-600 bg-blue-50 border-blue-100" },
        { title: "TR License Validity", icon: FileCheck, items: trList.sort(sortFn), color: "text-amber-600 bg-amber-50 border-amber-100" },
        { title: "LL License Expiry", icon: Calendar, items: llList.sort(sortFn), color: "text-purple-600 bg-purple-50 border-purple-100" },
        { title: "DL License Expiry", icon: Building2, items: dlList.sort(sortFn), color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
        { title: "Hazardous License Expiry", icon: AlertCircle, items: hazardousList.sort(sortFn), color: "text-rose-600 bg-rose-50 border-rose-100" },
      ];
    }

    if (activeSubModule === "form5") {
      const ntList: ExpiryItem[] = [];
      const trList: ExpiryItem[] = [];
      const llList: ExpiryItem[] = [];

      applications.forEach((app) => {
        if (app.subModule === "form5" && app.form5Details) {
          const fd = app.form5Details;
          const ownerName = fd.name || app.ownerName || "Applicant";
          const phone = app.mobileNumber || "—";
          const baseInfo = {
            vehicleNumber: fd.applicationNo || app.applicationId || app.id,
            ownerName,
            phone,
            vehicleClass: fd.form5Type === "new_hgv" ? "Form 5 New HGV" : "Form 5A Renew HGV",
          };

          if (fd.llExpiryDate) {
            const days = computeDaysRemaining(fd.llExpiryDate);
            llList.push({ ...baseInfo, expiryDate: fd.llExpiryDate, daysRemaining: days, isCritical: days <= 15 });
          }
          if (fd.ntValidityDate) {
            const days = computeDaysRemaining(fd.ntValidityDate);
            ntList.push({ ...baseInfo, expiryDate: fd.ntValidityDate, daysRemaining: days, isCritical: days <= 15 });
          }
          if (fd.trValidityDate) {
            const days = computeDaysRemaining(fd.trValidityDate);
            trList.push({ ...baseInfo, expiryDate: fd.trValidityDate, daysRemaining: days, isCritical: days <= 15 });
          }
        }
      });

      const sortFn = (a: ExpiryItem, b: ExpiryItem) => a.daysRemaining - b.daysRemaining;

      return [
        { title: "Form 5 NT License Validity", icon: Shield, items: ntList.sort(sortFn), color: "text-blue-600 bg-blue-50 border-blue-100" },
        { title: "Form 5 TR License Validity", icon: FileCheck, items: trList.sort(sortFn), color: "text-amber-600 bg-amber-50 border-amber-100" },
        { title: "Form 5 LL License Expiry", icon: Calendar, items: llList.sort(sortFn), color: "text-purple-600 bg-purple-50 border-purple-100" },
      ];
    }

    // Default: Services SubModule Expiry Cards
    const insuranceList: ExpiryItem[] = [];
    const fitnessList: ExpiryItem[] = [];
    const regRenewalList: ExpiryItem[] = [];
    const natAuthList: ExpiryItem[] = [];
    const natPermitList: ExpiryItem[] = [];
    const gujPermitList: ExpiryItem[] = [];
    const taxList: ExpiryItem[] = [];
    const pucList: ExpiryItem[] = [];

    activeVehicles.forEach((v) => {
      const baseInfo = {
        vehicleNumber: v.vehicleNumber || v.id,
        ownerName: v.ownerName || "Unknown Owner",
        phone: v.phone || "—",
        makerName: v.makerName,
        modelName: v.modelName,
        fuelType: v.fuelType,
        vehicleClass: v.vehicleClass,
        coName: v.coName,
        groupName: v.groupName,
      };

      const track = v.trackExpiry || {};
      const shouldTrackInsurance = track.insurance !== false;
      const shouldTrackFitness = track.fitness !== false;
      const shouldTrackPermit = track.permit !== false;
      const shouldTrackTax = track.tax !== false;
      const shouldTrackPuc = track.puc !== false;

      // 1. Insurance
      if (shouldTrackInsurance && v.insuranceDetails?.expiryDate) {
        const days = computeDaysRemaining(v.insuranceDetails.expiryDate);
        insuranceList.push({
          ...baseInfo,
          expiryDate: v.insuranceDetails.expiryDate,
          daysRemaining: days,
          isCritical: days <= 15,
        });
      }

      // 2. Fitness
      if (shouldTrackFitness && v.fitnessDetails?.expiryDate) {
        const days = computeDaysRemaining(v.fitnessDetails.expiryDate);
        fitnessList.push({
          ...baseInfo,
          expiryDate: v.fitnessDetails.expiryDate,
          daysRemaining: days,
          isCritical: days <= 15,
        });
      }

      // 3. Renewal of Registration
      if (shouldTrackFitness && v.registrationDetails?.registrationValidity) {
        const days = computeDaysRemaining(v.registrationDetails.registrationValidity);
        regRenewalList.push({
          ...baseInfo,
          expiryDate: v.registrationDetails.registrationValidity,
          daysRemaining: days,
          isCritical: days <= 30,
        });
      }

      // 4. National Authorization
      const natAuthExpiry = v.permitDetails?.nationalAuthExpiryDate ||
        (v.permitDetails?.permitType === "National Permit Authorization" ? v.permitDetails?.expiryDate : "");
      if (shouldTrackPermit && natAuthExpiry) {
        const days = computeDaysRemaining(natAuthExpiry);
        natAuthList.push({
          ...baseInfo,
          expiryDate: natAuthExpiry,
          daysRemaining: days,
          isCritical: days <= 15,
        });
      }

      // 5. National Permit(Gujrat Permit)
      const natPermitExpiry = v.permitDetails?.nationalPermitExpiryDate ||
        (v.permitDetails?.permitType === "National Permit" || v.permitDetails?.permitType === "National Permit(Gujrat Permit)" ? v.permitDetails?.expiryDate : "");
      if (shouldTrackPermit && natPermitExpiry) {
        const days = computeDaysRemaining(natPermitExpiry);
        natPermitList.push({
          ...baseInfo,
          expiryDate: natPermitExpiry,
          daysRemaining: days,
          isCritical: days <= 30,
        });
      }

      // 6. Gujarat Permit
      const gujPermitExpiry = v.permitDetails?.gujaratPermitExpiryDate ||
        (v.permitDetails?.permitType === "Gujarat Permit" ? v.permitDetails?.expiryDate : "");
      if (shouldTrackPermit && gujPermitExpiry) {
        const days = computeDaysRemaining(gujPermitExpiry);
        gujPermitList.push({
          ...baseInfo,
          expiryDate: gujPermitExpiry,
          daysRemaining: days,
          isCritical: days <= 30,
        });
      }

      // 7. Tax
      if (shouldTrackTax && !v.taxDetails?.isLumpsum && v.taxDetails?.expiryDate) {
        const days = computeDaysRemaining(v.taxDetails.expiryDate);
        taxList.push({
          ...baseInfo,
          expiryDate: v.taxDetails.expiryDate,
          daysRemaining: days,
          isCritical: days <= 10,
        });
      }

      // 8. PUC
      if (shouldTrackPuc && v.pucExpiryDate) {
        const days = computeDaysRemaining(v.pucExpiryDate);
        pucList.push({
          ...baseInfo,
          expiryDate: v.pucExpiryDate,
          daysRemaining: days,
          isCritical: days <= 7,
        });
      }
    });

    const sortFn = (a: ExpiryItem, b: ExpiryItem) => a.daysRemaining - b.daysRemaining;

    return [
      {
        title: "Fitness Due",
        icon: FileCheck,
        items: fitnessList.sort(sortFn),
        color: "text-amber-600 bg-amber-50 border-amber-100",
      },
      {
        title: "Renewal of Registration Due",
        icon: Calendar,
        items: regRenewalList.sort(sortFn),
        color: "text-blue-600 bg-blue-50 border-blue-100",
      },
      {
        title: "National Authorization Due",
        icon: Building2,
        items: natAuthList.sort(sortFn),
        color: "text-purple-600 bg-purple-50 border-purple-100",
      },
      {
        title: "National Permit(Gujrat Permit) Due",
        icon: Building2,
        items: natPermitList.sort(sortFn),
        color: "text-indigo-600 bg-indigo-50 border-indigo-100",
      },
      {
        title: "Gujarat Permit Due",
        icon: FileText,
        items: gujPermitList.sort(sortFn),
        color: "text-emerald-600 bg-emerald-50 border-emerald-100",
      },
      {
        title: "Tax Due",
        icon: FileText,
        items: taxList.sort(sortFn),
        color: "text-cyan-600 bg-cyan-50 border-cyan-100",
      },
      {
        title: "PUC Due",
        icon: Lightbulb,
        items: pucList.sort(sortFn),
        color: "text-teal-600 bg-teal-50 border-teal-100",
      },
    ];
  }, [activeSubModule, activeVehicles, applications]);

  return (
    <div className="p-6 space-y-6 bg-slate-50/50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Today's Operations</h1>
          <p className="text-sm text-slate-500 mt-1">
            Upcoming expiries and renewals across your entire fleet database.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard/applications"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-all shadow-md shadow-blue-500/20 active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            New Application
          </Link>
        </div>
      </div>

      {/* 3 Main Sub Module Services, Licence, Driving School Tabs */}
      <div>
        <SubModuleTabs activeTab={activeSubModule} onChange={setActiveSubModule} />
      </div>

      {activeSubModule === "driving_school" ? (
        <DrivingSchoolDashboard />
      ) : (
        /* 8 Expiry Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {expiryCategories.map((cat, idx) => {
            const Icon = cat.icon;
            const criticalCount = cat.items.filter((i) => i.isCritical).length;

            return (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col justify-between"
              >
                {/* Card Header */}
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-xl border", cat.color)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 leading-snug">{cat.title}</h3>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {cat.items.length} upcoming •{" "}
                        <span className="text-rose-600 font-semibold">{criticalCount} critical</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => exportCardToPDF(cat.title, cat.items)}
                      className="p-1 rounded hover:bg-slate-200/60 text-slate-400 hover:text-slate-600 transition"
                      title="Print / Download PDF"
                      disabled={cat.items.length === 0}
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => exportCardToExcel(cat.title, cat.items)}
                      className="p-1 rounded hover:bg-slate-200/60 text-slate-400 hover:text-slate-600 transition"
                      title="Export to Excel"
                      disabled={cat.items.length === 0}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Items List */}
                <div className="p-4 space-y-3 flex-1 overflow-y-auto max-h-[300px] divide-y divide-slate-100">
                  {cat.items.length === 0 ? (
                    <p className="text-center text-slate-400 text-xs py-6">No upcoming expiries</p>
                  ) : (
                    cat.items.slice(0, 5).map((item, iIdx) => (
                      <div key={iIdx} className="pt-2.5 first:pt-0 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-slate-900 font-mono tracking-tight">
                            {item.vehicleNumber}
                          </div>
                          <div className="text-[11px] text-slate-600 font-medium">{item.ownerName}</div>
                          {(item.makerName || item.modelName) && (
                            <div className="text-[10px] text-slate-400 font-sans">
                              {item.makerName || ""} {item.modelName || ""}{" "}
                              {item.fuelType ? `(${item.fuelType})` : ""}
                            </div>
                          )}
                        </div>

                        <div className="text-right">
                          <div className="font-mono text-[10px] text-slate-400">{formatDateDDMMYYYY(item.expiryDate)}</div>
                          {item.appointmentDate && (
                            <div className="text-[10px] text-blue-600 font-bold mt-0.5 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 inline-block">
                              Appt: {formatDateDDMMYYYY(item.appointmentDate)}
                            </div>
                          )}
                          <div className="mt-0.5">
                            <span
                              className={cn(
                                "inline-block text-[10px] font-bold px-2 py-0.5 rounded-md",
                                item.daysRemaining <= 0
                                  ? "bg-rose-100 text-rose-700"
                                  : item.daysRemaining <= 15
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-100 text-slate-600"
                              )}
                            >
                              {item.daysRemaining <= 0
                                ? `${Math.abs(item.daysRemaining)}d overdue`
                                : `${item.daysRemaining}d left`}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Card Footer */}
                <div className="p-3 bg-slate-50/80 border-t border-slate-100 text-center">
                  <Link
                    to="/dashboard/applications"
                    search={{ subModule: activeSubModule }}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                  >
                    View all {cat.items.length} {activeSubModule === "licence" || activeSubModule === "form5" ? "applicants" : "vehicles"} <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Targets Overview Section */}
      <DashboardTargetsSection activeSubModule={activeSubModule} />
    </div>
  );
}
