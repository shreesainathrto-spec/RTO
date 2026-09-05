import React from "react";
import { Wrench, Shield, GraduationCap, ShieldCheck, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export type SubModuleType = "services" | "licence" | "driving_school" | "insurance" | "form5";

interface SubModuleTabsProps {
  activeTab: SubModuleType;
  onChange: (tab: SubModuleType) => void;
  className?: string;
}

export const SUB_MODULE_TABS: { id: SubModuleType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "services", label: "Vahaan", icon: Wrench },
  { id: "insurance", label: "Insurance", icon: ShieldCheck },
  { id: "licence", label: "Licence", icon: Shield },
  { id: "form5", label: "Form 5", icon: FileText },
  { id: "driving_school", label: "Driving School", icon: GraduationCap },
];

export function SubModuleTabs({ activeTab, onChange, className }: SubModuleTabsProps) {
  return (
    <div className={cn("inline-flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/60 shadow-inner", className)}>
      {SUB_MODULE_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 select-none",
              isActive
                ? "bg-white text-slate-900 shadow-sm border border-slate-200/80 font-bold"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 font-medium"
            )}
          >
            <Icon className={cn("w-3.5 h-3.5", isActive ? "text-blue-600" : "text-slate-400")} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
