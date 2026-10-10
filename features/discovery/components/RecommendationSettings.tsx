"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Portal } from "@/components/ui/Portal";
import { StylesSheet } from "@/features/profiles/components/StylesSheet";
import { setMyLearnStylesAction } from "@/features/profiles/server-actions/profile";
import { CARD, INK, LINE } from "@/lib/design/tokens";

/** RECOMMENDATION SETTINGS (11 Oct 2026). The user: *"discover should get a
 *  setting icon on top right with option to change the dance styles you want to
 *  learn should be called recommendation settings."*
 *
 *  The list is the one onboarding's "Styles you want to learn" step writes —
 *  `profiles.learn_styles`, private to its owner — and Discover puts whatever is
 *  in those styles first on every shelf (`recommendFirst`). It has no floor:
 *  empty means "recommend nothing", so every Remove is live.
 *
 *  ⚠ Every press saves at once and the sheet keeps its own copy, so the order a
 *  drag leaves is what you see while the round trip is out; a refusal puts the
 *  previous list back and says so. ⚠ The sheet is PORTALLED — Discover's head is
 *  a `TopPanel`, and a fixed child of an animated panel is clipped by it (the
 *  16 Sep stacking-context lesson). */
export function RecommendationSettings({ initial }: { initial: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [styles, setStyles] = useState<string[]>(initial);
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<string | null>(null);

  const save = (next: string[], words: string) => {
    const before = styles;
    setStyles(next);
    start(async () => {
      const res = await setMyLearnStylesAction({ styles: next });
      if (res.error) {
        setStyles(before);
        setSaid(res.error);
        return;
      }
      setSaid(words);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        data-testid="recommendation-settings"
        aria-label="Recommendation settings"
        title="Recommendation settings"
        onClick={() => {
          setSaid(null);
          setOpen(true);
        }}
        style={{ width: 40, height: 40, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: CARD, border: `1.5px solid ${LINE}`, color: INK, cursor: "pointer", flexShrink: 0 }}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="10" cy="17" r="2" />
        </svg>
      </button>
      {open ? (
        <Portal>
          <StylesSheet
            styles={styles}
            onSave={save}
            pending={pending}
            lastWords=""
            allowEmpty
            label="Recommendation settings"
            title="Recommendation settings"
            intro="The dance styles you want to learn — Discover shows these first."
            onClose={() => setOpen(false)}
          />
          {said ? (
            <div role="status" style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 700, background: "var(--text)", color: "var(--solid)", padding: "8px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 800, pointerEvents: "none" }}>
              {said}
            </div>
          ) : null}
        </Portal>
      ) : null}
    </>
  );
}
