"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ProofPhotos } from "@/features/orgs/components/ProofPhotos";
import { PlatformIcon, Sheet } from "@/features/profiles/components/profile-kit";
import { dateWords } from "@/features/settings/components/settings-kit";
import { updateTenantProfileAction } from "@/features/settings/server-actions/plans";
import { requestStudioVerificationAction } from "@/features/tenants/server-actions/studioVerification";
import { INK, LILAC, SUB } from "@/lib/design/tokens";
import { PROOF_MAX, PROOF_MIN } from "@/lib/media/proof";
import type { StudioVerificationState } from "@/repositories/studioVerification";
import type { SocialLink } from "@/types/profile";
import type { Tenant } from "@/types/tenant";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";
const GREEN = "#22C55E";
const AMBER = "#F59E0B";
const RED = "#EF4444";

/** the four a dance studio actually has; anything else it already keeps on its
 *  own page, and this form is not trying to be that page */
const FIELDS: Array<{ platform: string; label: string; placeholder: string }> = [
  { platform: "Instagram", label: "Instagram", placeholder: "instagram.com/yourstudio" },
  { platform: "YouTube", label: "YouTube", placeholder: "youtube.com/@yourstudio" },
  { platform: "Facebook", label: "Facebook", placeholder: "facebook.com/yourstudio" },
  { platform: "Website", label: "Website", placeholder: "yourstudio.com" },
];

/** somebody types `instagram.com/x`, not `https://instagram.com/x` — and the
 *  database refuses anything that is not a real http(s) address, so the form
 *  finishes the job rather than refusing the person */
const asUrl = (raw: string): string => {
  const v = raw.trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
};

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

const blockHead: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: 9.5,
  fontWeight: 900,
  letterSpacing: 1,
  color: MUTED,
  marginBottom: 8,
};

/** WHY DANCEOS ASKS — one tap away, never in the way (14 Sep 2026).
 *
 *  The user: *"instead of writing this on the screen, better give 'why
 *  verification' that could open a tab where in detail the user can see the
 *  purpose of verification and why we need social medias and images. This is
 *  how some apps solve this, isn't it?"*
 *
 *  It is. Progressive disclosure: the form carries labels and controls only,
 *  and the reasoning — which is worth reading ONCE and never again — lives
 *  behind a link. A paragraph sitting on top of a form is read by nobody and
 *  makes the form look longer than it is. */
function WhySheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet label="Why verification" onClose={onClose}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.2, color: MUTED }}>VERIFICATION</div>
      <div style={{ fontSize: 19, fontWeight: 900, margin: "2px 0 10px", color: INK }}>Why DanceOS checks a studio</div>

      <p style={{ fontSize: 12.5, color: SUB, lineHeight: 1.6, margin: "0 0 16px" }}>
        Anyone can type a studio name. Before a studio appears on Discover — where strangers find it, book classes and pay
        for them — a person at DanceOS looks at it and confirms there is a real place with a real floor behind the name.
        It is the same check a food app runs before a kitchen can take orders.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
        <span aria-hidden="true" style={{ fontSize: 17, lineHeight: 1.2 }}>🔗</span>
        <div>
          <b style={{ fontSize: 12.5, color: INK, display: "block", marginBottom: 3 }}>Why your links</b>
          <span style={{ fontSize: 11.5, color: SUB, lineHeight: 1.55 }}>
            A studio that teaches has a public life — posts, reels, students in the comments. One link is usually enough
            to tell a working studio from a name somebody typed. They stay on your public page, where dancers see them too.
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
        <span aria-hidden="true" style={{ fontSize: 17, lineHeight: 1.2 }}>📸</span>
        <div>
          <b style={{ fontSize: 12.5, color: INK, display: "block", marginBottom: 3 }}>Why photos of the space</b>
          <span style={{ fontSize: 11.5, color: SUB, lineHeight: 1.55 }}>
            The floor, the mirrors, the entrance, a class in progress. Links can be borrowed; a room is harder to fake.{" "}
            <b style={{ color: INK }}>Nobody but you and a DanceOS admin ever sees these</b> — they are kept in a private
            store, they are not on your studio page, and they are not on Discover.
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16 }}>
        <span aria-hidden="true" style={{ fontSize: 17, lineHeight: 1.2 }}>🛡</span>
        <div>
          <b style={{ fontSize: 12.5, color: INK, display: "block", marginBottom: 3 }}>What it gets you</b>
          <span style={{ fontSize: 11.5, color: SUB, lineHeight: 1.55 }}>
            The verified badge on your studio page and on every Discover card — which is what a dancer choosing between two
            studios actually looks at. A studio can be verified once and stays verified.
          </span>
        </div>
      </div>

      <div style={{ background: LILAC, border: `1px solid ${EL}`, borderRadius: 13, padding: "11px 13px" }}>
        <b style={{ fontSize: 11.5, color: INK, display: "block", marginBottom: 7 }}>What happens next</b>
        {/* the numbers are drawn, not left to list markers — the app's reset
            strips those, and four steps without their numbers read as prose */}
        {[
          `You submit your links and ${PROOF_MIN}–${PROOF_MAX} photos.`,
          "A DanceOS admin looks — usually within a day.",
          "The badge lands, and you are told either way.",
          "Subscribe the studio and it goes live on Discover.",
        ].map((step, i) => (
          <div key={step} style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 6 }}>
            <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 9, background: "var(--text)", color: "var(--solid)", fontSize: 10, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
            <span style={{ fontSize: 11.5, color: SUB, lineHeight: 1.55 }}>{step}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 12, lineHeight: 1.5 }}>
        Turned down? You are told exactly why, and you can fix it and submit again — there is no limit.
      </div>

      {/* the way out an explainer always has — the backdrop and system back
          close it too, but a button is the one everybody finds */}
      <button
        type="button"
        onClick={onClose}
        style={{ width: "100%", marginTop: 16, padding: "13px 0", borderRadius: 999, border: "none", background: "var(--text)", color: "var(--solid)", fontSize: 13.5, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}
      >
        Got it
      </button>
    </Sheet>
  );
}

/** WHERE THIS STUDIO STANDS WITH DANCEOS — REBUILT AS A FORM (14 Sep 2026).
 *
 *  The user, looking at the first cut: *"don't need this additional text 'Show
 *  DanceOS this studio' — just 'Get this studio verified'. Then there should be
 *  a separate block with icons for social media — Instagram, YouTube, Facebook
 *  etc — below that Studio Images, then a submit button… always use a standard
 *  approach that looks good as well."*
 *
 *  So it is a form, in the shape every form has: a title, labelled blocks, one
 *  action. Two blocks — LINKS with each platform's own mark beside its field,
 *  and PHOTOS — and one Submit at the bottom. The explanation moved behind
 *  "Why?" (see `WhySheet`).
 *
 *  ONE BUTTON DOES BOTH JOBS. The links were edited on the studio's own page
 *  before, which meant leaving the hub, finding the sheet, coming back, and
 *  only then being able to ask. Submit now saves the links and files the
 *  request in one press, because to the person filling it in they were always
 *  one act. */
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
  const [why, setWhy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /* the fields start from what the studio already publishes */
  const [links, setLinks] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    FIELDS.forEach((f) => {
      seed[f.platform] = tenant.socials.find((s) => s.platform === f.platform)?.url ?? "";
    });
    return seed;
  });

  const typedLinks = FIELDS.filter((f) => links[f.platform]?.trim()).length;
  const enoughPhotos = photoCount >= PROOF_MIN;
  const ready = typedLinks > 0 && enoughPhotos;

  const submit = () =>
    start(async () => {
      setErr(null);
      /* the links first — the request is refused without one, and the refusal
         would be about a field the person has just filled in */
      const next: SocialLink[] = FIELDS.filter((f) => links[f.platform]?.trim()).map((f) => ({
        platform: f.platform,
        url: asUrl(links[f.platform]!),
      }));
      /* every other link the studio keeps (WhatsApp, a custom one) is left alone */
      const others = tenant.socials.filter((s) => !FIELDS.some((f) => f.platform === s.platform));
      const saved = await updateTenantProfileAction({
        tenantId: tenant.id,
        about: tenant.about,
        foundedYear: tenant.foundedYear,
        phone: tenant.phone,
        socials: [...next, ...others],
        enquiryTypes: tenant.enquiryTypes,
        accepts: tenant.accepts,
      });
      if (saved.error) {
        setErr(saved.error);
        return;
      }
      const out = await requestStudioVerificationAction({ tenantId: tenant.id });
      if (out.error) {
        setErr(out.error);
        return;
      }
      onDone?.(`Sent — a DanceOS admin will look at ${tenant.name}`);
      router.refresh();
    });

  /* ── VERIFIED: one line, and the subscription strip below is the next step ── */
  if (state.verifiedAt) {
    return (
      <div
        data-testid="studio-verification"
        role="status"
        aria-label="Studio verification: Verified"
        style={{ display: "flex", alignItems: "center", gap: 8, margin: "-4px 0 0", padding: "9px 12px", background: CARD, border: `1px solid ${EL}`, borderTop: "none" }}
      >
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.5, padding: "2px 6px", borderRadius: 5, background: `${GREEN}22`, color: GREEN }}>VERIFIED STUDIO</span>
        <span style={{ fontSize: 10.5, color: SUB }}>DanceOS checked it on {dateWords(state.verifiedAt)}.</span>
      </div>
    );
  }

  /* ── UNDER REVIEW: nothing to fill in, one door to a person ── */
  if (state.pending) {
    return (
      <div
        data-testid="studio-verification"
        role="status"
        aria-label="Studio verification: Under review"
        style={{ margin: "-4px 0 0", padding: "11px 12px 12px", background: CARD, border: `1px solid ${EL}`, borderTop: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.5, padding: "2px 6px", borderRadius: 5, background: `${AMBER}22`, color: AMBER }}>UNDER REVIEW</span>
          <b style={{ fontSize: 12, color: INK }}>A DanceOS admin is looking</b>
        </div>
        <div style={{ fontSize: 10.5, color: SUB, marginTop: 5, lineHeight: 1.5 }}>
          Usually within a day. The badge lands, then you subscribe it to Discover.
        </div>
        <Link
          href={state.requestId ? `/support?request=${state.requestId}` : "/support"}
          style={{ ...pill, marginTop: 10, background: LILAC, border: `1px solid ${EL}`, color: INK }}
        >
          Message DanceOS
        </Link>
      </div>
    );
  }

  const turnedDown = state.rejectedNote !== null;

  return (
    <div
      data-testid="studio-verification"
      role="status"
      aria-label={`Studio verification: ${turnedDown ? "Not approved" : "Not verified"}`}
      style={{ margin: "-4px 0 0", padding: "11px 12px 13px", background: CARD, border: `1px solid ${EL}`, borderTop: "none" }}
    >
      {/* ── the title, and the reasoning one tap away ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.5, padding: "2px 6px", borderRadius: 5, background: turnedDown ? `${RED}22` : EL, color: turnedDown ? RED : SUB }}>
          {turnedDown ? "NOT APPROVED" : "NOT VERIFIED"}
        </span>
        <b style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: INK }}>Get this studio verified</b>
        <button
          type="button"
          onClick={() => setWhy(true)}
          aria-label="Why verification"
          style={{ flexShrink: 0, background: "transparent", border: "none", padding: 0, fontSize: 11, fontWeight: 800, color: "#5AC8FA", cursor: "pointer", fontFamily: "inherit" }}
        >
          Why? ›
        </button>
      </div>

      {turnedDown ? (
        <div style={{ fontSize: 11.5, color: INK, marginTop: 9, lineHeight: 1.5, borderLeft: `2px solid ${RED}`, paddingLeft: 9 }}>&ldquo;{state.rejectedNote}&rdquo;</div>
      ) : null}

      {/* ── BLOCK 1: the links, each behind its own mark ── */}
      <div style={{ marginTop: 12, padding: "10px 11px 4px", borderRadius: 13, background: LILAC, border: `1px solid ${EL}` }}>
        <div style={blockHead}>
          <span>SOCIAL LINKS</span>
          <span style={{ color: typedLinks > 0 ? GREEN : AMBER, letterSpacing: 0 }}>{typedLinks > 0 ? `✓ ${typedLinks}` : "at least one"}</span>
        </div>
        {FIELDS.map((f) => (
          <div key={f.platform} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
            <span aria-hidden="true" style={{ flexShrink: 0, lineHeight: 0 }}>
              <PlatformIcon label={f.platform} size={19} />
            </span>
            <input
              value={links[f.platform] ?? ""}
              aria-label={f.label}
              onChange={(e) => {
                setLinks((l) => ({ ...l, [f.platform]: e.target.value }));
                setErr(null);
              }}
              placeholder={f.placeholder}
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              style={{
                flex: 1,
                minWidth: 0,
                boxSizing: "border-box",
                background: "var(--bg)",
                border: `1px solid ${EL}`,
                borderRadius: 10,
                padding: "9px 10px",
                fontSize: 12,
                color: INK,
                fontFamily: "inherit",
              }}
            />
          </div>
        ))}
      </div>

      {/* ── BLOCK 2: the photos ── */}
      <div style={{ marginTop: 10, padding: "10px 11px 11px", borderRadius: 13, background: LILAC, border: `1px solid ${EL}` }}>
        {/* no count here — the strip below carries its own, and two counters
            for one thing is one too many */}
        <div style={blockHead}>
          <span>STUDIO PHOTOS</span>
          <span style={{ marginLeft: "auto", fontWeight: 700, letterSpacing: 0, color: MUTED, textTransform: "none" }}>private · only DanceOS sees these</span>
        </div>
        <ProofPhotos orgId={orgId} tenantId={tenant.id} initialPhotos={state.photos} compact onCount={setPhotoCount} />
      </div>

      {/* ── the one action ── */}
      <button
        type="button"
        onClick={submit}
        disabled={!ready || pending}
        aria-label={`Submit ${tenant.name} for verification`}
        style={{
          width: "100%",
          marginTop: 12,
          padding: "13px 0",
          borderRadius: 999,
          border: "none",
          background: ready && !pending ? "var(--text)" : EL,
          color: ready && !pending ? "var(--solid)" : MUTED,
          fontSize: 13,
          fontWeight: 900,
          cursor: ready && !pending ? "pointer" : "default",
          fontFamily: "inherit",
        }}
      >
        {pending ? "Sending…" : turnedDown ? "Submit again" : "Submit for verification"}
      </button>

      {!ready && !pending ? (
        <div style={{ fontSize: 10.5, color: MUTED, marginTop: 7, textAlign: "center", lineHeight: 1.45 }}>
          {typedLinks === 0 && !enoughPhotos
            ? `Add one link and ${PROOF_MIN - photoCount} photos`
            : typedLinks === 0
              ? "Add at least one link"
              : `Add ${PROOF_MIN - photoCount} more photo${PROOF_MIN - photoCount === 1 ? "" : "s"}`}
        </div>
      ) : null}

      {err ? <div style={{ fontSize: 10.5, color: RED, marginTop: 7, lineHeight: 1.45 }}>{err}</div> : null}

      {why ? <WhySheet onClose={() => setWhy(false)} /> : null}
    </div>
  );
}
