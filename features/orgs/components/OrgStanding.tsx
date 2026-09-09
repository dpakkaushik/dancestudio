"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ProofPhotos } from "@/features/orgs/components/ProofPhotos";
import { VerifiedTick, dateWords } from "@/features/settings/components/settings-kit";
import { requestOrgVerificationAction } from "@/features/tenants/server-actions/tenants";
import { INK, LILAC, SUB } from "@/lib/design/tokens";
import { PROOF_MIN, type ProofPhoto } from "@/lib/media/proof";
import type { VerificationRequest } from "@/repositories/admin";
import type { OrgSubscription } from "@/repositories/orgStanding";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";

const pill: React.CSSProperties = {
  padding: "9px 15px",
  borderRadius: 999,
  fontSize: 11.5,
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  textDecoration: "none",
};

export interface OrgStandingProps {
  orgId: string;
  verifiedAt: string | null;
  request: VerificationRequest | null;
  socialsCount: number;
  photos: ProofPhoto[];
  subscription: OrgSubscription;
  threadId: string | null;
  unread: number;
}

/** The word beside the organization's name, and only for the organization
 *  itself. Exported so Home's identity sleeve can wear the same chip the card
 *  below it is titled with. */
export function orgStandingWords(verifiedAt: string | null, status: string | undefined): { title: string; tone: string; chip: string } {
  if (verifiedAt) return { title: "Verified organization", tone: "#22C55E", chip: "VERIFIED" };
  if (status === "pending") return { title: "Under verification", tone: "#F59E0B", chip: "UNDER VERIFICATION" };
  if (status === "rejected") return { title: "Not approved", tone: "#EF4444", chip: "NOT APPROVED" };
  return { title: "Not verified yet", tone: "var(--sub)", chip: "NOT VERIFIED" };
}

/** WHERE YOU STAND WITH DANCEOS — on HOME (R13, 9 Sep 2026, the user's ask).
 *
 *  This card used to live inside the studios hub, two taps from anywhere, which
 *  put the conversation with a stranger who is judging your business behind a
 *  door marked "Studios". It is now the first thing an organization sees, with
 *  the badge on its own name, and the way to reach a person on the same card.
 *
 *  Six steps, because the gate now has six parts (R14/R16): the links, the
 *  photos, the ask, the decision, the subscription, and the studios going
 *  public. Every step says where it stands and what would move it; a rejection
 *  prints the admin's own words; and there is always a door to a person. */
export function OrgStanding({ orgId, verifiedAt, request, socialsCount, photos, subscription, threadId, unread }: OrgStandingProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showProof, setShowProof] = useState(false);

  const req = request;
  const verified = Boolean(verifiedAt);
  const { title, tone } = orgStandingWords(verifiedAt, req?.status);
  const asked = Boolean(req);
  const inReview = req?.status === "pending";
  const rejected = req?.status === "rejected";
  const decided = req?.status === "approved" || rejected;
  const enoughPhotos = photos.length >= PROOF_MIN;
  const canAsk = !verified && !inReview && socialsCount > 0 && enoughPhotos;

  const ask = () =>
    start(async () => {
      setError(null);
      const out = await requestOrgVerificationAction();
      if (out.error) {
        setError(out.error);
        return;
      }
      router.refresh();
    });

  const steps: Array<{ label: string; note: string; state: "done" | "now" | "todo" }> = [
    {
      label: "Your links are published",
      note:
        socialsCount > 0
          ? `${socialsCount} link${socialsCount === 1 ? "" : "s"} on your profile`
          : "Add at least one on the Profile tab — this is what DanceOS checks",
      state: socialsCount > 0 ? "done" : "now",
    },
    {
      label: "DanceOS has photos of your space",
      note: enoughPhotos
        ? `${photos.length} photo${photos.length === 1 ? "" : "s"} — only you and a DanceOS admin can see them`
        : `${photos.length} of ${PROOF_MIN} — add the rest below`,
      state: enoughPhotos ? "done" : socialsCount > 0 ? "now" : "todo",
    },
    {
      label: "You asked to be verified",
      note: req ? `sent ${dateWords(req.createdAt)}` : "press the button below once your links and photos are up",
      state: asked ? "done" : socialsCount > 0 && enoughPhotos ? "now" : "todo",
    },
    {
      label: decided ? (rejected ? "DanceOS did not approve it" : "DanceOS approved it") : "A DanceOS admin checks them",
      note: decided
        ? rejected
          ? req?.note || "No reason was given — ask below and an admin will explain."
          : `approved ${req?.decidedAt ? dateWords(req.decidedAt) : "just now"}`
        : asked
          ? "usually within a day"
          : "nothing to check yet",
      state: decided ? "done" : inReview ? "now" : "todo",
    },
    {
      label: "Your subscription is active",
      note: subscription.active
        ? subscription.until
          ? `until ${dateWords(subscription.until)}`
          : "active"
        : verified
          ? "message DanceOS below and an admin will set it up"
          : "set up once you are verified",
      state: subscription.active ? "done" : verified ? "now" : "todo",
    },
    {
      label: "You can open studios",
      note:
        verified && subscription.active
          ? "add one from Your business — it goes on Discover straight away"
          : "a studio needs the tick and a live subscription",
      state: verified && subscription.active ? "done" : "todo",
    },
  ];

  return (
    <div
      role="status"
      aria-label={`Verification: ${title}`}
      style={{ background: CARD, border: `1px solid ${EL}`, borderLeft: `4px solid ${tone}`, borderRadius: 16, padding: "12px 13px", margin: "12px 0 4px" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        {verified ? <VerifiedTick size={15} /> : <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: tone, display: "inline-block" }} />}
        <b style={{ fontSize: 13 }}>{title}</b>
        {unread > 0 ? (
          <span style={{ marginLeft: "auto", minWidth: 17, height: 17, borderRadius: 9, padding: "0 5px", background: "#EC4899", color: "#fff", fontSize: 10, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            {unread}
          </span>
        ) : null}
      </div>

      <ol style={{ listStyle: "none", padding: 0, margin: "11px 0 2px" }}>
        {steps.map((s) => (
          <li key={s.label} style={{ display: "flex", gap: 9, paddingBottom: 9 }}>
            <span aria-hidden="true" style={{ flexShrink: 0, width: 15, height: 15, borderRadius: 8, marginTop: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, background: s.state === "done" ? "#22C55E" : s.state === "now" ? tone : "var(--el)", color: s.state === "todo" ? MUTED : "#fff" }}>
              {s.state === "done" ? "✓" : s.state === "now" ? "●" : ""}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: s.state === "todo" ? 600 : 800, color: s.state === "todo" ? MUTED : INK, lineHeight: 1.35 }}>{s.label}</span>
              <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 2, lineHeight: 1.45 }}>{s.note}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* the photos are managed here too, because this is where their step is —
          open by default while they are still missing, tucked away once they are not */}
      {verified && enoughPhotos ? null : (
        <div style={{ marginTop: 2, marginBottom: 10 }}>
          {enoughPhotos && !showProof ? (
            <button type="button" onClick={() => setShowProof(true)} style={{ background: "none", border: "none", padding: 0, fontFamily: "inherit", fontSize: 11, fontWeight: 800, color: SUB, textDecoration: "underline", cursor: "pointer" }}>
              Change the photos DanceOS sees
            </button>
          ) : (
            <div style={{ background: LILAC, border: `1px solid ${EL}`, borderRadius: 12, padding: "10px 11px" }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.5, color: MUTED, marginBottom: 7 }}>PHOTOS OF YOUR SPACE</div>
              <ProofPhotos orgId={orgId} initialPhotos={photos} compact />
            </div>
          )}
        </div>
      )}

      {error ? <div style={{ fontSize: 11, color: "#B42318", marginBottom: 8, lineHeight: 1.45 }}>{error}</div> : null}

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {canAsk ? (
          <button type="button" disabled={pending} onClick={ask} style={{ ...pill, background: "var(--text)", color: "var(--solid)" }}>
            {pending ? "Asking…" : rejected ? "Ask again" : "Request verification"}
          </button>
        ) : null}
        {/* there is a person on the other side of this decision — always a door to them */}
        <Link
          href={threadId ? `/support/${threadId}` : req ? `/support?request=${req.id}` : "/support"}
          style={{ ...pill, background: LILAC, border: `1px solid ${EL}`, color: INK, display: "inline-flex", alignItems: "center" }}
        >
          {unread > 0 ? `Read DanceOS's reply (${unread})` : threadId ? "Your conversation with DanceOS" : "Message DanceOS"}
        </Link>
      </div>
    </div>
  );
}
