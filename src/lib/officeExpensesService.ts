import { db } from "./firebase";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

export interface OfficeExpense {
  id: string;
  expenseDate: string;
  category: string;
  description: string;
  amount: number;
  remarks: string;
  paidByEmployee: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const COLLECTION_NAME = "office_expenses";

export async function addOfficeExpense(
  expense: Omit<OfficeExpense, "id" | "createdAt" | "updatedAt">
): Promise<void> {
  const now = new Date().toISOString();
  await addDoc(collection(db, COLLECTION_NAME), {
    ...expense,
    amount: Number(expense.amount) || 0,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateOfficeExpense(
  id: string,
  expense: Partial<OfficeExpense>
): Promise<void> {
  const ref = doc(db, COLLECTION_NAME, id);
  const updateData: any = {
    ...expense,
    updatedAt: new Date().toISOString(),
  };
  if (expense.amount !== undefined) {
    updateData.amount = Number(expense.amount) || 0;
  }
  await updateDoc(ref, updateData);
}

export async function deleteOfficeExpense(id: string): Promise<void> {
  const ref = doc(db, COLLECTION_NAME, id);
  await deleteDoc(ref);
}

export function subscribeOfficeExpenses(
  callback: (list: OfficeExpense[]) => void
): () => void {
  const q = query(collection(db, COLLECTION_NAME), orderBy("expenseDate", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as OfficeExpense[];
      callback(list);
    },
    (err) => {
      console.error("Error subscribing to office expenses:", err);
    }
  );
}
