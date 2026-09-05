import { db } from "./src/lib/firebase";
import { doc, deleteDoc } from "firebase/firestore";

async function run() {
  try {
    const ids = ["AolAC7sB9Tc1EKBX02Ma", "tNrTxDmkqE7WwbjjXcd8"];
    for (const id of ids) {
      const ref = doc(db, "registry_services_v2", id);
      await deleteDoc(ref);
      console.log(`🗑️ DELETED CORRUPTED SERVICE DOC: ${id}`);
    }
  } catch (err) {
    console.error(err);
  }
}

run();
