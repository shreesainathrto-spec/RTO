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
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { removeUndefined } from "./records";
import { getSession } from "./auth";

export const DRIVING_SCHOOL_VEHICLES_COL = "DrivingSchoolVehicles";
export const DRIVING_SCHOOL_DAILY_REPORTS_COL = "DrivingSchoolDailyReports";

export interface DrivingSchoolVehicle {
  id: string;
  vehicleNumber: string;
  vehicleName: string;
  manufacturer: string;
  model: string;
  vehicleType: string;
  fuelType: string;
  registrationDate: string;
  insuranceExpiry: string;
  fitnessExpiry: string;
  pucExpiry: string;
  permitExpiry: string;
  taxExpiry: string;
  currentOdometer: number;
  vehiclePhoto: string;
  status: "Available" | "In Use" | "Maintenance";
  documents?: {
    rc?: string;
    insurance?: string;
    fitness?: string;
    puc?: string;
    permit?: string;
    taxReceipt?: string;
    [key: string]: string | undefined;
  };
  createdAt: string;
  updatedAt: string;
}

export interface StudentTrip {
  studentName: string;
  batch?: string;
  pickupTime: string;
  dropTime: string;
  pickupLocation: string;
  dropLocation: string;
  purpose: string;
  remarks?: string;
}

export interface DrivingSchoolDailyReport {
  id: string;
  vehicleId: string;
  vehicleNumber: string;
  driver?: string;
  reportDate: string;
  
  // Odometer Info
  startOdometer: number;
  startOdometerPhoto?: string;
  endOdometer: number;
  endOdometerPhoto?: string;
  distanceTravelled: number;
  
  // Expenses
  fuelExpense?: number;
  generalExpense?: number;
  otherExpense?: number;
  expenseRemarks?: string;
  totalExpense?: number;
  
  // Student Trips
  studentTrips: StudentTrip[];
  
  // Legacy / Compatibility fields
  studentName?: string;
  fuelAmount?: number;
  generalExpenseAmount?: number;
  notes?: string;
  
  createdAt: string;
  updatedAt: string;
  reportType?: string;
  studentId?: string;
}

/**
 * Uploads a file or base64 data string to Firebase Storage under the given path and returns its download URL.
 * If data is already a remote HTTP/HTTPS URL, returns it as-is.
 * If data is invalid/empty or fails, handles gracefully.
 */
export async function uploadImageToStorage(
  fileOrBase64: File | string,
  storagePath: string
): Promise<string> {
  if (!fileOrBase64) return "";

  // If already a remote download URL, return directly
  if (typeof fileOrBase64 === "string" && (fileOrBase64.startsWith("http://") || fileOrBase64.startsWith("https://"))) {
    return fileOrBase64;
  }

  try {
    let blob: Blob;
    let contentType = "image/jpeg";

    if (fileOrBase64 instanceof File) {
      blob = fileOrBase64;
      contentType = fileOrBase64.type || "image/jpeg";
    } else if (typeof fileOrBase64 === "string" && fileOrBase64.startsWith("data:")) {
      const parts = fileOrBase64.split(",");
      const mimeMatch = parts[0].match(/:(.*?);/);
      if (mimeMatch) contentType = mimeMatch[1];
      const byteString = atob(parts[1]);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      blob = new Blob([ab], { type: contentType });
    } else {
      // Unknown format or legacy non-URL string
      return "";
    }

    const storageRef = ref(storage, storagePath);
    const uploadTask = await uploadBytesResumable(storageRef, blob, { contentType });
    const downloadUrl = await getDownloadURL(uploadTask.ref);
    return downloadUrl;
  } catch (err) {
    console.error(`Failed to upload image to Firebase Storage path [${storagePath}]:`, err);
    throw err;
  }
}

// 1. Realtime listener for Driving School Vehicles
export function subscribeDrivingSchoolVehiclesList(
  callback: (vehicles: DrivingSchoolVehicle[]) => void
): () => void {
  const q = query(collection(db, DRIVING_SCHOOL_VEHICLES_COL), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DrivingSchoolVehicle));
      callback(list);
    },
    (err) => {
      console.error("Error subscribing to Driving School Vehicles:", err);
      // Fallback query without orderBy if index is building
      const fallbackQ = query(collection(db, DRIVING_SCHOOL_VEHICLES_COL));
      return onSnapshot(fallbackQ, (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DrivingSchoolVehicle));
        callback(list);
      });
    }
  );
}

// 2. Realtime listener for Daily Reports of a Vehicle
export function subscribeDailyReportsForVehicle(
  vehicleId: string,
  callback: (reports: DrivingSchoolDailyReport[]) => void
): () => void {
  const q = query(
    collection(db, DRIVING_SCHOOL_DAILY_REPORTS_COL),
    where("vehicleId", "==", vehicleId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DrivingSchoolDailyReport));
      reports.sort((a, b) => new Date(b.reportDate || b.createdAt).getTime() - new Date(a.reportDate || a.createdAt).getTime());
      callback(reports);
    },
    (err) => {
      console.error("Error subscribing to daily reports for vehicle:", err);
      callback([]);
    }
  );
}

// 3. Realtime listener for ALL Daily Reports
export function subscribeAllDailyReports(
  callback: (reports: DrivingSchoolDailyReport[]) => void
): () => void {
  const q = query(collection(db, DRIVING_SCHOOL_DAILY_REPORTS_COL));
  return onSnapshot(
    q,
    (snap) => {
      const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DrivingSchoolDailyReport));
      reports.sort((a, b) => new Date(b.reportDate || b.createdAt).getTime() - new Date(a.reportDate || a.createdAt).getTime());
      callback(reports);
    },
    (err) => {
      console.error("Error subscribing to all daily reports:", err);
      callback([]);
    }
  );
}

// 4. Save / Update Vehicle
export async function saveDrivingSchoolVehicleRecord(
  vehicleData: Partial<DrivingSchoolVehicle>,
  existingId?: string
): Promise<string> {
  const session = getSession();
  const now = new Date().toISOString();

  const finalId = existingId || vehicleData.id;
  const isUpdate = !!finalId;
  let targetId = finalId;
  let docRef;

  if (!isUpdate || !targetId) {
    docRef = doc(collection(db, DRIVING_SCHOOL_VEHICLES_COL));
    targetId = docRef.id;
  } else {
    docRef = doc(db, DRIVING_SCHOOL_VEHICLES_COL, targetId);
  }

  // Upload vehicle photo if base64/File
  let vehiclePhotoUrl = vehicleData.vehiclePhoto || "";
  if (vehiclePhotoUrl && (vehiclePhotoUrl.startsWith("data:") || (vehiclePhotoUrl as any) instanceof File)) {
    vehiclePhotoUrl = await uploadImageToStorage(
      vehiclePhotoUrl,
      `vehicles/${targetId}/photo_${Date.now()}.jpg`
    );
  }

  // Upload document photos if base64/File
  const processedDocs: Record<string, string> = {};
  if (vehicleData.documents) {
    for (const [key, val] of Object.entries(vehicleData.documents)) {
      if (!val) continue;
      if (typeof val === "string" && (val.startsWith("data:") || (val as any) instanceof File)) {
        processedDocs[key] = await uploadImageToStorage(
          val,
          `vehicles/${targetId}/documents/${key}_${Date.now()}.jpg`
        );
      } else if (typeof val === "string" && (val.startsWith("http://") || val.startsWith("https://"))) {
        processedDocs[key] = val;
      }
    }
  }

  if (!isUpdate) {
    const payload = removeUndefined({
      ...vehicleData,
      id: targetId,
      vehiclePhoto: vehiclePhotoUrl,
      documents: processedDocs,
      status: vehicleData.status || "Available",
      currentOdometer: Number(vehicleData.currentOdometer) || 0,
      createdAt: now,
      updatedAt: now,
      createdBy: session?.name || "System",
    });

    await setDoc(docRef, payload);
  } else {
    const payload = removeUndefined({
      ...vehicleData,
      id: targetId,
      vehiclePhoto: vehiclePhotoUrl,
      documents: processedDocs,
      currentOdometer: Number(vehicleData.currentOdometer) || 0,
      updatedAt: now,
      updatedBy: session?.name || "System",
    });

    await setDoc(docRef, payload, { merge: true });
  }

  return targetId;
}

// 5. Delete Vehicle
export async function deleteDrivingSchoolVehicleRecord(id: string): Promise<void> {
  if (!id) return;
  await deleteDoc(doc(db, DRIVING_SCHOOL_VEHICLES_COL, id));
}

// 6. Save / Update Daily Report (Auto updates Vehicle's currentOdometer)
export async function saveDrivingSchoolDailyReportRecord(
  reportData: Partial<DrivingSchoolDailyReport> & { vehicleId: string; vehicleNumber: string; startOdometer: number; endOdometer: number },
  existingId?: string
): Promise<string> {
  const session = getSession();
  const now = new Date().toISOString();

  const finalId = existingId || reportData.id;
  const isUpdate = !!finalId;
  let targetId = finalId;
  let docRef;

  if (!isUpdate || !targetId) {
    docRef = doc(collection(db, DRIVING_SCHOOL_DAILY_REPORTS_COL));
    targetId = docRef.id;
  } else {
    docRef = doc(db, DRIVING_SCHOOL_DAILY_REPORTS_COL, targetId);
  }

  // Upload start & end odometer photos if base64/File
  let startOdoPhotoUrl = reportData.startOdometerPhoto || "";
  if (startOdoPhotoUrl && (startOdoPhotoUrl.startsWith("data:") || (startOdoPhotoUrl as any) instanceof File)) {
    startOdoPhotoUrl = await uploadImageToStorage(
      startOdoPhotoUrl,
      `vehicles/${reportData.vehicleId}/reports/${targetId}_start_${Date.now()}.jpg`
    );
  }

  let endOdoPhotoUrl = reportData.endOdometerPhoto || "";
  if (endOdoPhotoUrl && (endOdoPhotoUrl.startsWith("data:") || (endOdoPhotoUrl as any) instanceof File)) {
    endOdoPhotoUrl = await uploadImageToStorage(
      endOdoPhotoUrl,
      `vehicles/${reportData.vehicleId}/reports/${targetId}_end_${Date.now()}.jpg`
    );
  }

  const distance = Math.max(0, (Number(reportData.endOdometer) || 0) - (Number(reportData.startOdometer) || 0));
  const fExp = Number(reportData.fuelExpense) || 0;
  const gExp = Number(reportData.generalExpense) || 0;
  const oExp = Number(reportData.otherExpense) || 0;
  const totalExp = fExp + gExp + oExp;

  if (!isUpdate) {
    const payload = removeUndefined({
      ...reportData,
      id: targetId,
      startOdometerPhoto: startOdoPhotoUrl,
      endOdometerPhoto: endOdoPhotoUrl,
      startOdometer: Number(reportData.startOdometer) || 0,
      endOdometer: Number(reportData.endOdometer) || 0,
      distanceTravelled: distance,
      fuelExpense: fExp,
      generalExpense: gExp,
      otherExpense: oExp,
      totalExpense: totalExp,
      studentTrips: reportData.studentTrips || [],
      createdAt: now,
      updatedAt: now,
      createdBy: session?.name || "System",
    });

    await setDoc(docRef, payload);
  } else {
    const payload = removeUndefined({
      ...reportData,
      id: targetId,
      startOdometerPhoto: startOdoPhotoUrl,
      endOdometerPhoto: endOdoPhotoUrl,
      startOdometer: Number(reportData.startOdometer) || 0,
      endOdometer: Number(reportData.endOdometer) || 0,
      distanceTravelled: distance,
      fuelExpense: fExp,
      generalExpense: gExp,
      otherExpense: oExp,
      totalExpense: totalExp,
      studentTrips: reportData.studentTrips || [],
      updatedAt: now,
      updatedBy: session?.name || "System",
    });

    await setDoc(docRef, payload, { merge: true });
  }

  // Auto-update currentOdometer on Vehicle document
  if (reportData.vehicleId && reportData.endOdometer > 0) {
    const vehRef = doc(db, DRIVING_SCHOOL_VEHICLES_COL, reportData.vehicleId);
    await setDoc(
      vehRef,
      {
        currentOdometer: Number(reportData.endOdometer),
        updatedAt: now,
      },
      { merge: true }
    );
  }

  return targetId;
}

// 7. Delete Daily Report
export async function deleteDrivingSchoolDailyReportRecord(id: string): Promise<void> {
  if (!id) return;
  await deleteDoc(doc(db, DRIVING_SCHOOL_DAILY_REPORTS_COL, id));
}

