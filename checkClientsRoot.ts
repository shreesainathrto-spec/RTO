import { getDocs, collection } from "firebase/firestore";
import { db } from "./src/lib/firebase";
import { CLIENTS_COL } from "./src/lib/hierarchy";

async function main() {
  const snap = await getDocs(collection(db, CLIENTS_COL));
  console.log("registry_clients_v2 document count:", snap.size);
  snap.forEach((doc) => {
    console.log("Client ID:", doc.id, "Data:", doc.data());
  });
}

main().catch((err) => console.error("Error:", err));
