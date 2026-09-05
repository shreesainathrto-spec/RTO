import { collection, addDoc, query, where, onSnapshot, getDocs, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { logClientActivity } from "./activity";
import { toast } from "sonner";

export function handleFirestoreError(err: any, context: string) {
  console.error(`[Firestore Error: ${context}]`, err);
  if (err && (err.code === "failed-precondition" || err.message?.includes("index"))) {
    toast.error("Database index is being prepared. Please try again shortly.");
  }
}


export type PaymentMode = "Cash" | "UPI" | "Bank Transfer" | "Cheque" | "Online Payment";
export type AccountType = "Main Account" | "Current Account" | "Cash Account" | "Other Accounts";

export interface ClientPayment {
  id: string;
  clientId: string;
  amount: number;
  paymentMode: PaymentMode;
  accountName: string; // Received In Account
  transactionDate: string; // ISO date
  receivedBy: string;
  referenceNumber?: string;
  remarks?: string;
  createdAt: string; // ISO
}

const col = () => collection(db, "clientPayments");

export async function addPayment(
  payment: Omit<ClientPayment, "id" | "createdAt"> & { id?: string },
) {
  try {
    const payload = {
      clientId: payment.clientId,
      amount: payment.amount || 0,
      paymentMode: payment.paymentMode,
      accountName: payment.accountName,
      transactionDate: payment.transactionDate,
      receivedBy: payment.receivedBy,
      referenceNumber: payment.referenceNumber || null,
      remarks: payment.remarks || null,
      createdAt: new Date().toISOString(),
    };
    const docRef = await addDoc(col(), payload as any);
    // Log activity for client
    try {
      await logClientActivity(
        payment.clientId,
        payment.receivedBy || "",
        payment.receivedBy || "",
        `Payment received: ₹${payment.amount}`,
        "payment",
        null,
        `₹${payment.amount} via ${payment.paymentMode}`,
      );
    } catch (err) {
      console.warn("[addPayment] logClientActivity failed:", err);
    }
    return { id: docRef.id, ...payload } as ClientPayment;
  } catch (err) {
    console.error("[addPayment] failed to write payment:", err);
    throw err;
  }
}

export function subscribeToClientPayments(
  clientId: string,
  cb: (payments: ClientPayment[]) => void,
) {
  const q = query(col(), where("clientId", "==", clientId), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as ClientPayment);
      cb(items);
    },
    (err) => {
      handleFirestoreError(err, "subscribeToClientPayments");
      cb([]);
    },
  );
}

export function subscribeToAllPayments(cb: (payments: ClientPayment[]) => void) {
  const q = query(col(), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as ClientPayment);
      cb(items);
    },
    (err) => {
      handleFirestoreError(err, "subscribeToAllPayments");
      cb([]);
    },
  );
}

export async function getAllPayments(): Promise<ClientPayment[]> {
  const snap = await getDocs(query(col(), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as ClientPayment);
}
