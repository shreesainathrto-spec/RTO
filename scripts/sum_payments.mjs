import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

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
  try {
    const snap = await getDocs(collection(db, "clientPayments"));
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    console.log("Payments count=", items.length, "Total revenue=₹" + total.toLocaleString("en-IN"));
    // Show per-client totals for top few
    const byClient = {};
    for (const it of items) {
      const cid = it.clientId || "unknown";
      byClient[cid] = (byClient[cid] || 0) + (Number(it.amount) || 0);
    }
    console.log("Per-client totals (sample):");
    for (const k of Object.keys(byClient).slice(0, 20)) {
      console.log(" ", k, "-> ₹" + byClient[k].toLocaleString("en-IN"));
    }
  } catch (err) {
    console.error("Query failed", err);
    process.exit(2);
  }
}

run();
