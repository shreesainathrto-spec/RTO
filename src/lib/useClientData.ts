import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ClientData } from "@/lib/whatsappTemplateEngine";

/**
 * Hook to fetch client data from Firestore.
 * @param clientId The document ID of the client in the "clients" collection.
 * @returns An object containing the client data, loading state and any error.
 */
export function useClientData(clientId: string) {
  const [data, setData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      return;
    }
    const fetchData = async () => {
      setLoading(true);
      try {
        const clientRef = doc(db, "clients", clientId);
        const snap = await getDoc(clientRef);
        if (snap.exists()) {
          const docData = snap.data();
          const clientData: ClientData = {
            clientName: docData.name ?? "",
            mobileNumber: docData.mobile ?? "",
            vehicleNumber: docData.vehicleNumber ?? "",
            serviceName: docData.serviceName,
            dueDate: docData.dueDate,
            pendingAmount: docData.pendingAmount,
            invoiceNumber: docData.invoiceNumber,
          };
          setData(clientData);
        } else {
          setData(null);
        }
      } catch (e) {
        setError(e as Error);
        console.error("Failed to fetch client data", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [clientId]);

  return { data, loading, error };
}
