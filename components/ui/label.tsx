"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

/** The field label in the DanceOS eyebrow treatment — small, tracked out,
 *  weight 700 (prototype "EMAIL ADDRESS"). Radix's Label is used rather than a
 *  bare <label> so clicking the eyebrow focuses the field even when the two are
 *  not nested. */
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "block text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase",
        "select-none peer-disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
}

export { Label };
