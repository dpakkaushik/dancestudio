import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** shadcn's Button, re-shaped to the DanceOS button language rather than the
 *  stock one: a full pill (prototype BTN_STYLE radius 999), weight 800, and the
 *  accent reserved for the primary path. A default shadcn button — 6px radius,
 *  weight 500 — reads as a template next to the rest of the app. */
const buttonVariants = cva(
  cn(
    "inline-flex w-full items-center justify-center gap-2 rounded-full text-[15px] font-extrabold",
    "select-none whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-200",
    "outline-none focus-visible:ring-[2.5px] focus-visible:ring-ring focus-visible:ring-offset-2",
    "focus-visible:ring-offset-background",
    "disabled:pointer-events-none",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
  ),
  {
    variants: {
      variant: {
        /* the one path forward on a screen — accent + a lift, so it reads as
           raised rather than merely coloured */
        primary: cn(
          "bg-primary text-primary-foreground",
          "shadow-[0_8px_22px_-6px_var(--dos-accent)]",
          "hover:brightness-110 active:translate-y-px",
          "disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none"
        ),
        /* the alternative, not the afterthought: outlined, same footprint */
        outline: cn(
          "border-[1.5px] border-border bg-card text-foreground",
          "hover:border-primary hover:text-primary active:translate-y-px",
          "disabled:text-muted-foreground"
        ),
        ghost: cn(
          "bg-transparent text-muted-foreground",
          "hover:bg-card hover:text-foreground",
          "disabled:text-muted-foreground"
        ),
      },
      size: {
        /* 15px of padding — the prototype's own button height */
        default: "px-5 py-[15px]",
        sm: "w-auto px-4 py-2.5 text-[13px]",
        icon: "size-10 w-auto rounded-full p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
