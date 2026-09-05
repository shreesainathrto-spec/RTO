import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  getDocs,
  getDoc,
  deleteDoc,
  runTransaction,
  limit,
} from "firebase/firestore";
import { db } from "./firebase";
import { removeUndefined } from "./records";
import { getSession } from "./auth";
import { syncInvoice } from "./billing";
import { saveClient } from "./hierarchy";

export const APPLICATIONS_COL = "registry_applications_v1";
export const VEHICLES_CENTRIC_COL = "registry_vehicles_master_v1";
export const ACCOUNTING_COL = "registry_accounting";

export interface AccountingRecord {
  id: string;
  applicationId: string;
  applicationDocId?: string;
  clientId?: string;
  clientName?: string;
  ownerName?: string;
  mobileNumber?: string;
  vehicleNumber?: string;
  employee?: string;
  assignedEmployeeName?: string;
  serviceCount?: number;
  selectedServices?: string[] | string;
  totalCharges?: number;
  advancePaid?: number;
  rtoReceipt?: number;
  outstanding?: number;
  rtoExpense?: number;
  profit?: number;
  taskId?: string;
  employeeId?: string;
  employeeName?: string;
  totalPayment: number;
  advancePayment: number;
  remainingPayment: number;
  paymentStatus: "Paid" | "Partially Paid" | "Pending";
  createdAt?: string;
  updatedAt?: string;
  applicationType?: string;
}

export function subscribeAccountingRecords(
  callback: (recordsMap: Map<string, AccountingRecord>) => void
): () => void {
  const q = query(collection(db, ACCOUNTING_COL));
  return onSnapshot(
    q,
    (snap) => {
      const map = new Map<string, AccountingRecord>();
      snap.docs.forEach((d) => {
        const data = d.data() as AccountingRecord;
        const rec = { ...data, id: d.id };
        map.set(d.id, rec);
        if (data.applicationId) {
          map.set(data.applicationId, rec);
        }
        if (data.applicationDocId) {
          map.set(data.applicationDocId, rec);
        }
      });
      callback(map);
    },
    (err) => {
      console.error("Error subscribing to accounting records:", err);
      callback(new Map());
    }
  );
}

export async function saveAccountingRecord(payload: AccountingRecord): Promise<void> {
  const docId = payload.applicationDocId || payload.id || payload.applicationId;
  if (!docId) return;
  const ref = doc(db, ACCOUNTING_COL, docId);
  const now = new Date().toISOString();
  await setDoc(
    ref,
    removeUndefined({
      ...payload,
      id: docId,
      updatedAt: now,
    }),
    { merge: true }
  );
}

export async function syncAccountingRecord(
  appDocId: string,
  updates: {
    rtoExpense?: number;
    rtoReceipt?: number;
    employeeName?: string;
    applicationId?: string;
    vehicleNumber?: string;
    ownerName?: string;
  }
): Promise<void> {
  if (!appDocId) return;

  const appRef = doc(db, APPLICATIONS_COL, appDocId);
  const accRef = doc(db, ACCOUNTING_COL, appDocId);

  const [appSnap, accSnap] = await Promise.all([
    getDoc(appRef),
    getDoc(accRef)
  ]);

  const appData = appSnap.exists() ? appSnap.data() : {};
  const accData = accSnap.exists() ? accSnap.data() : {};

  // Resolve totalCharges and advancePaid
  const totalCharges = Number(accData.totalCharges ?? appData.totalFee ?? appData.amount ?? 0);
  const advancePaid = Number(accData.advancePaid ?? appData.totalAdvance ?? appData.totalPaid ?? 0);

  // Resolve RTO Expense
  const rtoExpense = Number(updates.rtoExpense ?? accData.rtoExpense ?? appData.rtoExpense ?? 0);

  // Resolve RTO Receipt
  const rtoReceipt = Number(updates.rtoReceipt ?? accData.rtoReceipt ?? accData.rtoReceiptAmount ?? appData.rtoReceiptAmount ?? 0);

  const outstanding = Math.max(0, totalCharges - advancePaid);
  const profit = outstanding - rtoReceipt - rtoExpense;

  const payload = {
    id: appDocId,
    applicationDocId: appDocId,
    applicationId: updates.applicationId || accData.applicationId || appData.applicationId || appDocId,
    vehicleNumber: updates.vehicleNumber || accData.vehicleNumber || appData.vehicleNumber || "",
    ownerName: updates.ownerName || accData.ownerName || appData.ownerName || appData.clientName || "",
    employeeName: updates.employeeName || accData.employeeName || appData.assignedEmployeeName || appData.assignee || "Unassigned",
    totalCharges,
    advancePaid,
    rtoReceipt,
    rtoReceiptAmount: rtoReceipt,
    outstanding,
    rtoExpense,
    profit,
    updatedAt: new Date().toISOString(),
  };

  await setDoc(accRef, removeUndefined(payload), { merge: true });
  console.log("✅ Synchronized accounting record for:", appDocId, payload);
}

export interface TrackExpirySettings {
  puc?: boolean;
  tax?: boolean;
  permit?: boolean;
  insurance?: boolean;
  fitness?: boolean;
}

export interface VehicleMaster {
  id: string;
  vehicleNumber: string;
  phone: string;
  ownerName: string;
  fatherHusbandName: string;
  coName?: string;
  groupName?: string;
  address: string;
  registrationDate: string;
  chassisNumber: string;
  engineNumber: string;
  fuelType: string;
  vehicleClass: string;
  makerName: string;
  modelName: string;
  colour: string;
  bodyType: string;
  seatingCapacity: number;
  grossWeight: number;
  unladenWeight: number;
  payload: number;
  horsePower: string;
  cylinderCount: number;
  pucExpiryDate: string;
  taxDetails?: {
    isLumpsum: boolean;
    issueDate?: string;
    expiryDate?: string;
    amount?: number;
    period?: string;
    receiptUrl?: string;
    rcUrl?: string;
  };
  fitnessDetails?: {
    issueDate?: string;
    expiryDate?: string;
    documentUrl?: string;
  };
  insuranceDetails?: {
    company?: string;
    policyNumber?: string;
    policyType?: string;
    issueDate?: string;
    expiryDate?: string;
    amount?: number;
    insurancePlace?: string;
    documentUrl?: string;
    policySubCategory?: string;
    vehicleType?: string;
    agent?: string;
    insuranceAgency?: string;
    reference?: string;
    fuelType?: string;
    vehicleRegistrationNumber?: string;
    vehicleModelDetails?: string;
    premiumExclGst?: number;
    gstAmount?: number;
    totalPremium?: number;
    insurerCommission?: number;
    clientDiscount?: number;
    netCommission?: number;
  };
  permitDetails?: {
    permitType?: "Gujarat Permit" | "National Permit" | "National Permit(Gujrat Permit)" | "National Permit Authorization" | string;
    issueDate?: string;
    expiryDate?: string;
    gujaratPermitIssueDate?: string;
    gujaratPermitExpiryDate?: string;
    nationalPermitIssueDate?: string;
    nationalPermitExpiryDate?: string;
    nationalAuthIssueDate?: string;
    nationalAuthExpiryDate?: string;
    documentUrl?: string;
  };
  registrationDetails?: {
    dateOfRegistration?: string;
    registrationValidity?: string;
  };
  trackExpiry?: TrackExpirySettings;
  documents?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ServiceAccountingItem {
  serviceName: string;
  totalAmount: number;
  advancePayment: number;
  pendingAmount: number;
}

export interface LicenseDetailsData {
  subModule?: "services" | "licence" | "driving_school" | "insurance";
  dateOfBirth?: string;
  isDrivingSchoolHolder?: boolean;
  newLearningLicence?: {
    enabled: boolean;
    appointmentDate?: string;
    applicationNo?: string;
    classOfVehicle?: string[];
    totalAmount?: number | string;
    advanceAmount?: number | string;
    step1?: {
      llNumber?: string;
      issueDate?: string;
      expiryDate?: string;
      classOfVehicle?: string[];
    };
    step2?: {
      dlNumber?: string;
      issueDate?: string;
      expiryDate?: string;
      validityDate?: string;
      vehicleTypes?: { nt?: boolean; tr?: boolean; hazardous?: boolean };
      classOfVehicle?: string[];
    };
  };
  dlNewLlEndorsement?: {
    enabled: boolean;
    applicationNo?: string;
    totalAmount?: number | string;
    advanceAmount?: number | string;
    step1?: {
      dlNumber?: string;
      issueDate?: string;
      validityDate?: string;
      vehicleTypes?: { nt?: boolean; tr?: boolean; hazardous?: boolean };
      classOfVehicle?: string;
    };
    step2?: {
      llNumber?: string;
      issueDate?: string;
      expiryDate?: string;
      classOfVehicle?: string;
    };
    step3?: {
      dlNumber?: string;
      issueDate?: string;
      validityDate?: string;
      vehicleTypes?: { nt?: boolean; tr?: boolean; hazardous?: boolean };
      classOfVehicle?: string;
    };
  };
  llRenewClass?: {
    enabled: boolean;
    appointmentDate?: string;
    applicationNo?: string;
    totalAmount?: number | string;
    advanceAmount?: number | string;
    step1?: { llNumber?: string; issueDate?: string; expiryDate?: string; classOfVehicle?: string[] };
    step2?: { dlNumber?: string; issueDate?: string; validityDate?: string; classOfVehicle?: string[] };
    step3?: { dlNumber?: string; issueDate?: string; validityDate?: string; classOfVehicle?: string[] };
  };
  dlRenewRetest?: {
    enabled: boolean;
    applicationNo?: string;
    totalAmount?: number | string;
    advanceAmount?: number | string;
    step1?: { dlNumber?: string; issueDate?: string; validityDate?: string; appNo1?: string };
    step2?: { llNumber?: string; issueDate?: string; expiryDate?: string; appNo2?: string };
    step3?: { dlNumber?: string; issueDate?: string; validityDate?: string; appNo1?: string };
  };
  generalLicenceServices?: {
    selectedServices?: string[];
    serviceAccounting?: Record<string, { totalAmount: number | string; advanceAmount: number | string }>;
    changeDobData?: {
      dlNumber?: string;
      classOfVehicle?: string;
      issueDate?: string;
      validityDate?: string;
      vehicleTypes?: { nt?: boolean; tr?: boolean; hazardous?: boolean };
      newDob?: string;
    };
    dlNumber?: string;
    classOfVehicle?: string[];
    issueDate?: string;
    validityDate?: string;
    vehicleTypes?: { nt?: boolean; tr?: boolean; hazardous?: boolean };
    ntValidity?: string;
    trValidity?: string;
    hazardousValidity?: string;
    hazardousTrainingValidity?: string;
    internationalLicenceValidity?: string;
  };
}

export interface Form5DetailsData {
  form5Type: "new_hgv" | "renew_hgv" | "";
  name?: string;
  dlNumber?: string;
  applicationNo?: string;
  dateOfBirth?: string;
  llNumber?: string;
  llIssueDate?: string;
  llExpiryDate?: string;
  ntValidityDate?: string;
  trValidityDate?: string;
  aadhaarNumber?: string;
}

export interface ApplicationRecord {
  id: string;
  applicationId: string;
  vehicleId: string;
  vehicleNumber: string;
  ownerName: string;
  mobileNumber: string;
  dateOfBirth?: string;
  services: string[];
  subModule?: "services" | "licence" | "driving_school" | "insurance" | "form5";
  licenseDetails?: LicenseDetailsData;
  form5Details?: Form5DetailsData;
  serviceAccounting?: Record<string, ServiceAccountingItem>;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  applicationStatus: "Draft" | "Submitted" | "In Review" | "Approved" | "Rejected" | "On Hold";
  paymentStatus: "Paid" | "Pending" | "Partial";
  amount: number;
  totalPaid?: number;
  pendingAmount?: number;
  invoiceId?: string;
  invoiceNumber?: string;
  expiryDate?: string;
  allExpiries?: Array<{ title: string; date: string }>;
  remarks?: string;
  reminder?: string;
  dueDate?: string;
  priority?: "Low" | "Medium" | "High" | "Urgent";
  createTaskAuto?: boolean;
  documents?: Record<string, string>;
  applicationType?: string;
  trackExpiry?: TrackExpirySettings;
  vehicleDetails: VehicleMaster;
  // Special Services fields
  pucExpiryDate?: string;
  pucCharges?: number;
  pucRemarks?: string;
  insuranceCompany?: string;
  insurancePolicyNumber?: string;
  insuranceExpiryDate?: string;
  insuranceCharges?: number;
  insuranceRemarks?: string;
  taxExpiryDate?: string;
  taxCharges?: number;
  taxRemarks?: string;
  fitnessExpiryDate?: string;
  fitnessCharges?: number;
  fitnessRemarks?: string;
  permitType?: "National" | "Gujarat" | string;
  npAuth?: boolean;
  permitExpiryDate?: string;
  permitCharges?: number;
  permitRemarks?: string;
  nationalPermitExpiryDate?: string;
  gujaratPermitExpiryDate?: string;
  npAuthExpiryDate?: string;
  registrationRenewalExpiryDate?: string;
  registrationRenewalCharges?: number;
  registrationRenewalRemarks?: string;
  specialServicesDetails?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  historyId?: string;
  accountingId?: string;
  taskId?: string;
  activityLogs?: any[];
  templateId?: string;
  groupName?: string;
  totalCourseFees?: number;
  advancePaid?: number;
  isDeleted?: boolean;
  selectedServices?: string[];
  appointmentDate?: string;
}

export function computePermitExpiry(permitType: string, issueDate: string): string {
  if (!issueDate) return "";
  const date = new Date(issueDate);
  if (isNaN(date.getTime())) return "";

  if (permitType === "Gujarat Permit" || permitType === "National Permit" || permitType === "National Permit(Gujrat Permit)") {
    date.setFullYear(date.getFullYear() + 5);
  } else if (permitType === "National Permit Authorization") {
    date.setFullYear(date.getFullYear() + 1);
  } else {
    date.setFullYear(date.getFullYear() + 5);
  }
  return date.toISOString().split("T")[0];
}

export async function fetchVehicleByNumber(vehicleNumber: string): Promise<VehicleMaster | null> {
  const cleanNumber = vehicleNumber.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!cleanNumber) return null;

  try {
    const q = query(
      collection(db, VEHICLES_CENTRIC_COL),
      where("vehicleNumberClean", "==", cleanNumber)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docData = snap.docs[0].data();
      return { id: snap.docs[0].id, ...docData } as VehicleMaster;
    }
  } catch (err) {
    console.error("Error fetching vehicle by number:", err);
  }
  return null;
}

export function subscribeApplications(
  callback: (apps: ApplicationRecord[]) => void
): () => void {
  const q = query(collection(db, APPLICATIONS_COL), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const apps = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ApplicationRecord));
      callback(apps);
    },
    (err) => {
      console.error("Error subscribing applications:", err);
      callback([]);
    }
  );
}

export async function saveApplicationAndVehicle(
  appData: Omit<ApplicationRecord, "id" | "applicationId" | "createdAt" | "updatedAt">,
  existingAppId?: string
): Promise<string> {
  const session = getSession();
  const now = new Date().toISOString();
  const cleanVehicleNo = appData.vehicleNumber.trim().toUpperCase().replace(/[\s-]/g, "");

  let templateSubtasks: any[] = [];
  if (appData.templateId) {
    try {
      const tplSnap = await getDoc(doc(db, "task_templates", appData.templateId));
      if (tplSnap.exists()) {
        const tplData = tplSnap.data();
        if (Array.isArray(tplData?.subtasks)) {
          templateSubtasks = tplData.subtasks.map((title: string) => ({
            id: crypto.randomUUID(),
            title,
            completed: false,
            status: "Read",
            createdAt: now,
          }));
        }
      }
    } catch (err) {
      console.error("Error loading template for task creation:", err);
    }
  }

  const vehicleRef = doc(db, VEHICLES_CENTRIC_COL, cleanVehicleNo);
  const vehiclePayload = removeUndefined({
    ...appData.vehicleDetails,
    id: cleanVehicleNo,
    vehicleNumber: appData.vehicleNumber,
    vehicleNumberClean: cleanVehicleNo,
    ownerName: appData.ownerName,
    phone: appData.mobileNumber,
    pucExpiryDate: appData.pucExpiryDate || appData.vehicleDetails?.pucExpiryDate || "",
    insuranceDetails: appData.insuranceCompany || appData.insuranceExpiryDate ? {
      company: appData.insuranceCompany || "",
      policyNumber: appData.insurancePolicyNumber || "",
      expiryDate: appData.insuranceExpiryDate || "",
      amount: appData.insuranceCharges || 0,
      remarks: appData.insuranceRemarks || "",
    } : appData.vehicleDetails?.insuranceDetails,
    taxDetails: appData.taxExpiryDate ? {
      expiryDate: appData.taxExpiryDate || "",
      amount: appData.taxCharges || 0,
      remarks: appData.taxRemarks || "",
    } : appData.vehicleDetails?.taxDetails,
    fitnessDetails: appData.fitnessExpiryDate ? {
      expiryDate: appData.fitnessExpiryDate || "",
      amount: appData.fitnessCharges || 0,
      remarks: appData.fitnessRemarks || "",
    } : appData.vehicleDetails?.fitnessDetails,
    permitDetails: appData.permitExpiryDate || appData.permitType ? {
      permitType: appData.permitType || "",
      expiryDate: appData.permitExpiryDate || "",
      nationalPermitExpiryDate: appData.nationalPermitExpiryDate || "",
      gujaratPermitExpiryDate: appData.gujaratPermitExpiryDate || "",
      nationalAuthExpiryDate: appData.npAuthExpiryDate || "",
      remarks: appData.permitRemarks || "",
    } : appData.vehicleDetails?.permitDetails,
    registrationDetails: appData.registrationRenewalExpiryDate ? {
      registrationValidity: appData.registrationRenewalExpiryDate,
    } : appData.vehicleDetails?.registrationDetails,
    trackExpiry: appData.trackExpiry || appData.vehicleDetails?.trackExpiry,
    updatedAt: now,
    updatedBy: session?.name || "System",
  });

  const totAmt = Number(appData.amount) || 0;
  const advAmt = Number(appData.totalPaid) || 0;
  const remAmt = typeof appData.pendingAmount === "number" ? appData.pendingAmount : Math.max(0, totAmt - advAmt);
  const pStatus: "Paid" | "Partially Paid" | "Pending" = remAmt <= 0 ? "Paid" : advAmt > 0 ? "Partially Paid" : "Pending";
  const servicesList = appData.services || [];
  const joinedServices = servicesList.join(", ");

  let finalAppId = existingAppId;
  let generatedAppIdStr = "";

  if (!finalAppId) {
    // ─── CREATE NEW APPLICATION: SINGLE FIRESTORE TRANSACTION ────────────
    generatedAppIdStr = (appData as any).applicationId || "";

    const newAppRef = doc(collection(db, APPLICATIONS_COL));
    finalAppId = newAppRef.id;

    const newTaskRef = doc(collection(db, "registry_tasks"));
    const newAccountingRef = doc(db, ACCOUNTING_COL, finalAppId);
    const newHistoryRef = doc(collection(db, "history"));

    const newAppPayload = removeUndefined({
      ...appData,
      id: finalAppId,
      applicationId: generatedAppIdStr,
      vehicleId: cleanVehicleNo,
      taskId: newTaskRef.id,
      accountingId: finalAppId,
      historyId: newHistoryRef.id,
      createdAt: now,
      updatedAt: now,
      createdBy: session?.name || "System",
    });

    const serviceCards = servicesList.map((srv) => ({
      id: `card-${Math.random().toString(36).substring(2, 9)}`,
      taskName: `${srv} - ${appData.vehicleNumber}`,
      serviceName: srv,
      description: `Processing ${srv} for vehicle ${appData.vehicleNumber}`,
      templateId: "",
    }));

    const newTaskPayload = removeUndefined({
      id: newTaskRef.id,
      taskId: newTaskRef.id,
      parentApplicationId: finalAppId,
      title: `${joinedServices || "Application Services"} - ${appData.vehicleNumber}`,
      serviceName: joinedServices,
      serviceType: joinedServices,
      services: servicesList,
      serviceCards: serviceCards,
      applicationDocId: finalAppId,
      applicationId: generatedAppIdStr,
      applicationType: appData.applicationType || "Home",
      vehicleId: cleanVehicleNo,
      vehicleNumber: appData.vehicleNumber,
      ownerName: appData.ownerName,
      ownerPhone: appData.mobileNumber,
      clientName: appData.ownerName || "",
      mobileNumber: appData.mobileNumber || "",
      phone: appData.mobileNumber || "",
      assignedEmployeeName: appData.assignedEmployeeName || "Unassigned",
      assignee: appData.assignedEmployeeName || "Unassigned",
      assignedEmployeeId: appData.assignedEmployeeId || "",
      assignedEmployeeUid: appData.assignedEmployeeId || "",
      reference: `${generatedAppIdStr} - ${appData.vehicleNumber}`,
      trackExpiry: appData.trackExpiry || appData.vehicleDetails?.trackExpiry,
      remarks: appData.remarks || "",
      dueDate: appData.dueDate || "",
      priority: appData.priority || "Medium",
      documents: appData.documents || {},
      subModule: appData.subModule || "services",
      licenseDetails: appData.licenseDetails,
      issueDate: now,
      createdDate: now,
      createdAt: now,
      createdBy: session?.name || "System",
      manual: false,
      status: appData.applicationStatus === "On Hold" ? "On Hold" : "Read",
      done: false,
      associationType: "application",
      bucket: "applications",
      pucExpiryDate: appData.pucExpiryDate || "",
      taxExpiryDate: appData.taxExpiryDate || "",
      fitnessExpiryDate: appData.fitnessExpiryDate || "",
      insuranceExpiryDate: appData.insuranceExpiryDate || "",
      nationalPermitExpiryDate: appData.nationalPermitExpiryDate || "",
      gujaratPermitExpiryDate: appData.gujaratPermitExpiryDate || "",
      npAuthExpiryDate: appData.npAuthExpiryDate || "",
      registrationRenewalExpiryDate: appData.registrationRenewalExpiryDate || "",
      totalCharges: totAmt,
      advancePaid: advAmt,
      rtoExpense: 0,
      updatedAt: now,
      templateId: appData.templateId || "",
      subtasks: templateSubtasks,
      progress: 0,
    });

    const newAccountingPayload = removeUndefined({
      id: finalAppId,
      applicationId: generatedAppIdStr,
      applicationDocId: finalAppId,
      clientId: finalAppId,
      clientName: appData.ownerName || "",
      ownerName: appData.ownerName || "",
      mobileNumber: appData.mobileNumber || "",
      vehicleNumber: appData.vehicleNumber || "",
      employee: appData.assignedEmployeeName || "Unassigned",
      assignedEmployeeName: appData.assignedEmployeeName || "Unassigned",
      employeeId: appData.assignedEmployeeId || "",
      employeeName: appData.assignedEmployeeName || "Unassigned",
      taskId: newTaskRef.id,
      serviceCount: servicesList.length,
      selectedServices: servicesList,
      totalCharges: Math.max(0, totAmt),
      advancePaid: Math.max(0, advAmt),
      rtoReceipt: 0,
      outstanding: Math.max(0, totAmt - advAmt),
      rtoExpense: 0,
      profit: Math.max(0, totAmt - advAmt),
      totalPayment: totAmt,
      advancePayment: advAmt,
      remainingPayment: Math.max(0, totAmt - advAmt),
      paymentStatus: pStatus,
      createdAt: now,
      updatedAt: now,
    });

    const newHistoryPayload = removeUndefined({
      id: newHistoryRef.id,
      historyId: newHistoryRef.id,
      applicationId: generatedAppIdStr,
      applicationDocId: finalAppId,
      vehicleNumber: appData.vehicleNumber,
      ownerName: appData.ownerName,
      mobileNumber: appData.mobileNumber,
      services: servicesList,
      status: appData.applicationStatus,
      createdAt: now,
      updatedAt: now,
    });

    await runTransaction(db, async (transaction) => {
      const vehSnap = await transaction.get(vehicleRef);
      if (!vehSnap.exists()) {
        vehiclePayload.createdAt = now;
        transaction.set(vehicleRef, vehiclePayload);
      } else {
        transaction.set(vehicleRef, vehiclePayload, { merge: true });
      }

      transaction.set(newAppRef, newAppPayload);
      transaction.set(newTaskRef, newTaskPayload);
      transaction.set(newAccountingRef, newAccountingPayload);
      transaction.set(newHistoryRef, newHistoryPayload);
    });

  } else {
    // ─── UPDATE EXISTING APPLICATION ATOMICALLY: SINGLE FIRESTORE TRANSACTION ───
    const appRef = doc(db, APPLICATIONS_COL, finalAppId);
    const accRef = doc(db, ACCOUNTING_COL, finalAppId);

    // Reads first outside transaction to resolve existing IDs
    const appSnap = await getDoc(appRef);
    if (appSnap.exists()) {
      generatedAppIdStr = appSnap.data()?.applicationId || finalAppId;
    } else {
      generatedAppIdStr = finalAppId;
    }

    let existingTaskId = appSnap.exists() ? appSnap.data()?.taskId || "" : "";
    if (!existingTaskId) {
      const q1 = query(collection(db, "registry_tasks"), where("applicationDocId", "==", finalAppId));
      const snap1 = await getDocs(q1);
      if (!snap1.empty) {
        existingTaskId = snap1.docs[0].id;
      } else {
        const q2 = query(collection(db, "registry_tasks"), where("recordId", "==", finalAppId));
        const snap2 = await getDocs(q2);
        if (!snap2.empty) {
          existingTaskId = snap2.docs[0].id;
        }
      }
    }

    let taskRef;
    if (existingTaskId) {
      taskRef = doc(db, "registry_tasks", existingTaskId);
    } else {
      taskRef = doc(collection(db, "registry_tasks"));
      existingTaskId = taskRef.id;
    }

    let existingHistoryId = appSnap.exists() ? appSnap.data()?.historyId || "" : "";
    if (!existingHistoryId) {
      const q1 = query(collection(db, "history"), where("applicationDocId", "==", finalAppId));
      const snap1 = await getDocs(q1);
      if (!snap1.empty) {
        existingHistoryId = snap1.docs[0].id;
      } else {
        const q2 = query(collection(db, "history"), where("recordId", "==", finalAppId));
        const snap2 = await getDocs(q2);
        if (!snap2.empty) {
          existingHistoryId = snap2.docs[0].id;
        } else if (generatedAppIdStr) {
          const q3 = query(collection(db, "history"), where("applicationId", "==", generatedAppIdStr));
          const snap3 = await getDocs(q3);
          if (!snap3.empty) {
            existingHistoryId = snap3.docs[0].id;
          }
        }
      }
    }

    let historyRef;
    if (existingHistoryId) {
      historyRef = doc(db, "history", existingHistoryId);
    } else {
      historyRef = doc(collection(db, "history"));
      existingHistoryId = historyRef.id;
    }

    // Find RTO Completed Service Ref if any
    let serviceDocId = "";
    const srvQ = query(collection(db, "registry_services_v2"), where("applicationDocId", "==", finalAppId));
    const srvSnap = await getDocs(srvQ);
    if (!srvSnap.empty) {
      serviceDocId = srvSnap.docs[0].id;
    }

    // Transaction execution
    await runTransaction(db, async (transaction) => {
      const tAppSnap = await transaction.get(appRef);
      const tAccSnap = await transaction.get(accRef);
      const tVehSnap = await transaction.get(vehicleRef);
      const tTaskSnap = await transaction.get(taskRef);
      const tHistSnap = await transaction.get(historyRef);

      const existingAcc = tAccSnap.exists() ? tAccSnap.data() : null;
      const rtoReceipt = existingAcc?.rtoReceipt !== undefined ? Number(existingAcc.rtoReceipt) || 0 : 0;
      const rtoExpense = existingAcc?.rtoExpense !== undefined ? Number(existingAcc.rtoExpense) || 0 : 0;
      const outstanding = Math.max(0, totAmt - advAmt - rtoReceipt);
      const profit = outstanding - rtoExpense;

      const oldApp = tAppSnap.exists() ? tAppSnap.data() || {} : {};
      const newLogs: any[] = [];
      const actorName = session?.name || session?.username || "System";

      const compareAndLog = (fieldKey: string, label: string) => {
        const oldVal = oldApp[fieldKey];
        const newVal = (appData as any)[fieldKey];
        if (newVal !== undefined && String(oldVal || "") !== String(newVal || "")) {
          newLogs.push({
            id: crypto.randomUUID(),
            actor: actorName,
            action: `Updated ${label}`,
            field: label,
            oldValue: String(oldVal || "—"),
            newValue: String(newVal || "—"),
            timestamp: now,
          });
        }
      };

      compareAndLog("ownerName", "Owner Name");
      compareAndLog("mobileNumber", "Mobile Number");
      compareAndLog("vehicleNumber", "Vehicle Number");
      compareAndLog("assignedEmployeeName", "Assigned Employee");
      compareAndLog("applicationStatus", "Application Status");
      compareAndLog("amount", "Total Amount");
      compareAndLog("totalPaid", "Advance Paid");
      compareAndLog("applicationType", "Application Type");
      compareAndLog("remarks", "Remarks");

      // Compare nested vehicleDetails fields
      const oldVeh = oldApp.vehicleDetails || {};
      const newVeh = appData.vehicleDetails || {};
      const compareVehAndLog = (fieldKey: string, label: string) => {
        const oldVal = (oldVeh as any)[fieldKey];
        const newVal = (newVeh as any)[fieldKey];
        if (newVal !== undefined && String(oldVal || "") !== String(newVal || "")) {
          newLogs.push({
            id: crypto.randomUUID(),
            actor: actorName,
            action: `Updated ${label}`,
            field: label,
            oldValue: String(oldVal || "—"),
            newValue: String(newVal || "—"),
            timestamp: now,
          });
        }
      };

      compareVehAndLog("colour", "Vehicle Colour");
      compareVehAndLog("chassisNumber", "Chassis Number");
      compareVehAndLog("engineNumber", "Engine Number");
      compareVehAndLog("makerName", "Maker Name");
      compareVehAndLog("modelName", "Model Name");
      compareVehAndLog("vehicleClass", "Vehicle Class");
      compareVehAndLog("bodyType", "Body Type");
      compareVehAndLog("fuelType", "Fuel Type");
      compareVehAndLog("seatingCapacity", "Seating Capacity");
      compareVehAndLog("fatherHusbandName", "Father/Husband Name");

      const oldServices = oldApp.services || [];
      const newServices = appData.services || [];
      if (JSON.stringify(oldServices) !== JSON.stringify(newServices)) {
        newLogs.push({
          id: crypto.randomUUID(),
          actor: actorName,
          action: "Updated Services",
          field: "Services",
          oldValue: oldServices.join(", ") || "—",
          newValue: newServices.join(", ") || "—",
          timestamp: now,
        });
      }

      if (newLogs.length === 0) {
        newLogs.push({
          id: crypto.randomUUID(),
          actor: actorName,
          action: "Application edited",
          timestamp: now,
        });
      }

      const existingTaskData = tTaskSnap.exists() ? tTaskSnap.data() || {} : {};
      const existingActivityLogs = existingTaskData.activityLogs || existingTaskData.activity || [];
      const updatedActivityLogs = [...existingActivityLogs, ...newLogs];

      const existingAppLogs = oldApp.activityLogs || oldApp.activity || [];
      const updatedAppLogs = [...existingAppLogs, ...newLogs];

      const updateAppPayload = removeUndefined({
        ...appData,
        vehicleId: cleanVehicleNo,
        taskId: existingTaskId,
        accountingId: finalAppId,
        historyId: existingHistoryId,
        updatedAt: now,
        updatedBy: session?.name || "System",
        activityLogs: updatedAppLogs,
      });

      const taskPayload = removeUndefined({
        title: `${joinedServices || "Application Services"} - ${appData.vehicleNumber}`,
        serviceName: joinedServices,
        serviceType: joinedServices,
        services: servicesList,
        applicationDocId: finalAppId,
        applicationId: generatedAppIdStr,
        parentApplicationId: finalAppId,
        applicationType: appData.applicationType || "Home",
        vehicleId: cleanVehicleNo,
        vehicleNumber: appData.vehicleNumber,
        ownerName: appData.ownerName,
        ownerPhone: appData.mobileNumber,
        clientName: appData.ownerName || "",
        mobileNumber: appData.mobileNumber || "",
        phone: appData.mobileNumber || "",
        assignedEmployeeName: appData.assignedEmployeeName || "Unassigned",
        assignee: appData.assignedEmployeeName || "Unassigned",
        assignedEmployeeId: appData.assignedEmployeeId || "",
        assignedEmployeeUid: appData.assignedEmployeeId || "",
        reference: `${generatedAppIdStr} - ${appData.vehicleNumber}`,
        trackExpiry: appData.trackExpiry || appData.vehicleDetails?.trackExpiry,
        remarks: appData.remarks || "",
        dueDate: appData.dueDate || "",
        priority: appData.priority || "Medium",
        documents: appData.documents || {},
        subModule: appData.subModule || "services",
        licenseDetails: appData.licenseDetails,
        pucExpiryDate: appData.pucExpiryDate || "",
        taxExpiryDate: appData.taxExpiryDate || "",
        fitnessExpiryDate: appData.fitnessExpiryDate || "",
        insuranceExpiryDate: appData.insuranceExpiryDate || "",
        nationalPermitExpiryDate: appData.nationalPermitExpiryDate || "",
        gujaratPermitExpiryDate: appData.gujaratPermitExpiryDate || "",
        npAuthExpiryDate: appData.npAuthExpiryDate || "",
        registrationRenewalExpiryDate: appData.registrationRenewalExpiryDate || "",
        totalCharges: totAmt,
        advancePaid: advAmt,
        updatedAt: now,
        activityLogs: updatedActivityLogs,
        templateId: appData.templateId || existingTaskData.templateId || "",
        ...( (appData.templateId && (existingTaskData.templateId !== appData.templateId || !existingTaskData.subtasks?.length)) ? { subtasks: templateSubtasks, progress: 0 } : {}),
      });

      if (!tTaskSnap.exists()) {
        (taskPayload as any).id = existingTaskId;
        (taskPayload as any).taskId = existingTaskId;
        (taskPayload as any).createdAt = now;
        (taskPayload as any).createdDate = now;
        (taskPayload as any).manual = false;
        (taskPayload as any).status = appData.applicationStatus === "On Hold" ? "On Hold" : "Read";
        (taskPayload as any).taskStatus = appData.applicationStatus === "On Hold" ? "On Hold" : "Read";
        (taskPayload as any).done = false;
        (taskPayload as any).associationType = "application";
        (taskPayload as any).bucket = "applications";
      }

      const accPayload = removeUndefined({
        id: finalAppId,
        applicationId: generatedAppIdStr,
        applicationDocId: finalAppId,
        clientId: finalAppId,
        clientName: appData.ownerName || "",
        ownerName: appData.ownerName || "",
        mobileNumber: appData.mobileNumber || "",
        vehicleNumber: appData.vehicleNumber || "",
        employee: appData.assignedEmployeeName || "Unassigned",
        assignedEmployeeName: appData.assignedEmployeeName || "Unassigned",
        employeeId: existingAcc?.employeeId || appData.assignedEmployeeId || "",
        employeeName: existingAcc?.employeeName || appData.assignedEmployeeName || "Unassigned",
        taskId: existingTaskId,
        serviceCount: servicesList.length,
        selectedServices: servicesList,
        totalCharges: Math.max(0, totAmt),
        advancePaid: Math.max(0, advAmt),
        rtoReceipt,
        outstanding,
        rtoExpense,
        profit,
        totalPayment: totAmt,
        advancePayment: advAmt,
        remainingPayment: outstanding,
        paymentStatus: pStatus,
        updatedAt: now,
      });

      if (!tAccSnap.exists()) {
        (accPayload as any).createdAt = now;
      }

      const historyPayload = removeUndefined({
        id: existingHistoryId,
        historyId: existingHistoryId,
        applicationId: generatedAppIdStr,
        applicationDocId: finalAppId,
        vehicleNumber: appData.vehicleNumber,
        ownerName: appData.ownerName,
        mobileNumber: appData.mobileNumber,
        services: servicesList,
        status: appData.applicationStatus,
        updatedAt: now,
      });

      if (!tHistSnap.exists()) {
        (historyPayload as any).createdAt = now;
      }

      // 1. Update/Merge Vehicle document
      transaction.set(vehicleRef, vehiclePayload, { merge: true });
      // 2. Update/Merge Application document
      transaction.set(appRef, updateAppPayload, { merge: true });
      // 3. Update/Merge Task document
      transaction.set(taskRef, taskPayload, { merge: true });
      // 4. Update/Merge Accounting document
      transaction.set(accRef, accPayload, { merge: true });
      // 5. Update/Merge History document
      transaction.set(historyRef, historyPayload, { merge: true });

      // 6. Update Completed RTO Service Entry if exists
      if (serviceDocId) {
        const srvRef = doc(db, "registry_services_v2", serviceDocId);
        const srvPayload = removeUndefined({
          id: serviceDocId,
          status: "Completed",
          taskStatus: "Completed",
          rtoExpense,
          remarks: appData.remarks || "",
          notes: appData.remarks || "",
          applicationId: generatedAppIdStr,
          applicationType: appData.applicationType || "Home",
          updatedAt: now,
          title: `${joinedServices || "Application Services"} - ${appData.vehicleNumber}`,
          serviceName: joinedServices,
          serviceType: joinedServices,
          services: servicesList,
          applicationDocId: finalAppId,
          vehicleId: cleanVehicleNo,
          vehicleNumber: appData.vehicleNumber,
          ownerName: appData.ownerName,
          ownerPhone: appData.mobileNumber,
          clientName: appData.ownerName || "",
          mobileNumber: appData.mobileNumber || "",
          phone: appData.mobileNumber || "",
          assignedEmployeeName: appData.assignedEmployeeName || "Unassigned",
          assignee: appData.assignedEmployeeName || "Unassigned",
          assignedEmployeeId: appData.assignedEmployeeId || "",
          assignedEmployeeUid: appData.assignedEmployeeId || "",
          reference: `${generatedAppIdStr} - ${appData.vehicleNumber}`,
          pucExpiryDate: appData.pucExpiryDate || "",
          taxExpiryDate: appData.taxExpiryDate || "",
          fitnessExpiryDate: appData.fitnessExpiryDate || "",
          insuranceExpiryDate: appData.insuranceExpiryDate || "",
          nationalPermitExpiryDate: appData.nationalPermitExpiryDate || "",
          gujaratPermitExpiryDate: appData.gujaratPermitExpiryDate || "",
          npAuthExpiryDate: appData.npAuthExpiryDate || "",
          registrationRenewalExpiryDate: appData.registrationRenewalExpiryDate || "",
          totalCharges: totAmt,
          advancePaid: advAmt,
          subModule: appData.subModule || "services",
          licenseDetails: appData.licenseDetails,
        });
        transaction.set(srvRef, srvPayload, { merge: true });
      }
    });
  }

  // Auto-sync invoice with application details
  await syncInvoice(finalAppId, appData.subModule || "services").catch((err) => {
    console.error("Failed to sync invoice inside saveApplicationAndVehicle:", err);
  });

  // Auto-sync customer / client section
  await saveClient({
    id: finalAppId,
    name: appData.ownerName || (appData as any).clientName || "Client",
    mobile: appData.mobileNumber || (appData as any).phone || (appData as any).mobile || "",
    address: appData.vehicleDetails?.address || (appData as any).address || "",
    companyName: appData.vehicleDetails?.groupName || (appData as any).groupName || "",
    notes: appData.remarks || "",
    type: "client",
    ownerName: appData.ownerName || (appData as any).clientName || "Client",
    groupName: appData.vehicleDetails?.groupName || (appData as any).groupName || "",
  }).catch((err) => {
    console.error("Failed to auto-sync client inside saveApplicationAndVehicle:", err);
  });

  return finalAppId;
}

export async function deleteApplication(id: string): Promise<void> {
  const session = getSession();
  if (!session || (session.role !== "admin" && session.role !== "manager")) {
    throw new Error("Access Denied: Only Admin or Manager can delete applications.");
  }
  try {
    const appRef = doc(db, APPLICATIONS_COL, id);
    const appSnap = await getDoc(appRef);
    const generatedAppIdStr = appSnap.exists() ? appSnap.data()?.applicationId : "";
    const vehicleNo = appSnap.exists() ? appSnap.data()?.vehicleNumber : "";
    const cleanVehicleNo = vehicleNo ? vehicleNo.trim().toUpperCase().replace(/[\s-]/g, "") : "";

    // 1. Delete Application Document
    await deleteDoc(appRef);

    // 2. Check if any remaining application exists for this vehicle; if not, delete vehicle master doc
    if (cleanVehicleNo) {
      const remainingQuery = query(
        collection(db, APPLICATIONS_COL),
        where("vehicleId", "==", cleanVehicleNo)
      );
      const remainingSnap = await getDocs(remainingQuery);
      if (remainingSnap.empty) {
        const vehDocRef = doc(db, VEHICLES_CENTRIC_COL, cleanVehicleNo);
        await deleteDoc(vehDocRef).catch(console.error);
      }
    }

    // 3. Delete linked tasks from registry_tasks
    const taskDocsToDelete = new Map();
    if (id) {
      const q1 = query(collection(db, "registry_tasks"), where("applicationDocId", "==", id));
      const s1 = await getDocs(q1);
      s1.docs.forEach((d) => taskDocsToDelete.set(d.id, d.ref));

      const q2 = query(collection(db, "registry_tasks"), where("recordId", "==", id));
      const s2 = await getDocs(q2);
      s2.docs.forEach((d) => taskDocsToDelete.set(d.id, d.ref));
    }
    if (generatedAppIdStr && generatedAppIdStr.trim() !== "" && generatedAppIdStr !== "undefined" && generatedAppIdStr !== "null") {
      const q3 = query(collection(db, "registry_tasks"), where("applicationId", "==", generatedAppIdStr));
      const s3 = await getDocs(q3);
      s3.docs.forEach((d) => taskDocsToDelete.set(d.id, d.ref));
    }

    const taskDirect1 = doc(db, "registry_tasks", id);
    const taskDirect1Snap = await getDoc(taskDirect1);
    if (taskDirect1Snap.exists()) taskDocsToDelete.set(id, taskDirect1);

    const taskDirect2 = doc(db, "registry_tasks", `task-app-${id}`);
    const taskDirect2Snap = await getDoc(taskDirect2);
    if (taskDirect2Snap.exists()) taskDocsToDelete.set(`task-app-${id}`, taskDirect2);

    for (const tRef of taskDocsToDelete.values()) {
      await deleteDoc(tRef);
    }

    // 4. Delete linked services from registry_services_v2
    const serviceDocsToDelete = new Map();
    if (id) {
      const q1 = query(collection(db, "registry_services_v2"), where("applicationDocId", "==", id));
      const s1 = await getDocs(q1);
      s1.docs.forEach((d) => serviceDocsToDelete.set(d.id, d.ref));

      const q2 = query(collection(db, "registry_services_v2"), where("recordId", "==", id));
      const s2 = await getDocs(q2);
      s2.docs.forEach((d) => serviceDocsToDelete.set(d.id, d.ref));
    }
    if (generatedAppIdStr && generatedAppIdStr.trim() !== "" && generatedAppIdStr !== "undefined" && generatedAppIdStr !== "null") {
      const q3 = query(collection(db, "registry_services_v2"), where("applicationId", "==", generatedAppIdStr));
      const s3 = await getDocs(q3);
      s3.docs.forEach((d) => serviceDocsToDelete.set(d.id, d.ref));
    }

    const srvDirect1 = doc(db, "registry_services_v2", id);
    const srvDirect1Snap = await getDoc(srvDirect1);
    if (srvDirect1Snap.exists()) serviceDocsToDelete.set(id, srvDirect1);

    const srvDirect2 = doc(db, "registry_services_v2", `task-app-${id}`);
    const srvDirect2Snap = await getDoc(srvDirect2);
    if (srvDirect2Snap.exists()) serviceDocsToDelete.set(`task-app-${id}`, srvDirect2);

    for (const sRef of serviceDocsToDelete.values()) {
      await deleteDoc(sRef);
    }

    // 5. Delete linked accounting records from registry_accounting
    await deleteDoc(doc(db, "registry_accounting", id)).catch(console.error);

    // 6. Delete linked history/dashboard records from history
    const historyDocsToDelete = new Map();
    if (id) {
      const hq1 = query(collection(db, "history"), where("applicationDocId", "==", id));
      const hs1 = await getDocs(hq1);
      hs1.docs.forEach((d) => historyDocsToDelete.set(d.id, d.ref));
    }
    if (generatedAppIdStr && generatedAppIdStr.trim() !== "" && generatedAppIdStr !== "undefined" && generatedAppIdStr !== "null") {
      const hq2 = query(collection(db, "history"), where("applicationId", "==", generatedAppIdStr));
      const hs2 = await getDocs(hq2);
      hs2.docs.forEach((d) => historyDocsToDelete.set(d.id, d.ref));
    }
    for (const hRef of historyDocsToDelete.values()) {
      await deleteDoc(hRef).catch(console.error);
    }

    // 7. Delete linked billing invoices from billing_invoices
    const invoiceDocsToDelete = new Map();
    if (id) {
      const invQ1 = query(collection(db, "billing_invoices"), where("applicationDocId", "==", id));
      const invS1 = await getDocs(invQ1);
      invS1.docs.forEach((d) => invoiceDocsToDelete.set(d.id, d.ref));

      const invQ2 = query(collection(db, "billing_invoices"), where("clientId", "==", id));
      const invS2 = await getDocs(invQ2);
      invS2.docs.forEach((d) => invoiceDocsToDelete.set(d.id, d.ref));
    }
    for (const invRef of invoiceDocsToDelete.values()) {
      await deleteDoc(invRef).catch(console.error);
    }
  } catch (err) {
    console.error("Error in deleteApplication:", err);
    throw err;
  }
}

export async function searchExistingApplication(
  subModule: "services" | "insurance" | "licence" | "form5" | "driving_school",
  lookupKey: string | { ownerName?: string; studentName?: string; mobileNumber: string }
): Promise<any | null> {
  try {
    const colName = subModule === "driving_school" ? "DrivingSchoolApplications" : "registry_applications_v1";
    let q;
    
    if (subModule === "services") {
      const vehicleNum = typeof lookupKey === "string" ? lookupKey.trim().toUpperCase() : "";
      if (!vehicleNum) return null;
      q = query(
        collection(db, colName),
        where("vehicleNumber", "==", vehicleNum)
      );
    } else {
      const keys = lookupKey as { ownerName?: string; studentName?: string; mobileNumber: string };
      const mobile = (keys.mobileNumber || "").trim();
      if (!mobile) return null;
      q = query(
        collection(db, colName),
        where("mobileNumber", "==", mobile)
      );
    }
    
    const snap = await getDocs(q);
    if (snap.empty) return null;
    
    const records = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter(docData => {
        if (docData.archived === true || docData.isArchived === true) return false;
        
        if (subModule === "services") {
          return docData.subModule === "services";
        } else if (subModule === "insurance") {
          const name = ((lookupKey as any).ownerName || "").trim().toLowerCase();
          return docData.subModule === "insurance" && (docData.ownerName || "").trim().toLowerCase() === name;
        } else if (subModule === "licence") {
          const name = ((lookupKey as any).ownerName || "").trim().toLowerCase();
          return docData.subModule === "licence" && (docData.ownerName || "").trim().toLowerCase() === name;
        } else if (subModule === "form5") {
          const name = ((lookupKey as any).ownerName || "").trim().toLowerCase();
          return docData.subModule === "form5" && (docData.ownerName || "").trim().toLowerCase() === name;
        } else if (subModule === "driving_school") {
          const name = ((lookupKey as any).studentName || "").trim().toLowerCase();
          return (docData.studentName || "").trim().toLowerCase() === name;
        }
        return false;
      });
      
    if (records.length === 0) return null;
    
    records.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    });
    
    return records[0];
  } catch (err) {
    console.error("Error in searchExistingApplication:", err);
    return null;
  }
}
