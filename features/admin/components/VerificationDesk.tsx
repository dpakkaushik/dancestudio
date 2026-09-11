"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideOrgVerificationAction, decideStudioVerificationAction } from "@/features/admin/server-actions/admin";
import { VerifiedTick, dateWords } from "@/features/settings/components/settings-kit";
import { PLATFORM_TINT, handleOf, isPlatform, safeHref } from "@/lib/constants/socials";
import { INK, SUB } from "@/lib/design/tokens";
import { ProofStrip } from "@/features/admin/components/ProofStrip";
import { photoUrl } from "@/lib/media/photo";
import type { ProofPhoto } from "@/lib/media/proof";
import type { OrganizationRow, StudioRow, VerificationCounts, VerificationRequest } from "@/repositories/admin";
import type { SocialLink } from "@/types/profile";
import { agoWords } from "@/types/notification";
import { AdminGlyph, DESK_TINT } from "./admin-glyphs";
import { CountLine, DeskHero, DeskTabs, EmptyLine, PAGE_SIZE, Pager, SearchBar, StatStrip } from "./desk-kit";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";
const initialsOf = (name: string) => name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "O";
const pill: React.CSSProperties = { display: "inline-block", padding: "9px 16px", borderRadius: 999, fontWeight: 900, fontSize: 11.5, cursor: "pointer", textDecoration: "none", border: "none", fontFamily: "inherit" };

export type VerificationTab = "pending" | "approved" | "rejected" | "all";

/** THE LINKS ARE THE EVIDENCE. Each one opens in a new tab, named by its
 *  platform, so the admin reads the organization where it actually lives. An
 *  address that is not http(s) is not drawn (11 Sep 2026). */
function Links({ socials }: { socials: SocialLink[] }) {
  if (socials.length === 0) return <div style={{ fontSize: 11.5, color: "#EF4444", fontWeight: 700 }}>No links published — nothing to check.</div>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {socials.map((l) => {
        const tint = isPlatform(l.platform) ? PLATFORM_TINT[l.platform] : "#64748B";
        const href = safeHref(l.url);
        if (!href) return null;
        return (
          <a key={`${l.platform}-${l.url}`} href={href} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: `${tint}18`, border: `1px solid ${tint}55`, color: INK, textDecoration: "none", fontSize: 11.5, fontWeight: 800 }}>
            <span style={{ color: tint }}>{l.platform}</span>
            <span style={{ color: SUB, fontWeight: 600 }}>{handleOf(l.url)}</span>
            <span aria-hidden="true" style={{ color: SUB }}>↗</span>
          </a>
        );
      })}
    </div>
  );
}

function Face({ name, path, size = 44 }: { name: string; path: string | null; size?: number }) {
  const src = photoUrl(path);
  return (
    <span style={{ width: size, height: size, borderRadius: 14, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#3B82F6,#1D4ED8)", color: "#fff", fontWeight: 900, fontSize: size / 2.6 }}>
      {src ? <Image src={src} alt="" width={size} height={size} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : initialsOf(name)}
    </span>
  );
}

const TABS: Array<{ key: VerificationTab; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Verified studios" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All orgs" },
];

/** what a request is ABOUT: the studio since 11 Sep 2026, the organization on
 *  the legacy rows kept as history */
const subjectOf = (r: VerificationRequest) => ({
  id: r.tenantId ?? r.orgId,
  name: r.tenantName ?? r.orgName,
  city: r.tenantId ? r.tenantCity : r.orgCity,
  socials: r.tenantId ? r.tenantSocials : r.socials,
  verifiedAt: r.tenantId ? r.tenantVerifiedAt : r.orgVerifiedAt,
  isStudio: Boolean(r.tenantId),
});

/** THE VERIFICATION DESK, SECOND CUT (11 Sep 2026) — the user's words: "how am
 *  I gonna scroll down if there are 2k studios which applied? Rather it should
 *  have a better approach: at top a dashboard showing numbers — pending,
 *  approved etc — separate tabs for pending and approved, and inside each tab a
 *  dashboard, filters, counts."
 *
 *  So: the figures first, then four tabs as blocks, each with its own count;
 *  inside a tab a search and ONE PAGE of the list, never the whole thing, with
 *  the total said out loud and a pager. Pending is oldest first, because the
 *  person who has waited longest is the one to answer next.
 *
 *  What each tab holds, and why:
 *    Pending  — requests waiting on an admin, with the evidence (links, photos)
 *               and the decision on the card, as before.
 *    Approved — organizations WEARING THE TICK, not "approved requests": the
 *               grandfathered ones never asked, and what an admin wants here is
 *               who is trusted right now, with the one lever that changes it.
 *    Rejected — requests an admin said no to, with the reason they were given,
 *               and a way to approve after all.
 *    All orgs — every organization, whatever it is wearing.
 *
 *  ⚠ SINCE 11 Sep 2026 THE THING REVIEWED IS A STUDIO (the user: "the earlier
 *  logic of org verification will work for the studio… admin will verify the
 *  studio, then the studio will get badge, then it will subscribe to go live").
 *  A pending card is a studio — its name, the organization behind it, ITS
 *  links, ITS photos — and Approve stamps the studio's badge and nothing else:
 *  the owner still subscribes it to reach Discover. The Approved tab lists the
 *  studios wearing the badge, with the one lever that takes it off. Requests
 *  filed under the old model (about an organization) are still drawn, as
 *  history, and still decided through the organization's own RPC. */
export function VerificationDesk({
  tab,
  q,
  page,
  counts,
  requests,
  studios = [],
  orgs,
  total,
  proof,
  nowIso,
}: {
  tab: VerificationTab;
  q: string;
  page: number;
  counts: VerificationCounts;
  /** the page of requests — on the Pending and Rejected tabs */
  requests: VerificationRequest[];
  /** the page of badged studios — on the Approved tab (11 Sep 2026) */
  studios?: StudioRow[];
  /** the page of organizations — on the All tab */
  orgs: OrganizationRow[];
  /** how many match in all, on this tab */
  total: number;
  /** R16: the photos of the space, keyed by the STUDIO on THIS page of the
   *  queue (by the organization on a legacy row), each URL already signed on
   *  the server for this admin's own session */
  proof: Record<string, ProofPhoto[]>;
  nowIso: string;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };
  const decide = (orgId: string, approve: boolean, said: string, withNote?: string) =>
    start(async () => {
      const out = await decideOrgVerificationAction({ orgId, approve, note: withNote || null });
      if (out.error) return fire(out.error);
      setRejecting(null);
      setNote("");
      fire(said);
      router.refresh();
    });
  /* the studio's badge — the answer since 11 Sep 2026 */
  const decideStudio = (tenantId: string, approve: boolean, said: string, withNote?: string) =>
    start(async () => {
      const out = await decideStudioVerificationAction({ tenantId, approve, note: withNote || null });
      if (out.error) return fire(out.error);
      setRejecting(null);
      setNote("");
      fire(said);
      router.refresh();
    });
  /* one call for either kind of row */
  const answer = (r: VerificationRequest, approve: boolean, withNote?: string) => {
    const s = subjectOf(r);
    const said = approve
      ? s.isStudio ? `${s.name} verified — the owner subscribes it to go live` : `${s.name} verified — its studios are live`
      : `${s.name} not approved`;
    return s.isStudio ? decideStudio(s.id, approve, said, withNote) : decide(s.id, approve, said, withNote);
  };

  const tint = DESK_TINT.verifications;
  const base = "/admin/verifications";
  const keep = { tab, q: q || null };
  const shown = tab === "pending" || tab === "rejected" ? requests.length : tab === "approved" ? studios.length : orgs.length;
  const what = tab === "pending" ? "waiting" : tab === "approved" ? "verified studios" : tab === "rejected" ? "not approved" : "organizations";

  return (
    <div style={{ padding: "6px 16px var(--dos-foot, 40px)" }}>
      <DeskHero
        eyebrow="APPROVAL REQUESTS"
        title="Verification queue"
        sub={counts.pending === 0 ? "nothing waiting on you" : `${counts.pending} studio${counts.pending === 1 ? "" : "s"} waiting`}
        tint={tint}
        icon={<AdminGlyph k="verifications" size={22} />}
      />

      <StatStrip
        cols={4}
        figs={[
          { n: counts.pending, label: "waiting", href: `${base}?tab=pending`, tone: counts.pending > 0 ? "#F59E0B" : undefined },
          { n: counts.verifiedStudios, label: "verified studios", href: `${base}?tab=approved`, tone: "#22C55E" },
          { n: counts.rejected, label: "not approved", href: `${base}?tab=rejected`, tone: counts.rejected > 0 ? "#EF4444" : undefined },
          { n: counts.orgs, label: "organizations", href: `${base}?tab=all` },
        ]}
      />

      <DeskTabs
        base={base}
        current={tab}
        keep={{ q: q || null }}
        tabs={TABS.map((t) => ({
          ...t,
          count: t.key === "pending" ? counts.pending : t.key === "approved" ? counts.verifiedStudios : t.key === "rejected" ? counts.rejected : counts.orgs,
          tone: t.key === "pending" ? "#F59E0B" : t.key === "rejected" ? "#EF4444" : undefined,
        }))}
      />

      <SearchBar action={base} q={q} keep={{ tab }} placeholder={tab === "pending" || tab === "rejected" ? "Search by studio or organization…" : "Search by name or city…"} />

      <CountLine shown={shown} total={total} what={what} q={q} />

      {/* ── PENDING: the evidence and the decision, on the card ── */}
      {tab === "pending" ? (
        requests.length === 0 ? (
          <EmptyLine>{q ? "No waiting request matches that name." : "All clear — every studio that asked has an answer."}</EmptyLine>
        ) : (
          requests.map((r) => {
            const s = subjectOf(r);
            return (
              <div key={r.id} data-testid="verification-request" style={{ background: CARD, border: `1px solid ${EL}`, borderLeft: "4px solid #F59E0B", borderRadius: 16, padding: "12px 13px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <Face name={s.name} path={s.isStudio ? null : r.orgAvatarPath} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link href={s.isStudio ? `/studio/${s.id}` : `/person/${r.orgId}`} style={{ fontSize: 13.5, fontWeight: 900, color: INK, textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</Link>
                    <div style={{ fontSize: 10.5, color: SUB, marginTop: 1 }}>
                      {[s.isStudio ? `studio · run by ${r.orgName}` : "organization", s.city, `asked ${agoWords(r.createdAt, nowIso)}`].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
                <div style={{ margin: "10px 0 4px" }}>
                  <Links socials={s.socials} />
                </div>
                {/* R16: the links say who they claim to be; the photos say there is a floor */}
                <div style={{ margin: "10px 0 4px" }}>
                  <ProofStrip photos={proof[s.id] ?? []} orgName={s.name} />
                </div>
                {rejecting === s.id ? (
                  <div style={{ marginTop: 10 }}>
                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Why not — the owner reads this" aria-label="Reason for rejecting" style={{ width: "100%", boxSizing: "border-box", background: EL, border: `1px solid ${EL}`, borderRadius: 12, padding: "10px 12px", color: INK, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button type="button" disabled={pending} onClick={() => answer(r, false, note.trim())} style={{ ...pill, background: "#EF4444", color: "#fff" }}>
                        {pending ? "Saving…" : "Reject"}
                      </button>
                      <button type="button" disabled={pending} onClick={() => { setRejecting(null); setNote(""); }} style={{ ...pill, background: EL, color: INK }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button type="button" disabled={pending || s.socials.length === 0} aria-label={`Approve ${s.name}`} onClick={() => answer(r, true)} style={{ ...pill, background: s.socials.length ? "#22C55E" : EL, color: s.socials.length ? "#fff" : MUTED }}>
                      {pending ? "Saving…" : "Approve"}
                    </button>
                    <button type="button" disabled={pending} aria-label={`Reject ${s.name}`} onClick={() => setRejecting(s.id)} style={{ ...pill, background: EL, color: INK }}>
                      Reject…
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )
      ) : null}

      {/* ── REJECTED: the reason they were given, and the way back ── */}
      {tab === "rejected" ? (
        requests.length === 0 ? (
          <EmptyLine>{q ? "No rejected request matches that name." : "Nobody has been turned down."}</EmptyLine>
        ) : (
          requests.map((r) => {
            const s = subjectOf(r);
            return (
              <div key={r.id} data-testid="verification-rejected" style={{ background: CARD, border: `1px solid ${EL}`, borderLeft: "4px solid #EF4444", borderRadius: 16, padding: "11px 13px", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <Face name={s.name} path={s.isStudio ? null : r.orgAvatarPath} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <Link href={s.isStudio ? `/studio/${s.id}` : `/person/${r.orgId}`} style={{ fontSize: 13, fontWeight: 900, color: INK, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</Link>
                      {s.verifiedAt ? <VerifiedTick size={13} /> : null}
                    </div>
                    <div style={{ fontSize: 10.5, color: SUB, marginTop: 1 }}>
                      {[s.isStudio ? `run by ${r.orgName}` : null, s.city, r.decidedAt ? `rejected ${dateWords(r.decidedAt)}` : "rejected", s.verifiedAt ? "verified since" : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {s.verifiedAt ? null : (
                    <button type="button" disabled={pending || s.socials.length === 0} aria-label={`Verify ${s.name}`} onClick={() => answer(r, true)} style={{ ...pill, padding: "7px 12px", background: s.socials.length ? "var(--text)" : EL, color: s.socials.length ? "var(--solid)" : MUTED }}>
                      Verify
                    </button>
                  )}
                </div>
                {r.note ? <div style={{ fontSize: 11.5, color: INK, marginTop: 8, lineHeight: 1.5, borderLeft: `2px solid ${EL}`, paddingLeft: 9 }}>&ldquo;{r.note}&rdquo;</div> : <div style={{ fontSize: 10.5, color: MUTED, marginTop: 8 }}>No reason was recorded.</div>}
              </div>
            );
          })
        )
      ) : null}

      {/* ── APPROVED: the studios wearing the badge, and the lever that takes it off ── */}
      {tab === "approved" ? (
        studios.length === 0 ? (
          <EmptyLine>{q ? "No verified studio matches that." : "No studio is verified yet."}</EmptyLine>
        ) : (
          studios.map((s) => (
            <div key={s.id} data-testid="verification-studio" style={{ display: "flex", alignItems: "center", gap: 11, background: CARD, border: `1px solid ${EL}`, borderLeft: "4px solid #22C55E", borderRadius: 16, padding: "10px 13px", marginBottom: 8 }}>
              <Face name={s.name} path={s.photoPath} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <Link href={`/studio/${s.id}`} style={{ fontSize: 13, fontWeight: 900, color: INK, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</Link>
                  <VerifiedTick size={13} />
                </div>
                <div style={{ fontSize: 10.5, color: SUB, marginTop: 1 }}>
                  {[s.ownerName ? `run by ${s.ownerName}` : null, [s.area, s.city].filter(Boolean).join(", ") || null, s.verifiedAt ? `verified ${dateWords(s.verifiedAt)}` : null, s.visibility === "listed" ? "on Discover" : "not on Discover yet"].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button type="button" disabled={pending} aria-label={`Revoke ${s.name}`} onClick={() => decideStudio(s.id, false, `${s.name} unverified — its badge is off`)} style={{ ...pill, padding: "7px 12px", background: EL, color: INK }}>
                Revoke
              </button>
            </div>
          ))
        )
      ) : null}

      {/* ── ALL: every organization, as a directory. The tick an organization wears
          is the OLD model's (DanceOS checked it by hand before 11 Sep 2026); it is
          shown, not offered — the lever is on the studio now. ── */}
      {tab === "all" ? (
        orgs.length === 0 ? (
          <EmptyLine>{q ? "No organization matches that." : "No organizations on DanceOS yet."}</EmptyLine>
        ) : (
          orgs.map((o) => {
            const verified = Boolean(o.verifiedAt);
            return (
              <div key={o.id} data-testid="verification-org" style={{ display: "flex", alignItems: "center", gap: 11, background: CARD, border: `1px solid ${EL}`, borderLeft: `4px solid ${verified ? "#22C55E" : EL}`, borderRadius: 16, padding: "10px 13px", marginBottom: 8 }}>
                <Face name={o.name} path={o.avatarPath} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <Link href={`/person/${o.id}`} style={{ fontSize: 13, fontWeight: 900, color: INK, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</Link>
                    {verified ? <VerifiedTick size={13} /> : null}
                  </div>
                  <div style={{ fontSize: 10.5, color: SUB, marginTop: 1 }}>
                    {[o.city, verified ? `verified ${dateWords(o.verifiedAt as string)}` : "not verified by hand", `${o.socials.length} link${o.socials.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
            );
          })
        )
      ) : null}

      <Pager base={base} page={page} total={total} size={PAGE_SIZE} keep={keep} />

      {toast ? <div role="status" style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#241B33", color: "#fff", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 700 }}>{toast}</div> : null}
    </div>
  );
}
