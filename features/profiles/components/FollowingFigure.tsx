"use client";

import { useState } from "react";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { loadFollowingAction, type FollowListResult } from "@/features/profiles/server-actions/followLists";
import { DOS_DISPLAY } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import { Row } from "./profile-kit";
import { figureLabel, figureNum } from "./profile-band";

/** ⚠⚠ THE FOLLOWING FIGURE IS A DOOR ON AN ENTITY'S OWN HOME (27 Sep 2026, the
 *  user: *"following list not opening properly crew and organization"*).
 *
 *  This is `FollowerFigure`'s twin and it exists for the same reason. That one
 *  made FOLLOWERS a door on the seven surfaces that printed a dead number, and
 *  left FOLLOWING dead on the three entity homes — the same bug one column to the
 *  right, which is what the user pressed.
 *
 *  ⚠ WHOSE LIST IT IS, said plainly, because the figure does not say it: a crew
 *  follows nothing and neither does a studio — `follows.follower_id` references
 *  `profiles`, so there is nothing to follow WITH — and what these homes have
 *  printed since 20 Sep is what the ACCOUNT that runs them follows. So the sheet
 *  is the account's own, `loadFollowingAction` takes no argument at all, and the
 *  heading says "Following" without a possessive that would be a lie either way.
 *
 *  ⚠ IT IS ONLY EVER DRAWN WHERE THE VIEWER IS THAT ACCOUNT — a crew's home
 *  (`requireLedCrew`), a studio's and an organization's own home (the figure is
 *  passed only to an owner). On a PUBLIC page the count stays a plain `Figure`:
 *  the list belongs to somebody else, `follows` has no public SELECT policy, and
 *  a door that can never open for the person pressing it is worse than none. */
export function FollowingFigure({
  n,
  testId,
  userId = null,
  always = false,
}: {
  /** ⚠ ALWAYS DRAWN (2 Oct 2026, the user: "following section for crew pages
   *  under profile pic to be always visible"). A count that could not be read
   *  prints "—", never a 0 nobody measured; the press still opens the sheet,
   *  which says why it cannot read the list (a stranger is asked to sign in). */
  always?: boolean;
  /** ⚠ WHOSE LIST (2 Oct 2026): null is the reader's own, as it always was; a
   *  person's id reads THEIR list through `profile_following`, which is what
   *  makes the figure a door on somebody else's profile too */
  userId?: string | null;
  /** ⚠ NULL DRAWS NOTHING, NEVER A ZERO — `Figure`'s rule since 20 Sep, kept
   *  here word for word: a count that could not be read is not a count of none,
   *  and every one of these reads is wrapped in a `.catch` so a home still
   *  opens. Zero itself IS drawn, and opens an honest empty sheet. */
  n: number | null;
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
    void loadFollowingAction(userId ? { userId } : undefined).then((r) => {
      setState(r);
      setBusy(false);
    });
  };

  if (count == null && !always) return null;
  const shown = count == null ? "—" : count.toLocaleString("en-IN");

  return (
    <>
      <button
        type="button"
        onClick={press}
        aria-label={`Following — ${count ?? "not available"}`}
        data-testid={testId}
        /* a bare button, so it sits in `FIGURE_ROW` exactly where the plain
           `Figure` div did — same two lines, same metrics, no chrome */
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "inherit", textAlign: "left" }}
      >
        <span style={figureNum}>{shown}</span>
        <span style={figureLabel}>Following</span>
      </button>

      {open ? (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 660 }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Following"
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--solid)", borderRadius: "24px 24px 0 0", padding: "16px 16px 26px", width: "100%", maxWidth: 430, boxSizing: "border-box", color: "var(--text)", maxHeight: "82vh", overflowY: "auto", animation: "dosSheetUp .28s cubic-bezier(.22,.9,.34,1)" }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
              <b style={{ fontSize: 16, fontFamily: DOS_DISPLAY }}>Following</b>
              <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: "var(--muted)" }}>{count ?? ""}</span>
            </div>

            {busy ? <div style={{ fontSize: 12, color: "var(--sub)", padding: "18px 2px" }}>Reading the list…</div> : null}
            {!busy && state?.error ? <div style={{ fontSize: 12, color: "#F87171", padding: "12px 2px" }}>{state.error}</div> : null}
            {!busy && state && !state.error && state.rows.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--sub)", padding: "18px 2px", lineHeight: 1.5 }}>Not following anybody yet.</div>
            ) : null}
            {!busy && state?.rows.map((r) => <Row key={r.id} href={r.href} markName={r.name} photo={photoUrl(r.photoPath)} title={r.name} sub={r.sub ?? ""} />)}

            <button type="button" onClick={() => setOpen(false)} style={{ width: "100%", marginTop: 12, textAlign: "center", padding: 12, borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 12.5, cursor: "pointer", border: "none", fontFamily: "inherit" }}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
