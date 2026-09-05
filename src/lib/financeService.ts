// src/lib/financeService.ts
import { db } from "./firebase";
import { getSession } from "./auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  deleteDoc,
} from "firebase/firestore";
import { verifyAdminPin } from "./adminSecurity";
import { subscribeToAllInvoices } from "./billing";
import { toast } from "sonner";
import { invalidateCache } from "./cacheInvalidator";

export function handleFirestoreError(err: any, context: string) {
  console.error(`[Firestore Error: ${context}]`, err);
  if (err && (err.code === "failed-precondition" || err.message?.includes("index"))) {
    toast.error("Database index is being prepared. Please try again shortly.");
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinanceRecord {
  id: string; // Matches Invoice ID
  clientId: string;
  clientName: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceAmount: number;
  receivedAmount: number;
  balanceAmount: number;
  collectionDate: string; // YYYY-MM-DD
  paymentStatus: "Pending" | "Partially Paid" | "Paid";
  askBhaylubha: boolean;
  approvedBy?: string | null;
  approvedAt?: string | null;
  approvedRemarks?: string | null;
  receivedBy?: string | null;
  paymentMethod?: string | null;
  accountName?: string | null;
  remarks?: string | null;
  createdAt: string;
  updatedAt: string;
  assignedEmployee?: string;
  daysOverdue?: number;
}

export interface PaymentHistoryItem {
  id?: string;
  financeRecordId: string;
  invoiceId: string;
  amount: number;
  method: "Cash" | "UPI" | "Bank Transfer" | "Cheque" | "Online";
  receivedBy: string;
  receivedAt: string;
  accountName: "Cash Account" | "ICICI Bank" | "HDFC Bank" | "Axis Bank" | "SBI" | "Other";
  remarks: string;
  clientId?: string;
  clientName?: string;
  paymentDate?: string;
  paymentId?: string;
  referenceNumber?: string | null;
  allocations?: {
    invoiceId: string;
    invoiceNumber: string;
    allocatedAmount: number;
  }[];
}

/** Generate sequential Payment ID (e.g. PAY-001, PAY-002, etc.) */
export async function generatePaymentId(): Promise<string> {
  const col = collection(db, PAYMENTS_COL);
  const snap = await getDocs(col);
  let maxNum = 0;
  snap.forEach((d) => {
    const data = d.data();
    if (data.paymentId && data.paymentId.startsWith('PAY-')) {
      const numPart = parseInt(data.paymentId.replace('PAY-', ''), 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    }
  });
  const nextNum = maxNum + 1;
  return `PAY-${String(nextNum).padStart(3, '0')}`;
}

export interface LedgerEntry {
  id?: string;
  timestamp: string;
  type: "Debit" | "Credit";
  amount: number;
  account: string; // Cash, Bank, UPI, Cheque
  balance: number;
  referenceId: string; // Payment ID or Invoice ID
  remarks: string;
  clientId?: string;
}

export interface FinanceAuditLog {
  id?: string;
  action:
    | "Payment Added"
    | "Payment Updated"
    | "Invoice Deleted"
    | "Collection Date Changed"
    | "Approval Granted"
    | "Approval Removed";
  performedBy: string;
  timestamp: string;
  recordId: string;
  remarks: string;
}

// ─── Collections ──────────────────────────────────────────────────────────────

const FINANCE_COL = "finance_records";
const PAYMENTS_COL = "payment_history";
const LEDGER_COL = "accounts_ledger";
const AUDIT_COL = "finance_audit_logs";
const INVOICES_COL = "billing_invoices";

// ─── Audit Logger ─────────────────────────────────────────────────────────────

export async function logFinanceAction(
  action: FinanceAuditLog["action"],
  performedBy: string,
  recordId: string,
  remarks: string,
) {
  try {
    await addDoc(collection(db, AUDIT_COL), {
      action,
      performedBy,
      timestamp: new Date().toISOString(),
      recordId,
      remarks,
    });
  } catch (err) {
    console.error("[logFinanceAction] Failed:", err);
  }
}

// ─── Sync / Init Helpers ──────────────────────────────────────────────────────

/**
 * Ensures a finance record exists for a given invoice.
 * If not, creates one. Otherwise returns the existing one.
 */
export async function ensureFinanceRecord(invoice: any): Promise<FinanceRecord> {
  const receivedAmount = invoice.totalPaid || 0;
  const balanceAmount = invoice.totalAmount - receivedAmount;
  const paymentStatus: FinanceRecord["paymentStatus"] =
    balanceAmount === 0 ? "Paid" : receivedAmount > 0 ? "Partially Paid" : "Pending";

  return {
    id: invoice.id,
    clientId: invoice.clientId,
    clientName: invoice.clientName || "Unknown Client",
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceAmount: invoice.totalAmount,
    receivedAmount,
    balanceAmount,
    collectionDate: invoice.collectionDate || new Date(invoice.createdAt || Date.now()).toISOString().slice(0, 10),
    paymentStatus,
    askBhaylubha: !!invoice.askBhaylubha,
    createdAt: invoice.createdAt || new Date().toISOString(),
    updatedAt: invoice.createdAt || new Date().toISOString(),
    assignedEmployee: invoice.createdBy || "System",
  };
}

// ─── Finance Records Read ────────────────────────────────────────────────────

export function subscribeFinanceRecords(cb: (records: FinanceRecord[]) => void) {
  return subscribeAndSyncFinance(cb);
}

// ─── Collection Date Scheduling ──────────────────────────────────────────────

export async function updateRecordCollectionDate(
  recordId: string,
  date: string,
  performedBy: string,
) {
  // Update registry_services_v2 if exists
  const sRef = doc(db, "registry_services_v2", recordId);
  const sSnap = await getDoc(sRef);
  if (sSnap.exists()) {
    await updateDoc(sRef, {
      collectionDate: date,
      dueDate: date,
      updatedAt: new Date().toISOString(),
    });
  }

  const ref = doc(db, INVOICES_COL, recordId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const oldVal = snap.data().collectionDate || "None";
    await updateDoc(ref, {
      collectionDate: date,
      updatedAt: new Date().toISOString(),
    });
    await logFinanceAction(
      "Collection Date Changed",
      performedBy,
      recordId,
      `Changed collection date from ${oldVal} to ${date}`,
    );
  }
}

// ─── Bhaylubha Approval Logic ────────────────────────────────────────────────

export async function setBhaylubhaRequirement(
  recordId: string,
  required: boolean,
  performedBy: string,
) {
  // Update registry_services_v2 if exists
  const sRef = doc(db, "registry_services_v2", recordId);
  const sSnap = await getDoc(sRef);
  if (sSnap.exists()) {
    await updateDoc(sRef, {
      askBhaylubha: required,
      updatedAt: new Date().toISOString(),
    });
  }

  const ref = doc(db, INVOICES_COL, recordId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, {
      askBhaylubha: required,
      updatedAt: new Date().toISOString(),
    });

    await logFinanceAction(
      required ? "Approval Removed" : "Approval Granted",
      performedBy,
      recordId,
      required ? "Enabled Bhaylubha approval requirement" : "Disabled/Cleared Bhaylubha approval requirement",
    );
  }
}

export async function approveRecordBhaylubha(
  recordId: string,
  approvedBy: string,
  remarks: string,
) {
  // Update registry_services_v2 if exists
  const sRef = doc(db, "registry_services_v2", recordId);
  const sSnap = await getDoc(sRef);
  if (sSnap.exists()) {
    await updateDoc(sRef, {
      askBhaylubha: false,
      updatedAt: new Date().toISOString(),
    });
  }

  const ref = doc(db, INVOICES_COL, recordId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, {
      askBhaylubha: false, // Flag cleared when approved
      approvedBy,
      approvedAt: new Date().toISOString(),
      approvedRemarks: remarks,
      updatedAt: new Date().toISOString(),
    });

    await logFinanceAction(
      "Approval Granted",
      approvedBy,
      recordId,
      `Bhaylubha approval granted. Remarks: ${remarks}`,
    );
  }
}

// ─── Payment Entry Recording ─────────────────────────────────────────────────

export async function recordPaymentEntry(
  recordId: string,
  payment: Omit<PaymentHistoryItem, "financeRecordId" | "invoiceId" | "receivedAt"> & { paymentDate: string },
) {
  const session = getSession();
  if (!session || (session.role !== "admin" && session.role !== "manager")) {
    throw new Error("Access Denied: Employees are not authorized to record payments.");
  }
  // 1. Try finding in registry_services_v2
  const sRef = doc(db, "registry_services_v2", recordId);
  const sSnap = await getDoc(sRef);
  
  let targetInvoiceId = recordId;
  let clientName = payment.clientName || "Unknown Client";
  let clientId = payment.clientId || "";
  let invoiceNumber = "Service payment";

  if (sSnap.exists()) {
    const sData = sSnap.data() as any;
    const balanceAmount = sData.serviceAmount - (sData.amountReceived || 0);

    if (payment.amount > balanceAmount) {
      throw new Error(`Payment amount (₹${payment.amount}) exceeds remaining balance of ₹${balanceAmount}`);
    }
    if (payment.amount <= 0) {
      throw new Error("Payment amount must be greater than zero");
    }

    const newReceived = (sData.amountReceived || 0) + payment.amount;
    const newBalance = sData.serviceAmount - newReceived;

    await updateDoc(sRef, {
      amountReceived: newReceived,
      pendingAmount: newBalance,
      taskStatus: newBalance === 0 ? "Completed" : sData.taskStatus,
      updatedAt: new Date().toISOString(),
    });

    targetInvoiceId = sData.invoiceId || recordId;
    invoiceNumber = sData.invoiceNumber || invoiceNumber;
  }

  // 2. Also try updating invoice in billing_invoices or application in registry_applications_v1
  const cleanAppId = recordId.replace("app-fin-", "");
  const appRef = doc(db, "registry_applications_v1", cleanAppId);
  const appSnap = await getDoc(appRef);
  if (appSnap.exists()) {
    const aData = appSnap.data() as any;
    clientName = aData.ownerName || clientName;
    clientId = aData.id || clientId;
    invoiceNumber = aData.applicationId || aData.invoiceNumber || invoiceNumber;
    const totalAmount = aData.amount || 0;
    const currentPaid = aData.totalPaid || 0;
    const newPaid = currentPaid + payment.amount;
    const newPending = Math.max(0, totalAmount - newPaid);
    const newPaymentStatus = newPending === 0 && totalAmount > 0 ? "Paid" : newPaid > 0 ? "Partial" : "Pending";

    await updateDoc(appRef, {
      totalPaid: newPaid,
      pendingAmount: newPending,
      paymentStatus: newPaymentStatus,
      updatedAt: new Date().toISOString(),
    });
  }

  const ref = doc(db, INVOICES_COL, targetInvoiceId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data() as any;
    clientName = data.clientName;
    clientId = data.clientId;
    invoiceNumber = data.invoiceNumber;
    const balanceAmount = data.totalAmount - (data.totalPaid || 0);

    const newReceived = (data.totalPaid || 0) + payment.amount;
    const newBalance = data.totalAmount - newReceived;
    const newStatus = newBalance === 0 ? "Paid" : newReceived > 0 ? "Partially Paid" : "Pending";

    await updateDoc(ref, {
      totalPaid: newReceived,
      status: newStatus,
      receivedBy: payment.receivedBy,
      paymentMethod: payment.method,
      accountName: payment.accountName,
      remarks: payment.remarks,
      updatedAt: new Date().toISOString(),
    });

    // Proportional allocation to services in invoice payload
    if (data.services && data.services.length > 0) {
      for (const sItem of data.services) {
        const sId = sItem.serviceId;
        if (!sId) continue;
        const innerSRef = doc(db, "registry_services_v2", sId);
        const innerSSnap = await getDoc(innerSRef);
        if (innerSSnap.exists()) {
          const innerSData = innerSSnap.data() as any;
          const serviceRatio = sItem.total / data.totalAmount;
          const allocatedAmount = Math.round(payment.amount * serviceRatio);
          const newSReceived = Math.min(sItem.total, (innerSData.amountReceived || 0) + allocatedAmount);
          const newSPending = Math.max(0, sItem.total - newSReceived);
          await updateDoc(innerSRef, {
            amountReceived: newSReceived,
            pendingAmount: newSPending,
            taskStatus: newSPending === 0 ? "Completed" : innerSData.taskStatus,
          });
        }
      }
    }
  }

  // 3. Create payment history and ledger entries
  const timestamp = payment.paymentDate ? new Date(payment.paymentDate).toISOString() : new Date().toISOString();
  const payId = await generatePaymentId();
  const payCol = collection(db, PAYMENTS_COL);
  const payDocRef = doc(payCol);

  await setDoc(payDocRef, {
    paymentId: payId,
    clientId,
    clientName,
    financeRecordId: recordId,
    invoiceId: targetInvoiceId,
    amount: payment.amount,
    method: payment.method,
    receivedBy: payment.receivedBy,
    receivedAt: timestamp,
    accountName: payment.accountName,
    remarks: payment.remarks,
    referenceNumber: payment.referenceNumber || null,
    allocations: [{
      invoiceId: targetInvoiceId,
      invoiceNumber: invoiceNumber,
      allocatedAmount: payment.amount,
    }],
  });

  await recordLedgerEntry({
    timestamp,
    type: "Debit",
    amount: payment.amount,
    account: payment.accountName,
    referenceId: payDocRef.id,
    remarks: `Payment for Service/Invoice ${invoiceNumber}. Recv by ${payment.receivedBy}`,
    clientId,
  });

  await logFinanceAction(
    "Payment Added",
    payment.receivedBy,
    targetInvoiceId,
    `Added payment of ₹${payment.amount} via ${payment.method} into ${payment.accountName} (ID: ${payId})`,
  );
  invalidateCache();
}

/** Record payment allocated across multiple invoices */
export async function recordMultiInvoicePayment(
  clientId: string,
  clientName: string,
  allocations: { invoiceId: string; amount: number }[],
  payment: Omit<PaymentHistoryItem, "financeRecordId" | "invoiceId" | "receivedAt"> & { paymentDate: string },
) {
  const session = getSession();
  if (!session || (session.role !== "admin" && session.role !== "manager")) {
    throw new Error("Access Denied: Employees are not authorized to record payments.");
  }
  const batch = writeBatch(db);
  const timestamp = new Date(payment.paymentDate).toISOString();
  const payId = await generatePaymentId();

  const payCol = collection(db, PAYMENTS_COL);
  const payDocRef = doc(payCol);

  const detailedAllocations: { invoiceId: string; invoiceNumber: string; allocatedAmount: number }[] = [];

  for (const alloc of allocations) {
    if (alloc.amount <= 0) continue;

    const invoiceRef = doc(db, INVOICES_COL, alloc.invoiceId);
    const iSnap = await getDoc(invoiceRef);
    if (!iSnap.exists()) continue;
    const iData = iSnap.data() as any;

    detailedAllocations.push({
      invoiceId: alloc.invoiceId,
      invoiceNumber: iData.invoiceNumber,
      allocatedAmount: alloc.amount,
    });

    const newReceived = (iData.totalPaid || 0) + alloc.amount;
    const newBalance = iData.totalAmount - newReceived;
    const newStatus = newBalance === 0 ? "Paid" : newReceived > 0 ? "Partially Paid" : "Pending";

    // Keep invoice in sync directly
    batch.update(invoiceRef, {
      status: newStatus,
      totalPaid: newReceived,
      receivedBy: payment.receivedBy,
      paymentMethod: payment.method,
      accountName: payment.accountName,
      remarks: payment.remarks,
      updatedAt: timestamp,
    });

    // Add ledger entry
    const ledgerCol = collection(db, LEDGER_COL);
    const ledgerDocRef = doc(ledgerCol);
    
    batch.set(ledgerDocRef, {
      timestamp,
      type: "Debit",
      amount: alloc.amount,
      account: payment.accountName,
      referenceId: payDocRef.id,
      remarks: `Payment allocation for Invoice ${iData.invoiceNumber}. Recv by ${payment.receivedBy}`,
      clientId,
    });
  }

  // Save the single payment record
  batch.set(payDocRef, {
    paymentId: payId,
    clientId,
    clientName,
    financeRecordId: allocations.length === 1 ? allocations[0].invoiceId : "multi",
    invoiceId: allocations.length === 1 ? allocations[0].invoiceId : "multi",
    amount: payment.amount,
    method: payment.method,
    receivedBy: payment.receivedBy,
    receivedAt: timestamp,
    accountName: payment.accountName,
    remarks: payment.remarks || "Multi-invoice Payment Allocation",
    referenceNumber: payment.referenceNumber || null,
    allocations: detailedAllocations,
  });

  await batch.commit();

  await logFinanceAction(
    "Payment Added",
    payment.receivedBy,
    clientId,
    `Multi-invoice payment allocated. Total: ₹${payment.amount} (ID: ${payId})`,
  );
  invalidateCache();
}

/** Record direct payment with no invoice linked */
export async function recordDirectPayment(
  clientId: string,
  clientName: string,
  payment: Omit<PaymentHistoryItem, "financeRecordId" | "invoiceId" | "receivedAt"> & { paymentDate: string },
) {
  const session = getSession();
  if (!session || (session.role !== "admin" && session.role !== "manager")) {
    throw new Error("Access Denied: Employees are not authorized to record payments.");
  }
  const timestamp = new Date(payment.paymentDate).toISOString();
  const payId = await generatePaymentId();
  
  const payCol = collection(db, PAYMENTS_COL);
  const payDocRef = doc(payCol);
  
  await setDoc(payDocRef, {
    paymentId: payId,
    clientId,
    clientName,
    financeRecordId: "non-invoiced",
    invoiceId: "non-invoiced",
    amount: payment.amount,
    method: payment.method,
    receivedBy: payment.receivedBy,
    receivedAt: timestamp,
    accountName: payment.accountName,
    remarks: payment.remarks || "Direct Non-Invoiced Payment",
    referenceNumber: payment.referenceNumber || null,
    allocations: [],
  });

  // Create accounts ledger entry
  await recordLedgerEntry({
    timestamp,
    type: "Debit",
    amount: payment.amount,
    account: payment.accountName,
    referenceId: payDocRef.id,
    remarks: `Direct Payment from ${clientName}. Recv by ${payment.receivedBy}`,
    clientId,
  });

  await logFinanceAction(
    "Payment Added",
    payment.receivedBy,
    "non-invoiced",
    `Added direct payment of ₹${payment.amount} from ${clientName} via ${payment.method} (ID: ${payId})`,
  );
}

// ─── Accounts Ledger ─────────────────────────────────────────────────────────

export async function recordLedgerEntry(entry: Omit<LedgerEntry, "balance">) {
  // To compute the running balance, we query all ledger entries for this account
  const col = collection(db, LEDGER_COL);
  const q = query(col, where("account", "==", entry.account), orderBy("timestamp", "asc"));
  
  let currentBalance = 0;
  try {
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const data = d.data() as LedgerEntry;
      if (data.type === "Debit") {
        currentBalance += data.amount;
      } else {
        currentBalance -= data.amount;
      }
    });
  } catch (err: any) {
    console.warn("[recordLedgerEntry] Index query failed, falling back to 0 baseline balance:", err);
    if (err && (err.code === "failed-precondition" || err.message?.includes("index"))) {
      toast.error("Database index is being prepared. Ledger running balance may temporarily default to 0.");
    }
  }

  // Apply this transaction
  if (entry.type === "Debit") {
    currentBalance += entry.amount;
  } else {
    currentBalance -= entry.amount;
  }

  await addDoc(col, {
    ...entry,
    balance: currentBalance,
  });
}

export function subscribeLedgerEntries(cb: (entries: LedgerEntry[]) => void) {
  return onSnapshot(
    query(collection(db, LEDGER_COL), orderBy("timestamp", "desc")),
    (snapshot) => {
      const list: LedgerEntry[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as LedgerEntry);
      });
      cb(list);
    },
    (err) => handleFirestoreError(err, "subscribeLedgerEntries"),
  );
}

// ─── Payments History Read ────────────────────────────────────────────────────

export function subscribePaymentHistory(cb: (payments: PaymentHistoryItem[]) => void) {
  return onSnapshot(
    query(collection(db, PAYMENTS_COL), orderBy("receivedAt", "desc")),
    (snapshot) => {
      const list: PaymentHistoryItem[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as PaymentHistoryItem);
      });
      cb(list);
    },
    (err) => handleFirestoreError(err, "subscribePaymentHistory"),
  );
}

// ─── Secure Invoice Deletion ─────────────────────────────────────────────────

export async function deleteInvoiceSecured(
  invoiceId: string,
  pin: string,
  reason: string,
  userId: string,
  userRole: string,
) {
  if (userRole !== "admin" && userRole !== "manager") {
    throw new Error("Permission Denied: Only Admin or Manager users can delete invoices.");
  }

  const ok = await verifyAdminPin(pin);
  if (!ok) {
    throw new Error("Invalid Admin PIN");
  }

  const invoiceRef = doc(db, INVOICES_COL, invoiceId);
  const invoiceSnap = await getDoc(invoiceRef);
  if (!invoiceSnap.exists()) {
    throw new Error("Invoice not found");
  }
  const invData = invoiceSnap.data();

  const batch = writeBatch(db);

  // 1. Delete billing payments
  const paymentsSnap = await getDocs(
    query(collection(db, "billing_invoice_payments"), where("invoiceId", "==", invoiceId)),
  );
  paymentsSnap.forEach((d) => {
    batch.delete(d.ref);
  });

  // 2. Delete payment_history payments and collect their IDs for ledger deletion
  const paymentsSnap2 = await getDocs(collection(db, PAYMENTS_COL));
  const deletedPaymentIds: string[] = [];
  paymentsSnap2.forEach((d) => {
    const data = d.data();
    if (data.invoiceId === invoiceId) {
      batch.delete(d.ref);
      deletedPaymentIds.push(d.id || d.ref.id);
    } else if (data.allocations?.some((alloc: any) => alloc.invoiceId === invoiceId)) {
      const updatedAllocations = data.allocations.filter((alloc: any) => alloc.invoiceId !== invoiceId);
      const newAmount = updatedAllocations.reduce((sum: number, a: any) => sum + a.allocatedAmount, 0);
      if (updatedAllocations.length === 0) {
        batch.delete(d.ref);
        deletedPaymentIds.push(d.id || d.ref.id);
      } else {
        batch.update(d.ref, {
          amount: newAmount,
          allocations: updatedAllocations
        });
      }
    }
  });

  // 3. Delete accounts_ledger entries for deleted payments
  for (const pid of deletedPaymentIds) {
    const ledgerSnap = await getDocs(
      query(collection(db, LEDGER_COL), where("referenceId", "==", pid))
    );
    ledgerSnap.forEach((d) => {
      batch.delete(d.ref);
    });
  }

  // 4. Delete invoice itself
  batch.delete(invoiceRef);

  await batch.commit();
  invalidateCache();

  // Log to audit log
  await logFinanceAction(
    "Invoice Deleted",
    userId,
    invoiceId,
    `Deleted Invoice ${invData.invoiceNumber || invoiceId}. Reason: ${reason}`,
  );
}

// ─── Audit Log Read ──────────────────────────────────────────────────────────

export function subscribeAuditLogs(cb: (logs: FinanceAuditLog[]) => void) {
  return onSnapshot(
    query(collection(db, AUDIT_COL), orderBy("timestamp", "desc")),
    (snapshot) => {
      const list: FinanceAuditLog[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as FinanceAuditLog);
      });
      cb(list);
    },
    (err) => handleFirestoreError(err, "subscribeAuditLogs"),
  );
}

export function subscribeAndSyncFinance(cb: (records: FinanceRecord[]) => void) {
  return subscribeToAllInvoices((invoices) => {
    const list: FinanceRecord[] = invoices.map((inv) => {
      const receivedAmount = inv.totalPaid || 0;
      const balanceAmount = inv.totalAmount - receivedAmount;
      const paymentStatus: FinanceRecord["paymentStatus"] =
        balanceAmount === 0 ? "Paid" : receivedAmount > 0 ? "Partially Paid" : "Pending";

      let daysOverdue = 0;
      const collectionDate = inv.collectionDate || new Date(inv.createdAt || Date.now()).toISOString().slice(0, 10);
      if (paymentStatus !== "Paid" && collectionDate) {
        const due = new Date(collectionDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        due.setHours(0, 0, 0, 0);
        if (today.getTime() > due.getTime()) {
          daysOverdue = Math.ceil((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        }
      }

      return {
        id: inv.id,
        clientId: inv.clientId,
        clientName: inv.clientName || "Unknown Client",
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceAmount: inv.totalAmount,
        receivedAmount,
        balanceAmount,
        collectionDate,
        paymentStatus,
        askBhaylubha: !!inv.askBhaylubha,
        createdAt: inv.createdAt,
        updatedAt: inv.createdAt,
        assignedEmployee: inv.createdBy || "System",
        daysOverdue,
      };
    });
    cb(list);
  });
}

/**
 * Synchronize client advance payment: creates/updates/deletes placeholder invoice,
 * payment history, and ledger records based on client's advance payment value.
 */
/**
 * Synchronize service advance payment: creates/updates/deletes payment history
 * and ledger records based on service's advance payment value.
 */
export async function syncServiceAdvancePayment(
  service: any,
  clientId: string,
  clientName: string,
  clientMobile: string,
  clientAddress: string,
  actorName: string = "System"
): Promise<void> {
  const invoiceId = service.invoiceId || service.id;
  const invoiceNumber = service.invoiceNumber || "Pending Invoice";
  
  const paymentId = `pay_service_${service.id}`;
  const ledgerId = `ledger_service_${service.id}`;

  const paymentRef = doc(db, PAYMENTS_COL, paymentId);
  const ledgerRef = doc(db, LEDGER_COL, ledgerId);

  const now = new Date().toISOString();
  const advancePayment = Number(service.advancePayment) || 0;

  if (advancePayment > 0) {
    // 1. Create or update payment history record
    await setDoc(paymentRef, {
      paymentId: `PAY-${service.id.slice(-6).toUpperCase()}`,
      clientId,
      clientName,
      financeRecordId: invoiceId,
      invoiceId: invoiceId,
      amount: advancePayment,
      method: service.paymentMethod || "Cash",
      receivedBy: actorName,
      receivedAt: service.paymentDate || now,
      accountName: "Cash Account",
      remarks: service.remarks || `${service.serviceType} Service Advance Payment`,
      referenceNumber: service.receiptNumber || null,
      allocations: [{
        invoiceId: invoiceId,
        invoiceNumber: invoiceNumber,
        allocatedAmount: advancePayment,
      }],
    });

    // 2. Create or update Ledger entry
    await setDoc(ledgerRef, {
      timestamp: service.paymentDate || now,
      type: "Debit",
      amount: advancePayment,
      account: "Cash Account",
      referenceId: paymentId,
      remarks: service.remarks || `Advance Payment for ${service.serviceType} - Client: ${clientName}`,
      balance: advancePayment,
      clientId,
    });
  } else {
    // If advance payment is 0, delete the payment and ledger entries if they exist
    await deleteDoc(paymentRef);
    await deleteDoc(ledgerRef);
  }
}

/**
 * Recalculates subtotal, totalPaid, and status of an invoice based on its linked services.
 * Deletes the invoice if no services remain.
 */
export async function syncInvoiceWithServices(invoiceId: string): Promise<void> {
  if (!invoiceId || invoiceId === "none" || invoiceId.startsWith("advance_")) return;
  const invoiceRef = doc(db, INVOICES_COL, invoiceId);
  const invoiceSnap = await getDoc(invoiceRef);
  if (!invoiceSnap.exists()) return;

  const invoiceData = invoiceSnap.data() as any;

  // Fetch all services linked to this invoice
  const qServices = query(
    collection(db, "registry_services_v2"),
    where("invoiceId", "==", invoiceId)
  );
  const servicesSnap = await getDocs(qServices);
  const servicesList = servicesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as any);

  if (servicesList.length === 0) {
    // If no services left on this invoice, delete the invoice completely
    await deleteDoc(invoiceRef);
    return;
  }

  // Recalculate totals
  const subtotal = servicesList.reduce((sum, s) => sum + (s.serviceAmount || 0), 0);
  const totalPaid = servicesList.reduce((sum, s) => sum + (s.amountReceived || 0) + (s.advancePayment || 0), 0);
  const tax = invoiceData.totalTax || 0;
  const finalTotalAmount = subtotal + tax;

  const status = totalPaid >= finalTotalAmount ? "Paid" : totalPaid > 0 ? "Partially Paid" : "Pending";

  const updatedInvoiceServices = servicesList.map((s) => ({
    serviceId: s.id,
    serviceName: s.serviceType,
    quantity: 1,
    unitPrice: s.serviceAmount || 0,
    amount: s.serviceAmount || 0,
    tax: 0,
    total: s.serviceAmount || 0,
  }));

  await updateDoc(invoiceRef, {
    subtotal,
    totalAmount: finalTotalAmount,
    totalPaid,
    status,
    services: updatedInvoiceServices,
  });
}

