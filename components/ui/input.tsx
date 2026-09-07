import * as React from "react";
import { cn } from "@/lib/utils";

/** shadcn's Input at the DanceOS field size: 14px radius, 1.5px border, 15px
 *  text (prototype inputStyle). `aria-invalid` carries the error colour so the
 *  field itself shows the problem — the old screen only had a floating toast,
 *  which left the input looking fine while the message sat elsewhere. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full rounded-[14px] border-[1.5px] border-input bg-card px-4 py-[13px]",
        "text-[15px] text-foreground placeholder:text-muted-foreground",
        "transition-[border-color,box-shadow] duration-150",
        "outline-none focus-visible:border-primary focus-visible:ring-[3px]",
        "focus-visible:ring-[color-mix(in_oklab,var(--dos-accent)_28%,transparent)]",
        "aria-invalid:border-destructive",
        "aria-invalid:focus-visible:ring-[color-mix(in_oklab,var(--dos-danger)_28%,transparent)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className
      )}
      {...props}
    />
  );
}

export { Input };
