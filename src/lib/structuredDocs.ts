import { db, storage } from "./firebase";
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { getSession } from "./auth";
import { logActivity } from "./hierarchy";

export interface ClientDocument {
  id: string;
  clientId: string;
  fileName: string;
  url: string;
  uploadedAt: string;
  uploadedBy: string;
  category: string;
  storagePath: string;
}

export interface VehicleDocumentInfo {
  id: string;
  vehicleId: string;
  clientId: string;
  documentType: string;
  fileName: string;
  url: string;
  uploadedAt: string;
  uploadedBy: string;
  storagePath: string;
  expiryDate?: string;
  documentNumber?: string;
}

// Subscribe to Client Documents
export function subscribeClientDocs(
  clientId: string,
  cb: (docs: ClientDocument[]) => void,
): () => void {
  const q = query(collection(db, "client_documents"), where("clientId", "==", clientId));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClientDocument));
  });
}

// Subscribe to Vehicle Documents
export function subscribeVehicleDocs(
  clientId: string,
  cb: (docs: VehicleDocumentInfo[]) => void,
): () => void {
  const q = query(collection(db, "vehicle_documents"), where("clientId", "==", clientId));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as VehicleDocumentInfo));
  });
}

export async function saveClientDocument(
  clientId: string,
  category: string,
  file: File,
  existingDoc: ClientDocument | null,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const session = getSession();
  const userName = session?.name || "System";
  const now = new Date().toISOString();



  const allowedExtensions = ["pdf", "jpg", "jpeg", "png", "webp"];
  const fileExt = file.name.split(".").pop()?.toLowerCase() || "";
  if (!allowedExtensions.includes(fileExt)) {
    throw new Error("Allowed formats: PDF, JPG, JPEG, PNG, WEBP");
  }

  const docId = existingDoc?.id || crypto.randomUUID();
  const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const storagePath = `client_documents/${clientId}/${category}/${docId}_${cleanFileName}`;
  const storageRef = ref(storage, storagePath);

  const uploadTask = uploadBytesResumable(storageRef, file);
  await new Promise<void>((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        onProgress?.(pct);
      },
      (err) => reject(err),
      () => resolve(),
    );
  });

  const downloadUrl = await getDownloadURL(storageRef);

  const docRef = doc(db, "client_documents", docId);
  await setDoc(docRef, {
    clientId,
    category,
    fileName: file.name,
    url: downloadUrl,
    uploadedAt: now,
    uploadedBy: userName,
    storagePath,
  });

  if (existingDoc && existingDoc.storagePath && existingDoc.storagePath !== storagePath) {
    try {
      await deleteObject(ref(storage, existingDoc.storagePath));
    } catch (err) {
      console.warn("Could not delete old storage reference:", err);
    }
  }

  const actorOverride = session
    ? { name: session.name, uid: session.uid, role: session.role }
    : undefined;
  if (existingDoc) {
    await logActivity(
      clientId,
      `${userName} replaced ${category.replace("_", " ").toUpperCase()}`,
      `Client Document: ${category}`,
      existingDoc.fileName,
      file.name,
      actorOverride,
    );
  } else {
    await logActivity(
      clientId,
      `Document Uploaded`,
      `Client Document: ${category}`,
      null,
      file.name,
      actorOverride,
    );
  }
}

export async function saveVehicleDocument(
  clientId: string,
  vehicleId: string,
  documentType: string,
  file: File,
  existingDoc: VehicleDocumentInfo | null,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const session = getSession();
  const userName = session?.name || "System";
  const now = new Date().toISOString();



  const allowedExtensions = ["pdf", "jpg", "jpeg", "png", "webp"];
  const fileExt = file.name.split(".").pop()?.toLowerCase() || "";
  if (!allowedExtensions.includes(fileExt)) {
    throw new Error("Allowed formats: PDF, JPG, JPEG, PNG, WEBP");
  }

  const docId = existingDoc?.id || crypto.randomUUID();
  const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const storagePath = `vehicle_documents/${clientId}/${vehicleId}/${documentType}/${docId}_${cleanFileName}`;
  const storageRef = ref(storage, storagePath);

  const uploadTask = uploadBytesResumable(storageRef, file);
  await new Promise<void>((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        onProgress?.(pct);
      },
      (err) => reject(err),
      () => resolve(),
    );
  });

  const downloadUrl = await getDownloadURL(storageRef);

  const docRef = doc(db, "vehicle_documents", docId);
  await setDoc(docRef, {
    clientId,
    vehicleId,
    documentType,
    fileName: file.name,
    url: downloadUrl,
    uploadedAt: now,
    uploadedBy: userName,
    storagePath,
  }, { merge: true });

  if (existingDoc && existingDoc.storagePath && existingDoc.storagePath !== storagePath) {
    try {
      await deleteObject(ref(storage, existingDoc.storagePath));
    } catch (err) {
      console.warn("Could not delete old storage reference:", err);
    }
  }

  const actorOverride = session
    ? { name: session.name, uid: session.uid, role: session.role }
    : undefined;
  if (existingDoc) {
    await logActivity(
      clientId,
      `${userName} replaced ${documentType.replace("_", " ").toUpperCase()}`,
      `Vehicle Document: ${documentType}`,
      existingDoc.fileName,
      file.name,
      actorOverride,
    );
  } else {
    await logActivity(
      clientId,
      `Document Uploaded`,
      `Vehicle Document: ${documentType}`,
      null,
      file.name,
      actorOverride,
    );
  }
}

export async function deleteClientDocEntry(docObj: ClientDocument): Promise<void> {
  const session = getSession();
  const userName = session?.name || "System";
  await deleteDoc(doc(db, "client_documents", docObj.id));
  if (docObj.storagePath) {
    try {
      await deleteObject(ref(storage, docObj.storagePath));
    } catch (err) {
      console.warn(err);
    }
  }
  const actorOverride = session
    ? { name: session.name, uid: session.uid, role: session.role }
    : undefined;
  await logActivity(
    docObj.clientId,
    `Document Removed`,
    `Client Document: ${docObj.category}`,
    docObj.fileName,
    null,
    actorOverride,
  );
}

export async function deleteVehicleDocEntry(docObj: VehicleDocumentInfo): Promise<void> {
  const session = getSession();
  const userName = session?.name || "System";
  await deleteDoc(doc(db, "vehicle_documents", docObj.id));
  if (docObj.storagePath) {
    try {
      await deleteObject(ref(storage, docObj.storagePath));
    } catch (err) {
      console.warn(err);
    }
  }
  const actorOverride = session
    ? { name: session.name, uid: session.uid, role: session.role }
    : undefined;
  await logActivity(
    docObj.clientId,
    `Document Removed`,
    `Vehicle Document: ${docObj.documentType}`,
    docObj.fileName,
    null,
    actorOverride,
  );
}
