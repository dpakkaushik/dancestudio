"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideOrgVerificationAction } from "@/features/admin/server-actions/admin";
import { VerifiedTick } from "@/features/settings/components/settings-kit";
import { PLATFORM_TINT, handleOf, isPlatform } from "@/lib/constants/socials";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { OrganizationRow, VerificationRequest } from "@/repositories/admin";
import type { SocialLink } from "@/types/profile";
import { agoWords } from "@/types/notification";

const CARD = "var(--card)";
const EL = "var(--el)";
const initialsOf = (name: string) => name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "O";

const Head = ({ children }: { children: string }) => (
  <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: "var(--muted)", margin: "2px 0 8px" }}>{children}</div>
);
const pill: React.CSSProperties = { display: "inline-block", padding: "9px 16px", borderRadius: 999, fontWeight: 900, fontSize: 11.5, cursor: "pointer", textDecoration: "none", border: "none", fontFamily: "inherit" };

/** THE LINKS ARE THE EVIDENCE. Each one opens in a new tab, named by its
 *  platform, so the admin reads the organization where it actually lives. */
function Links({ socials }: { socials: SocialLink[] }) {
  if (socials.length === 0) return <div style={{ fontSize: 11.5, color: "#EF4444", fontWeight: 700 }}>No links published — nothing to check.</div>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {socials.map((l) => {
        const tint = isPlatform(l.platform) ? PLATFORM_TINT[l.platform] : "#64748B";
        return (
          <a key={`${l.platform}-${l.url}`} href={l.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: `${tint}18`, border: `1px solid ${tint}55`, color: INK, textDecoration: "none", fontSize: 11.5, fontWeight: 800 }}>
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

/** THE VERIFICATION QUEUE (8 Sep 2026) — what is waiting on a DanceOS admin,
 *  and every organization there is. Approving stamps the tick and lists the
 *  organization's studios; rejecting (with a reason the organization reads
 *  back) or revoking clears the tick and unlists them. Both are the database's
 *  doing in one transaction; this screen only asks. */
export function VerificationQueue({ queue, orgs, nowIso }: { queue: VerificationRequest[]; orgs: OrganizationRow[]; /** the clock, stamped by the page — never read during render */ nowIso: string }) {
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

  const pendingIds = new Set(queue.map((q) => q.orgId));

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: "var(--dos-foot, 40px)" }}>
      <div style={{ padding: "14px 16px 0" }}>
        <div style={{ borderRadius: 22, padding: "15px 17px 14px", marginBottom: 14, position: "relative", overflow: "hidden", color: "#fff", background: "linear-gradient(135deg,#64748B,#0EA5E9)" }}>
          <div style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, position: "relative", fontFamily: DOS_DISPLAY, lineHeight: 1.18 }}>Verification queue</div>
          <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2, position: "relative" }}>{queue.length === 0 ? "nothing waiting on you" : `${queue.length} organization${queue.length === 1 ? "" : "s"} waiting`}</div>
        </div>

        <Head>WAITING ON DANCEOS</Head>
        {queue.length === 0 ? (
          <div style={{ fontSize: 11.5, color: SUB, padding: "0 2px 12px" }}>All clear — every organization that asked has an answer.</div>
        ) : (
          queue.map((q) => (
            <div key={q.id} data-testid="verification-request" style={{ background: CARD, border: `1px solid ${EL}`, borderLeft: "4px solid #F59E0B", borderRadius: 16, padding: "12px 13px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <Face name={q.orgName} path={q.orgAvatarPath} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/person/${q.orgId}`} style={{ fontSize: 13.5, fontWeight: 900, color: INK, textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.orgName}</Link>
                  <div style={{ fontSize: 10.5, color: SUB, marginTop: 1 }}>{[q.orgCity, `asked ${agoWords(q.createdAt, nowIso)}`].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
              <div style={{ margin: "10px 0 4px" }}>
                <Links socials={q.socials} />
              </div>
              {rejecting === q.orgId ? (
                <div style={{ marginTop: 10 }}>
                  <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Why not — the organization reads this" aria-label="Reason for rejecting" style={{ width: "100%", boxSizing: "border-box", background: EL, border: `1px solid ${EL}`, borderRadius: 12, padding: "10px 12px", color: INK, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button type="button" disabled={pending} onClick={() => decide(q.orgId, false, `${q.orgName} not approved`, note.trim())} style={{ ...pill, background: "#EF4444", color: "#fff" }}>
                      {pending ? "Saving…" : "Reject"}
                    </button>
                    <button type="button" disabled={pending} onClick={() => { setRejecting(null); setNote(""); }} style={{ ...pill, background: EL, color: INK }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button type="button" disabled={pending || q.socials.length === 0} aria-label={`Approve ${q.orgName}`} onClick={() => decide(q.orgId, true, `${q.orgName} verified — its studios are live`)} style={{ ...pill, background: q.socials.length ? "#22C55E" : EL, color: q.socials.length ? "#fff" : "var(--muted)" }}>
                    {pending ? "Saving…" : "Approve"}
                  </button>
                  <button type="button" disabled={pending} aria-label={`Reject ${q.orgName}`} onClick={() => setRejecting(q.orgId)} style={{ ...pill, background: EL, color: INK }}>
                    Reject…
                  </button>
                </div>
              )}
            </div>
          ))
        )}

        <div style={{ marginTop: 20 }}>
          <Head>EVERY ORGANIZATION</Head>
          {orgs.length === 0 ? (
            <div style={{ fontSize: 11.5, color: SUB, padding: "0 2px" }}>No organizations on DanceOS yet.</div>
          ) : (
            orgs.map((o) => {
              const verified = Boolean(o.verifiedAt);
              const waiting = pendingIds.has(o.id);
              return (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 11, background: CARD, border: `1px solid ${EL}`, borderLeft: `4px solid ${verified ? "#22C55E" : waiting ? "#F59E0B" : EL}`, borderRadius: 16, padding: "10px 13px", marginBottom: 8 }}>
                  <Face name={o.name} path={o.avatarPath} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <Link href={`/person/${o.id}`} style={{ fontSize: 13, fontWeight: 900, color: INK, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</Link>
                      {verified ? <VerifiedTick size={13} /> : null}
                    </div>
                    <div style={{ fontSize: 10.5, color: SUB, marginTop: 1 }}>{[o.city, verified ? "verified" : waiting ? "in review" : "not verified", `${o.socials.length} link${o.socials.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</div>
                  </div>
                  {verified ? (
                    <button type="button" disabled={pending} aria-label={`Revoke ${o.name}`} onClick={() => decide(o.id, false, `${o.name} unverified — its studios are private`)} style={{ ...pill, padding: "7px 12px", background: EL, color: INK }}>
                      Revoke
                    </button>
                  ) : waiting ? null : (
                    <button type="button" disabled={pending || o.socials.length === 0} aria-label={`Verify ${o.name}`} onClick={() => decide(o.id, true, `${o.name} verified — its studios are live`)} style={{ ...pill, padding: "7px 12px", background: o.socials.length ? "var(--text)" : EL, color: o.socials.length ? "var(--solid)" : "var(--muted)" }}>
                      Verify
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
      {toast ? <div role="status" style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#241B33", color: "#fff", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 700 }}>{toast}</div> : null}
    </div>
  );
}
