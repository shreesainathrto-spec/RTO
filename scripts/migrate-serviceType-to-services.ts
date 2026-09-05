import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { normalizeServiceType } from "../src/lib/records";

// This script runs locally with Node.js. It requires FIREBASE_ env vars or
// will import the project's firebase config if available.

async function run() {
  console.log("Migration: serviceType -> services[] starting");
  // Load firebase config from project
  const { firebaseConfig } = require("../src/lib/firebase");
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const buckets = ["registry_clients", "registry_leads", "registry_customers"];

  for (const colName of buckets) {
    console.log("Scanning collection:", colName);
    const snap = await getDocs(collection(db, colName));
    for (const d of snap.docs) {
      const data = d.data();
      if (data.services && Array.isArray(data.services) && data.services.length > 0) continue;
      const st = data.serviceType;
      if (st) {
        const n = normalizeServiceType(st);
        if (n) {
          await updateDoc(doc(db, colName, d.id), { services: [n] });
          console.log("Updated", d.id, "->", [n]);
        } else {
          console.warn("Could not normalize serviceType for", d.id, st);
        }
      }
    }
  }

  console.log("Migration complete");
}

run().catch((e) => {
  console.error("Migration failed", e);
  process.exit(1);
});
