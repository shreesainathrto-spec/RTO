import { db, storage } from "./firebase";
import {
  addDoc,
  deleteDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  Timestamp,
  updateDoc,
  where,
  setDoc,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { logClientActivity } from "./activity";
import { removeUndefined, type RegistryRecord } from "./records";
import { toast } from "sonner";
import { invalidateCache } from "./cacheInvalidator";

export function handleFirestoreError(err: any, context: string) {
  console.error(`[Firestore Error: ${context}]`, err);
  if (err && (err.code === "failed-precondition" || err.message?.includes("index"))) {
    toast.error("Database index is being prepared. Please try again shortly.");
  }
}

export type InvoiceServiceItem = {
  serviceId: string;
  serviceName: string;
  vehicleNumber?: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  tax: number;
  total: number;
};

export type InvoiceStatus = "Pending" | "Partially Paid" | "Paid" | "Cancelled";

export type Invoice = {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  clientMobile?: string;
  clientAddress?: string;
  vehicleNumber?: string;
  vehicleType?: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  subtotal: number;
  totalTax: number;
  totalAmount: number;
  totalPaid: number;
  invoiceDate: string;
  createdBy: string;
  createdAt: string;
  status: InvoiceStatus;
  services: InvoiceServiceItem[];
  pdfUrl?: string | null;
  collectionDate?: string | null;
  askBhaylubha?: boolean;
  amountPaid?: number;
  paymentMethod?: string;
  notes?: string;
  subModule?: string;
  rtoReceipt?: number;
  rtoExpense?: number;
  profit?: number;
  assignedEmployee?: string;
};

export type InvoicePayment = {
  id: string;
  invoiceId: string;
  amount: number;
  paymentMode: string;
  receivedBy: string;
  referenceNumber?: string | null;
  notes?: string | null;
  createdAt: string;
  paymentDate?: string;
  amountReceived?: number;
  paymentMethod?: string;
  receivedInAccount?: string;
  remarks?: string;
};

export interface BillingMetrics {
  totalInvoiced: number;
  totalCollected: number;
  outstandingAmount: number;
  invoicesThisMonth: number;
  pendingInvoices: number;
  overdueInvoices: number;
  collectionRate: number;
}

export interface BillingPeriodInfo {
  invoiceId: string;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
}

const BILLING_INVOICES_COL = "billing_invoices";
const BILLING_INVOICE_PAYMENTS_COL = "billing_invoice_payments";
const COUNTERS_COL = "counters";
const PDF_STORAGE_FOLDER = "billing_invoices";
const INVOICE_NUMBER_PADDING = 4;

function padNumber(value: number, size = INVOICE_NUMBER_PADDING) {
  return value.toString().padStart(size, "0");
}

function dateToIsoString(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseBillingDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as any).toDate === "function"
  ) {
    const date = (value as any).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const isoRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
  const dmyRegex = /^(\d{2})-(\d{2})-(\d{4})$/;
  const dmySlashRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;

  let match = isoRegex.exec(raw);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  match = dmyRegex.exec(raw) || dmySlashRegex.exec(raw);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function formatBillingDate(value: unknown): string {
  const date = parseBillingDate(value);
  return date ? dateToIsoString(date) : "";
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function normalizeIsoDate(value: unknown): Date | null {
  return parseBillingDate(value);
}

async function getNextInvoiceNumber(year: number) {
  const counterRef = doc(db, COUNTERS_COL, `billing_invoices-${year}`);
  const nextCount = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef as any);
    let current = 0;
    if (snap.exists()) {
      const data = snap.data() as { last?: number };
      current = typeof data.last === "number" ? data.last : 0;
    }

    const next = current + 1;
    tx.set(counterRef as any, { last: next }, { merge: true });
    return next;
  });

  return `INV-${year}-${padNumber(nextCount)}`;
}

export async function getLatestBillingPeriod(clientId: string): Promise<BillingPeriodInfo | null> {
  const q = query(collection(db, BILLING_INVOICES_COL), where("clientId", "==", clientId));
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const invoices = snap.docs
    .map((docSnap) => docSnap.data() as Invoice)
    .filter((invoice) => !!invoice.billingPeriodEnd)
    .sort((a, b) => {
      const dateA = normalizeIsoDate(a.billingPeriodEnd)?.getTime() ?? 0;
      const dateB = normalizeIsoDate(b.billingPeriodEnd)?.getTime() ?? 0;
      return dateB - dateA;
    });

  const latest = invoices[0];
  if (!latest) return null;

  return {
    invoiceId:
      snap.docs.find((docSnap) => {
        const invoice = docSnap.data() as Invoice;
        return (
          invoice.invoiceNumber === latest.invoiceNumber &&
          invoice.billingPeriodEnd === latest.billingPeriodEnd
        );
      })?.id || "",
    invoiceNumber: latest.invoiceNumber,
    periodStart: latest.billingPeriodStart,
    periodEnd: latest.billingPeriodEnd,
  };
}

export async function getNextBillingStartDate(clientId: string): Promise<string> {
  const latest = await getLatestBillingPeriod(clientId);
  if (!latest) {
    return dateToIsoString(new Date());
  }

  const lastEnd = normalizeIsoDate(latest.periodEnd);
  if (!lastEnd) {
    return dateToIsoString(new Date());
  }

  return dateToIsoString(addDaysUtc(lastEnd, 1));
}

/**
 * Calculates the total invoice amount dynamically for a client and selected services.
 * Fetches all vehicles for the client, and filters their services by the selected service types.
 */
export async function calculateInvoiceAmount(
  clientId: string,
  selectedServices: string[],
): Promise<{
  totalAmount: number;
  breakdown: Array<{
    serviceId: string;
    serviceName: string;
    vehicleNumber: string;
    vehicleType: string;
    amount: number;
  }>;
}> {
  console.log(
    `[calculateInvoiceAmount] calculating for clientId=${clientId}, selectedServices=`,
    selectedServices,
  );

  if (!clientId || selectedServices.length === 0) {
    return { totalAmount: 0, breakdown: [] };
  }

  // Load vehicles
  const qVehicles = query(
    collection(db, "registry_vehicles_v2"),
    where("clientId", "==", clientId),
  );
  const vehiclesSnap = await getDocs(qVehicles);

  const vehicles = vehiclesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as any);
  const vehicleIds = vehicles.map((v) => v.id);

  if (vehicleIds.length === 0) {
    return { totalAmount: 0, breakdown: [] };
  }

  // Fetch all services, filter in memory by vehicleId
  const servicesSnap = await getDocs(collection(db, "registry_services_v2"));
  const services = servicesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as any)
    .filter((s) => vehicleIds.includes(s.vehicleId));

  let totalAmount = 0;
  const breakdown: any[] = [];

  for (const s of services) {
    if (selectedServices.includes(s.serviceType)) {
      const v = vehicles.find((veh) => veh.id === s.vehicleId);
      const amount = s.serviceAmount ?? 0;
      totalAmount += amount;
      breakdown.push({
        serviceId: s.id,
        serviceName: s.serviceType,
        vehicleNumber: v?.vehicleNumber || "—",
        vehicleType: v?.vehicleType || "Commercial",
        amount,
      });
    }
  }

  return { totalAmount, breakdown };
}

export async function validateBillingPeriodSequence(
  clientId: string,
  billingPeriodStart: string,
  billingPeriodEnd: string,
): Promise<{ valid: boolean; reason?: string }> {
  console.log("Raw Start Date:", billingPeriodStart);
  console.log("Raw End Date:", billingPeriodEnd);

  const startDate = parseBillingDate(billingPeriodStart);
  const endDate = parseBillingDate(billingPeriodEnd);

  console.log("Parsed Start:", startDate);
  console.log("Parsed End:", endDate);
  console.log("Start Timestamp:", startDate?.getTime());
  console.log("End Timestamp:", endDate?.getTime());
  console.log(
    "Comparison Result:",
    startDate && endDate ? startDate.getTime() < endDate.getTime() : null,
  );

  if (!startDate || !endDate) {
    return { valid: false, reason: "Please provide valid billing start and end dates." };
  }

  if (startDate.getTime() >= endDate.getTime()) {
    return { valid: false, reason: "Billing start date must be before the end date." };
  }

  const q = query(collection(db, BILLING_INVOICES_COL), where("clientId", "==", clientId));
  const snap = await getDocs(q);
  const invoices = snap.docs
    .map((d) => d.data() as Invoice)
    .filter((invoice) => !!invoice.billingPeriodStart)
    .sort((a, b) => {
      const dateA = normalizeIsoDate(a.billingPeriodStart)?.getTime() ?? 0;
      const dateB = normalizeIsoDate(b.billingPeriodStart)?.getTime() ?? 0;
      return dateA - dateB;
    });

  for (const invoice of invoices) {
    const existingStart = normalizeIsoDate(invoice.billingPeriodStart);
    const existingEnd = normalizeIsoDate(invoice.billingPeriodEnd);
    if (!existingStart || !existingEnd) continue;

    if (
      startDate.getTime() <= existingEnd.getTime() &&
      endDate.getTime() >= existingStart.getTime()
    ) {
      return { valid: false, reason: "Billing period overlaps an existing invoice." };
    }
  }

  if (invoices.length > 0) {
    const lastInvoice = invoices[invoices.length - 1];
    const lastEndDate = parseBillingDate(lastInvoice.billingPeriodEnd);
    console.log("lastInvoice:", lastInvoice);
    console.log("lastBillingStart:", lastInvoice.billingPeriodStart);
    console.log("lastBillingEnd:", lastInvoice.billingPeriodEnd);
    console.log("lastEndDate:", lastEndDate);

    if (lastEndDate) {
      const expectedNextStart = addDaysUtc(lastEndDate, 1);
      console.log("nextExpectedDate:", expectedNextStart);
      if (startDate.getTime() !== expectedNextStart.getTime()) {
        return {
          valid: false,
          reason: `Billing periods must continue without gaps. Next invoice should start on ${dateToIsoString(expectedNextStart)}.`,
        };
      }
    }
  }

  return { valid: true };
}

export async function createInvoice(
  client: RegistryRecord,
  services: InvoiceServiceItem[],
  billingPeriodStart: string,
  billingPeriodEnd: string,
  createdBy: string,
  collectionDate?: string,
  askBhaylubha?: boolean,
  subModule?: string,
): Promise<Invoice> {
  const validation = await validateBillingPeriodSequence(
    client.id,
    billingPeriodStart,
    billingPeriodEnd,
  );
  if (!validation.valid) {
    throw new Error(validation.reason || "Invalid billing period sequence.");
  }

  if (services.length === 0) {
    throw new Error("Invoice must include at least one service.");
  }

  const subtotal = services.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const totalTax = services.reduce((sum, item) => sum + (item.tax ?? 0), 0);
  const totalAmount = subtotal + totalTax;
  const invoiceNumber = await getNextInvoiceNumber(new Date().getUTCFullYear());
  const invoiceDate = new Date().toISOString();
  const createdAt = invoiceDate;
  const formattedStart = formatBillingDate(billingPeriodStart);
  const formattedEnd = formatBillingDate(billingPeriodEnd);

  const finalSubModule = subModule || (client as any).subModule || "services";

  let finalTotalPaid = 0;

  // Calculate finalTotalPaid by summing up all service advance payments
  for (const item of services) {
    const sId = item.serviceId;
    if (!sId) continue;
    const sRef = doc(db, "registry_services_v2", sId);
    const sSnap = await getDoc(sRef);
    if (sSnap.exists()) {
      const sData = sSnap.data() as any;
      finalTotalPaid += (Number(sData.amountReceived) || 0) + (Number(sData.advancePayment) || 0);
    }
  }

  const status = finalTotalPaid >= totalAmount ? "Paid" : finalTotalPaid > 0 ? "Partially Paid" : "Pending";

  const invoicePayload = removeUndefined({
    invoiceNumber,
    clientId: client.id || "CLIENT",
    clientName: client.name || (client as any).ownerName || (client as any).studentName || "Client",
    clientMobile: client.mo || (client as any).mobileNumber || null,
    clientAddress: client.application || (client as any).address || null,
    vehicleNumber: client.mvNo || (client as any).vehicleNumber || null,
    vehicleType: (client as any).vehicleType || client.work || (client as any).courseType || null,
    billingPeriodStart: formattedStart,
    billingPeriodEnd: formattedEnd,
    subtotal,
    totalTax,
    totalAmount,
    totalPaid: finalTotalPaid,
    invoiceDate,
    createdBy,
    createdAt,
    status: status as InvoiceStatus,
    services,
    pdfUrl: null,
    collectionDate: collectionDate || null,
    askBhaylubha: askBhaylubha || false,
    subModule: finalSubModule,
    assignedEmployee: (client as any).assignedEmployee || (client as any).assignedEmployeeName || "Unassigned",
    notes: (client as any).remarks || "",
  });

  const invoiceDocRef = doc(db, BILLING_INVOICES_COL, client.id || `inv-${Date.now()}`);
  await setDoc(invoiceDocRef, invoicePayload);

  // Update corresponding registry_services_v2 documents with the invoice info
  for (const item of services) {
    const sId = item.serviceId;
    if (!sId) continue;
    const sRef = doc(db, "registry_services_v2", sId);
    const sSnap = await getDoc(sRef);
    if (sSnap.exists()) {
      const sData = sSnap.data() as any;
      await updateDoc(sRef, {
        invoiceId: client.id,
        invoiceNumber: invoiceNumber,
        collectionDate: collectionDate || null,
        askBhaylubha: askBhaylubha || false,
        updatedAt: new Date().toISOString(),
      });

      // Also update the payment history entry for this service advance if it exists
      if ((sData.advancePayment || 0) > 0) {
        const paymentRef = doc(db, "payment_history", `pay_service_${sId}`);
        const paymentSnap = await getDoc(paymentRef);
        if (paymentSnap.exists()) {
          await updateDoc(paymentRef, {
            financeRecordId: client.id,
            invoiceId: client.id,
            allocations: [{
              invoiceId: client.id,
              invoiceNumber: invoiceNumber,
              allocatedAmount: sData.advancePayment,
            }],
          });
        }
      }
    }
  }
  try {
    await logClientActivity(
      client.id,
      createdBy,
      createdBy,
      `Invoice generated: ${invoiceNumber}`,
      "invoice",
      null,
      `${invoiceNumber} - ₹${totalAmount}`,
    );
  } catch (err) {
    console.warn("[createInvoice] logClientActivity failed:", err);
  }

  invalidateCache();
  return {
    id: client.id,
    invoiceNumber,
    clientId: client.id,
    clientName: client.name,
    clientMobile: client.mo || undefined,
    clientAddress: client.application || undefined,
    vehicleNumber: client.mvNo || undefined,
    vehicleType: (client as any).vehicleType || client.work || undefined,
    billingPeriodStart: formattedStart,
    billingPeriodEnd: formattedEnd,
    subtotal,
    totalTax,
    totalAmount,
    totalPaid: finalTotalPaid,
    invoiceDate,
    createdBy,
    createdAt,
    status: status as InvoiceStatus,
    services,
    pdfUrl: null,
    collectionDate: collectionDate || null,
    askBhaylubha: askBhaylubha || false,
    subModule: finalSubModule,
    assignedEmployee: (client as any).assignedEmployee || (client as any).assignedEmployeeName || "Unassigned",
    notes: (client as any).remarks || "",
  };
}

export function subscribeToClientInvoices(
  clientId: string,
  callback: (invoices: Invoice[]) => void,
) {
  // Listen to ALL invoices and filter client-side to ensure full synchronization regardless of ID mismatches
  return onSnapshot(
    collection(db, BILLING_INVOICES_COL),
    (snap) => {
      const invoices = snap.docs
        .map((d) => ({ ...(d.data() as any), id: d.id }) as Invoice)
        .filter((inv) => inv.clientId === clientId || inv.id === clientId || inv.invoiceNumber === clientId)
        .sort((a, b) => {
          const dateA = normalizeIsoDate(a.createdAt)?.getTime() ?? 0;
          const dateB = normalizeIsoDate(b.createdAt)?.getTime() ?? 0;
          return dateB - dateA;
        });
      callback(invoices);
    },
    (error) => {
      handleFirestoreError(error, "subscribeToClientInvoices");
      callback([]);
    },
  );
}

export function subscribeToAllInvoices(callback: (invoices: Invoice[]) => void) {
  const q = query(collection(db, BILLING_INVOICES_COL), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ ...(d.data() as any), id: d.id }) as Invoice));
    },
    (error) => {
      handleFirestoreError(error, "subscribeToAllInvoices");
      callback([]);
    },
  );
}

export async function getInvoiceById(invoiceId: string): Promise<Invoice | null> {
  const invoiceDoc = doc(db, BILLING_INVOICES_COL, invoiceId);
  const snap = await getDoc(invoiceDoc);
  if (!snap.exists()) return null;
  return { ...(snap.data() as any), id: snap.id };
}

export async function updateInvoiceStatus(
  invoiceId: string,
  amountPaid: number,
  totalAmount: number,
  updatedBy: string,
): Promise<void> {
  const invoiceDoc = doc(db, BILLING_INVOICES_COL, invoiceId);

  let newStatus: InvoiceStatus = "Pending";
  if (amountPaid >= totalAmount) {
    newStatus = "Paid";
  } else if (amountPaid > 0) {
    newStatus = "Partially Paid";
  }

  await updateDoc(invoiceDoc, { status: newStatus });

  try {
    await logClientActivity(
      invoiceId,
      updatedBy,
      updatedBy,
      `Invoice status updated to: ${newStatus}`,
      "status",
      null,
      newStatus,
    );
  } catch (err) {
    console.warn("[updateInvoiceStatus] logClientActivity failed:", err);
  }
}

export async function recordInvoicePayment(
  invoiceId: string,
  amount: number,
  paymentMethod: string,
  receivedInAccount: string,
  receivedBy: string,
  remarks?: string,
  paymentDate?: string,
): Promise<any> {
  if (amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) {
    throw new Error("Invoice not found.");
  }

  const updatedTotalPaid = (invoice.totalPaid || 0) + amount;
  const remainingAmount = Math.max(0, invoice.totalAmount - updatedTotalPaid);
  const updatedStatus: InvoiceStatus =
    updatedTotalPaid >= invoice.totalAmount ? "Paid" : "Partially Paid";

  const pDate = paymentDate || new Date().toISOString().slice(0, 10);

  const paymentPayload = removeUndefined({
    invoiceId,
    invoiceNumber: invoice.invoiceNumber || "",
    invoiceAmount: invoice.totalAmount || 0,
    amountReceived: amount || 0,
    remainingAmount: remainingAmount || 0,
    paymentDate: pDate,
    paymentMethod: paymentMethod || "UPI",
    receivedInAccount: receivedInAccount || "Current Account",
    receivedBy: receivedBy || "system",
    remarks: remarks || "",
    createdAt: new Date().toISOString(),
  });

  const paymentRef = await addDoc(collection(db, BILLING_INVOICE_PAYMENTS_COL), paymentPayload);

  await updateDoc(doc(db, BILLING_INVOICES_COL, invoiceId), {
    totalPaid: updatedTotalPaid,
    status: updatedStatus,
  });

  try {
    await logClientActivity(
      invoice.clientId,
      receivedBy,
      receivedBy,
      `Payment recorded for invoice ${invoice.invoiceNumber}: ₹${amount}`,
      "payment",
      null,
      `₹${amount} via ${paymentMethod}`,
    );
  } catch (err) {
    console.warn("[recordInvoicePayment] logClientActivity failed:", err);
  }

  return {
    id: paymentRef.id,
    ...paymentPayload,
  };
}

export function subscribeToInvoicePayments(
  invoiceId: string,
  callback: (payments: InvoicePayment[]) => void,
) {
  const q = query(
    collection(db, BILLING_INVOICE_PAYMENTS_COL),
    where("invoiceId", "==", invoiceId),
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ ...(d.data() as any), id: d.id }) as InvoicePayment);
      list.sort((a, b) => {
        const dateA = normalizeIsoDate(a.createdAt)?.getTime() ?? 0;
        const dateB = normalizeIsoDate(b.createdAt)?.getTime() ?? 0;
        return dateB - dateA;
      });
      callback(list);
    },
    (error) => {
      handleFirestoreError(error, "subscribeToInvoicePayments");
      callback([]);
    },
  );
}

export async function getInvoicePayments(invoiceId: string): Promise<InvoicePayment[]> {
  const q = query(
    collection(db, BILLING_INVOICE_PAYMENTS_COL),
    where("invoiceId", "==", invoiceId),
  );
  const snap = await getDocs(q);
  const list = snap.docs.map(
    (docSnap) => ({ ...(docSnap.data() as any), id: docSnap.id }) as InvoicePayment,
  );
  list.sort((a, b) => {
    const dateA = normalizeIsoDate(a.createdAt)?.getTime() ?? 0;
    const dateB = normalizeIsoDate(b.createdAt)?.getTime() ?? 0;
    return dateB - dateA;
  });
  return list;
}

export async function calculateBillingMetrics(subModule?: string): Promise<BillingMetrics> {
  const q = subModule
    ? query(collection(db, BILLING_INVOICES_COL), where("subModule", "==", subModule))
    : query(collection(db, BILLING_INVOICES_COL));
  const snap = await getDocs(q);
  const invoices = snap.docs.map((d) => ({ ...(d.data() as any), id: d.id }) as Invoice);

  const totalInvoiced = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  const totalCollected = invoices.reduce((sum, inv) => sum + (inv.totalPaid || 0), 0);
  const outstandingAmount = Math.max(0, totalInvoiced - totalCollected);

  const pendingCount = invoices.filter(
    (inv) => inv.status === "Pending" || inv.status === "Partially Paid",
  ).length;

  return {
    totalInvoiced,
    totalCollected,
    outstandingAmount,
    invoicesThisMonth: invoices.length,
    pendingInvoices: pendingCount,
    overdueInvoices: 0,
    collectionRate: totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0,
  };
}

export async function attachPdfToInvoice(invoiceId: string, blob: Blob): Promise<string> {
  const ref = storageRef(storage, `${PDF_STORAGE_FOLDER}/${invoiceId}.pdf`);
  await uploadBytes(ref, blob);
  const url = await getDownloadURL(ref);
  await updateDoc(doc(db, BILLING_INVOICES_COL, invoiceId), { pdfUrl: url });
  return url;
}

export async function getClientBillingSummary(clientId: string) {
  const q = query(collection(db, BILLING_INVOICES_COL), where("clientId", "==", clientId));
  const snap = await getDocs(q);
  const invoices = snap.docs
    .map((d) => ({ ...(d.data() as any), id: d.id }) as Invoice)
    .sort((a, b) => {
      const dateA = normalizeIsoDate(a.createdAt)?.getTime() ?? 0;
      const dateB = normalizeIsoDate(b.createdAt)?.getTime() ?? 0;
      return dateB - dateA;
    });

  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + inv.totalPaid, 0);
  const outstandingAmount = Math.max(0, totalInvoiced - totalPaid);

  return {
    totalInvoices: invoices.length,
    totalInvoiced,
    totalPaid,
    outstandingAmount,
    recentInvoices: invoices.slice(0, 5),
    pendingInvoices: invoices.filter(
      (inv) => inv.status === "Pending" || inv.status === "Partially Paid",
    ),
  };
}

export async function deleteInvoiceById(
  invoiceId: string,
  deletedBy: string,
  reason: string,
): Promise<void> {
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) throw new Error("Invoice not found.");

  // Delete associated payments
  const payments = await getInvoicePayments(invoiceId);
  for (const pay of payments) {
    await deleteDoc(doc(db, BILLING_INVOICE_PAYMENTS_COL, pay.id));
  }

  // Delete invoice metadata doc
  await deleteDoc(doc(db, BILLING_INVOICES_COL, invoiceId));

  // Log client activity for deletion audit trail
  try {
    await logClientActivity(
      invoice.clientId,
      deletedBy,
      deletedBy,
      `Invoice deleted: ${invoice.invoiceNumber}. Reason: ${reason}`,
      "invoice_deleted",
      null,
      `Amount: ₹${invoice.totalAmount}`,
    );
  } catch (err) {
    console.warn("[deleteInvoiceById] logClientActivity failed:", err);
  }
  invalidateCache();
}

export function subscribeInvoicesBySubModule(
  subModule: string,
  callback: (invoices: Invoice[]) => void,
) {
  const q = query(
    collection(db, BILLING_INVOICES_COL),
    where("subModule", "==", subModule)
  );
  return onSnapshot(
    q,
    (snap) => {
      const invoices = snap.docs
        .map((d) => ({ ...(d.data() as any), id: d.id }) as Invoice)
        .sort((a, b) => {
          const dateA = normalizeIsoDate(a.createdAt || a.invoiceDate)?.getTime() ?? 0;
          const dateB = normalizeIsoDate(b.createdAt || b.invoiceDate)?.getTime() ?? 0;
          return dateB - dateA;
        });
      callback(invoices);
    },
    (error) => {
      handleFirestoreError(error, "subscribeInvoicesBySubModule");
      callback([]);
    },
  );
}

export async function syncInvoice(docId: string, subModule: string): Promise<void> {
  const now = new Date().toISOString();
  try {
    if (subModule === "driving_school") {
      const appRef = doc(db, "DrivingSchoolApplications", docId);
      const appSnap = await getDoc(appRef);
      if (!appSnap.exists()) return;
      const appData = appSnap.data() as any;

      const accRef = doc(db, "registry_accounting", docId);
      const accSnap = await getDoc(accRef);
      const accData = accSnap.exists() ? accSnap.data() as any : null;

      const totFee = Number(appData.totalCourseFees) || 0;
      const advFee = Number(appData.advancePaid) || 0;

      const invoiceRef = doc(db, BILLING_INVOICES_COL, docId);
      const invoicePayload = removeUndefined({
        id: docId,
        invoiceNumber: appData.applicationId || docId,
        clientId: docId,
        clientName: appData.studentName || "Unknown Student",
        clientMobile: appData.mobileNumber || "",
        clientAddress: appData.address || "",
        billingPeriodStart: formatBillingDate(appData.joiningDate || appData.createdAt?.slice(0, 10) || now.slice(0, 10)),
        billingPeriodEnd: formatBillingDate(appData.courseEndDate || appData.updatedAt?.slice(0, 10) || now.slice(0, 10)),
        subtotal: totFee,
        totalTax: 0,
        totalAmount: totFee,
        totalPaid: advFee,
        invoiceDate: appData.createdAt || now,
        createdBy: appData.createdBy || "System",
        createdAt: appData.createdAt || now,
        status: (appData.paymentStatus === "Partial" ? "Partially Paid" : (appData.paymentStatus || "Pending")) as InvoiceStatus,
        services: [{
          serviceId: "course",
          serviceName: appData.courseType || "Driving School Course",
          quantity: 1,
          unitPrice: totFee,
          amount: totFee,
          tax: 0,
          total: totFee,
        }],
        pdfUrl: appData.pdfUrl || null,
        collectionDate: appData.courseEndDate || null,
        askBhaylubha: accData?.askBhaylubha || false,
        subModule: "driving_school",
        assignedEmployee: appData.assignedEmployee || "Unassigned",
        notes: appData.employeeNotes || "",
        rtoReceipt: accData?.rtoReceipt || 0,
        rtoExpense: accData?.rtoExpense || 0,
        profit: accData?.profit || (totFee - advFee),
      });
      await setDoc(invoiceRef, invoicePayload, { merge: true });
    } else {
      const appRef = doc(db, "registry_applications_v1", docId);
      const appSnap = await getDoc(appRef);
      if (!appSnap.exists()) return;
      const appData = appSnap.data() as any;

      const accRef = doc(db, "registry_accounting", docId);
      const accSnap = await getDoc(accRef);
      const accData = accSnap.exists() ? accSnap.data() as any : null;

      const totAmt = Number(appData.amount) || 0;
      const advAmt = Number(appData.totalPaid) || 0;
      const servicesList = appData.services || [];

      // Determine RTO Expense and Profit
      const rtoReceipt = accData?.rtoReceipt || 0;
      const rtoExpense = accData?.rtoExpense || 0;
      const outstanding = Math.max(0, totAmt - advAmt - rtoReceipt);
      const profit = outstanding - rtoExpense;

      const invoiceRef = doc(db, BILLING_INVOICES_COL, docId);
      const invoicePayload = removeUndefined({
        id: docId,
        invoiceNumber: appData.applicationId || docId,
        clientId: docId,
        clientName: appData.ownerName || "Unknown Owner",
        clientMobile: appData.mobileNumber || "",
        clientAddress: appData.vehicleDetails?.address || "",
        vehicleNumber: appData.vehicleNumber || "",
        vehicleType: appData.vehicleDetails?.vehicleClass || "",
        billingPeriodStart: formatBillingDate(appData.createdAt?.slice(0, 10) || now.slice(0, 10)),
        billingPeriodEnd: formatBillingDate(appData.expiryDate || now.slice(0, 10)),
        subtotal: totAmt,
        totalTax: 0,
        totalAmount: totAmt,
        totalPaid: advAmt,
        invoiceDate: appData.createdAt || now,
        createdBy: appData.createdBy || "System",
        createdAt: appData.createdAt || now,
        status: (appData.paymentStatus === "Partial" ? "Partially Paid" : (appData.paymentStatus || "Pending")) as InvoiceStatus,
        services: servicesList.map((srv: string) => {
          const srvAmount = Number(appData.serviceFees?.[srv]) || (servicesList.length > 0 ? totAmt / servicesList.length : totAmt);
          return {
            serviceId: srv,
            serviceName: srv,
            vehicleNumber: appData.vehicleNumber || "",
            quantity: 1,
            unitPrice: srvAmount,
            amount: srvAmount,
            tax: 0,
            total: srvAmount,
          };
        }),
        pdfUrl: appData.pdfUrl || null,
        collectionDate: appData.expiryDate || null,
        askBhaylubha: accData?.askBhaylubha || false,
        subModule: appData.subModule || "services",
        assignedEmployee: appData.assignedEmployeeName || "Unassigned",
        notes: appData.remarks || "",
        rtoReceipt,
        rtoExpense,
        profit,
      });
      await setDoc(invoiceRef, invoicePayload, { merge: true });
    }
    invalidateCache();
  } catch (err) {
    console.error(`Failed to sync invoice for docId: ${docId}`, err);
  }
}

export async function migrateExistingInvoices(): Promise<void> {
  try {
    const q = query(collection(db, BILLING_INVOICES_COL));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const data = d.data() as any;
      if (!data.subModule) {
        // Try to find in registry_applications_v1
        const appRef = doc(db, "registry_applications_v1", d.id);
        const appSnap = await getDoc(appRef);
        if (appSnap.exists()) {
          const appData = appSnap.data() as any;
          await updateDoc(d.ref, {
            subModule: appData.subModule || "services",
            assignedEmployee: appData.assignedEmployeeName || "Unassigned",
            notes: appData.remarks || "",
            rtoReceipt: appData.rtoReceipt || 0,
            rtoExpense: appData.rtoExpense || 0,
          });
          continue;
        }

        // Try to find in DrivingSchoolApplications
        const dsRef = doc(db, "DrivingSchoolApplications", d.id);
        const dsSnap = await getDoc(dsRef);
        if (dsSnap.exists()) {
          const dsData = dsSnap.data() as any;
          await updateDoc(d.ref, {
            subModule: "driving_school",
            assignedEmployee: dsData.assignedEmployee || "Unassigned",
            notes: dsData.employeeNotes || "",
          });
          continue;
        }

        // Fallback
        if (data.invoiceNumber?.startsWith("DS-")) {
          await updateDoc(d.ref, { subModule: "driving_school" });
        } else {
          await updateDoc(d.ref, { subModule: "services" });
        }
      }
    }
  } catch (err) {
    console.error("Migration of invoices failed:", err);
  }
}
