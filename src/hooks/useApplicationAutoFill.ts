import { useState, useEffect, useRef } from "react";
import { searchExistingApplication } from "@/lib/applications";

interface UseApplicationAutoFillProps {
  subModule: "services" | "insurance" | "licence" | "form5" | "driving_school";
  lookupValues: string | { name: string; mobile: string };
  onFill: (data: any) => void;
  onClear: () => void;
  isEditing?: boolean;
}

export function useApplicationAutoFill({
  subModule,
  lookupValues,
  onFill,
  onClear,
  isEditing = false,
}: UseApplicationAutoFillProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchedKeyRef = useRef<string>("");
  const isFilledRef = useRef<boolean>(false);

  // Helper to determine if lookup values are valid and serializable to a string
  const getSerializedKey = () => {
    if (typeof lookupValues === "string") {
      return lookupValues.trim().toUpperCase();
    }
    const name = (lookupValues.name || "").trim();
    const mobile = (lookupValues.mobile || "").trim();
    if (!name || !mobile) return "";
    return `${name.toLowerCase()}_${mobile}`;
  };

  const serializedKey = getSerializedKey();

  const performSearch = async (keyToSearch: string) => {
    if (isEditing || !keyToSearch) return;
    if (keyToSearch === lastFetchedKeyRef.current) return;

    setLoading(true);
    setSuccess(false);

    try {
      let lookupParam: any = lookupValues;
      if (subModule === "services") {
        lookupParam = typeof lookupValues === "string" ? lookupValues.trim() : "";
      } else {
        const obj = lookupValues as { name: string; mobile: string };
        if (subModule === "driving_school") {
          lookupParam = { studentName: obj.name, mobileNumber: obj.mobile };
        } else {
          lookupParam = { ownerName: obj.name, mobileNumber: obj.mobile };
        }
      }

      const match = await searchExistingApplication(subModule, lookupParam);
      if (match) {
        onFill(match);
        setSuccess(true);
        isFilledRef.current = true;
        lastFetchedKeyRef.current = keyToSearch;
        setTimeout(() => {
          setSuccess(false);
        }, 2000);
      }
    } catch (err) {
      console.error("AutoFill search error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search on typing
  useEffect(() => {
    if (isEditing) return;

    if (!serializedKey) {
      if (isFilledRef.current) {
        onClear();
        isFilledRef.current = false;
        lastFetchedKeyRef.current = "";
      }
      return;
    }

    if (serializedKey === lastFetchedKeyRef.current) {
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      performSearch(serializedKey);
    }, 500);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [serializedKey, isEditing]);

  const handleBlur = () => {
    if (isEditing || !serializedKey || serializedKey === lastFetchedKeyRef.current) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    performSearch(serializedKey);
  };

  return {
    loading,
    success,
    handleBlur,
  };
}
