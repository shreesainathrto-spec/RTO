import fs from "fs";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";

function parseDotEnv(path) {
  const raw = fs.readFileSync(path, "utf8");
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

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");
if (!fs.existsSync(envPath)) {
  console.error(".env not found at", envPath);
  process.exit(1);
}
const env = parseDotEnv(envPath);
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

console.log("Using Firebase project:", firebaseConfig.projectId);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const payload = {
    clientId: "c1",
    amount: 5000,
    paymentMode: "UPI",
    accountName: "Main Account",
    transactionDate: new Date().toISOString(),
    receivedBy: "automated-script",
    referenceNumber: "TEST1",
    remarks: "Automated test payment",
    createdAt: new Date().toISOString(),
  };

  try {
    const ref = await addDoc(collection(db, "clientPayments"), payload);
    console.log("Payment written, id=", ref.id);
    process.exit(0);
  } catch (err) {
    console.error("Write failed:", err);
    process.exit(2);
  }
}

run();
