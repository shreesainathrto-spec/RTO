import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "firebase/firestore";

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
  try {
    const snap = await getDocs(collection(db, "users"));
    console.log(`Found ${snap.docs.length} users.`);
    for (const d of snap.docs) {
      const data = d.data();
      const empId = data.employeeId || "";
      const username = data.username || "";
      if (empId === "Boss001" || username === "admin") {
        console.log(`Keeping Boss account: ${username} (${empId})`);
        continue;
      }
      console.log(`Deleting user: ${username} (${empId}) ID: ${d.id}`);
      await deleteDoc(doc(db, "users", d.id));
    }
    console.log("Cleanup complete!");
  } catch (err) {
    console.error("Cleanup failed", err);
  }
}

run();
