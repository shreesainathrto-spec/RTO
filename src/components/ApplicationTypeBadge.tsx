import React from "react";
import { cn } from "@/lib/utils";

interface ApplicationTypeBadgeProps {
  appType?: string;
  className?: string;
}

export const getApplicationTypeStyle = (appType?: string) => {
  if (!appType) return {};
  const t = appType.trim().toLowerCase();
  let color = "";
  if (t === "home" || t === "non - faceless" || t === "non-faceless") color = "#1e293b";
  else if (t === "faceless") color = "#1e40af";
  else if (t === "out of bhavnagar") color = "#991b1b";
  else if (t === "out of bhavnagar to bhavnagar" || t === "out of bhavanagr to bhavnagar") color = "#9a3412";
  else if (t === "cng") color = "#065f46";

  if (color) {
    return {
      borderBottom: `3px solid ${color}`,
      borderLeft: `4px solid ${color}`,
    };
  }
  return {};
};

export function ApplicationTypeBadge({ appType, className }: ApplicationTypeBadgeProps) {
  const type = (appType || "Home").trim();
  const lower = type.toLowerCase();

  let displayVal = type;
  if (lower === "non-faceless" || lower === "non - faceless") {
    displayVal = "Non-Faceless";
  } else if (lower === "home") {
    displayVal = "Home";
  } else if (lower === "faceless") {
    displayVal = "Faceless";
  } else if (lower === "cng") {
    displayVal = "CNG";
  } else if (lower === "out of bhavnagar") {
    displayVal = "Out Of Bhavnagar";
  } else if (lower === "out of bhavnagar to bhavnagar" || lower === "out of bhavanagr to bhavnagar") {
    displayVal = "Out Of Bhavnagar To Bhavnagar";
  }

  return (
    <span
      className={cn(
        "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border inline-flex items-center justify-center",
        (lower === "home" || lower === "non - faceless" || lower === "non-faceless") && "bg-transparent text-slate-700 border-slate-500",
        lower === "faceless" && "bg-transparent text-blue-700 border-blue-600",
        lower === "out of bhavnagar" && "bg-transparent text-red-700 border-red-600",
        lower === "out of bhavnagar to bhavnagar" && "bg-transparent text-orange-700 border-orange-600",
        lower === "cng" && "bg-transparent text-emerald-700 border-emerald-600",
        !["home", "non - faceless", "non-faceless", "faceless", "out of bhavnagar", "out of bhavnagar to bhavnagar", "cng"].includes(lower) && "border-slate-500 text-slate-700 bg-transparent",
        className
      )}
      style={
        !["home", "non - faceless", "non-faceless", "faceless", "out of bhavnagar", "out of bhavnagar to bhavnagar", "cng"].includes(lower)
          ? getApplicationTypeStyle(type)
          : undefined
      }
    >
      {displayVal}
    </span>
  );
}
