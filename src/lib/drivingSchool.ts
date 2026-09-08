import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  getDocs,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { removeUndefined } from "./records";
import { getSession } from "./auth";
import { transformDataObject } from "./capitalize-settings";
import { saveAccountingRecord } from "./applications";
import { syncInvoice } from "./billing";
import { saveClient } from "./hierarchy";

export const DRIVING_SCHOOL_COL = "DrivingSchoolApplications";
export const DRIVING_SCHOOL_VEHICLES_COL = "DrivingSchoolVehicles";

export interface DrivingSchoolApplication {
  id: string;
  applicationId: string;
  studentName: string;
  mobileNumber: string;
  co?: string;
  bloodGroup?: string;
  address?: string;
  dateOfBirth: string;
  gender?: "Male" | "Female" | "Other" | string;
  hasDrivingLicence?: boolean;
  drivingLicenceNumber?: string;
  drivingLicenceStatus?: "WITH_DL" | "WITHOUT_DL";
  drivingLicence?: { number: string; issueDate: any; expiryDate: any; classes: string[] } | null;
  learningLicence?: { number: string; issueDate: any; expiryDate: any; classes: string[] } | null;
  joiningDate?: string;
  courseStartDate?: string;
  courseEndDate?: string;
  courseType?: "15 Days" | "21 Days" | "26 Days" | "45 Days" | "60 Days" | string;
  totalCourseFees: number;
  advancePaid: number;
  remainingFees: number;
  paymentStatus: "Paid" | "Partial" | "Pending";
  assignedEmployee?: string;
  reminderDate?: string;
  priority?: "Low" | "Medium" | "High" | "Urgent";
  employeeNotes?: string;
  documents?: Record<string, string>;
  vehicleNumber?: string;
  instructorName?: string;
  status?: "Active" | "Completed" | "On Hold";
  createdAt: string;
  updatedAt: string;
}

export interface DrivingSchoolVehicleStatus {
  id: string;
  vehicleNumber: string;
  instructor: string;
  timeSlot: string;
  status: "Available" | "In Class" | "Maintenance";
  distanceToday: string;
  fuelUsed: string;
  expenseToday: string;
}

// Realtime Listener for Driving School Vehicles
export function subscribeDrivingSchoolVehicles(
  callback: (vehicles: DrivingSchoolVehicleStatus[]) => void
): () => void {
  const q = query(collection(db, DRIVING_SCHOOL_VEHICLES_COL));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DrivingSchoolVehicleStatus));
      callback(list);
    },
    (err) => {
      console.error("Error subscribing to Driving School vehicles:", err);
      callback([]);
    }
  );
}

// Realtime Listener for Driving School Applications
export function subscribeDrivingSchoolApplications(
  callback: (apps: DrivingSchoolApplication[]) => void
): () => void {
  const q = query(collection(db, DRIVING_SCHOOL_COL), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const apps = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DrivingSchoolApplication));
      callback(apps);
    },
    (err) => {
      console.error("Error subscribing to Driving School applications:", err);
      callback([]);
    }
  );
}

// Save / Update Driving School Application (Creates ONLY application & accounting entry, NO task)
export async function saveDrivingSchoolApplication(
  appData: Omit<DrivingSchoolApplication, "id" | "applicationId" | "createdAt" | "updatedAt">,
  existingId?: string
): Promise<string> {
  const session = getSession();
  const now = new Date().toISOString();

  let finalId = existingId;
  let generatedAppId = "";
  let docRef;

  const totFee = Number(appData.totalCourseFees) || 0;
  const advFee = Number(appData.advancePaid) || 0;
  const remFee = Math.max(0, totFee - advFee);
  const pStatus: "Paid" | "Partial" | "Pending" =
    remFee <= 0 && totFee > 0 ? "Paid" : advFee > 0 ? "Partial" : "Pending";

  const sanitizedData = {
    ...appData,
    totalCourseFees: totFee,
    advancePaid: advFee,
    remainingFees: remFee,
    paymentStatus: pStatus,
    subModule: "driving_school" as const,
  };

  if (!finalId) {
    generatedAppId = (appData as any).applicationId || "";
    docRef = doc(collection(db, DRIVING_SCHOOL_COL));
    finalId = docRef.id;

    const payload = removeUndefined(transformDataObject({
      ...sanitizedData,
      id: finalId,
      applicationId: generatedAppId,
      status: appData.status || "Active",
      createdAt: now,
      updatedAt: now,
      createdBy: session?.name || "System",
    }));

    await setDoc(docRef, payload);
  } else {
    docRef = doc(db, DRIVING_SCHOOL_COL, finalId);
    const existingSnap = await getDoc(docRef);
    generatedAppId = existingSnap.exists()
      ? existingSnap.data()?.applicationId || finalId
      : finalId;

    const payload = removeUndefined(transformDataObject({
      ...sanitizedData,
      updatedAt: now,
      updatedBy: session?.name || "System",
    }));

    await setDoc(docRef, payload, { merge: true });
  }

  // Create linked Driving School Task if it doesn't exist
  try {
    const taskQ = query(collection(db, "registry_tasks"), where("parentApplicationId", "==", finalId));
    const taskSnap = await getDocs(taskQ);
    if (taskSnap.empty) {
      const newTaskRef = doc(collection(db, "registry_tasks"));
      const defaultSubtasks = [
        "Collect Joining Form",
        "Advance Payment",
        "Vehicle Allocation",
        "Course Execution",
        "Final Assessment",
        "Deliver Certificate"
      ];
      const taskPayload = removeUndefined({
        id: newTaskRef.id,
        taskId: newTaskRef.id,
        parentApplicationId: finalId,
        applicationDocId: finalId,
        applicationId: generatedAppId,
        title: `Driving Course - ${appData.studentName}`,
        serviceName: "Driving Course",
        serviceType: "Driving Course",
        clientName: appData.studentName || "",
        mobileNumber: appData.mobileNumber || "",
        phone: appData.mobileNumber || "",
        assignee: appData.assignedEmployee || "Unassigned",
        assignedEmployeeName: appData.assignedEmployee || "Unassigned",
        subModule: "driving_school",
        createdAt: now,
        createdBy: session?.name || "System",
        manual: false,
        status: "Read",
        done: false,
        associationType: "application",
        bucket: "applications",
        subtasks: defaultSubtasks.map(t => ({
          id: crypto.randomUUID(),
          title: t,
          completed: false,
          status: "Read",
          createdAt: now,
        })),
      });
      await setDoc(newTaskRef, taskPayload);

      // Trigger task assignment notification to assigned employee
      if (appData.assignedEmployee && appData.assignedEmployee !== "Unassigned") {
        try {
          const { sendTaskAssignmentNotification } = await import("./notifications");
          await sendTaskAssignmentNotification({
            taskId: newTaskRef.id,
            title: `Driving Course - ${appData.studentName}`,
            serviceName: "Driving Course",
            vehicleNumber: appData.vehicleNumber || "",
            applicationId: generatedAppId || finalId,
            applicationDocId: finalId,
            subModule: "driving_school",
            assignee: appData.assignedEmployee,
            assignedEmployeeName: appData.assignedEmployee,
            assignedBy: session?.name || "System",
          });
        } catch (notifErr) {
          console.warn("Failed to dispatch driving school task assignment notification:", notifErr);
        }
      }
    }
  } catch (taskErr) {
    console.error("Error generating driving school task:", taskErr);
  }

  // Sync to Accounting so Driving School revenues appear in Accounting Module
  try {
    const accPaymentStatus: "Paid" | "Partially Paid" | "Pending" =
      remFee <= 0 && totFee > 0 ? "Paid" : advFee > 0 ? "Partially Paid" : "Pending";

    await saveAccountingRecord({
      id: finalId,
      applicationId: generatedAppId,
      applicationDocId: finalId,
      clientId: finalId,
      clientName: appData.studentName || "",
      mobileNumber: appData.mobileNumber || "",
      vehicleNumber: appData.vehicleNumber || generatedAppId,
      totalPayment: totFee,
      advancePayment: advFee,
      remainingPayment: remFee,
      paymentStatus: accPaymentStatus,
      createdAt: now,
      updatedAt: now,
    });
  } catch (accErr) {
    console.error("Error syncing Driving School accounting record:", accErr);
  }

  // Auto-sync invoice with driving school application details
  await syncInvoice(finalId, "driving_school").catch((err) => {
    console.error("Failed to sync invoice inside saveDrivingSchoolApplication:", err);
  });

  // Auto-sync customer / client section
  await saveClient({
    id: finalId,
    name: appData.studentName || "Client",
    mobile: appData.mobileNumber || "",
    address: appData.address || "",
    companyName: "",
    notes: "",
    type: "client",
    ownerName: appData.studentName || "Client",
  }).catch((err) => {
    console.error("Failed to auto-sync client inside saveDrivingSchoolApplication:", err);
  });

  return finalId;
}

export async function deleteDrivingSchoolApplication(id: string): Promise<void> {
  const session = getSession();
  if (!session || (session.role !== "admin" && session.role !== "manager")) {
    throw new Error("Access Denied: Only Admin or Manager can delete driving school applications.");
  }
  if (!id) return;
  try {
    const appRef = doc(db, DRIVING_SCHOOL_COL, id);
    const appSnap = await getDoc(appRef);
    const generatedAppIdStr = appSnap.exists() ? appSnap.data()?.applicationId : "";

    // 1. Delete the driving school application doc itself
    await deleteDoc(appRef);

    // 2. Delete linked accounting records from registry_accounting
    await deleteDoc(doc(db, "registry_accounting", id)).catch(console.error);

    // 3. Delete linked billing invoices from billing_invoices
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

    // 4. Delete linked tasks from registry_tasks
    const taskDocsToDelete = new Map();
    if (id) {
      const tq1 = query(collection(db, "registry_tasks"), where("applicationDocId", "==", id));
      const ts1 = await getDocs(tq1);
      ts1.docs.forEach((d) => taskDocsToDelete.set(d.id, d.ref));

      const tq2 = query(collection(db, "registry_tasks"), where("parentApplicationId", "==", id));
      const ts2 = await getDocs(tq2);
      ts2.docs.forEach((d) => taskDocsToDelete.set(d.id, d.ref));

      const tq3 = query(collection(db, "registry_tasks"), where("clientId", "==", id));
      const ts3 = await getDocs(tq3);
      ts3.docs.forEach((d) => taskDocsToDelete.set(d.id, d.ref));
    }
    if (generatedAppIdStr) {
      const tq4 = query(collection(db, "registry_tasks"), where("applicationId", "==", generatedAppIdStr));
      const ts4 = await getDocs(tq4);
      ts4.docs.forEach((d) => taskDocsToDelete.set(d.id, d.ref));
    }
    for (const tRef of taskDocsToDelete.values()) {
      await deleteDoc(tRef).catch(console.error);
    }

    // 5. Delete linked history/dashboard records from history
    const historyDocsToDelete = new Map();
    if (id) {
      const hq1 = query(collection(db, "history"), where("applicationDocId", "==", id));
      const hs1 = await getDocs(hq1);
      hs1.docs.forEach((d) => historyDocsToDelete.set(d.id, d.ref));
    }
    if (generatedAppIdStr) {
      const hq2 = query(collection(db, "history"), where("applicationId", "==", generatedAppIdStr));
      const hs2 = await getDocs(hq2);
      hs2.docs.forEach((d) => historyDocsToDelete.set(d.id, d.ref));
    }
    for (const hRef of historyDocsToDelete.values()) {
      await deleteDoc(hRef).catch(console.error);
    }
  } catch (err) {
    console.error("Error in deleteDrivingSchoolApplication:", err);
    throw err;
  }
}

// Export Utilities (CSV, Excel, PDF)
export function exportDrivingSchoolToCSV(apps: DrivingSchoolApplication[]) {
  if (!apps || apps.length === 0) return;
  const headers = [
    "Application ID",
    "Student Name",
    "Mobile Number",
    "C/O",
    "Date of Birth",
    "Course Type",
    "Joining Date",
    "Total Fees",
    "Advance Paid",
    "Remaining Fees",
    "Payment Status",
    "Assigned Employee",
    "Priority",
  ];

  const rows = apps.map((a) => [
    `"${a.applicationId || a.id}"`,
    `"${a.studentName || ""}"`,
    `"${a.mobileNumber || ""}"`,
    `"${a.co || ""}"`,
    `"${a.dateOfBirth || ""}"`,
    `"${a.courseType || ""}"`,
    `"${a.joiningDate || ""}"`,
    a.totalCourseFees || 0,
    a.advancePaid || 0,
    a.remainingFees || 0,
    `"${a.paymentStatus || ""}"`,
    `"${a.assignedEmployee || ""}"`,
    `"${a.priority || ""}"`,
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Driving_School_Students_${new Date().toISOString().split("T")[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportDrivingSchoolToExcel(apps: DrivingSchoolApplication[]) {
  exportDrivingSchoolToCSV(apps);
}

export function exportDrivingSchoolToPDF(apps: DrivingSchoolApplication[]) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Driving School Students Report</title>
      <style>
        body { font-family: sans-serif; padding: 20px; color: #1e293b; }
        h1 { color: #0f172a; font-size: 20px; margin-bottom: 4px; }
        p { color: #64748b; font-size: 12px; margin-top: 0; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
        th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
        th { background-color: #f1f5f9; font-weight: bold; }
        .paid { color: #047857; font-weight: bold; }
        .partial { color: #b45309; font-weight: bold; }
        .pending { color: #be123c; font-weight: bold; }
      </style>
    </head>
    <body>
      <h1>Driving School Students List</h1>
      <p>Report Generated on ${new Date().toLocaleDateString()} | Total Records: ${apps.length}</p>
      <table>
        <thead>
          <tr>
            <th>App ID</th>
            <th>Student Name</th>
            <th>Mobile</th>
            <th>Course</th>
            <th>Joining Date</th>
            <th>Total Fees</th>
            <th>Advance</th>
            <th>Remaining</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${apps
            .map(
              (a) => `
            <tr>
              <td>${a.applicationId || a.id}</td>
              <td><strong>${a.studentName}</strong></td>
              <td>${a.mobileNumber || "—"}</td>
              <td>${a.courseType || "—"}</td>
              <td>${a.joiningDate || "—"}</td>
              <td>₹${(a.totalCourseFees || 0).toLocaleString()}</td>
              <td>₹${(a.advancePaid || 0).toLocaleString()}</td>
              <td>₹${(a.remainingFees || 0).toLocaleString()}</td>
              <td class="${(a.paymentStatus || "").toLowerCase()}">${a.paymentStatus}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `;
  printWindow.document.write(html);
  printWindow.document.close();
}
