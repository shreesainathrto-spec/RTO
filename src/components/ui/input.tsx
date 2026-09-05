import * as React from "react";
import { cn } from "@/lib/utils";
import { DateInput } from "@/components/DateInput";
import { useForceCapitals } from "@/hooks/useForceCapitals";

/** Input types that should NEVER be uppercased */
const SKIP_UPPERCASE_TYPES = new Set([
  "password",
  "email",
  "date",
  "number",
  "file",
  "hidden",
  "color",
  "range",
  "checkbox",
  "radio",
  "time",
  "datetime-local",
  "month",
  "week",
  "url",
]);

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input"> & { "data-no-force-caps"?: boolean }>(
  ({ className, type, onChange, value, defaultValue, "data-no-force-caps": noForceCaps, ...props }, ref) => {
    const forceCaps = useForceCapitals();

    // Determine whether force-caps should apply to this input
    const shouldUppercase =
      forceCaps &&
      !noForceCaps &&
      !SKIP_UPPERCASE_TYPES.has(type || "text");

    if (type === "date") {
      const handleDateChange = (val: string) => {
        if (onChange) {
          const event = {
            target: {
              value: val,
              name: props.name,
              type: "date",
            },
            currentTarget: {
              value: val,
              name: props.name,
              type: "date",
            },
          } as React.ChangeEvent<HTMLInputElement>;
          onChange(event);
        }
      };

      return (
        <DateInput
          value={String(value || "")}
          onChange={handleDateChange}
          placeholder={props.placeholder}
          className={className}
          disabled={props.disabled}
        />
      );
    }

    // Wrap onChange to force uppercase on the value before passing to parent
    const handleChange = shouldUppercase
      ? (e: React.ChangeEvent<HTMLInputElement>) => {
          // Mutate the event target value to uppercase so the parent
          // component always receives uppercase text
          const upper = e.target.value.toUpperCase();
          // Use Object.defineProperty to override the readonly value
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value",
          )?.set;
          nativeInputValueSetter?.call(e.target, upper);
          // Create a new synthetic-like event with the uppercased value
          const syntheticEvent = {
            ...e,
            target: { ...e.target, value: upper },
            currentTarget: { ...e.currentTarget, value: upper },
          } as React.ChangeEvent<HTMLInputElement>;
          onChange?.(syntheticEvent);
        }
      : onChange;

    // Apply uppercase to the controlled value for display
    const displayValue =
      shouldUppercase && typeof value === "string"
        ? value.toUpperCase()
        : value;

    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          shouldUppercase && "uppercase",
          className,
        )}
        ref={ref}
        onChange={handleChange}
        value={displayValue}
        defaultValue={defaultValue}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
