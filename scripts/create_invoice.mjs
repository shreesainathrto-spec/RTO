import fs from "fs";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";
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

console.log("Using Firebase project:", firebaseConfig.projectId);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const now = new Date();
  const invoiceNumber = `INV-TEST-${now.getFullYear()}${now.getMonth() + 1}${now.getDate()}-${now.getTime()}`;

  const payload = {
    invoiceNumber,
    clientId: "sample-client-123",
    clientName: "Maulik",
    clientMobile: "9897969545",
    clientAddress: "Sample Address",
    vehicleNumber: "GJ03789",
    vehicleType: "Two-wheeler",
    billingPeriodStart: "2025-04-05",
    billingPeriodEnd: "2027-05-04",
    subtotal: 1000,
    totalTax: 180,
    totalAmount: 1180,
    invoiceDate: now.toISOString(),
    createdBy: "automated-script",
    createdAt: now.toISOString(),
    status: "Pending",
    services: [
      {
        serviceId: "svc-1",
        serviceName: "Fitness",
        vehicleNumber: "GJ03789",
        quantity: 1,
        unitPrice: 1000,
        amount: 1000,
        tax: 180,
        total: 1180,
      },
    ],
    totalPaid: 0,
  };

  try {
    const ref = await addDoc(collection(db, "invoices"), payload);
    console.log("Invoice written, id=", ref.id);
    process.exit(0);
  } catch (err) {
    console.error("Write failed:", err);
    process.exit(2);
  }
}

run();
