import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** The ← every prototype auth screen opens with (DanceOSApp.jsx:3727).
 *
 *  Extracted because four screens draw it now. `data-slot` matters: the focus
 *  block in globals.css is UNLAYERED css, so it outranks every Tailwind utility
 *  whatever the specificity — `outline-none` included — and it re-rounds what it
 *  touches to 10px. It exempts `[data-slot]`, so carrying the attribute is what
 *  lets this draw its own round ring instead of a squashed magenta one. */
export function AuthBackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="Back"
      data-slot="link"
      className="inline-flex size-9 -translate-x-2 items-center justify-center rounded-full text-foreground transition-colors hover:bg-card focus-visible:ring-[2.5px] focus-visible:ring-ring focus-visible:outline-none"
    >
      <ArrowLeft className="size-5" aria-hidden />
    </Link>
  );
}
