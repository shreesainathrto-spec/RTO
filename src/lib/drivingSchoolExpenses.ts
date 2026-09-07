import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { removeUndefined } from "./records";
import { getSession } from "./auth";

export const DRIVING_SCHOOL_EXPENSES_COL = "driving_school_vehicle_expenses";

export const EXPENSE_CATEGORIES = [
  "Fuel",
  "Maintenance",
  "Repair",
  "Service",
  "Tyres",
  "Battery",
  "Insurance",
  "Tax",
  "PUC",
  "Spare Parts",
  "Cleaning",
  "Driver Salary",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number] | string;

export const SALARY_PERIODS = ["Daily", "Weekly", "Monthly", "Custom"] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number] | string;

export const PAYMENT_METHODS = ["Cash", "UPI", "Bank", "Other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number] | string;

export interface DrivingSchoolExpense {
  id: string;
  vehicleId: string;
  vehicleNumber: string;
  vehicleName: string;
  category: ExpenseCategory;
  amount: number;
  expenseDate: string; // Stored in DD/MM/YYYY
  driverId?: string;
  driverName?: string;
  salaryPeriod?: SalaryPeriod;
  paymentMethod?: PaymentMethod;
  description?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
  updatedBy?: string;
  updatedByName?: string;
  updatedAt: string;
}

/**
 * Realtime listener for all driving school vehicle expenses
 */
export function subscribeDrivingSchoolExpenses(
  callback: (expenses: DrivingSchoolExpense[]) => void
): () => void {
  const q = query(collection(db, DRIVING_SCHOOL_EXPENSES_COL));
  return onSnapshot(
    q,
    (snap) => {
      const expenses = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          amount: Number(data.amount) || 0,
        } as DrivingSchoolExpense;
      });
      // Sort newest date first
      expenses.sort((a, b) => {
        const parseD = (dStr?: string) => {
          if (!dStr) return 0;
          const parts = dStr.split("/");
          if (parts.length === 3) {
            return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
          }
          return new Date(dStr).getTime() || 0;
        };
        return parseD(b.expenseDate) - parseD(a.expenseDate);
      });
      callback(expenses);
    },
    (err) => {
      console.error("Error subscribing to driving school expenses:", err);
      callback([]);
    }
  );
}

/**
 * Save or update a driving school vehicle expense record
 */
export async function saveDrivingSchoolExpenseRecord(
  expenseData: Partial<DrivingSchoolExpense>,
  existingId?: string
): Promise<string> {
  const session = getSession();
  const now = new Date().toISOString();

  const finalId = existingId || expenseData.id;
  const isUpdate = !!finalId;
  let targetId = finalId;
  let docRef;

  if (!isUpdate || !targetId) {
    docRef = doc(collection(db, DRIVING_SCHOOL_EXPENSES_COL));
    targetId = docRef.id;
  } else {
    docRef = doc(db, DRIVING_SCHOOL_EXPENSES_COL, targetId);
  }

  const amt = Number(expenseData.amount);
  if (isNaN(amt) || amt < 0) {
    throw new Error("Invalid expense amount");
  }

  if (!expenseData.vehicleId) {
    throw new Error("Vehicle is required");
  }

  if (!expenseData.category) {
    throw new Error("Expense category is required");
  }

  if (!expenseData.expenseDate) {
    throw new Error("Expense date is required");
  }

  if (!isUpdate) {
    const payload = removeUndefined({
      id: targetId,
      vehicleId: expenseData.vehicleId,
      vehicleNumber: expenseData.vehicleNumber || "",
      vehicleName: expenseData.vehicleName || "",
      category: expenseData.category,
      amount: amt,
      expenseDate: expenseData.expenseDate,
      driverId: expenseData.driverId || "",
      driverName: expenseData.driverName || "",
      salaryPeriod: expenseData.salaryPeriod || "",
      paymentMethod: expenseData.paymentMethod || "Cash",
      description: expenseData.description || "",
      createdBy: session?.uid || session?.id || "system",
      createdByName: session?.name || "System",
      createdAt: now,
      updatedBy: session?.uid || session?.id || "system",
      updatedByName: session?.name || "System",
      updatedAt: now,
    });

    await setDoc(docRef, payload);
  } else {
    const payload = removeUndefined({
      vehicleId: expenseData.vehicleId,
      vehicleNumber: expenseData.vehicleNumber || "",
      vehicleName: expenseData.vehicleName || "",
      category: expenseData.category,
      amount: amt,
      expenseDate: expenseData.expenseDate,
      driverId: expenseData.driverId || "",
      driverName: expenseData.driverName || "",
      salaryPeriod: expenseData.salaryPeriod || "",
      paymentMethod: expenseData.paymentMethod || "Cash",
      description: expenseData.description || "",
      updatedBy: session?.uid || session?.id || "system",
      updatedByName: session?.name || "System",
      updatedAt: now,
    });

    await setDoc(docRef, payload, { merge: true });
  }

  return targetId;
}

/**
 * Delete an expense record by ID
 */
export async function deleteDrivingSchoolExpenseRecord(id: string): Promise<void> {
  if (!id) return;
  await deleteDoc(doc(db, DRIVING_SCHOOL_EXPENSES_COL, id));
}
