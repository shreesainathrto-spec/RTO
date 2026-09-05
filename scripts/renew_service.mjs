import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";

function parseDotEnv(pathp) {
  const raw = fs.readFileSync(pathp, "utf8");
  const obj = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    obj[key] = val;
  }
  return obj;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");
const env = parseDotEnv(envPath);
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const clientId = "c1";
  const ref = doc(db, "registry_clients", clientId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    console.error("not found");
    process.exit(1);
  }
  const data = snap.data();
  const services = Array.isArray(data.services) ? data.services.slice() : [];
  let changed = false;
  for (let s of services) {
    if (s.serviceType === "Insurance" && s.dueDate && s.status !== "Completed") {
      s.status = "Completed";
      changed = true;
    }
  }
  if (!changed) {
    console.log("No matching Insurance service to update for", clientId);
    return;
  }
  try {
    await updateDoc(ref, { services });
    console.log("Marked Insurance services as Completed for", clientId);
  } catch (err) {
    console.error("Update failed", err);
  }
}

run();
