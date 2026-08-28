"use client";

import { useRouter } from "next/navigation";
import { DOS_CITIES } from "@/lib/constants/cities";
import { DosPinIcon } from "./discover-kit";

/** THE PLACE, ONCE (prototype 4507-4530): one 34px chip — the app's own place
 *  mark, the city, and the chevron that says it opens — with the platform's
 *  native select invisible and full-size underneath, so the picker is the
 *  platform's own and the keyboard still reaches it. Picking a city changes
 *  `?city=` and keeps the tab and every filter already in the address. */
export function CityChip({ city, tab, extra }: { city: string; tab: string; extra: Record<string, string> }) {
  const router = useRouter();
  const pick = (next: string) => {
    const p = new URLSearchParams({ city: next, tab, ...extra });
    router.push(`/discover?${p.toString()}`);
  };
  return (
    <span style={{ position: "relative", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 17, background: "var(--card)", border: "1px solid var(--el)", fontSize: 12.5, fontWeight: 800, color: "var(--text)", cursor: "pointer", maxWidth: 170, boxSizing: "border-box" }}>
      <DosPinIcon size={13} color="var(--sub)" />
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{city}</span>
      <span aria-hidden="true" style={{ color: "var(--muted)", fontSize: 10 }}>
        ▾
      </span>
      <select value={city} onChange={(e) => pick(e.target.value)} aria-label="Choose a city" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", WebkitAppearance: "none", appearance: "none", border: "none", background: "transparent" }}>
        {DOS_CITIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </span>
  );
}
