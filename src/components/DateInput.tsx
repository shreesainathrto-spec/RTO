import React, { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { formatDateDDMMYYYY, parseDateDDMMYYYY, isValidDateDDMMYYYY } from "@/lib/formatting";

interface DateInputProps {
  value: string;
  onChange: (normalizedValue: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  placeholder = "DD/MM/YYYY",
  className = "",
  disabled = false,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState(false);

  // Sync internal display state with parent value
  useEffect(() => {
    if (!value) {
      setInputValue("");
      setError(false);
      return;
    }
    // If it's already DD/MM/YYYY, display it
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
      setInputValue(value);
      setError(!isValidDateDDMMYYYY(value));
    } else {
      // Convert standard ISO YYYY-MM-DD to DD/MM/YYYY for display
      const formatted = formatDateDDMMYYYY(value);
      if (formatted !== "—") {
        setInputValue(formatted);
        setError(!isValidDateDDMMYYYY(formatted));
      } else {
        setInputValue(value);
      }
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let text = e.target.value;

    // Filter characters to allow only digits and slashes
    text = text.replace(/[^0-9/]/g, "");

    // Auto-insert slash as typing
    if (text.length === 2 && !text.includes("/")) {
      text = text + "/";
    } else if (text.length === 5 && text.split("/").length === 2) {
      text = text + "/";
    }

    // Limit to 10 characters (DD/MM/YYYY)
    if (text.length > 10) {
      text = text.slice(0, 10);
    }

    setInputValue(text);

    if (text.length === 10) {
      if (isValidDateDDMMYYYY(text)) {
        setError(false);
        // Parse and emit as YYYY-MM-DD for standard database compatibility
        const parsed = parseDateDDMMYYYY(text);
        if (parsed) {
          const yyyy = parsed.getFullYear();
          const mm = String(parsed.getMonth() + 1).padStart(2, "0");
          const dd = String(parsed.getDate()).padStart(2, "0");
          onChange(`${yyyy}-${mm}-${dd}`);
        }
      } else {
        setError(true);
      }
    } else if (text === "") {
      setError(false);
      onChange("");
    }
  };

  const handleBlur = () => {
    if (inputValue && !isValidDateDDMMYYYY(inputValue)) {
      setError(true);
    }
  };

  // Helper for inline native datepicker calendar trigger
  const handleCalendarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value; // YYYY-MM-DD
    if (!rawVal) return;
    const [y, m, d] = rawVal.split("-");
    const formatted = `${d}/${m}/${y}`;
    setInputValue(formatted);
    setError(false);
    onChange(rawVal);
  };

  return (
    <div className={`relative flex items-center w-full ${className}`}>
      <input
        value={inputValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={`flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm pr-10 ${error ? "border-red-500 ring-red-500 focus-visible:ring-red-500" : ""}`}
      />
      <div className="absolute right-3 cursor-pointer text-muted-foreground hover:text-foreground flex items-center justify-center pointer-events-none">
        <Calendar className="size-4 shrink-0" />
      </div>
      {/* Hidden native input date overlay that gets triggered by clicking or focusing */}
      <input
        type="date"
        disabled={disabled}
        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        style={{ colorScheme: "light" }}
        value={
          value && /^\d{4}-\d{2}-\d{2}$/.test(value)
            ? value
            : value && /^\d{2}\/\d{2}\/\d{4}$/.test(value)
              ? (() => {
                  const parsed = parseDateDDMMYYYY(value);
                  if (!parsed || parsed.getFullYear() < 1000) return "";
                  const y = parsed.getFullYear();
                  const m = String(parsed.getMonth() + 1).padStart(2, "0");
                  const d = String(parsed.getDate()).padStart(2, "0");
                  return `${y}-${m}-${d}`;
                })()
              : ""
        }
        onChange={handleCalendarChange}
      />
    </div>
  );
};
