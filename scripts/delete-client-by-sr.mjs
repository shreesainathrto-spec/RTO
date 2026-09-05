#!/usr/bin/env node
import "dotenv/config";
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    "Usage: node scripts/delete-client-by-sr.mjs <srNo> [--hard] [--bucket=clients|leads|customers]",
  );
  process.exit(1);
}

const srNo = Number(args[0]);
const hard = args.includes("--hard");
const bucketArg = args.find((a) => a.startsWith("--bucket="));
const bucket = bucketArg ? bucketArg.split("=")[1] : "clients";

async function runAdminDelete() {
  const admin = await import("firebase-admin");
  let serviceAccount;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const p = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!fs.existsSync(p)) throw new Error("GOOGLE_APPLICATION_CREDENTIALS file not found: " + p);
    serviceAccount = JSON.parse(fs.readFileSync(p, "utf8"));
  } else if (process.env.SERVICE_ACCOUNT_JSON) {
    serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_JSON);
  } else {
    throw new Error(
      "No service account credentials found. Set GOOGLE_APPLICATION_CREDENTIALS or SERVICE_ACCOUNT_JSON",
    );
  }

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const col = db.collection(`registry_${bucket}`);
  const snap = await col.where("srNo", "==", srNo).get();
  if (snap.empty) {
    console.log(`No records found with srNo=${srNo} in registry_${bucket}`);
    return;
  }
  for (const doc of snap.docs) {
    console.log("Found:", doc.id, doc.data());
    if (hard) {
      await doc.ref.delete();
      console.log(`Hard-deleted ${doc.id}`);
    } else {
      await doc.ref.update({
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: "script",
        deleteReason: "Admin removal via script",
      });
      console.log(`Soft-deleted ${doc.id}`);
    }
  }
}

async function runClientDelete() {
  // Use web SDK as fallback. Requires VITE_FIREBASE_* env vars in .env
  const { initializeApp } = await import("firebase/app");
  const { getFirestore, collection, query, where, getDocs, doc, updateDoc, deleteDoc } =
    await import("firebase/firestore");

  const config = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
  };

  if (!config.projectId) throw new Error("VITE_FIREBASE_PROJECT_ID missing in environment");

  const app = initializeApp(config);
  const db = getFirestore(app);
  const colName = `registry_${bucket}`;
  const q = query(collection(db, colName), where("srNo", "==", srNo));
  const snap = await getDocs(q);
  if (snap.empty) {
    console.log(`No records found with srNo=${srNo} in ${colName}`);
    return;
  }
  for (const d of snap.docs) {
    console.log("Found:", d.id, d.data());
    if (hard) {
      await deleteDoc(doc(db, colName, d.id));
      console.log(`Hard-deleted ${d.id}`);
    } else {
      await updateDoc(doc(db, colName, d.id), {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: "script",
        deleteReason: "Admin removal via script",
      });
      console.log(`Soft-deleted ${d.id}`);
    }
  }
}

(async () => {
  try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.SERVICE_ACCOUNT_JSON) {
      await runAdminDelete();
    } else {
      await runClientDelete();
    }
    console.log("Done");
  } catch (err) {
    console.error("Error:", err);
    process.exit(2);
  }
})();
