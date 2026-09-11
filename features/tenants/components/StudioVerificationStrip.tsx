"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ProofPhotos } from "@/features/orgs/components/ProofPhotos";
import { dateWords } from "@/features/settings/components/settings-kit";
import { requestStudioVerificationAction } from "@/features/tenants/server-actions/studioVerification";
import { INK, LILAC, SUB } from "@/lib/design/tokens";
import { PROOF_MIN } from "@/lib/media/proof";
import { publicProfilePath } from "@/lib/routes/publicProfile";
import type { StudioVerificationState } from "@/repositories/studioVerification";
import type { Tenant } from "@/types/tenant";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";
const GREEN = "#22C55E";
const AMBER = "#F59E0B";
const RED = "#EF4444";

const pill: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 999,
  fontSize: 11.5,
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};

/** WHERE THIS STUDIO STANDS WITH DANCEOS (11 Sep 2026 — the user: "the earlier
 *  logic of org verification will work for the studio: the user will upload
 *  5-10 images and social media for the studio, then admin will verify the
 *  studio, then the studio will get badge, then it will subscribe to go live").
 *
 *  So this is the organization's old six-step card, one level down and three
 *  steps shorter, under EACH studio on the hub: a public link, the photos, the
 *  ask, the answer. It sits directly above the studio's subscription strip
 *  because that is the next sentence — the badge is what a subscription turns
 *  into a listing, and Subscribe is not offered until the badge is on.
 *
 *  Every state says what has happened and what would move it; a rejection
 *  prints the admin's own words; and while an admin is looking there is a door
 *  to a person, carrying the request so the thread is about THIS studio. */
export function StudioVerificationStrip({
  tenant,
  orgId,
  state,
  onDone,
}: {
  tenant: Tenant;
  /** the owner's own id — the photos go into their folder in the private bucket */
  orgId: string;
  state: StudioVerificationState;
  onDone?: (message: string) => void;
}) {
  const router = useRouter();
  const [photoCount, setPhotoCount] = useState(state.photos.length);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const links = tenant.socials.length;
  const enoughPhotos = photoCount >= PROOF_MIN;
  const canAsk = links > 0 && enoughPhotos && !state.pending;

  const ask = () =>
    start(async () => {
      setErr(null);
      const out = await requestStudioVerificationAction({ tenantId: tenant.id });
      if (out.error) {
        setErr(out.error);
        return;
      }
      onDone?.(`Asked — a DanceOS admin will look at ${tenant.name}`);
      router.refresh();
    });

  /* ── VERIFIED: one line, and the subscription strip below is the next step ── */
  if (state.verifiedAt) {
    return (
      <div
        data-testid="studio-verification"
        role="status"
        aria-label="Studio verification: Verified"
        style={{ display: "flex", alignItems: "center", gap: 8, margin: "-4px 0 0", padding: "8px 12px", background: CARD, border: `1px solid ${EL}`, borderTop: "none" }}
      >
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.5, padding: "2px 6px", borderRadius: 5, background: `${GREEN}22`, color: GREEN }}>VERIFIED STUDIO</span>
        <span style={{ fontSize: 10.5, color: SUB }}>DanceOS checked its photos and links on {dateWords(state.verifiedAt)}.</span>
      </div>
    );
  }

  const title = state.pending ? "Under review" : state.rejectedNote !== null ? "Not approved" : "Not verified";
  const tone = state.pending ? AMBER : state.rejectedNote !== null ? RED : MUTED;

  return (
    <div
      data-testid="studio-verification"
      role="status"
      aria-label={`Studio verification: ${title}`}
      style={{ margin: "-4px 0 0", padding: "10px 12px 12px", background: CARD, border: `1px solid ${EL}`, borderTop: "none" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.5, padding: "2px 6px", borderRadius: 5, background: `${tone}22`, color: tone === MUTED ? SUB : tone }}>{title.toUpperCase()}</span>
        <b style={{ fontSize: 12, color: INK }}>Get this studio verified</b>
      </div>

      <div style={{ fontSize: 10.5, color: SUB, marginTop: 5, lineHeight: 1.5 }}>
        {state.pending
          ? "A DanceOS admin is checking this studio. The badge lands, then you subscribe it to Discover."
          : state.rejectedNote !== null
            ? "DanceOS could not verify it from what it showed. Fix what the note says, then ask again."
            : "Show DanceOS this studio — a public link and 5–10 photos of the space — and an admin gives it the badge. Then you subscribe it to Discover."}
      </div>

      {state.rejectedNote ? (
        <div style={{ fontSize: 11.5, color: INK, marginTop: 8, lineHeight: 1.5, borderLeft: `2px solid ${RED}`, paddingLeft: 9 }}>&ldquo;{state.rejectedNote}&rdquo;</div>
      ) : null}

      {/* the link — kept on the studio page, where every other fact about it is edited */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, padding: "7px 10px", borderRadius: 11, background: LILAC, border: `1px solid ${EL}` }}>
        <span aria-hidden="true" style={{ fontSize: 12, color: links > 0 ? GREEN : AMBER }}>{links > 0 ? "✓" : "○"}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: SUB, lineHeight: 1.4 }}>
          {links > 0 ? `${links} public link${links === 1 ? "" : "s"} on the studio page.` : "No public link yet — Instagram, a website, YouTube."}
        </span>
        <Link href={publicProfilePath(tenant)} aria-label={`Add a link for ${tenant.name}`} style={{ ...pill, padding: "5px 10px", background: CARD, border: `1px solid ${EL}`, color: INK, flexShrink: 0 }}>
          {links > 0 ? "Edit" : "Add a link"}
        </Link>
      </div>

      {/* the photos — the same strip the organization used to show its space */}
      <div style={{ marginTop: 10 }}>
        <ProofPhotos orgId={orgId} tenantId={tenant.id} initialPhotos={state.photos} compact onCount={setPhotoCount} />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
        {state.pending ? (
          <Link href={state.requestId ? `/support?request=${state.requestId}` : "/support"} style={{ ...pill, background: LILAC, border: `1px solid ${EL}`, color: INK }}>
            Message DanceOS
          </Link>
        ) : (
          <button
            type="button"
            onClick={ask}
            disabled={!canAsk || pending}
            aria-label={`Ask DanceOS to verify ${tenant.name}`}
            style={{ ...pill, background: canAsk && !pending ? "var(--text)" : EL, color: canAsk && !pending ? "var(--solid)" : MUTED, cursor: canAsk && !pending ? "pointer" : "default" }}
          >
            {pending ? "Asking…" : state.rejectedNote !== null ? "Ask again" : "Ask DanceOS to verify it"}
          </button>
        )}
        {!state.pending && !canAsk ? (
          <span style={{ fontSize: 10.5, color: MUTED }}>
            {links === 0 && !enoughPhotos ? "needs a link and the photos" : links === 0 ? "needs a public link" : `needs ${PROOF_MIN - photoCount} more photo${PROOF_MIN - photoCount === 1 ? "" : "s"}`}
          </span>
        ) : null}
      </div>
      {err ? <div style={{ fontSize: 10.5, color: RED, marginTop: 6, lineHeight: 1.45 }}>{err}</div> : null}
    </div>
  );
}
