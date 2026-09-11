"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setTenantVisibilityAction } from "@/features/admin/server-actions/moderation";
import { endSubscriptionAction, grantSubscriptionAction } from "@/features/admin/server-actions/subscriptions";
import { dateWords } from "@/features/settings/components/settings-kit";
import { VerifiedTick } from "@/features/settings/components/settings-kit";
import { INK, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { AdminBusiness } from "@/repositories/adminPanel";
import { AdminGlyph, DESK_TINT } from "./admin-glyphs";
import type { BusinessCounts, BusinessTab } from "./businesses-tabs";
import { CountLine, DeskHero, DeskTabs, Pager, SearchBar, StatStrip } from "./desk-kit";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";
const initialsOf = (name: string) => name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
const chip: React.CSSProperties = { fontSize: 9, fontWeight: 900, letterSpacing: 0.5, padding: "2px 6px", borderRadius: 5, whiteSpace: "nowrap" };
const btn: React.CSSProperties = { height: 32, padding: "0 11px", borderRadius: 10, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${EL}`, background: CARD, color: INK };

function Mark({ name, path }: { name: string; path: string | null }) {
  const src = photoUrl(path);
  return (
    <span style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#0E7490,#22D3EE)", color: "#fff", fontWeight: 800, fontSize: 15 }}>
      {src ? <Image src={src} alt="" width={42} height={42} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : initialsOf(name)}
    </span>
  );
}

/** BUSINESSES (10 Sep 2026). Every studio and artist page, searchable by its
 *  name, its city or its owner's name, with the switch that had been missing:
 *  taking ONE business off Discover.
 *
 *  Until this existed the only lever was revoking a whole organization's
 *  verification, which unlists every studio it runs in order to deal with one
 *  of them. Unlisting demands a reason, because the owner reads it.
 *
 *  Listing a studio is refused while its organization is unverified — the
 *  database refuses it too, so this is one rule said in two places rather than
 *  a button that would fail. */
export function BusinessesDesk({
  businesses,
  q,
  tab,
  counts,
  page,
  total,
}: {
  /** ONE PAGE of the businesses on this tab */
  businesses: AdminBusiness[];
  q: string;
  tab: BusinessTab;
  counts: BusinessCounts;
  page: number;
  total: number;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [unlisting, setUnlisting] = useState<string | null>(null);
  const [granting, setGranting] = useState<string | null>(null);
  const [ending, setEnding] = useState<string | null>(null);
  const [months, setMonths] = useState(12);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  };

  const closeSheets = () => {
    setUnlisting(null);
    setGranting(null);
    setEnding(null);
    setReason("");
  };

  /* comping a studio a period (10 Sep 2026): the row says granted, renews
     nothing, and the studio goes public if its organization is verified */
  const grant = (b: AdminBusiness) =>
    start(async () => {
      const out = await grantSubscriptionAction({ kind: "studio", subjectId: b.id, months, note: reason.trim() || null });
      if (out.error) return fire(out.error);
      closeSheets();
      fire(`${b.name} is subscribed for ${months} month${months === 1 ? "" : "s"} — nothing charged, the owner has been told`);
      router.refresh();
    });

  const endSub = (b: AdminBusiness) =>
    start(async () => {
      if (!b.subscriptionId) return fire("That studio has no subscription");
      const out = await endSubscriptionAction({ subscriptionId: b.subscriptionId, reason: reason.trim() });
      if (out.error) return fire(out.error);
      closeSheets();
      fire(`${b.name}'s subscription has ended — the owner has been told why`);
      router.refresh();
    });

  const move = (b: AdminBusiness, visibility: "listed" | "unlisted", why?: string) =>
    start(async () => {
      const out = await setTenantVisibilityAction({ tenantId: b.id, visibility, reason: why ?? null });
      if (out.error) return fire(out.error);
      setUnlisting(null);
      setReason("");
      fire(visibility === "listed" ? `${b.name} is public again` : `${b.name} is off Discover — the owner has been told why`);
      router.refresh();
    });

  const base = "/admin/businesses";

  return (
    <div style={{ padding: "6px 16px var(--dos-foot, 40px)" }}>
      {/* THE DESK SHAPE (11 Sep 2026): figures, tabs as blocks with their own
          counts, a search, one page of the list */}
      <DeskHero
        eyebrow="THE REGISTER"
        title="Businesses"
        sub={`${counts.listed} public · ${counts.unlisted} not public${counts.subscribedStudios > 0 ? ` · ${counts.subscribedStudios} studio${counts.subscribedStudios === 1 ? "" : "s"} subscribed` : ""}`}
        tint={DESK_TINT.businesses}
        icon={<AdminGlyph k="businesses" size={22} />}
      />
      <StatStrip
        cols={4}
        figs={[
          { n: counts.studios, label: "studios", href: `${base}?tab=studios` },
          { n: counts.artists, label: "artist pages", href: `${base}?tab=artists` },
          { n: counts.listed, label: "on Discover", href: `${base}?tab=public`, tone: "#22C55E" },
          { n: counts.unlisted, label: "not public", href: `${base}?tab=private`, tone: counts.unlisted > 0 ? "#F59E0B" : undefined },
        ]}
      />
      <DeskTabs
        base={base}
        current={tab}
        keep={{ q: q || null }}
        tabs={[
          { key: "all", label: "All", count: counts.all },
          { key: "studios", label: "Studios", count: counts.studios },
          { key: "artists", label: "Artists", count: counts.artists },
          { key: "public", label: "Public", count: counts.listed },
          { key: "private", label: "Private", count: counts.unlisted, tone: "#F59E0B" },
        ]}
      />
      <SearchBar action={base} q={q} keep={{ tab }} placeholder="A studio, a city, or an owner…" />
      <CountLine shown={businesses.length} total={total} what={tab === "all" ? "businesses" : tab === "artists" ? "artist pages" : tab === "public" ? "on Discover" : tab === "private" ? "not public" : tab} q={q} />

      {businesses.length === 0 ? (
        <div style={{ fontSize: 11.5, color: SUB }}>Nothing matches that.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {businesses.map((b) => {
            const live = b.visibility === "listed";
            const blockedFromListing = !live && b.type === "studio" && (!b.ownerVerified || !(b.subStatus && ["active", "past_due", "canceled"].includes(b.subStatus)));
            const subLive = b.type === "studio" && b.subStatus !== null && ["active", "past_due", "canceled"].includes(b.subStatus);
            return (
              <div key={b.id} data-testid="admin-business" style={{ background: CARD, border: `1px solid ${EL}`, borderLeft: `4px solid ${live ? "#22C55E" : "#F59E0B"}`, borderRadius: 16, padding: "11px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <Mark name={b.name} path={b.photoPath} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                      <Link href={b.type === "studio" ? `/studio/${b.id}` : `/artist/${b.id}`} style={{ fontSize: 13, fontWeight: 900, color: INK, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {b.name}
                      </Link>
                      {b.verifiedAt ? <VerifiedTick size={12} /> : null}
                    </div>
                    <div style={{ fontSize: 10.5, color: SUB, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {[b.area, b.city].filter(Boolean).join(", ") || "no address"} · {b.rooms} room{b.rooms === 1 ? "" : "s"} · {b.classes} class{b.classes === 1 ? "" : "es"} · {b.events} event{b.events === 1 ? "" : "s"} · {b.followers} follower{b.followers === 1 ? "" : "s"}
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                      <span style={{ ...chip, background: b.type === "studio" ? "#DBEAFE" : "#FCE7F3", color: b.type === "studio" ? "#1D4ED8" : "#BE185D" }}>
                        {b.type === "studio" ? "STUDIO" : "ARTIST PAGE"}
                      </span>
                      <span style={{ ...chip, background: live ? "#DCFCE7" : "#FEF3C7", color: live ? "#15803D" : "#92400E" }}>{live ? "PUBLIC" : "NOT PUBLIC"}</span>
                      {b.ownerSuspended ? <span style={{ ...chip, background: "#FEE2E2", color: "#B42318" }}>OWNER SUSPENDED</span> : null}
                      {/* the studio's own subscription (10 Sep 2026) */}
                      {b.type === "studio" ? (
                        subLive ? (
                          <span style={{ ...chip, background: b.subStatus === "past_due" ? "#FEE2E2" : "#DCFCE7", color: b.subStatus === "past_due" ? "#B42318" : "#15803D" }}>
                            {b.subStatus === "past_due" ? "PAST DUE" : b.subGranted ? "GRANTED" : b.subRenews ? "SUBSCRIBED · RENEWS" : "SUBSCRIBED · ENDING"}
                            {b.subUntil ? ` · ${dateWords(b.subUntil)}` : ""}
                          </span>
                        ) : (
                          <span style={{ ...chip, background: "#FEF3C7", color: "#92400E" }}>{b.subStatus === "pending_auth" ? "MANDATE NOT AUTHORISED" : "NO SUBSCRIPTION"}</span>
                        )
                      ) : null}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 10.5, color: MUTED, marginTop: 7 }}>
                  owner:{" "}
                  {b.ownerId ? (
                    <Link href={`/admin/accounts?q=${encodeURIComponent(b.ownerName ?? "")}`} style={{ color: INK, fontWeight: 800, textDecoration: "none" }}>
                      {b.ownerName}
                    </Link>
                  ) : (
                    <span style={{ color: "#B42318", fontWeight: 800 }}>nobody live — an orphan row</span>
                  )}
                  {b.ownerId ? ` · ${b.ownerRole === "org" ? "organization" : "user"}${b.ownerVerified ? ", verified" : ", not verified"}` : ""}
                </div>

                {granting === b.id ? (
                  <div style={{ marginTop: 9 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED, marginBottom: 5 }}>HOW LONG</div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 7, flexWrap: "wrap" }}>
                      {[1, 3, 6, 12].map((m) => (
                        <button key={m} type="button" onClick={() => setMonths(m)} aria-pressed={months === m} style={{ ...btn, background: months === m ? "var(--text)" : CARD, color: months === m ? "var(--solid)" : SUB, border: `1px solid ${months === m ? "var(--text)" : EL}` }}>
                          {m === 12 ? "1 year" : `${m} month${m === 1 ? "" : "s"}`}
                        </button>
                      ))}
                    </div>
                    <input aria-label={`Note on ${b.name}'s subscription`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="A note for the log (optional)" style={{ width: "100%", boxSizing: "border-box", background: "var(--bg)", border: `1px solid ${EL}`, borderRadius: 10, padding: "8px 10px", fontSize: 12, color: INK, fontFamily: "inherit" }} />
                    <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                      <button type="button" disabled={pending} onClick={() => grant(b)} style={{ ...btn, background: "var(--text)", color: "var(--solid)", border: "none" }} aria-label={`Confirm granting ${b.name} a subscription`}>
                        {pending ? "Granting…" : "Grant it"}
                      </button>
                      <button type="button" onClick={closeSheets} style={btn}>Cancel</button>
                    </div>
                    <div style={{ fontSize: 10, color: MUTED, marginTop: 6, lineHeight: 1.45 }}>
                      A comp: nothing is charged and it does not renew — the owner is reminded three days before it ends. The log says so.
                    </div>
                  </div>
                ) : ending === b.id ? (
                  <div style={{ marginTop: 9 }}>
                    <label htmlFor={`endsub-${b.id}`} style={{ display: "block", fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED, marginBottom: 5 }}>WHY — THE OWNER READS THIS</label>
                    <textarea id={`endsub-${b.id}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} placeholder="Why it is ending now, in a sentence." style={{ width: "100%", boxSizing: "border-box", background: "var(--bg)", border: `1px solid ${EL}`, borderRadius: 10, padding: "8px 10px", fontSize: 12, color: INK, fontFamily: "inherit", resize: "vertical" }} />
                    <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                      <button type="button" disabled={pending || reason.trim().length < 3} onClick={() => endSub(b)} style={{ ...btn, background: "#EF4444", color: "#fff", border: "none", opacity: reason.trim().length < 3 ? 0.5 : 1 }} aria-label={`Confirm ending ${b.name}'s subscription`}>
                        {pending ? "Ending…" : "End it now"}
                      </button>
                      <button type="button" onClick={closeSheets} style={btn}>Cancel</button>
                    </div>
                    <div style={{ fontSize: 10, color: MUTED, marginTop: 6, lineHeight: 1.45 }}>
                      A sanction: access stops today, the mandate is cancelled, and the studio comes off Discover.
                    </div>
                  </div>
                ) : unlisting === b.id ? (
                  <div style={{ marginTop: 9 }}>
                    <label htmlFor={`why-${b.id}`} style={{ display: "block", fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED, marginBottom: 5 }}>WHY — THE OWNER READS THIS</label>
                    <textarea
                      id={`why-${b.id}`}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="What is wrong with it, in a sentence."
                      style={{ width: "100%", boxSizing: "border-box", background: "var(--bg)", border: `1px solid ${EL}`, borderRadius: 10, padding: "8px 10px", fontSize: 12, color: INK, fontFamily: "inherit", resize: "vertical" }}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                      <button type="button" disabled={pending || reason.trim().length < 3} onClick={() => move(b, "unlisted", reason.trim())} style={{ ...btn, background: "#EF4444", color: "#fff", border: "none", opacity: reason.trim().length < 3 ? 0.5 : 1 }} aria-label={`Confirm taking ${b.name} off Discover`}>
                        {pending ? "Taking it down…" : "Take off Discover"}
                      </button>
                      <button type="button" onClick={() => { setUnlisting(null); setReason(""); }} style={btn}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                    {live ? (
                      <button type="button" onClick={() => { setReason(""); setUnlisting(b.id); }} style={{ ...btn, color: "#B42318" }} aria-label={`Take ${b.name} off Discover`}>
                        Take off Discover
                      </button>
                    ) : blockedFromListing ? (
                      <span style={{ fontSize: 10.5, color: MUTED, alignSelf: "center", lineHeight: 1.4 }}>
                        {!b.ownerVerified
                          ? "Its organization is not verified — verify that first, or its studios cannot be public."
                          : "It has no active subscription — its owner subscribes it, or grant one below."}
                      </span>
                    ) : (
                      <button type="button" disabled={pending} onClick={() => move(b, "listed")} style={{ ...btn, color: "#15803D" }} aria-label={`Put ${b.name} back on Discover`}>
                        Put back on Discover
                      </button>
                    )}
                    {b.type === "studio" && !b.ownerSuspended ? (
                      subLive ? (
                        <button type="button" onClick={() => { closeSheets(); setEnding(b.id); }} style={{ ...btn, color: "#B42318" }} aria-label={`End ${b.name}'s subscription`}>
                          End subscription
                        </button>
                      ) : (
                        <button type="button" onClick={() => { closeSheets(); setMonths(12); setGranting(b.id); }} style={{ ...btn, color: "#15803D" }} aria-label={`Grant ${b.name} a subscription`}>
                          Grant subscription
                        </button>
                      )
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Pager base={base} page={page} total={total} keep={{ tab, q: q || null }} />

      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 16, lineHeight: 1.55, borderTop: `1px solid ${EL}`, paddingTop: 12 }}>
        Taking one business off Discover leaves the rest of its organization alone — that is what this screen is for.
        Revoking the organization&apos;s verification, on the Verifications screen, unlists every studio it runs.
      </div>

      {toast ? (
        <div role="status" style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "calc(28px + var(--dos-safe-bottom, 0px))", zIndex: 500, background: "var(--text)", color: "var(--solid)", borderRadius: 999, padding: "10px 18px", fontSize: 12, fontWeight: 800, width: "min(360px, calc(100vw - 44px))", textAlign: "center", boxSizing: "border-box" }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
