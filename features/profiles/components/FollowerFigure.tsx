"use client";

import { useState } from "react";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { loadFollowersAction, type FollowListResult } from "@/features/profiles/server-actions/followLists";
import { DOS_DISPLAY } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import { Row } from "./profile-kit";
import { figureLabel, figureNum } from "./profile-band";

/** ⚠⚠ THE FOLLOWERS FIGURE IS A DOOR EVERYWHERE (27 Sep 2026, the user: *"fix
 *  follow following for all profiles. list should open when clicked from
 *  anywhere"*).
 *
 *  It was a door on a person's own two screens and a DEAD NUMBER on a studio's
 *  home, an organization's, a crew's and all four public pages — and the one
 *  way into a business's follower list was a separate small "Followers ›"
 *  button the owner alone could see, in the member row, on the public page.
 *  Two controls for one list, and seven surfaces with neither.
 *
 *  This is the figure AND its sheet, for the two kinds that are not a person:
 *  a business (a studio, an artist page, an organization) and a crew. It reads
 *  its rows ON THE PRESS — see `loadFollowersAction` for why that is cheaper
 *  than what it replaces and where the privacy line actually is.
 *
 *  ⚠ WHAT IT DOES NOT DO, deliberately: it never claims a list it cannot get.
 *  `follows` has no public SELECT policy, so a visitor pressing this on a
 *  studio's public page gets the honest "Nobody here you can see" rather than
 *  an error or an empty white sheet — and the COUNT beside it is still the real
 *  one, because counts have always been public and names never have. */
export function FollowerFigure({
  n,
  kind,
  id,
  name,
  testId,
}: {
  /** ⚠ NULL IS NOT ZERO, and the distinction is kept from `Figure` (which has
   *  drawn nothing for null since 20 Sep): zero followers is a measurement and
   *  is drawn; NULL means the count could not be read at all — a crew whose
   *  `crew_follower_counts` failed — and a figure invented for that would be a
   *  claim rather than a reading. This is not the 27 Sep "show it even if it is
   *  0" rule pulling the other way; that rule is about zeros. */
  n: number | null;
  kind: "business" | "crew";
  id: string;
  /** whose followers — the sheet says so, because a studio's home and its
   *  organization's look alike enough to be confused at a glance */
  name: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FollowListResult | null>(null);
  const [busy, setBusy] = useState(false);
  useCloseOnBack(() => setOpen(false), open);
  /* the hooks run first, unconditionally — this repo's lint, and React's rule */
  const count = n;

  const press = () => {
    setOpen(true);
    if (state || busy) return;
    setBusy(true);
    void loadFollowersAction({ kind, id }).then((r) => {
      setState(r);
      setBusy(false);
    });
  };

  if (count == null) return null;

  return (
    <>
      <button
        type="button"
        onClick={press}
        aria-label={`Followers — ${count}`}
        data-testid={testId}
        /* a bare button so it sits in `FIGURE_ROW` exactly where the plain
           `Figure` div did — same two lines, same metrics, no chrome */
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "inherit", textAlign: "left" }}
      >
        <span style={figureNum}>{count.toLocaleString("en-IN")}</span>
        <span style={figureLabel}>Followers</span>
      </button>

      {open ? (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 660 }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Followers of ${name}`}
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--solid)", borderRadius: "24px 24px 0 0", padding: "16px 16px 26px", width: "100%", maxWidth: 430, boxSizing: "border-box", color: "var(--text)", maxHeight: "82vh", overflowY: "auto", animation: "dosSheetUp .28s cubic-bezier(.22,.9,.34,1)" }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
              <b style={{ fontSize: 16, fontFamily: DOS_DISPLAY }}>Followers</b>
              <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: "var(--muted)" }}>{count}</span>
            </div>

            {busy ? <div style={{ fontSize: 12, color: "var(--sub)", padding: "18px 2px" }}>Reading the list…</div> : null}
            {!busy && state?.error ? <div style={{ fontSize: 12, color: "#F87171", padding: "12px 2px" }}>{state.error}</div> : null}
            {!busy && state && !state.error && state.rows.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--sub)", padding: "18px 2px", lineHeight: 1.5 }}>
                {count > 0 ? "Nobody here you can see — a follower list is the owner's." : "Nobody follows this yet."}
              </div>
            ) : null}
            {!busy && state?.rows.map((r) => (
              <Row key={r.id} href={r.href} markName={r.name} photo={photoUrl(r.photoPath)} title={r.name} sub={r.sub ?? ""} />
            ))}

            <button type="button" onClick={() => setOpen(false)} style={{ width: "100%", marginTop: 12, textAlign: "center", padding: 12, borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 12.5, cursor: "pointer", border: "none", fontFamily: "inherit" }}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
