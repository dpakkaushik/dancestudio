import Link from "next/link";
import { PROFILE_CHIP } from "./profile-band";

/** STATS AS A BUTTON BESIDE THE QR (18 Sep 2026, the user: "remove stats from
 *  tools and place like a button similar to the qr code in the same area on both
 *  home and profile"). It wears exactly the QR chip's clothes — `ProfileShare`'s
 *  38px round control in the page's ink — so the two read as one row of things
 *  you can do with this profile: share it, and see its record. The glyph is the
 *  bars the Stats tile carried, which is where this door lived until today. The
 *  accessible name stays "Stats", so the promise the tile made ("there is a link
 *  called Stats on Home") is still true. */
export function StatsChip({ href, label = "Stats" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      style={PROFILE_CHIP}
    >
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 19.5h16" />
        <path d="M6 16V11.5M10.5 16V7.5M15 16v-6" />
        <path d="m19.5 16-.01-9" />
        <path d="m17.4 6.6 2.1-2.1 2.1 2.1" />
      </svg>
    </Link>
  );
}
