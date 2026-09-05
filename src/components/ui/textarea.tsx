import * as React from "react";

import { cn } from "@/lib/utils";
import { useForceCapitals } from "@/hooks/useForceCapitals";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea"> & { "data-no-force-caps"?: boolean }>(
  ({ className, onChange, value, "data-no-force-caps": noForceCaps, ...props }, ref) => {
    const forceCaps = useForceCapitals();
    const shouldUppercase = forceCaps && !noForceCaps;

    const handleChange = shouldUppercase
      ? (e: React.ChangeEvent<HTMLTextAreaElement>) => {
          const upper = e.target.value.toUpperCase();
          const syntheticEvent = {
            ...e,
            target: { ...e.target, value: upper },
            currentTarget: { ...e.currentTarget, value: upper },
          } as React.ChangeEvent<HTMLTextAreaElement>;
          onChange?.(syntheticEvent);
        }
      : onChange;

    const displayValue =
      shouldUppercase && typeof value === "string"
        ? value.toUpperCase()
        : value;

    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          shouldUppercase && "uppercase",
          className,
        )}
        ref={ref}
        onChange={handleChange}
        value={displayValue}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
