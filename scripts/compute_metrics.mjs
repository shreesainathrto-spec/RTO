import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

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

function toDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt;
}

function daysBetween(a, b) {
  const ma = new Date(a);
  const mb = new Date(b);
  ma.setHours(0, 0, 0, 0);
  mb.setHours(0, 0, 0, 0);
  const ms = mb - ma;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

async function run() {
  // Total revenue from clientPayments
  const paymentsSnap = await getDocs(collection(db, "clientPayments"));
  const payments = paymentsSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const totalRevenue = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  // Active services: count records with status == 'In Progress' across buckets
  const buckets = ["registry_clients", "registry_leads", "registry_customers"];
  let activeCount = 0;
  let allRecords = [];
  for (const col of buckets) {
    const snap = await getDocs(collection(db, col));
    const recs = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    allRecords = allRecords.concat(recs);
    activeCount += recs.filter((r) => r.status === "In Progress").length;
  }

  // Upcoming renewals (30 days) using followups logic
  const flat = [];
  const now = new Date();
  for (const r of allRecords) {
    const services = [];
    if (Array.isArray(r.services) && r.services.length) {
      for (const s of r.services) {
        if (typeof s === "object") services.push(s);
        else
          services.push({
            serviceType: s,
            dueDate: r.serviceDueDate,
            status: r.serviceStatus || r.status,
          });
      }
    } else if (r.serviceType) {
      services.push({
        serviceType: r.serviceType,
        dueDate: r.serviceDueDate,
        status: r.serviceStatus || r.status,
      });
    }
    for (const s of services) {
      const due = toDate(s.dueDate);
      const entry = {
        clientId: r.id,
        clientName: r.name,
        serviceType: s.serviceType,
        dueDate: s.dueDate,
        status: s.status,
      };
      if (due) entry.daysRemaining = daysBetween(now, due);
      flat.push(entry);
    }
  }

  const upcoming30 = flat.filter(
    (e) => typeof e.daysRemaining === "number" && e.daysRemaining >= 0 && e.daysRemaining <= 30,
  );

  console.log("Total Revenue: ₹" + totalRevenue.toLocaleString("en-IN"));
  console.log("Active Services (records with status In Progress):", activeCount);
  console.log("Upcoming Renewals (30 days):", upcoming30.length);
  console.log("Sample upcoming entries:", upcoming30.slice(0, 10));
}

run();
