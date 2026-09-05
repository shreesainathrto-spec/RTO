import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, updateDoc, arrayUnion, getDoc, setDoc } from "firebase/firestore";

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
  const col = "registry_clients";
  const ref = doc(db, col, clientId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    console.error("Client not found:", clientId);
    process.exit(1);
  }
  const data = snapshot.data();

  // Compute a due date 10 days from now
  const due = new Date();
  due.setDate(due.getDate() + 10);
  const dueStr = due.toISOString().split("T")[0]; // YYYY-MM-DD

  try {
    // Add services array entry
    await updateDoc(ref, {
      status: "In Progress",
      services: arrayUnion({ serviceType: "Insurance", dueDate: dueStr, status: "Active" }),
      serviceTypes: arrayUnion("Insurance"),
      serviceStatus: "In Progress",
      serviceDueDate: dueStr,
    });
    console.log(
      "Updated client",
      clientId,
      "status -> In Progress and added Insurance service due",
      dueStr,
    );
  } catch (err) {
    console.error("Update failed", err);
    process.exit(2);
  }
}

run();
