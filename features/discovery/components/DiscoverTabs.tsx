"use client";

import type { ReactNode } from "react";
import { useOptimisticNav } from "@/features/shell/components/SegmentedNav";
import { SUB } from "@/lib/design/tokens";

const EL = "var(--el)";

/** DISCOVER'S FIVE SECTION TILES (4571-4585), PRESSED THE MOMENT THEY ARE TAPPED
 *  (20 Sep 2026, the user: *"see such bug doesnt appear anywhere in the system
 *  where things are getting stuck"*).
 *
 *  Same reason as the class segments: each tab is a real link, so a tap is a
 *  server round trip — the studios shelf reads `nearby_businesses`, the classes
 *  shelf reads a city's published classes and their artists — and until it came
 *  back the OLD tile stayed on the ink and nothing moved. The tile you pressed
 *  lights straight away now and React puts it back if the navigation never
 *  lands. The address is still the state, so back and a pasted link are
 *  untouched, and the tiles are still anchors for a middle-click. */
export function DiscoverTabs({
  tabs,
  active,
}: {
  /** ⚠ EVERY TAB CARRIES ITS OWN `href` AS DATA. The first cut took an
   *  `hrefOf(key)` FUNCTION, and Discover's page is a SERVER component — a
   *  function cannot cross that boundary, so every render of /discover answered
   *  a 500 and three e2e specs went red on a page that had nothing to do with
   *  them. The element (`icon`) crosses fine; the closure does not. */
  tabs: Array<{ key: string; word: string; href: string; icon: ReactNode }>;
  active: string;
}) {
  const { shown, go } = useOptimisticNav(active);
  return (
    <div style={{ display: "flex", gap: 6, margin: "10px 0 4px" }}>
      {tabs.map((t) => {
        const on = shown === t.key;
        const href = t.href;
        return (
          <a
            key={t.key}
            href={href}
            aria-label={t.word}
            aria-current={on ? "page" : undefined}
            onClick={(e) => go(t.key, href, e)}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: "center",
              padding: "10px 2px 8px",
              borderRadius: 14,
              textDecoration: "none",
              background: on ? "var(--text)" : "var(--card)",
              color: on ? "var(--solid)" : SUB,
              border: `1.5px solid ${on ? "var(--text)" : EL}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            {t.icon}
            <div style={{ fontSize: 10, fontWeight: 800 }}>{t.word}</div>
          </a>
        );
      })}
    </div>
  );
}
