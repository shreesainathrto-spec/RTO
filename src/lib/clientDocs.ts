import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc as firestoreDeleteDoc,
} from "firebase/firestore";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { db, storage } from "./firebase";
import { removeUndefined } from "./records";
import { toast } from "sonner";

export function handleFirestoreError(err: any, context: string) {
  console.error(`[Firestore Error: ${context}]`, err);
  if (err && (err.code === "failed-precondition" || err.message?.includes("index"))) {
    toast.error("Database index is being prepared. Please try again shortly.");
  }
}

export interface ClientDoc {
  id: string;
  clientId: string;
  name: string;
  type: string;
  addedAt: string;
  storagePath?: string;
  downloadURL?: string;
  mimeType?: string;
  fileSize?: number;
}

const COL = "registry_client_docs";
export const GENERAL_CLIENT_ID = "__unlinked__";

export function subscribeToDocsFor(
  clientId: string,
  cb: (docs: ClientDoc[]) => void,
): () => void {
  const q = query(
    collection(db, COL),
    where("clientId", "==", clientId),
    orderBy("addedAt", "desc"),
  );

  const unsub = onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClientDoc);
      cb(docs);
    },
    (error) => {
      handleFirestoreError(error, "subscribeToDocsFor");
    },
  );

  return unsub;
}

async function uploadFileWithRetry(
  storageRef: any,
  file: File,
  onProgress?: (pct: number) => void,
  maxRetries = 3,
): Promise<string> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const uploadTask = uploadBytesResumable(storageRef, file);
      if (onProgress) {
        uploadTask.on("state_changed", (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress(progress);
        });
      }
      await uploadTask;
      return await getDownloadURL(storageRef);
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) throw error;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error("Upload failed after retries.");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function addDoc(
  clientId: string,
  name: string,
  type: string,
  file?: File,
  onProgress?: (pct: number) => void,
): Promise<ClientDoc> {
  const id = crypto.randomUUID();
  let storagePath: string | undefined;
  let downloadURL: string | undefined;
  let mimeType: string | undefined;
  let fileSize: number | undefined;

  if (file) {
    const safeFileName = `${id}_${file.name}`;
    storagePath =
      clientId === GENERAL_CLIENT_ID
        ? `documents/general/attachments/${safeFileName}`
        : `clients/${clientId}/attachments/${safeFileName}`;
    const storageRef = ref(storage, storagePath);

    try {
      downloadURL = await uploadFileWithRetry(storageRef, file, onProgress);
      mimeType = file.type;
      fileSize = file.size;
    } catch (error) {
      try {
        await deleteObject(storageRef);
      } catch {}
      throw new Error(`Upload failed: ${getErrorMessage(error)}`);
    }
  }

  const docEntry: ClientDoc = {
    id,
    clientId,
    name,
    type,
    addedAt: new Date().toISOString(),
    ...(storagePath ? { storagePath, downloadURL, mimeType, fileSize } : {}),
  };

  try {
    const { id: _id, ...data } = docEntry;
    const docRef = doc(db, COL, id);
    await setDoc(docRef, removeUndefined(data));
    return docEntry;
  } catch (error) {
    throw new Error(
      `Failed to save document: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function updateDoc(
  docId: string,
  clientId: string,
  name: string,
  type: string,
  file: File,
  onProgress?: (pct: number) => void,
  oldStoragePath?: string,
): Promise<ClientDoc> {
  if (oldStoragePath) {
    try {
      const oldRef = ref(storage, oldStoragePath);
      await deleteObject(oldRef);
    } catch (err) {
      console.warn("[updateDoc] Failed to delete old storage object:", err);
    }
  }

  const safeFileName = `${docId}_${file.name}`;
  const storagePath =
    clientId === GENERAL_CLIENT_ID
      ? `documents/general/attachments/${safeFileName}`
      : `clients/${clientId}/attachments/${safeFileName}`;
  const storageRef = ref(storage, storagePath);

  let downloadURL: string;
  try {
    downloadURL = await uploadFileWithRetry(storageRef, file, onProgress);
  } catch (error) {
    throw new Error(`Upload failed: ${getErrorMessage(error)}`);
  }

  const docEntry: ClientDoc = {
    id: docId,
    clientId,
    name,
    type,
    addedAt: new Date().toISOString(),
    storagePath,
    downloadURL,
    mimeType: file.type,
    fileSize: file.size,
  };

  try {
    const { id: _id, ...data } = docEntry;
    const docRef = doc(db, COL, docId);
    await setDoc(docRef, removeUndefined(data));
    return docEntry;
  } catch (error) {
    throw new Error(
      `Failed to save document: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function deleteDoc(docId: string, storagePath?: string): Promise<void> {
  if (storagePath) {
    try {
      const storageRef = ref(storage, storagePath);
      await deleteObject(storageRef);
    } catch (error) {
      console.warn("[deleteDoc] Failed to delete storage object:", error);
    }
  }

  try {
    const docRef = doc(db, COL, docId);
    await firestoreDeleteDoc(docRef);
  } catch (error) {
    throw new Error(
      `Failed to delete document entry: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
