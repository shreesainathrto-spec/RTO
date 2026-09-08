import React, { useEffect, useMemo, useState } from "react";
import { getSession } from "@/lib/auth";
import { collection, onSnapshot, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isTaskAssignedToUser } from "@/lib/tasks";
import {
  getServiceClientsAll,
  getServiceStats,
  getServiceDistributionSummary,
} from "@/lib/services";
import {
  subscribeAccountingRecords,
  syncAccountingRecord,
  type AccountingRecord,
} from "@/lib/applications";
import {
  serviceLabel,
  type ServiceType,
  type RegistryRecord,
  getRecordServices,
  getRecordServiceAmount,
  getRecordPendingAmount,
  getRecordPaymentStatus,
  getRecordServiceDetails,
  hasLegacyAccounting,
  STAFF_USERS,
} from "@/lib/records";
import { RecordTable } from "@/components/RecordTable";
import { ClientDetailWorkspace } from "./ClientDetailWorkspace";
import { AddClientWizardDialog } from "./AddClientWizardDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import {
  Users,
  TrendingUp,
  Package,
  AlertCircle,
  DollarSign,
  ArrowRight,
  Download,
  ChevronDown,
  ChevronRight,
  Search,
  Plus,
  Eye,
  FileText,
  Pencil,
} from "lucide-react";
import { generateServicePDF } from "@/lib/pdfServiceHelper";
import { ApplicationFullDetailsModal } from "./ApplicationFullDetailsModal";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ApplicationTypeBadge, getApplicationTypeStyle } from "./ApplicationTypeBadge";
import { formatPaymentStatus, formatDateDDMMYYYY } from "@/lib/formatting";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface ServiceDashboardProps {
  serviceType: ServiceType;
  title?: string;
  description?: string;
}

function aggregateServiceRecords(recs: RegistryRecord[], serviceType: ServiceType) {
  const clientGroups: { [clientId: string]: RegistryRecord[] } = {};
  for (const r of recs) {
    if (!clientGroups[r.id]) {
      clientGroups[r.id] = [];
    }
    clientGroups[r.id].push(r);
  }

  const aggregatedRecords: any[] = [];
  let index = 1;

  let uniqueVehicles = new Set<string>();

  // Status counts for services
  let serviceActiveCount = 0;
  let serviceCompletedCount = 0;
  let servicePendingCount = 0;
  let serviceOnHoldCount = 0;

  for (const clientId in clientGroups) {
    const group = clientGroups[clientId];
    const first = group[0];

    const vehicleNumbers = Array.from(new Set(group.map((r) => r.mvNo).filter((v) => v && v !== "—")));
    vehicleNumbers.forEach((v) => uniqueVehicles.add(v));

    const servicesList = group.flatMap((r) => r.services || []);

    for (const s of servicesList) {
      // Count service statuses
      const status = s.status || "Pending";
      if (status === "Completed") {
        serviceCompletedCount++;
      } else if (
        status === "In Progress" ||
        status === "Documents Collected" ||
        status === "Verification" ||
        status === "Submitted" ||
        status === "Approved" ||
        status === "Active"
      ) {
        serviceActiveCount++;
      } else if (status === "On Hold") {
        serviceOnHoldCount++;
      } else {
        servicePendingCount++;
      }
    }

    // Determine aggregated status
    let aggStatus = "Pending";
    const statuses = servicesList.map((s) => s.status || "Pending");
    if (statuses.every((s) => s === "Completed")) {
      aggStatus = "Completed";
    } else if (
      statuses.some((s) =>
        [
          "In Progress",
          "Active",
          "Submitted",
          "Approved",
          "Verification",
          "Documents Collected",
        ].includes(s),
      )
    ) {
      aggStatus = "In Progress";
    } else if (statuses.some((s) => s === "On Hold")) {
      aggStatus = "On Hold";
    }

    // Determine earliest due date
    const dueDates = servicesList.map((s) => s.dueDate).filter(Boolean);
    const earliestDueDate =
      dueDates.length > 0
        ? dueDates.reduce((earliest, current) => {
          return new Date(current) < new Date(earliest) ? current : earliest;
        })
        : "";

    aggregatedRecords.push({
      ...first,
      srNo: index++,
      mvNo: vehicleNumbers.join(", "),
      vehicleCount: vehicleNumbers.length,
      serviceCount: servicesList.length,
      status: aggStatus,
      serviceDueDate: earliestDueDate,
      services: servicesList,
      aggregatedVehicles: vehicleNumbers,
    });
  }

  // Compute service-specific aggregates
  let serviceTotal = 0;
  let receivedTotal = 0;
  for (const r of recs) {
    const details = getRecordServiceDetails(r);
    const matching = details.find((s) => s.serviceType === serviceType);
    if (matching) {
      serviceTotal += matching.price ?? 0;
      receivedTotal += matching.amountReceived ?? 0;
    }
  }

  return {
    aggregatedRecords,
    stats: {
      total: Object.keys(clientGroups).length, // unique clients
      active: serviceActiveCount,
      completed: serviceCompletedCount,
      pending: servicePendingCount,
      onHold: serviceOnHoldCount,
      vehicleCount: uniqueVehicles.size,
      serviceCount: recs.length,
    },
    serviceTotal,
    receivedTotal,
    pendingTotal: Math.max(0, serviceTotal - receivedTotal),
  };
}

import { SubModuleTabs, type SubModuleType } from "@/components/SubModuleTabs";

export function ServiceDashboard({
  serviceType,
  title,
  description,
}: ServiceDashboardProps) {
  const [session] = useState(() => getSession());
  const isAdmin = session?.role === "admin" || session?.role === "manager";
  const [activeSubModule, setActiveSubModule] = useState<SubModuleType>("services");
  const [records, setRecords] = useState<RegistryRecord[]>([]);
  const [completedTasks, setCompletedTasks] = useState<any[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    completed: 0,
    pending: 0,
    onHold: 0,
    vehicleCount: 0,
    serviceCount: 0,
  });
  const [totalServiceAmount, setTotalServiceAmount] = useState(0);
  const [totalReceived, setTotalReceived] = useState(0);
  const [totalPending, setTotalPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<RegistryRecord | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [diagOutput, setDiagOutput] = useState<string | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [apptDateFilter, setApptDateFilter] = useState("");
  const [appsList, setAppsList] = useState<any[]>([]);
  const [selectedAppModal, setSelectedAppModal] = useState<any>(null);
  const [appModalOpen, setAppModalOpen] = useState(false);

  // Service Edit popup states
  const [editingService, setEditingService] = useState<any | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [editApptDate, setEditApptDate] = useState("");
  const [editRtoReceiptAmount, setEditRtoReceiptAmount] = useState("");
  const [editAppId, setEditAppId] = useState("");
  const [editAppType, setEditAppType] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [editHoldReason, setEditHoldReason] = useState("");
  const [editHoldDate, setEditHoldDate] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Vahaan hold states
  const [showVahaanHoldModal, setShowVahaanHoldModal] = useState(false);
  const [vahaanHoldTask, setVahaanHoldTask] = useState<any | null>(null);
  const [vahaanHoldReason, setVahaanHoldReason] = useState("");
  const [vahaanHoldDate, setVahaanHoldDate] = useState("");

  const availableGroups = useMemo(() => {
    const groupsSet = new Set<string>();
    completedTasks.forEach((t) => {
      const g = t.groupName || "";
      if (g.trim()) {
        groupsSet.add(g.trim());
      }
    });
    return Array.from(groupsSet).sort((a, b) => a.localeCompare(b));
  }, [completedTasks]);

  // RTO Expense popup states
  const [showRtoExpenseModal, setShowRtoExpenseModal] = useState(false);
  const [rtoExpenseValue, setRtoExpenseValue] = useState<number>(0);
  const [rtoExpensePaidBy, setRtoExpensePaidBy] = useState<string>("");
  const [rtoApptDate, setRtoApptDate] = useState("");
  const [pendingStatusChange, setPendingStatusChange] = useState<{ task: any; newStatus: string; isVahaan?: boolean } | null>(null);

  // Licence PASS popup states
  const [showLicencePassModal, setShowLicencePassModal] = useState(false);
  const [licNo, setLicNo] = useState("");
  const [licIssueDate, setLicIssueDate] = useState("");
  const [licExpiryDate, setLicExpiryDate] = useState("");

  const handleLicenceStatusChange = (task: any, newStatus: string) => {
    if (newStatus === "FAIL" || newStatus === "RETEST") {
      setPendingStatusChange({ task, newStatus, isVahaan: false });
      setRtoExpenseValue(task.rtoExpense || 0);
      setRtoExpensePaidBy(task.rtoExpensePaidBy || "");
      setRtoApptDate(task.appointmentDate || "");
      setShowRtoExpenseModal(true);
    } else if (newStatus === "PASS") {
      setPendingStatusChange({ task, newStatus, isVahaan: false });

      const currentStep = task.currentStep || 1;
      const lic = task.licenseDetails || {};
      let existNo = "";
      let existIssue = "";
      let existExpiry = "";

      if (lic.newLearningLicence?.enabled) {
        if (currentStep === 1) {
          existNo = lic.newLearningLicence.step1?.llNumber || "";
          existIssue = lic.newLearningLicence.step1?.issueDate || "";
          existExpiry = lic.newLearningLicence.step1?.expiryDate || "";
        } else {
          existNo = lic.newLearningLicence.step2?.dlNumber || "";
          existIssue = lic.newLearningLicence.step2?.issueDate || "";
          existExpiry = lic.newLearningLicence.step2?.validityDate || "";
        }
      } else if (lic.dlNewLlEndorsement?.enabled) {
        if (currentStep === 1) {
          existNo = lic.dlNewLlEndorsement.step1?.dlNumber || "";
          existIssue = lic.dlNewLlEndorsement.step1?.issueDate || "";
          existExpiry = lic.dlNewLlEndorsement.step1?.validityDate || "";
        } else if (currentStep === 2) {
          existNo = lic.dlNewLlEndorsement.step2?.llNumber || "";
          existIssue = lic.dlNewLlEndorsement.step2?.issueDate || "";
          existExpiry = lic.dlNewLlEndorsement.step2?.expiryDate || "";
        } else {
          existNo = lic.dlNewLlEndorsement.step3?.dlNumber || "";
          existIssue = lic.dlNewLlEndorsement.step3?.issueDate || "";
          existExpiry = lic.dlNewLlEndorsement.step3?.validityDate || "";
        }
      } else if (lic.llRenewClass?.enabled) {
        if (currentStep === 1) {
          existNo = lic.llRenewClass.step1?.llNumber || "";
          existIssue = lic.llRenewClass.step1?.issueDate || "";
          existExpiry = lic.llRenewClass.step1?.expiryDate || "";
        } else if (currentStep === 2) {
          existNo = lic.llRenewClass.step2?.dlNumber || "";
          existIssue = lic.llRenewClass.step2?.issueDate || "";
          existExpiry = lic.llRenewClass.step2?.validityDate || "";
        } else {
          existNo = lic.llRenewClass.step3?.dlNumber || "";
          existIssue = lic.llRenewClass.step3?.issueDate || "";
          existExpiry = lic.llRenewClass.step3?.validityDate || "";
        }
      } else if (lic.dlRenewRetest?.enabled) {
        if (currentStep === 1) {
          existNo = lic.dlRenewRetest.step1?.dlNumber || "";
          existIssue = lic.dlRenewRetest.step1?.issueDate || "";
          existExpiry = lic.dlRenewRetest.step1?.validityDate || "";
        } else if (currentStep === 2) {
          existNo = lic.dlRenewRetest.step2?.llNumber || "";
          existIssue = lic.dlRenewRetest.step2?.issueDate || "";
          existExpiry = lic.dlRenewRetest.step2?.expiryDate || "";
        } else {
          existNo = lic.dlRenewRetest.step3?.dlNumber || "";
          existIssue = lic.dlRenewRetest.step3?.issueDate || "";
          existExpiry = lic.dlRenewRetest.step3?.validityDate || "";
        }
      }

      setLicNo(existNo);
      setLicIssueDate(existIssue);
      setLicExpiryDate(existExpiry);
      setShowLicencePassModal(true);
    } else {
      updateLicenceStatusAndExpense(task, newStatus, task.rtoExpense || 0, task.appointmentDate || "");
    }
  };

  const handleSaveLicencePass = async () => {
    if (!pendingStatusChange) return;
    const { task, newStatus } = pendingStatusChange;
    const currentStep = task.currentStep || 1;
    const lic = { ...(task.licenseDetails || {}) };

    if (lic.newLearningLicence?.enabled) {
      if (currentStep === 1) {
        lic.newLearningLicence.step1 = { ...(lic.newLearningLicence.step1 || {}), llNumber: licNo, issueDate: licIssueDate, expiryDate: licExpiryDate };
      } else {
        lic.newLearningLicence.step2 = { ...(lic.newLearningLicence.step2 || {}), dlNumber: licNo, issueDate: licIssueDate, validityDate: licExpiryDate };
      }
    } else if (lic.dlNewLlEndorsement?.enabled) {
      if (currentStep === 1) {
        lic.dlNewLlEndorsement.step1 = { ...(lic.dlNewLlEndorsement.step1 || {}), dlNumber: licNo, issueDate: licIssueDate, validityDate: licExpiryDate };
      } else if (currentStep === 2) {
        lic.dlNewLlEndorsement.step2 = { ...(lic.dlNewLlEndorsement.step2 || {}), llNumber: licNo, issueDate: licIssueDate, expiryDate: licExpiryDate };
      } else {
        lic.dlNewLlEndorsement.step3 = { ...(lic.dlNewLlEndorsement.step3 || {}), dlNumber: licNo, issueDate: licIssueDate, validityDate: licExpiryDate };
      }
    } else if (lic.llRenewClass?.enabled) {
      if (currentStep === 1) {
        lic.llRenewClass.step1 = { ...(lic.llRenewClass.step1 || {}), llNumber: licNo, issueDate: licIssueDate, expiryDate: licExpiryDate };
      } else if (currentStep === 2) {
        lic.llRenewClass.step2 = { ...(lic.llRenewClass.step2 || {}), dlNumber: licNo, issueDate: licIssueDate, validityDate: licExpiryDate };
      } else {
        lic.llRenewClass.step3 = { ...(lic.llRenewClass.step3 || {}), dlNumber: licNo, issueDate: licIssueDate, validityDate: licExpiryDate };
      }
    } else if (lic.dlRenewRetest?.enabled) {
      if (currentStep === 1) {
        lic.dlRenewRetest.step1 = { ...(lic.dlRenewRetest.step1 || {}), dlNumber: licNo, issueDate: licIssueDate, validityDate: licExpiryDate };
      } else if (currentStep === 2) {
        lic.dlRenewRetest.step2 = { ...(lic.dlRenewRetest.step2 || {}), llNumber: licNo, issueDate: licIssueDate, expiryDate: licExpiryDate };
      } else {
        lic.dlRenewRetest.step3 = { ...(lic.dlRenewRetest.step3 || {}), dlNumber: licNo, issueDate: licIssueDate, validityDate: licExpiryDate };
      }
    }

    try {
      const coll = task.sourceCollection || "registry_tasks";
      const docRef = doc(db, coll, task.id);
      const updateData: any = {
        licenseDetails: lic,
        updatedAt: new Date().toISOString()
      };
      if (coll === "registry_tasks") {
        updateData.status = newStatus;
      } else {
        updateData.taskStatus = newStatus;
      }
      await setDoc(docRef, updateData, { merge: true });

      const appId = task.applicationDocId || task.applicationId || task.recordId;
      if (appId) {
        const appRef = doc(db, "registry_applications_v1", appId);
        await setDoc(appRef, {
          licenseDetails: lic,
          status: newStatus,
          updatedAt: new Date().toISOString()
        }, { merge: true }).catch(() => { });
      }

      toast.success("Licence details updated and status set to PASS!");
      setShowLicencePassModal(false);
      setPendingStatusChange(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update Licence details");
    }
  };

  const handleCancelLicencePass = () => {
    setShowLicencePassModal(false);
    setPendingStatusChange(null);
    toast.info("Status change cancelled");
  };

  const handleSaveRtoExpense = () => {
    if (pendingStatusChange) {
      const { task, newStatus, isVahaan } = pendingStatusChange;
      if (isVahaan) {
        updateVahaanStatusInDb(task, newStatus, "", "", rtoExpenseValue, rtoExpensePaidBy);
      } else {
        updateLicenceStatusAndExpense(task, newStatus, rtoExpenseValue, rtoApptDate, rtoExpensePaidBy);
      }
      setShowRtoExpenseModal(false);
      setPendingStatusChange(null);
      setRtoExpensePaidBy("");
    }
  };

  const handleCancelRtoExpense = () => {
    setShowRtoExpenseModal(false);
    setPendingStatusChange(null);
    setRtoExpensePaidBy("");
    toast.info("Status change cancelled");
  };

  const updateLicenceStatusAndExpense = async (task: any, status: string, expense: number, apptDate: string, paidBy?: string) => {
    try {
      const coll = task.sourceCollection || "registry_tasks";
      const docRef = doc(db, coll, task.id);

      const updateData: any = {
        rtoExpense: Number(expense) || 0,
        appointmentDate: apptDate,
        updatedAt: new Date().toISOString()
      };

      if (paidBy !== undefined) {
        updateData.rtoExpensePaidBy = paidBy;
      }

      if (coll === "registry_tasks") {
        updateData.status = status;
      } else {
        updateData.taskStatus = status;
      }

      await setDoc(docRef, updateData, { merge: true });
      toast.success("Licence status updated successfully!");

      const appId = task.applicationDocId || task.applicationId || task.recordId;
      if (appId) {
        const appRef = doc(db, "registry_applications_v1", appId);
        
        const appPayload: any = {
          rtoExpense: Number(expense) || 0,
          appointmentDate: apptDate,
          status: status,
          updatedAt: new Date().toISOString()
        };
        
        if (paidBy !== undefined) {
          appPayload.rtoExpensePaidBy = paidBy;
        }
        
        await setDoc(appRef, appPayload, { merge: true }).catch(() => { });

        await syncAccountingRecord(appId, {
          rtoExpense: Number(expense) || 0,
          employeeName: task.assignedEmployeeName || task.assignee
        }).catch(console.error);
      }
    } catch (error) {
      console.error("Error updating licence status and expense:", error);
      toast.error("Failed to update status");
    }
  };

  const handleVahaanStatusChange = (task: any, newStatus: string) => {
    if (newStatus.toUpperCase() === "ONHOLD" || newStatus.toUpperCase() === "ON HOLD") {
      setVahaanHoldTask(task);
      setVahaanHoldReason(task.holdReason || "");
      setVahaanHoldDate(task.holdDate || new Date().toISOString().split("T")[0]);
      setShowVahaanHoldModal(true);
    } else if (newStatus.toUpperCase() === "INWARD") {
      setPendingStatusChange({ task, newStatus, isVahaan: true });
      setRtoExpenseValue(task.rtoExpense || 0);
      setRtoExpensePaidBy(task.rtoExpensePaidBy || "");
      setRtoApptDate(task.appointmentDate || "");
      setShowRtoExpenseModal(true);
    } else {
      updateVahaanStatusInDb(task, newStatus);
    }
  };

  const updateVahaanStatusInDb = async (task: any, status: string, holdReason = "", holdDate = "", rtoExpense?: number, paidBy?: string) => {
    try {
      const coll = task.sourceCollection || "registry_services_v2";
      const docRef = doc(db, coll, task.id);

      const updateData: any = {
        status: status,
        taskStatus: status,
        updatedAt: new Date().toISOString(),
      };

      if (status.toUpperCase() === "ON HOLD" || status.toUpperCase() === "ONHOLD") {
        updateData.holdReason = holdReason;
        updateData.holdDate = holdDate;
      }

      if (rtoExpense !== undefined) {
        updateData.rtoExpense = Number(rtoExpense) || 0;
      }
      
      if (paidBy !== undefined) {
        updateData.rtoExpensePaidBy = paidBy;
      }

      await setDoc(docRef, updateData, { merge: true });
      toast.success("Vahaan status updated successfully!");

      const appDocId = task.applicationDocId || task.recordId || task.clientId || task.id.replace("task-app-", "");
      if (appDocId) {
        const appRef = doc(db, "registry_applications_v1", appDocId);
        const appPayload: any = {
          applicationStatus: status === "Completed" ? "COMPLETED" : status,
          updatedAt: new Date().toISOString()
        };
        if (rtoExpense !== undefined) {
          appPayload.rtoExpense = Number(rtoExpense) || 0;
        }
        if (paidBy !== undefined) {
          appPayload.rtoExpensePaidBy = paidBy;
        }
        await setDoc(appRef, appPayload, { merge: true }).catch(() => { });

        await syncAccountingRecord(appDocId, {
          rtoExpense: rtoExpense !== undefined ? Number(rtoExpense) : undefined,
          employeeName: task.assignedEmployeeName || task.assignee
        }).catch(console.error);
      }
    } catch (error) {
      console.error("Error updating Vahaan status:", error);
      toast.error("Failed to update status");
    }
  };

  const handleSaveVahaanHold = () => {
    if (vahaanHoldTask) {
      if (!vahaanHoldReason.trim()) {
        toast.error("Hold reason is required");
        return;
      }
      if (!vahaanHoldDate) {
        toast.error("Hold date is required");
        return;
      }
      updateVahaanStatusInDb(vahaanHoldTask, "Onhold", vahaanHoldReason, vahaanHoldDate);
      setShowVahaanHoldModal(false);
      setVahaanHoldTask(null);
      setVahaanHoldReason("");
      setVahaanHoldDate("");
    }
  };

  const handleSaveServiceEdit = async () => {
    if (!editingService) return;
    setSavingEdit(true);
    try {
      if (editApptDate && !/^\d{2}\/\d{2}\/\d{4}$/.test(editApptDate)) {
        throw new Error("Appointment Date must be in DD/MM/YYYY format.");
      }
      const docRef = doc(db, editingService.sourceCollection || "registry_services_v2", editingService.id);

      const matchedStaff = STAFF_USERS.find(s => s.username === editAssignee);
      const assigneeName = matchedStaff ? matchedStaff.name : editAssignee;

      const rtoReceiptAmountVal = parseFloat(editRtoReceiptAmount) || 0;

      const updateData: any = {
        status: editStatus,
        taskStatus: editStatus,
        done: ["COMPLETED", "RTO", "PASS", "FAIL", "RETEST"].includes(editStatus.toUpperCase()),
        assignee: editAssignee,
        assignedEmployeeName: assigneeName,
        assignedStaff: editAssignee,
        appointmentDate: editApptDate,
        rtoReceiptAmount: rtoReceiptAmountVal,
        rtoReceiptNo: String(rtoReceiptAmountVal),
        rtoExpense: rtoReceiptAmountVal,
        applicationId: editAppId,
        applicationType: editAppType,
        remarks: editRemarks,
        notes: editRemarks,
        updatedAt: new Date().toISOString(),
      };

      if (editStatus.toUpperCase() === "ON HOLD" || editStatus.toUpperCase() === "ONHOLD") {
        updateData.holdReason = editHoldReason;
        updateData.holdDate = editHoldDate;
      }

      await setDoc(docRef, updateData, { merge: true });

      const appDocId = editingService.applicationDocId || editingService.recordId || editingService.clientId || editingService.id.replace("task-app-", "");
      if (appDocId) {
        const appRef = doc(db, "registry_applications_v1", appDocId);
        await setDoc(appRef, {
          applicationId: editAppId,
          applicationType: editAppType,
          applicationStatus: editStatus === "Completed" ? "COMPLETED" : editStatus,
          rtoReceiptAmount: rtoReceiptAmountVal,
          rtoReceiptNo: String(rtoReceiptAmountVal),
          updatedAt: new Date().toISOString()
        }, { merge: true }).catch(() => { });

        await syncAccountingRecord(appDocId, {
          applicationId: editAppId,
          rtoReceipt: rtoReceiptAmountVal,
          employeeName: assigneeName
        }).catch(console.error);
      }

      toast.success("Service record updated successfully!");
      setEditingService(null);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to update service record");
    } finally {
      setSavingEdit(false);
    }
  };

  // Subscribe to Firestore tasks & registry_services_v2 to dynamically display Completed Services
  useEffect(() => {
    const session = getSession();
    const isAdmin = session?.role === "admin" || session?.role === "manager";
    const userName = session?.name || session?.username || "";
    const userUid = session?.uid || session?.employeeId || "";

    const handleDocsUpdate = (snap1: any, snap2: any) => {
      const docs1 = snap1 ? snap1.docs.map((d: any) => ({ id: d.id, ...d.data() })) : [];
      const docs2 = snap2 ? snap2.docs.map((d: any) => ({ id: d.id, ...d.data() })) : [];

      const combined = [...docs1, ...docs2];
      const completedList = combined.filter((t: any) => t.status === "Completed" || t.taskStatus === "Completed" || t.done === true);

      // Deduplicate by ID
      const uniqueMap = new Map();
      completedList.forEach((item: any) => uniqueMap.set(item.id, item));
      const uniqueCompleted = Array.from(uniqueMap.values());

      // Permission filtering for Completed Services
      const allowed = uniqueCompleted.filter((t: any) => {
        if (isAdmin) return true;
        return isTaskAssignedToUser(t, session);
      });

      setCompletedTasks(allowed);
    };
    let snap1Data: any = null;
    let snap2Data: any = null;
    let snap3Data: any = null;
    let accMapData: Map<string, AccountingRecord> = new Map();
    let clientsData: any[] = [];

    const handleDocsUpdateAll = () => {
      const docs1 = snap1Data ? snap1Data.docs.map((d: any) => ({ id: d.id, sourceCollection: "registry_tasks", ...d.data() })) : [];
      const docs2 = snap2Data ? snap2Data.docs.map((d: any) => ({ id: d.id, sourceCollection: "registry_services_v2", ...d.data() })) : [];
      const apps = snap3Data ? snap3Data.docs.map((d: any) => ({ id: d.id, ...d.data() })) : [];
      setAppsList(apps);
      const appsMap = new Map<string, any>(apps.map((a: any) => [a.id, a]));

      const combined = [...docs1, ...docs2];
      const completedList = combined.filter((t: any) => {
        const targetAppId = t.applicationDocId || t.applicationId || t.recordId || t.clientId || t.id.replace("task-app-", "");
        const app = appsMap.get(targetAppId) || apps.find((a: any) => a.id === t.id || a.id === t.recordId || a.id === t.applicationDocId);
        const resolvedSubModule = app?.subModule || (app?.licenseDetails ? "licence" : t.subModule || "services");

        const s = (t.status || t.taskStatus || "").toUpperCase();
        if (resolvedSubModule === "licence") {
          return ["RTO", "PASS", "FAIL", "RETEST", "COMPLETED"].includes(s);
        }
        return ["COMPLETED", "IN RTO", "INWARD", "VERIFY", "APPROVED", "ON HOLD", "ONHOLD"].includes(s);
      });

      // Deduplicate by ID and enrich with Application & Accounting record details
      const uniqueMap = new Map();
      completedList.forEach((item: any) => {
        const targetAppId = item.applicationDocId || item.applicationId || item.recordId || item.clientId || item.id.replace("task-app-", "");
        let app: any = appsMap.get(targetAppId);

        const cleanVeh = item.vehicleNumber || item.vehicleId || "";
        const cleanVehNo = cleanVeh ? cleanVeh.trim().toUpperCase().replace(/[\s-]/g, "") : "";

        if (!app) {
          app = apps.find((a: any) => {
            const aAppId = a.applicationId ? a.applicationId.trim().toUpperCase() : "";
            const tAppId = item.applicationId ? item.applicationId.trim().toUpperCase() : "";
            const aVeh = a.vehicleNumber ? a.vehicleNumber.trim().toUpperCase().replace(/[\s-]/g, "") : "";

            return (
              (tAppId && aAppId === tAppId) ||
              a.id === item.id ||
              a.id === item.recordId ||
              a.id === item.applicationDocId ||
              (item.id && item.id.replace("task-app-", "") === a.id) ||
              (cleanVehNo && aVeh === cleanVehNo)
            );
          });
        }

        // Filter out completed tasks if their parent application has been deleted or is missing
        if (!app || app.isDeleted) {
          return;
        }

        const acc = accMapData.get(targetAppId) || accMapData.get(item.applicationId || "") || (app ? accMapData.get(app.id) || accMapData.get(app.applicationId) : null);

        const totalAmt = acc?.totalPayment ?? app?.amount ?? item.amount ?? item.totalAmount ?? 0;
        const advAmt = acc?.advancePayment ?? app?.totalPaid ?? item.totalPaid ?? item.advanceAmount ?? 0;
        const remAmt = acc?.remainingPayment ?? (app ? (typeof app.pendingAmount === "number" ? app.pendingAmount : Math.max(0, totalAmt - advAmt)) : item.pendingAmount ?? Math.max(0, totalAmt - advAmt));
        const rawStatus = acc?.paymentStatus ?? app?.paymentStatus ?? item.paymentStatus ?? (remAmt <= 0 ? "Paid" : advAmt > 0 ? "Partially Paid" : "Pending");
        const pStatus = rawStatus === "Partially Paid" ? "Partial" : rawStatus;
        const v = app?.vehicleDetails || app?.vehicleMaster || app || {};
        const client = clientsData.find((c: any) =>
          c.id === targetAppId ||
          c.id === app?.clientId ||
          c.id === item.clientId ||
          (app?.mobileNumber && c.mobile === app.mobileNumber) ||
          (item.mobileNumber && c.mobile === item.mobileNumber)
        );
        const resolvedGroupName = client?.groupName || client?.companyName || app?.groupName || item.groupName || "";

        const enriched = {
          ...item,
          applicationId: item.applicationId || app?.applicationId || "",
          vehicleNumber: app?.vehicleNumber || item.vehicleNumber || item.vehicleId || "",
          clientName: app?.ownerName || item.clientName || item.ownerName || "",
          mobileNumber: app?.mobileNumber || item.mobileNumber || item.ownerPhone || item.phone || "",
          serviceName: (app?.services && app.services.join(", ")) || item.serviceName || item.serviceType || "",
          reference: app?.reference || app?.applicationId || item.reference || item.title || item.id,
          assignedEmployeeName: app?.assignedEmployeeName || item.assignedEmployeeName || item.assignee || "Unassigned",
          rtoExpense: item.rtoExpense || 0,
          amount: totalAmt,
          totalPaid: advAmt,
          pendingAmount: remAmt,
          paymentStatus: pStatus,
          subModule: app?.subModule || (app?.licenseDetails ? "licence" : item.subModule || "services"),
          applicationType: app?.applicationType || item.applicationType || (app?.subModule === "licence" ? "Licence" : "Home"),
          licenseDetails: app?.licenseDetails || item.licenseDetails,
          dateOfBirth: app?.licenseDetails?.dateOfBirth || item.dateOfBirth,
          pucExpiryDate: app?.pucExpiryDate || item.pucExpiryDate || v.pucExpiryDate || v.pucDetails?.expiryDate || "—",
          taxExpiryDate: app?.taxExpiryDate || item.taxExpiryDate || v.taxExpiryDate || v.taxDetails?.expiryDate || "—",
          fitnessExpiryDate: app?.fitnessExpiryDate || item.fitnessExpiryDate || v.fitnessExpiryDate || v.fitnessDetails?.expiryDate || "—",
          insuranceExpiryDate: app?.insuranceExpiryDate || item.insuranceExpiryDate || v.insuranceExpiryDate || v.insuranceDetails?.expiryDate || "—",
          nationalPermitExpiryDate: app?.nationalPermitExpiryDate || item.nationalPermitExpiryDate || v.nationalPermitExpiryDate || v.permitDetails?.nationalPermitExpiryDate || "—",
          gujaratPermitExpiryDate: app?.gujaratPermitExpiryDate || item.gujaratPermitExpiryDate || v.gujaratPermitExpiryDate || v.permitDetails?.gujaratPermitExpiryDate || "—",
          npAuthExpiryDate: app?.npAuthExpiryDate || item.npAuthExpiryDate || v.npAuthExpiryDate || v.permitDetails?.nationalAuthExpiryDate || "—",
          registrationRenewalExpiryDate: app?.registrationRenewalExpiryDate || item.registrationRenewalExpiryDate || v.registrationRenewalExpiryDate || v.registrationDetails?.registrationValidity || "—",
          groupName: resolvedGroupName,
        };
        uniqueMap.set(item.id, enriched);
      });
      const uniqueCompleted = Array.from(uniqueMap.values());

      // Permission filtering for Completed Services
      const allowed = uniqueCompleted.filter((t: any) => {
        if (isAdmin) return true;
        return isTaskAssignedToUser(t, session);
      });

      setCompletedTasks(allowed);
    };

    const unsub1 = onSnapshot(collection(db, "registry_tasks"), (snap) => {
      snap1Data = snap;
      handleDocsUpdateAll();
    });

    const unsub2 = onSnapshot(collection(db, "registry_services_v2"), (snap) => {
      snap2Data = snap;
      handleDocsUpdateAll();
    });

    const unsub3 = onSnapshot(collection(db, "registry_applications_v1"), (snap) => {
      snap3Data = snap;
      handleDocsUpdateAll();
    });

    const unsub4 = subscribeAccountingRecords((map) => {
      accMapData = map;
      handleDocsUpdateAll();
    });

    const unsub5 = onSnapshot(collection(db, "registry_clients_v2"), (snap) => {
      clientsData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      handleDocsUpdateAll();
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
    };
  }, []);

  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records;
    const q = searchQuery.toLowerCase().trim();
    return records.filter((r) => {
      const vehiclesList: string[] = (r as any).aggregatedVehicles || [];
      const servicesList: any[] = (r as any).services || [];
      const matchesName = r.name?.toLowerCase().includes(q);
      const matchesMobile = (r.mo || "").toLowerCase().includes(q);
      const matchesVehicle = vehiclesList.some((v) => v.toLowerCase().includes(q));
      const matchesAppId = servicesList.some((s) => (s.applicationId || "").toLowerCase().includes(q));
      const matchesAssignee =
        servicesList.some((s) => (s.assignee || s.assignedEmployeeName || "").toLowerCase().includes(q)) ||
        (r.assignee || "").toLowerCase().includes(q);
      const matchesService = (r.serviceType || "").toLowerCase().includes(q);
      return matchesName || matchesMobile || matchesVehicle || matchesAppId || matchesAssignee || matchesService;
    });
  }, [records, searchQuery]);

  const filteredCompletedTasks = useMemo(() => {
    let list = completedTasks;
    if (activeSubModule === "driving_school") {
      list = list.filter((t: any) => t.subModule === "driving_school");
    } else if (activeSubModule === "licence") {
      list = list.filter((t: any) => {
        if (t.subModule) return t.subModule === "licence";
        return (t.applicationType || "").toLowerCase() === "licence";
      });
    } else if (activeSubModule === "insurance") {
      list = list.filter((t: any) => {
        if (t.subModule) return t.subModule === "insurance";
        return (t.applicationType || "").toLowerCase() === "insurance";
      });
    } else {
      list = list.filter((t: any) => {
        if (t.subModule) return t.subModule === "services";
        return (t.applicationType || "").toLowerCase() !== "licence" && (t.applicationType || "").toLowerCase() !== "insurance" && (t.applicationType || "").toLowerCase() !== "driving_school";
      });
    }

    if (groupFilter !== "all") {
      list = list.filter((t: any) => t.groupName === groupFilter);
    }

    if (statusFilter !== "all") {
      list = list.filter((t: any) => (t.status || t.taskStatus || "").toUpperCase() === statusFilter.toUpperCase());
    }

    if (apptDateFilter) {
      list = list.filter((t: any) => {
        if (!t.appointmentDate) return false;
        const apptDate = new Date(t.appointmentDate);
        if (isNaN(apptDate.getTime())) return false;
        const yyyy = apptDate.getFullYear();
        const mm = String(apptDate.getMonth() + 1).padStart(2, "0");
        const dd = String(apptDate.getDate()).padStart(2, "0");
        const apptStr = `${yyyy}-${mm}-${dd}`;
        return apptStr === apptDateFilter;
      });
    }

    let final = list;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      final = list.filter((t: any) => {
        const matchTitle = (t.title || "").toLowerCase().includes(q);
        const matchVehicle = (t.vehicleNumber || t.vehicleId || "").toLowerCase().includes(q);
        const matchClient = (t.clientName || "").toLowerCase().includes(q);
        const matchPhone = (t.mobileNumber || t.phone || "").toLowerCase().includes(q);
        const matchAppNo = (t.applicationId || "").toLowerCase().includes(q);
        const matchService = (t.serviceName || t.serviceType || "").toLowerCase().includes(q);
        return matchTitle || matchVehicle || matchClient || matchPhone || matchAppNo || matchService;
      });
    }

    const parseDate = (dStr: string) => {
      if (!dStr) return 0;
      if (dStr.includes('/')) {
        const parts = dStr.split('/');
        if (parts.length === 3) {
          return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
        }
      }
      return new Date(dStr).getTime() || 0;
    };

    return final.sort((a: any, b: any) => {
      const dateA = parseDate(a.appointmentDate);
      const dateB = parseDate(b.appointmentDate);
      return dateB - dateA;
    });
  }, [completedTasks, searchQuery, activeSubModule, groupFilter, statusFilter, apptDateFilter]);

  const openWorkflow = (record: RegistryRecord) => {
    setSelectedRecord(record);
    setProfileOpen(true);
  };

  const refreshData = async () => {
    try {
      setLoading(true);
      const [recs] = await Promise.all([getServiceClientsAll(serviceType)]);
      const agg = aggregateServiceRecords(recs, serviceType);

      setRecords(agg.aggregatedRecords);
      setStats(agg.stats);
      setTotalServiceAmount(agg.serviceTotal);
      setTotalReceived(agg.receivedTotal);
      setTotalPending(agg.pendingTotal);
    } catch (error) {
      console.error(`[ServiceDashboard] ERROR loading service data:`, error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [serviceType]);

  const statCards = [
    {
      label: "Total Clients",
      value: stats.total,
      icon: Users,
      color: "bg-blue-500/10 text-blue-500",
      description: `${stats.vehicleCount} vehicles registered`,
    },
    {
      label: "Active Services",
      value: stats.active,
      icon: TrendingUp,
      color: "bg-green-500/10 text-green-500",
      description: `${stats.serviceCount} total services`,
    },
    {
      label: "Completed",
      value: stats.completed,
      icon: Package,
      color: "bg-emerald-500/10 text-emerald-500",
      description: "Successfully processed",
    },
    {
      label: "Pending",
      value: stats.pending,
      icon: AlertCircle,
      color: "bg-amber-500/10 text-amber-500",
      description: "Awaiting action",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title || `${serviceType} Services`}</h2>
          <p className="text-sm text-muted-foreground">
            {description || `Manage and track ${serviceType.toLowerCase()} applications and client records`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateServicePDF(serviceType, { records, stats, totals: { totalServiceAmount, totalReceived, totalPending } }, "user")}
          >
            <Download className="size-4 mr-1.5" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* 3 Main Sub Module Services, Licence, Driving School Tabs */}
      <div>
        <SubModuleTabs activeTab={activeSubModule} onChange={setActiveSubModule} />
      </div>



      {/* Completed Services Module Table (Transferred Automatically from Task Module) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-slate-900">Completed Services</h3>
            <p className="text-xs text-slate-500">
              Real-time completed applications transferred automatically from Task Module
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Appointment Date Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 h-9">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Appt Date:</span>
              <input
                type="date"
                value={apptDateFilter}
                onChange={(e) => setApptDateFilter(e.target.value)}
                className="bg-transparent border-none text-xs font-semibold text-slate-700 focus:outline-none h-full outline-none w-28 cursor-pointer"
              />
              {apptDateFilter && (
                <button
                  onClick={() => setApptDateFilter("")}
                  className="text-slate-400 hover:text-slate-600 text-xs font-bold px-1 ml-1"
                  title="Clear Date Filter"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 h-9"
            >
              <option value="all">ALL GROUPS</option>
              {availableGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 h-9"
            >
              <option value="all">ALL STATUSES</option>
              <option value="verify">VERIFY</option>
              <option value="approved">APPROVED</option>
              <option value="in rto">IN RTO</option>
              <option value="on hold">ON HOLD</option>
              <option value="completed">COMPLETED</option>
            </select>

            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search Completed Services..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
          </div>
        </div>

        <div className="border rounded-2xl bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[1100px]">
              <thead className="bg-slate-50 text-gray-500 uppercase font-bold text-[9px] border-b">
                <tr>
                  <th className="p-3 text-center">SR NO</th>
                  {activeSubModule === "licence" ? (
                    <>
                      <th className="p-3">APPLICATION NUMBER</th>
                      <th className="p-3">CLIENT NAME</th>
                      <th className="p-3">DOB</th>
                      <th className="p-3">MOBILE NUMBER</th>
                      <th className="p-3">APPOINTMENT DATE</th>
                      <th className="p-3">DAYS</th>
                      <th className="p-3">DAYS AFTER APPOINTMENT</th>
                      {Array.from(
                        new Set(
                          filteredCompletedTasks.flatMap((t: any) => {
                            const sName = t.serviceName || t.serviceType || t.title || "License Service";
                            return sName.split(",").map((s: string) => s.trim()).filter(Boolean);
                          })
                        )
                      ).map((srv) => (
                        <th key={srv} className="p-3">
                          {srv.toUpperCase()} EXPIRE DATE
                        </th>
                      ))}
                      <th className="p-3">કુલ રકમ</th>
                      <th className="p-3">કુલ જમા</th>
                      <th className="p-3">બાકી</th>
                      <th className="p-3">PAYMENT STATUS</th>
                      <th className="p-3">STATUS OF TASK</th>
                      <th className="p-3">LATEST REMARK</th>
                    </>
                  ) : (
                    <>
                      <th className="p-3">APPLICATION NUMBER</th>
                      <th className="p-3">APPOINTMENT DATE</th>
                      <th className="p-3 text-center">DAYS</th>
                      <th className="p-3 text-center">DAYS AFTER APPOINTMENT</th>
                      <th className="p-3">VEHICLE NUMBER</th>
                      <th className="p-3">OWNER NAME</th>
                      <th className="p-3 text-center">TOTAL SERVICES</th>
                      <th className="p-3">ASSIGNED EMPLOYEE</th>
                      <th className="p-3">TASK STATUS</th>
                      <th className="p-3">LATEST REMARK</th>
                      <th className="p-3">PUC EXPIRY</th>
                      <th className="p-3">TAX EXPIRY</th>
                      <th className="p-3">FITNESS EXPIRY</th>
                      {activeSubModule !== "services" && <th className="p-3">INSURANCE EXPIRY</th>}
                      <th className="p-3">NATIONAL PERMIT(GUJRAT PERMIT)</th>
                      <th className="p-3">GUJARAT PERMIT</th>
                      <th className="p-3">NP AUTHORIZATION</th>
                      <th className="p-3">REGISTRATION RENEWAL</th>
                      <th className="p-3 font-bold text-slate-900">કુલ રકમ</th>
                      <th className="p-3 font-bold text-emerald-700">કુલ જમા</th>
                      <th className="p-3">APPLICATION TYPE</th>
                    </>
                  )}
                  <th className="p-3 text-center">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y text-gray-700 font-medium">
                {filteredCompletedTasks.length === 0 ? (
                  <tr>
                    <td colSpan={25} className="p-8 text-center text-slate-400">
                      No completed services found. Complete a task in the Task Module to transfer automatically.
                    </td>
                  </tr>
                ) : (
                  filteredCompletedTasks.map((t: any, idx: number) => {
                    // Days calculation: Appointment Date - Task Creation Date
                    const apptDate = t.appointmentDate ? new Date(t.appointmentDate) : null;
                    const createDate = t.createdDate || t.createdAt || t.issueDate ? new Date(t.createdDate || t.createdAt || t.issueDate) : null;

                    let daysDiffStr = "—";
                    if (apptDate && createDate && !isNaN(apptDate.getTime()) && !isNaN(createDate.getTime())) {
                      const diffTime = apptDate.getTime() - createDate.getTime();
                      const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                      daysDiffStr = `${diffDays}`;
                    }

                    // Days After Appointment calculation: Current Date - Appointment Date (0 if future, actual days if past)
                    let daysAfterApptStr = "0";
                    if (apptDate && !isNaN(apptDate.getTime())) {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const apptDateOnly = new Date(apptDate);
                      apptDateOnly.setHours(0, 0, 0, 0);
                      if (today.getTime() <= apptDateOnly.getTime()) {
                        daysAfterApptStr = "0";
                      } else {
                        const diffTime = today.getTime() - apptDateOnly.getTime();
                        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                        daysAfterApptStr = `${diffDays}`;
                      }
                    }

                    if (activeSubModule === "licence") {
                      const ld = t.licenseDetails;
                      const clientDob = ld?.dateOfBirth || t.dateOfBirth || "—";
                      const totalPay = t.amount || t.totalAmount || 0;
                      const advPay = t.totalPaid || t.advanceAmount || 0;
                      const remPay = typeof t.pendingAmount === "number" ? t.pendingAmount : Math.max(0, totalPay - advPay);
                      const pStatus = t.paymentStatus || (remPay <= 0 ? "Paid" : advPay > 0 ? "Partial" : "Pending");
                      const refCode = t.reference || t.applicationId || t.id;

                      const licServices = Array.from(
                        new Set(
                          filteredCompletedTasks.flatMap((item: any) => {
                            const sName = item.serviceName || item.serviceType || item.title || "License Service";
                            return sName.split(",").map((s: string) => s.trim()).filter(Boolean);
                          })
                        )
                      );

                      const getExpiryForService = (srvName: string) => {
                        if (!ld) return formatDateDDMMYYYY(t.dueDate || t.expiryDate);
                        if (srvName.includes("Learning") || srvName.includes("New Learning")) {
                          return formatDateDDMMYYYY(ld.newLearningLicence?.step1?.expiryDate || ld.newLearningLicence?.appointmentDate || t.dueDate);
                        }
                        if (srvName.includes("Endorsement")) {
                          return formatDateDDMMYYYY(ld.dlNewLlEndorsement?.step2?.expiryDate || ld.dlNewLlEndorsement?.step3?.validityDate || t.dueDate);
                        }
                        if (srvName.includes("Renew")) {
                          return formatDateDDMMYYYY(ld.llRenewClass?.step1?.expiryDate || ld.llRenewClass?.step3?.validityDate || t.dueDate);
                        }
                        return formatDateDDMMYYYY(t.dueDate || t.expiryDate);
                      };

                      const latestComment = t.comments && t.comments.length > 0
                        ? [...t.comments].sort((a: any, b: any) => new Date(b.at || b.createdAt).getTime() - new Date(a.at || a.createdAt).getTime())[0]?.text
                        : (t as any).lastRemark || (t as any).remarks || "—";

                      return (
                        <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="p-3 text-center font-mono text-slate-400">{idx + 1}</td>
                          <td className="p-3 font-mono text-slate-700 font-semibold">{refCode}</td>
                          <td className="p-3 text-blue-600 font-bold">{t.clientName || "—"}</td>
                          <td className="p-3 font-mono text-slate-600">{formatDateDDMMYYYY(clientDob)}</td>
                          <td className="p-3 font-mono text-slate-500">{t.mobileNumber || t.phone || "—"}</td>
                          <td className="p-3 font-mono font-semibold text-slate-900">
                            {formatDateDDMMYYYY(t.appointmentDate)}
                          </td>
                          <td className="p-3 font-semibold text-indigo-600 text-center">{daysDiffStr}</td>
                          <td className="p-3 font-semibold text-amber-600 text-center">{daysAfterApptStr}</td>
                          {licServices.map((srv) => (
                            <td key={srv} className="p-3 font-mono text-slate-600">
                              {getExpiryForService(srv)}
                            </td>
                          ))}
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
                            {(() => {
                              const sVal = (t.status || t.taskStatus || "Completed").toUpperCase();
                              const statusVal = ["RTO", "PASS", "FAIL", "RETEST"].includes(sVal) ? sVal : "RTO";
                              return (
                                <select
                                  value={statusVal}
                                  onChange={(e) => handleLicenceStatusChange(t, e.target.value)}
                                  className="px-2 py-1 rounded text-xs font-bold border bg-white cursor-pointer border-slate-200"
                                >
                                  <option value="RTO">RTO</option>
                                  <option value="PASS">PASS</option>
                                  <option value="FAIL">FAIL</option>
                                  <option value="RETEST">RETEST</option>
                                </select>
                              );
                            })()}
                          </td>
                          <td className="p-3 max-w-[150px] truncate text-slate-500 text-[11px]" title={latestComment}>
                            {latestComment}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingService(t);
                                  setEditStatus(t.status || t.taskStatus || "Completed");
                                  setEditAssignee(t.assignee || "");
                                  setEditApptDate(t.appointmentDate ? formatDateDDMMYYYY(t.appointmentDate) : "");
                                  setEditRtoReceiptAmount(t.rtoReceiptAmount || t.rtoExpense || t.rtoReceiptNo || "");
                                  setEditAppId(t.applicationId || "");
                                  setEditAppType(t.applicationType || "Home");
                                  setEditRemarks(t.remarks || t.notes || "");
                                  setEditHoldReason(t.holdReason || "");
                                  setEditHoldDate(t.holdDate || "");
                                }}
                                title="Edit Licence Service"
                              >
                                <Eye className="size-3.5 text-blue-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingService(t);
                                  setEditStatus(t.status || t.taskStatus || "Completed");
                                  setEditAssignee(t.assignee || "");
                                  setEditApptDate(t.appointmentDate ? formatDateDDMMYYYY(t.appointmentDate) : "");
                                  setEditRtoReceiptAmount(t.rtoReceiptAmount || t.rtoExpense || t.rtoReceiptNo || "");
                                  setEditAppId(t.applicationId || "");
                                  setEditAppType(t.applicationType || "Home");
                                  setEditRemarks(t.remarks || t.notes || "");
                                  setEditHoldReason(t.holdReason || "");
                                  setEditHoldDate(t.holdDate || "");
                                }}
                                title="Edit Licence Service"
                              >
                                <Pencil className="size-3.5 text-indigo-600" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    const srvCount = t.services?.length || (t.serviceName ? t.serviceName.split(",").length : 1);

                    const latestComment = t.comments && t.comments.length > 0
                      ? [...t.comments].sort((a: any, b: any) => new Date(b.at || b.createdAt).getTime() - new Date(a.at || a.createdAt).getTime())[0]?.text
                      : (t as any).lastRemark || (t as any).remarks || "—";

                    return (
                      <tr key={t.id} style={getApplicationTypeStyle(t.applicationType)} className="hover:bg-slate-50/40 border-b border-slate-100 transition-colors">
                        <td className="p-3 text-center font-mono text-slate-400">{idx + 1}</td>
                        <td className="p-3 font-mono text-xs font-semibold text-blue-600">{t.applicationId || "—"}</td>
                        <td className="p-3 font-mono font-semibold text-slate-900">
                          {formatDateDDMMYYYY(t.appointmentDate)}
                        </td>
                        <td className="p-3 font-semibold text-indigo-600 text-center">{daysDiffStr}</td>
                        <td className="p-3 font-semibold text-amber-600 text-center">{daysAfterApptStr}</td>
                        <td className="p-3 font-mono font-bold text-slate-900">{t.vehicleNumber || t.vehicleId || "—"}</td>
                        <td className="p-3 font-semibold text-slate-800">{t.clientName || t.ownerName || "—"}</td>
                        <td className="p-3 text-center font-bold text-slate-800">{srvCount}</td>
                        <td className="p-3 text-slate-700">{t.assignedEmployeeName || t.assignee || "Unassigned"}</td>
                        <td className="p-3">
                          {(() => {
                            const sVal = t.status || t.taskStatus || "Completed";
                            const normalized = sVal.toUpperCase() === "ON HOLD" ? "Onhold" : sVal;
                            const statusVal = ["In RTO", "Inward", "Verify", "Approved", "Onhold"].includes(normalized) ? normalized : "In RTO";
                            return (
                              <select
                                value={statusVal}
                                onChange={(e) => handleVahaanStatusChange(t, e.target.value)}
                                className={cn(
                                  "px-2 py-1 rounded text-xs font-bold border bg-white cursor-pointer",
                                  (() => {
                                    const s = statusVal.toUpperCase();
                                    switch (s) {
                                      case "COMPLETED":
                                        return "bg-emerald-50 text-emerald-700 border-emerald-200";
                                      case "IN RTO":
                                      case "RTO":
                                        return "bg-blue-50 text-blue-700 border-blue-200";
                                      case "INWARD":
                                        return "bg-purple-50 text-purple-700 border-purple-200";
                                      case "VERIFY":
                                        return "bg-indigo-50 text-indigo-700 border-indigo-200";
                                      case "APPROVED":
                                        return "bg-teal-50 text-teal-700 border-teal-200";
                                      case "ON HOLD":
                                      case "ONHOLD":
                                        return "bg-amber-50 text-amber-700 border-amber-200";
                                      default:
                                        return "bg-slate-50 text-slate-700 border-slate-200";
                                    }
                                  })()
                                )}
                              >
                                <option value="In RTO">In RTO</option>
                                <option value="Inward">Inward</option>
                                <option value="Verify">Verify</option>
                                <option value="Approved">Approved</option>
                                <option value="Onhold">Onhold</option>
                              </select>
                            );
                          })()}
                        </td>
                        <td className="p-3 max-w-[150px] truncate text-slate-500 text-[11px]" title={latestComment}>
                          {latestComment}
                        </td>
                        <td className="p-3 font-mono text-xs text-slate-600">{formatDateDDMMYYYY(t.pucExpiryDate)}</td>
                        <td className="p-3 font-mono text-xs text-slate-600">{formatDateDDMMYYYY(t.taxExpiryDate)}</td>
                        <td className="p-3 font-mono text-xs text-slate-600">{formatDateDDMMYYYY(t.fitnessExpiryDate)}</td>
                        {activeSubModule !== "services" && <td className="p-3 font-mono text-xs text-slate-600">{formatDateDDMMYYYY(t.insuranceExpiryDate)}</td>}
                        <td className="p-3 font-mono text-xs text-slate-600">{formatDateDDMMYYYY(t.nationalPermitExpiryDate)}</td>
                        <td className="p-3 font-mono text-xs text-slate-600">{formatDateDDMMYYYY(t.gujaratPermitExpiryDate)}</td>
                        <td className="p-3 font-mono text-xs text-slate-600">{formatDateDDMMYYYY(t.npAuthExpiryDate)}</td>
                        <td className="p-3 font-mono text-xs text-slate-600">{formatDateDDMMYYYY(t.registrationRenewalExpiryDate)}</td>
                        <td className="p-3 font-bold text-slate-900 font-mono">
                          ₹{Number(t.amount || t.totalAmount || 0).toLocaleString("en-IN")}
                        </td>
                        <td className="p-3 font-bold text-emerald-700 font-mono">
                          ₹{Number(t.totalPaid || t.advanceAmount || 0).toLocaleString("en-IN")}
                        </td>
                        <td className="p-3">
                          <ApplicationTypeBadge appType={t.applicationType} />
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingService(t);
                                setEditStatus(t.status || t.taskStatus || "Completed");
                                setEditAssignee(t.assignee || "");
                                setEditApptDate(t.appointmentDate ? formatDateDDMMYYYY(t.appointmentDate) : "");
                                setEditRtoReceiptAmount(t.rtoReceiptAmount || t.rtoExpense || t.rtoReceiptNo || "");
                                setEditAppId(t.applicationId || "");
                                setEditAppType(t.applicationType || "Home");
                                setEditRemarks(t.remarks || t.notes || "");
                                setEditHoldReason(t.holdReason || "");
                                setEditHoldDate(t.holdDate || "");
                              }}
                              title="Edit Service"
                            >
                              <Eye className="size-3.5 text-blue-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (!isAdmin) {
                                  toast.error("Access Denied: Employees cannot edit completed service records");
                                  return;
                                }
                                setEditingService(t);
                                setEditStatus(t.status || t.taskStatus || "Completed");
                                setEditAssignee(t.assignee || "");
                                setEditApptDate(t.appointmentDate ? formatDateDDMMYYYY(t.appointmentDate) : "");
                                setEditRtoReceiptAmount(t.rtoReceiptAmount || t.rtoExpense || t.rtoReceiptNo || "");
                                setEditAppId(t.applicationId || "");
                                setEditAppType(t.applicationType || "Home");
                                setEditRemarks(t.remarks || t.notes || "");
                                setEditHoldReason(t.holdReason || "");
                                setEditHoldDate(t.holdDate || "");
                              }}
                              title="Edit Service"
                            >
                              <Pencil className="size-3.5 text-indigo-600" />
                            </Button>
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
      </div>

      <ApplicationFullDetailsModal
        open={appModalOpen}
        onOpenChange={setAppModalOpen}
        application={selectedAppModal}
      />

      {selectedRecord && (
        <ClientDetailWorkspace
          clientId={selectedRecord.id}
          open={profileOpen}
          onOpenChange={setProfileOpen}
        />
      )}
      <AddClientWizardDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        defaultServiceType={serviceType}
        onSuccess={refreshData}
      />

      {/* Edit Completed Service Modal */}
      {editingService && (
        <Dialog open={!!editingService} onOpenChange={(open) => { if (!open) setEditingService(null); }}>
          <DialogContent className="max-w-md p-6 bg-white rounded-xl shadow-xl border border-slate-200">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">EDIT COMPLETED SERVICE</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-3 text-xs max-h-[60vh] overflow-y-auto">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full p-2 border rounded-lg bg-white"
                >
                  {activeSubModule === "licence"
                    ? ["RTO", "PASS", "FAIL", "RETEST", "COMPLETED"].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))
                    : activeSubModule === "services"
                      ? ["In RTO", "Inward", "Verify", "Approved", "Onhold", "Completed"].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))
                      : ["IN RTO", "INWARD", "VERIFY", "APPROVED", "ON HOLD", "COMPLETED"].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))
                  }
                </select>
              </div>

              {(editStatus.toUpperCase() === "ON HOLD" || editStatus.toUpperCase() === "ONHOLD") && (
                <>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 block">Hold Reason</label>
                    <Input
                      type="text"
                      value={editHoldReason}
                      onChange={(e) => setEditHoldReason(e.target.value)}
                      placeholder="Enter hold reason..."
                      className="w-full p-2 border rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 block">Hold Date</label>
                    <Input
                      type="date"
                      value={editHoldDate}
                      onChange={(e) => setEditHoldDate(e.target.value)}
                      className="w-full p-2 border rounded-lg"
                    />
                  </div>
                </>
              )}

              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">Assigned Employee</label>
                <select
                  value={editAssignee}
                  onChange={(e) => setEditAssignee(e.target.value)}
                  className="w-full p-2 border rounded-lg bg-white"
                >
                  <option value="">Unassigned</option>
                  {STAFF_USERS.map((s) => (
                    <option key={s.username} value={s.username}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">Appointment Date (DD/MM/YYYY)</label>
                <Input
                  type="text"
                  placeholder="DD/MM/YYYY"
                  value={editApptDate}
                  onChange={(e) => {
                    let val = e.target.value.replace(/\D/g, "");
                    if (val.length > 8) val = val.slice(0, 8);
                    if (val.length > 4) {
                      val = `${val.slice(0, 2)}/${val.slice(2, 4)}/${val.slice(4)}`;
                    } else if (val.length > 2) {
                      val = `${val.slice(0, 2)}/${val.slice(2)}`;
                    }
                    setEditApptDate(val);
                  }}
                  className="w-full p-2 border rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">RTO Receipt Amount</label>
                <Input
                  type="number"
                  value={editRtoReceiptAmount}
                  onChange={(e) => setEditRtoReceiptAmount(e.target.value)}
                  placeholder="Enter amount..."
                  className="w-full p-2 border rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">Application No.</label>
                <Input
                  type="text"
                  value={editAppId}
                  onChange={(e) => setEditAppId(e.target.value)}
                  placeholder="APL-XXXX-XXXX"
                  className="w-full p-2 border rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">Application Type</label>
                <select
                  value={editAppType}
                  onChange={(e) => setEditAppType(e.target.value)}
                  className="w-full p-2 border rounded-lg bg-white"
                >
                  <option value="Home">Home</option>
                  <option value="Faceless">Faceless</option>
                  <option value="Out Of Bhavnagar">Out Of Bhavnagar</option>
                  <option value="CNG">CNG</option>
                  <option value="Out Of Bhavnagar to Bhavnagar">Out Of Bhavnagar to Bhavnagar</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">Remarks / Notes</label>
                <Input
                  type="text"
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  placeholder="Enter remarks..."
                  className="w-full p-2 border rounded-lg"
                />
              </div>
            </div>
            <DialogFooter className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingService(null)} className="px-4 py-2 text-xs rounded-lg">
                CANCEL
              </Button>
              <Button onClick={handleSaveServiceEdit} disabled={savingEdit} className="px-5 py-2 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-bold">
                {savingEdit ? "SAVING..." : "SAVE CHANGES"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Vahaan Hold modal */}
      <Dialog open={showVahaanHoldModal} onOpenChange={(open) => { if (!open) setShowVahaanHoldModal(false); }}>
        <DialogContent className="max-w-md p-6 bg-white rounded-xl shadow-xl border border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">VAHAAN HOLD DETAILS</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 block">Reason</label>
              <Input
                type="text"
                value={vahaanHoldReason}
                onChange={(e) => setVahaanHoldReason(e.target.value)}
                placeholder="Enter reason..."
                className="w-full p-2 border rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 block">Date</label>
              <Input
                type="date"
                value={vahaanHoldDate}
                onChange={(e) => setVahaanHoldDate(e.target.value)}
                className="w-full p-2 border rounded-lg"
              />
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowVahaanHoldModal(false)} className="px-4 py-2 text-xs rounded-lg">
              CANCEL
            </Button>
            <Button onClick={handleSaveVahaanHold} className="px-5 py-2 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-bold">
              SAVE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RTO Expense Popup Modal */}
      <Dialog open={showRtoExpenseModal} onOpenChange={(open) => { if (!open) handleCancelRtoExpense(); }}>
        <DialogContent className="max-w-md p-6 bg-white rounded-xl shadow-xl border border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              {pendingStatusChange?.isVahaan ? "RTO EXPENSE DETAILS" : "RTO EXPENSE & APPOINTMENT DETAILS"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 text-xs">
            {!pendingStatusChange?.isVahaan && (
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">New Appointment Date (DD/MM/YYYY)</label>
                <Input
                  type="text"
                  value={rtoApptDate}
                  onChange={(e) => {
                    let val = e.target.value.replace(/\D/g, "");
                    if (val.length > 8) val = val.slice(0, 8);
                    if (val.length > 4) {
                      val = `${val.slice(0, 2)}/${val.slice(2, 4)}/${val.slice(4)}`;
                    } else if (val.length > 2) {
                      val = `${val.slice(0, 2)}/${val.slice(2)}`;
                    }
                    setRtoApptDate(val);
                  }}
                  placeholder="DD/MM/YYYY"
                  className="w-full p-2 border rounded-lg"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 block">RTO Expense (Optional)</label>
              <Input
                type="number"
                value={rtoExpenseValue === 0 ? "" : rtoExpenseValue}
                onChange={(e) => setRtoExpenseValue(e.target.value === "" ? 0 : Number(e.target.value))}
                placeholder="Enter RTO expense amount..."
                className="w-full p-2 border rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 block">Who Paid?</label>
              <select
                value={rtoExpensePaidBy}
                onChange={(e) => setRtoExpensePaidBy(e.target.value)}
                className="w-full p-2 border rounded-lg bg-white"
              >
                <option value="">Select...</option>
                <option value="Bhaylubha">Bhaylubha</option>
                <option value="Shaktibhai">Shaktibhai</option>
              </select>
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleCancelRtoExpense} className="px-4 py-2 text-xs rounded-lg">
              CANCEL
            </Button>
            <Button onClick={handleSaveRtoExpense} className="px-5 py-2 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-bold">
              SAVE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Licence PASS details Modal */}
      <Dialog open={showLicencePassModal} onOpenChange={(open) => { if (!open) handleCancelLicencePass(); }}>
        <DialogContent className="max-w-md p-6 bg-white rounded-xl shadow-xl border border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              ENTER LICENCE DETAILS FOR PASS STATUS
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 block">LL / DL Number</label>
              <Input
                type="text"
                value={licNo}
                onChange={(e) => setLicNo(e.target.value)}
                placeholder="Enter licence number..."
                className="w-full p-2 border rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 block">Issue Date (DD/MM/YYYY)</label>
              <Input
                type="text"
                value={licIssueDate}
                onChange={(e) => {
                  let val = e.target.value.replace(/\D/g, "");
                  if (val.length > 8) val = val.slice(0, 8);
                  if (val.length > 4) {
                    val = `${val.slice(0, 2)}/${val.slice(2, 4)}/${val.slice(4)}`;
                  } else if (val.length > 2) {
                    val = `${val.slice(0, 2)}/${val.slice(2)}`;
                  }
                  setLicIssueDate(val);
                }}
                placeholder="DD/MM/YYYY"
                className="w-full p-2 border rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 block">Expiry / Validity Date (DD/MM/YYYY)</label>
              <Input
                type="text"
                value={licExpiryDate}
                onChange={(e) => {
                  let val = e.target.value.replace(/\D/g, "");
                  if (val.length > 8) val = val.slice(0, 8);
                  if (val.length > 4) {
                    val = `${val.slice(0, 2)}/${val.slice(2, 4)}/${val.slice(4)}`;
                  } else if (val.length > 2) {
                    val = `${val.slice(0, 2)}/${val.slice(2)}`;
                  }
                  setLicExpiryDate(val);
                }}
                placeholder="DD/MM/YYYY"
                className="w-full p-2 border rounded-lg"
              />
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleCancelLicencePass} className="px-4 py-2 text-xs rounded-lg">
              CANCEL
            </Button>
            <Button onClick={handleSaveLicencePass} className="px-5 py-2 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-bold">
              SAVE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
