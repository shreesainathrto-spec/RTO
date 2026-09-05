import fs from "fs";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import path from "path";
import { fileURLToPath } from "url";

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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: node read_invoice.mjs <docId>");
    process.exit(1);
  }
  const d = doc(db, "invoices", id);
  try {
    const snap = await getDoc(d);
    if (!snap.exists()) {
      console.log("Not found");
      process.exit(0);
    }
    console.log("Document:", snap.id, snap.data());
  } catch (err) {
    console.error("Read failed:", err);
    process.exit(2);
  }
}

run();
