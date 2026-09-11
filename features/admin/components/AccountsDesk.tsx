"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { suspendAccountAction, unsuspendAccountAction } from "@/features/admin/server-actions/accounts";
import { grantSubscriptionAction } from "@/features/admin/server-actions/subscriptions";
import { adminOpenSupportThreadAction } from "@/features/support/server-actions/support";
import { VerifiedTick } from "@/features/settings/components/settings-kit";
import { INK, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { AdminAccount } from "@/repositories/adminPanel";
import type { OrgStandingRow } from "@/repositories/orgStanding";
import { agoWords } from "@/types/notification";
import { AdminGlyph, DESK_TINT } from "./admin-glyphs";
import type { AccountCounts, AccountTab } from "./accounts-tabs";
import { CountLine, DeskHero, DeskTabs, Pager, SearchBar, StatStrip } from "./desk-kit";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";
const initialsOf = (name: string) => name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

function Face({ name, path }: { name: string; path: string | null }) {
  const src = photoUrl(path);
  return (
    <span style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#64748B,#0EA5E9)", color: "#fff", fontWeight: 800, fontSize: 15 }}>
      {src ? <Image src={src} alt="" width={42} height={42} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : initialsOf(name)}
    </span>
  );
}

const chip: React.CSSProperties = { fontSize: 9, fontWeight: 900, letterSpacing: 0.5, padding: "2px 6px", borderRadius: 5, whiteSpace: "nowrap" };
const btn: React.CSSProperties = { height: 32, padding: "0 11px", borderRadius: 10, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${EL}`, background: CARD, color: INK };

/** ACCOUNTS (10 Sep 2026; subscriptions added 9 Sep 2026 for R14). Every live
 *  account, searchable, with what it holds and what an admin can do about it:
 *  write to it, suspend it, and — for an organization — set up or end the
 *  subscription that lets it open studios.
 *
 *  Suspension before deletion, deliberately. A suspended account can still
 *  sign in and read, and is refused every act that touches somebody else; its
 *  studios go dark while it lasts and come back if it is lifted. Deleting an
 *  account cascades a person's whole history and is not offered here. */
export function AccountsDesk({
  accounts,
  standing,
  q,
  tab,
  counts,
  page,
  total,
  nowIso,
}: {
  /** ONE PAGE of the accounts on this tab */
  accounts: AdminAccount[];
  /** R14/R16: subscription and evidence figures, per organization on this page */
  standing: Record<string, OrgStandingRow>;
  q: string;
  tab: AccountTab;
  counts: AccountCounts;
  page: number;
  total: number;
  nowIso: string;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [suspending, setSuspending] = useState<string | null>(null);
  const [writing, setWriting] = useState<string | null>(null);
  const [granting, setGranting] = useState<string | null>(null);
  const [months, setMonths] = useState(12);
  const [reason, setReason] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  };
  const close = () => {
    setSuspending(null);
    setWriting(null);
    setGranting(null);
    setReason("");
    setSubject("");
    setBody("");
  };

  const suspend = (a: AdminAccount) =>
    start(async () => {
      const out = await suspendAccountAction({ accountId: a.id, reason: reason.trim() });
      if (out.error) return fire(out.error);
      close();
      fire(`${a.fullName} is suspended — they have been told why`);
      router.refresh();
    });

  const lift = (a: AdminAccount) =>
    start(async () => {
      const out = await unsuspendAccountAction({ accountId: a.id, note: null });
      if (out.error) return fire(out.error);
      fire(`${a.fullName} is active again`);
      router.refresh();
    });

  /* comping a PERSON the Artist plan (10 Sep 2026): a studio's comp lives on
     Businesses, because a subscription is per studio */
  const grant = (a: AdminAccount) =>
    start(async () => {
      const out = await grantSubscriptionAction({ kind: "artist", subjectId: a.id, months, note: reason.trim() || null });
      if (out.error) return fire(out.error);
      close();
      fire(`${a.fullName} has the Artist plan for ${months} month${months === 1 ? "" : "s"} — nothing charged`);
      router.refresh();
    });

  const write = (a: AdminAccount) =>
    start(async () => {
      const out = await adminOpenSupportThreadAction({ accountId: a.id, subject: subject.trim(), body: body.trim() });
      if (out.error) return fire(out.error);
      close();
      if (out.threadId) router.push(`/admin/support/${out.threadId}`);
      else router.refresh();
    });

  const base = "/admin/accounts";

  return (
    <div style={{ padding: "6px 16px var(--dos-foot, 40px)" }}>
      {/* THE DESK SHAPE (11 Sep 2026): figures, tabs as blocks with their own
          counts, a search, one page of the list */}
      <DeskHero
        eyebrow="THE REGISTER"
        title="Accounts"
        sub={`${counts.all.toLocaleString("en-IN")} live account${counts.all === 1 ? "" : "s"}${counts.suspended > 0 ? ` · ${counts.suspended} suspended` : ""}`}
        tint={DESK_TINT.accounts}
        icon={<AdminGlyph k="accounts" size={22} />}
      />
      <StatStrip
        cols={4}
        figs={[
          { n: counts.users, label: "users", href: `${base}?tab=users` },
          { n: counts.orgs, label: "organizations", href: `${base}?tab=orgs` },
          { n: counts.verifiedOrgs, label: "verified", href: "/admin/verifications?tab=approved", tone: "#22C55E" },
          { n: counts.artists, label: "on the Artist plan", href: "/admin/subscriptions" },
        ]}
      />
      <DeskTabs
        base={base}
        current={tab}
        keep={{ q: q || null }}
        tabs={[
          { key: "all", label: "All", count: counts.all },
          { key: "users", label: "Users", count: counts.users },
          { key: "orgs", label: "Organizations", count: counts.orgs },
          { key: "suspended", label: "Suspended", count: counts.suspended, tone: "#EF4444" },
        ]}
      />
      <SearchBar action={base} q={q} keep={{ tab }} placeholder="Search a name, email or city…" />
      <CountLine shown={accounts.length} total={total} what={tab === "all" ? "accounts" : tab === "orgs" ? "organizations" : tab} q={q} />

      {accounts.length === 0 ? (
        <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.55 }}>Nobody matches that.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {accounts.map((a) => {
            const suspended = Boolean(a.suspendedAt);
            const sub = a.role === "org" ? (standing[a.id] ?? null) : null;
            return (
              <div key={a.id} data-testid="admin-account" style={{ background: CARD, border: `1px solid ${EL}`, borderLeft: `4px solid ${suspended ? "#EF4444" : a.isAdmin ? "#7C3AED" : a.role === "org" ? "#3B82F6" : EL}`, borderRadius: 16, padding: "11px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <Face name={a.fullName} path={a.avatarPath} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                      <b style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.fullName}</b>
                      {a.verifiedAt ? <VerifiedTick size={12} /> : null}
                    </div>
                    <div style={{ fontSize: 10.5, color: SUB, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.email ?? "no email"}
                      {a.city ? ` · ${a.city}` : ""}
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                      <span style={{ ...chip, background: a.role === "org" ? "#DBEAFE" : "#E0F2FE", color: a.role === "org" ? "#1D4ED8" : "#0369A1" }}>
                        {a.role === "org" ? "ORGANIZATION" : "USER"}
                      </span>
                      {a.hasPlan ? <span style={{ ...chip, background: "#FCE7F3", color: "#BE185D" }}>ARTIST</span> : null}
                      {a.isAdmin ? <span style={{ ...chip, background: "#EDE9FE", color: "#6B21A8" }}>ADMIN</span> : null}
                      {a.owns > 0 ? <span style={{ ...chip, background: "var(--el)", color: SUB }}>{a.owns} BUSINESS{a.owns === 1 ? "" : "ES"}</span> : null}
                      {suspended ? <span style={{ ...chip, background: "#FEE2E2", color: "#B42318" }}>SUSPENDED</span> : null}
                      {/* an organization's studios and how many are subscribed (10 Sep
                          2026: a subscription is per studio, comped on Businesses) */}
                      {a.role === "org" && sub && sub.studios > 0 ? (
                        <span style={{ ...chip, background: sub.subscribedStudios === sub.studios ? "#DCFCE7" : "#FEF3C7", color: sub.subscribedStudios === sub.studios ? "#15803D" : "#92400E" }}>
                          {sub.subscribedStudios}/{sub.studios} STUDIOS SUBSCRIBED
                        </span>
                      ) : null}
                      {a.role === "org" && sub ? (
                        <span style={{ ...chip, background: sub.proofPhotos >= 5 ? "var(--el)" : "#FEF3C7", color: sub.proofPhotos >= 5 ? SUB : "#92400E" }}>
                          {sub.proofPhotos} PHOTO{sub.proofPhotos === 1 ? "" : "S"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {suspended && a.suspendedReason ? (
                  <div style={{ fontSize: 11, color: "#B42318", marginTop: 8, lineHeight: 1.5, background: "#FEF2F2", borderRadius: 10, padding: "7px 9px" }}>
                    Suspended {agoWords(a.suspendedAt!, nowIso)}: {a.suspendedReason}
                  </div>
                ) : null}

                {/* ── the sheets ── */}
                {suspending === a.id ? (
                  <div style={{ marginTop: 9 }}>
                    <label htmlFor={`why-${a.id}`} style={{ display: "block", fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED, marginBottom: 5 }}>WHY — THEY READ THIS</label>
                    <textarea
                      id={`why-${a.id}`}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      maxLength={300}
                      placeholder="What they did, in a sentence."
                      style={{ width: "100%", boxSizing: "border-box", background: "var(--bg)", border: `1px solid ${EL}`, borderRadius: 10, padding: "8px 10px", fontSize: 12, color: INK, fontFamily: "inherit", resize: "vertical" }}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                      <button type="button" disabled={pending || reason.trim().length < 3} onClick={() => suspend(a)} style={{ ...btn, background: "#EF4444", color: "#fff", border: "none", opacity: reason.trim().length < 3 ? 0.5 : 1 }} aria-label={`Confirm suspending ${a.fullName}`}>
                        {pending ? "Suspending…" : "Suspend"}
                      </button>
                      <button type="button" onClick={close} style={btn}>Cancel</button>
                    </div>
                  </div>
                ) : granting === a.id ? (
                  <div style={{ marginTop: 9 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED, marginBottom: 5 }}>HOW LONG</div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 7, flexWrap: "wrap" }}>
                      {[1, 3, 6, 12].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMonths(m)}
                          aria-pressed={months === m}
                          style={{ ...btn, background: months === m ? "var(--text)" : CARD, color: months === m ? "var(--solid)" : SUB, border: `1px solid ${months === m ? "var(--text)" : EL}` }}
                        >
                          {m === 12 ? "1 year" : `${m} month${m === 1 ? "" : "s"}`}
                        </button>
                      ))}
                    </div>
                    <input
                      aria-label={`Note on ${a.fullName}'s Artist plan`}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={300}
                      placeholder="A note for the log (optional)"
                      style={{ width: "100%", boxSizing: "border-box", background: "var(--bg)", border: `1px solid ${EL}`, borderRadius: 10, padding: "8px 10px", fontSize: 12, color: INK, fontFamily: "inherit" }}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                      <button type="button" disabled={pending} onClick={() => grant(a)} style={{ ...btn, background: "var(--text)", color: "var(--solid)", border: "none" }} aria-label={`Confirm the Artist plan for ${a.fullName}`}>
                        {pending ? "Granting…" : "Grant it"}
                      </button>
                      <button type="button" onClick={close} style={btn}>Cancel</button>
                    </div>
                    <div style={{ fontSize: 10, color: MUTED, marginTop: 6, lineHeight: 1.45 }}>
                      A comp: nothing is charged and it does not renew — they are reminded three days before it ends. The log says so.
                    </div>
                  </div>
                ) : writing === a.id ? (
                  <div style={{ marginTop: 9 }}>
                    <input
                      aria-label={`Subject for ${a.fullName}`}
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      maxLength={140}
                      placeholder="Subject"
                      style={{ width: "100%", boxSizing: "border-box", background: "var(--bg)", border: `1px solid ${EL}`, borderRadius: 10, padding: "8px 10px", fontSize: 12, color: INK, fontFamily: "inherit", marginBottom: 6 }}
                    />
                    <textarea
                      aria-label={`Message to ${a.fullName}`}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={3}
                      maxLength={4000}
                      placeholder="Anything they need to get set up."
                      style={{ width: "100%", boxSizing: "border-box", background: "var(--bg)", border: `1px solid ${EL}`, borderRadius: 10, padding: "8px 10px", fontSize: 12, color: INK, fontFamily: "inherit", resize: "vertical" }}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                      <button type="button" disabled={pending || !subject.trim() || !body.trim()} onClick={() => write(a)} style={{ ...btn, background: "var(--text)", color: "var(--solid)", border: "none", opacity: subject.trim() && body.trim() ? 1 : 0.5 }}>
                        {pending ? "Sending…" : "Send"}
                      </button>
                      <button type="button" onClick={close} style={btn}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => { close(); setWriting(a.id); }} style={btn} aria-label={`Write to ${a.fullName}`}>✉ Write</button>
                    {suspended ? (
                      <button type="button" disabled={pending} onClick={() => lift(a)} style={{ ...btn, color: "#15803D" }} aria-label={`Lift the suspension on ${a.fullName}`}>
                        Lift suspension
                      </button>
                    ) : a.isAdmin ? (
                      <span style={{ fontSize: 10.5, color: MUTED, alignSelf: "center" }}>an admin cannot be suspended here</span>
                    ) : (
                      <button type="button" onClick={() => { close(); setSuspending(a.id); }} style={{ ...btn, color: "#B42318" }} aria-label={`Suspend ${a.fullName}`}>
                        Suspend
                      </button>
                    )}
                    {a.role !== "org" ? null : (
                      <Link href="/admin/verifications" style={{ ...btn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Verification</Link>
                    )}
                    {a.role === "org" && sub && sub.studios > 0 ? (
                      <Link href={`/admin/businesses?q=${encodeURIComponent(a.fullName)}`} style={{ ...btn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Studios</Link>
                    ) : null}
                    {a.role === "user" && !a.isAdmin && !suspended && !a.hasPlan ? (
                      <button type="button" onClick={() => { close(); setMonths(12); setGranting(a.id); }} style={{ ...btn, color: "#15803D" }} aria-label={`Grant ${a.fullName} the Artist plan`}>
                        Grant Artist plan
                      </button>
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
        Suspending unlists every studio the account owns and tells them why. Lifting it puts a verified organization&apos;s
        studios back. Deleting an account is not offered here — it erases a person&apos;s whole history, and
        <span className="mono"> scripts/remove-accounts.js</span> exists for when that is really what you mean.
      </div>

      {toast ? (
        <div role="status" style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "calc(28px + var(--dos-safe-bottom, 0px))", zIndex: 500, background: "var(--text)", color: "var(--solid)", borderRadius: 999, padding: "10px 18px", fontSize: 12, fontWeight: 800, width: "min(360px, calc(100vw - 44px))", textAlign: "center", boxSizing: "border-box" }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
