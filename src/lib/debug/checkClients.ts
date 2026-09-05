import { getDocs, collection } from "firebase/firestore";
import { db } from "../firebase";
import { CLIENTS_COL } from "../hierarchy";

async function checkClients() {
  const snapshot = await getDocs(collection(db, CLIENTS_COL));
  console.log("registry_clients_v2 document count:", snapshot.size);
  snapshot.docs.forEach((doc) => {
    console.log("Client ID:", doc.id, "Data:", doc.data());
  });
}

checkClients().catch((err) => console.error("Error checking clients:", err));
