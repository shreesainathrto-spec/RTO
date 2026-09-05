import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";

interface DateInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function DateInput({ value, onChange, placeholder = "DD/MM/YYYY", className, disabled }: DateInputProps) {
  const [localVal, setLocalVal] = useState("");

  useEffect(() => {
    if (!value) {
      setLocalVal("");
      return;
    }
    if (value.includes("-")) {
      const parts = value.split("-");
      if (parts.length === 3) {
        setLocalVal(`${parts[2]}/${parts[1]}/${parts[0]}`);
      } else {
        setLocalVal(value);
      }
    } else {
      setLocalVal(value);
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputVal = e.target.value;
    inputVal = inputVal.replace(/[^\d/]/g, "");
    
    // Format typing
    const digits = inputVal.replace(/\D/g, "");
    let formatted = digits;
    if (digits.length > 2) {
      formatted = digits.slice(0, 2) + "/" + digits.slice(2);
    }
    if (digits.length > 4) {
      formatted = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4, 8);
    }

    setLocalVal(formatted);

    if (formatted.length === 10) {
      const parts = formatted.split("/");
      if (parts.length === 3) {
        const yyyymmdd = `${parts[2]}-${parts[1]}-${parts[0]}`;
        onChange(yyyymmdd);
      }
    } else if (formatted.length === 0) {
      onChange("");
    }
  };

  return (
    <Input
      type="text"
      placeholder={placeholder}
      value={localVal}
      onChange={handleInputChange}
      className={className}
      disabled={disabled}
      maxLength={10}
    />
  );
}
