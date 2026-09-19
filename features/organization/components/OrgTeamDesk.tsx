"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Toast, bizBtn, bizCard, pressKey, sinceWords } from "@/features/crews/components/crew-kit";
import {
  askOrganizationMemberAction,
  removeOrganizationMemberAction,
  setOrganizationMemberRoleAction,
  withdrawOrganizationAskAction,
  type OrgTeamActionResult,
} from "@/features/organization/server-actions/team";
import { PeoplePicker } from "@/features/people/components/PeoplePicker";
import { DeskHero } from "@/features/tenants/components/biz-kit";
import { DOS_UI, INK, LILAC } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { OrgAskRole, OrgTeamMember, OrgTeamRole } from "@/repositories/organizationTeam";

/** AN ORGANIZATION'S TEAM DESK — `/business/team`, the Team tile on an
 *  organization's Home (push 2, 19 Sep 2026; the user: "You add a user or artist
 *  in Team section for organization to label them as owner"). Until today the
 *  tile opened the prototype's own "nothing here yet", because an organization
 *  is ONE LOGIN (8 Sep 2026) and there was no table to put a person in.
 *
 *  THERE STILL IS ONE LOGIN. What this desk keeps is `organization_members`:
 *  the people the organization NAMES on its public page — as its OWNER, or on
 *  its TEAM — each ASKED and CONFIRMED like every roster in this app (a crew's,
 *  a class's, a studio's), because a public page is a claim about the person
 *  on it. Owner and Member are LABELS: they change what `/org/{id}` prints and
 *  give nobody a key to anything. The desk is the crew desk's shape (S_crewmanage
 *  16318, one section): a row per person with the label's colour on its edge,
 *  ASKED IS NOT JOINED, Make owner / Make member, Remove or Withdraw, and
 *  "+ Add to the team" opening SEARCH DANCEOS, THEN ASK THEM. */

/* ⚠ FOUR LABELS SINCE 20 Sep 2026 (the user's list A: Owner · Studio owner ·
   Event Team · Other Team Members). `studio_owner` is amber like Owner because
   it IS one: it writes a real owner seat on the studio it names. */
const ROLE_TINT: Record<OrgTeamRole, string> = { owner: "#F59E0B", studio_owner: "#F59E0B", event_team: "#8B5CF6", member: "#3B82F6" };
const ROLE_WORD: Record<OrgTeamRole, string> = { owner: "Owner", studio_owner: "Studio owner", event_team: "Event team", member: "Other team member" };
/* what the ASK may offer — a studio-owner seat is real power over a studio, so
   it is never given to somebody who has not said yes yet (the RPC refuses it) */
const ASK_ROLES: ReadonlyArray<readonly [OrgAskRole, string]> = [
  ["owner", "As owner"],
  ["event_team", "As event team"],
  ["member", "As team member"],
];
/* ⚠ HOW THE ASK BUTTON READS, per role — a phrase, not the label lowercased.
   "…to be named other team member" is not English, and the accessible name is
   what a screen reader says and what the e2e presses; deriving it from the chip
   broke both (20 Sep 2026). */
const ASK_PHRASE: Record<OrgAskRole, string> = { owner: "an owner", event_team: "on the event team", member: "on the team" };

export function OrgTeamDesk({ orgId, orgName, members, studios = [] }: { orgId: string; orgName: string; members: OrgTeamMember[]; /** the studios this organization runs — the Studio owner dropdown's options (20 Sep 2026) */ studios?: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [add, setAdd] = useState(false);
  const [askRole, setAskRole] = useState<OrgAskRole>("member");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2300);
  };
  const run = async (op: () => Promise<OrgTeamActionResult>, done: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await op();
    setBusy(false);
    if (out.error) {
      setError(out.error);
      return;
    }
    fire(done);
    router.refresh();
  };

  const confirmed = members.filter((m) => m.status === "confirmed");
  const owners = confirmed.filter((m) => m.role === "owner");
  const waiting = members.filter((m) => m.status === "asked");

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "0 16px 40px", boxSizing: "border-box" }}>
      <DeskHero tool="team" as="h1" margin="12px 0 8px" />
      <Link href={`/org/${orgId}`} aria-label={`Open ${orgName}'s public page`} style={{ display: "block", fontSize: 11, fontWeight: 800, color: "var(--sub)", textDecoration: "none", margin: "0 2px 12px" }}>
        {orgName} · who its page names ›
      </Link>

      <div style={{ ...bizCard, borderLeft: "4px solid #F59E0B", display: "flex", gap: 8 }}>
        {(
          [
            [String(owners.length), "Owners", "#F59E0B"],
            [String(confirmed.length - owners.length), "Team", "#3B82F6"],
            [String(waiting.length), "Waiting", "#EC4899"],
          ] as Array<[string, string, string]>
        ).map(([v, l, col]) => (
          <div key={l} style={{ flex: 1, textAlign: "center", background: "var(--el)", borderRadius: 12, padding: "9px 3px", borderTop: `3px solid ${col}` }}>
            <div style={{ fontSize: 13, fontWeight: 900 }} data-testid={`org-team-tile-${l.toLowerCase()}`}>
              {v}
            </div>
            <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--sub)", marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
      {/* the one fact the screen cannot show: what these labels are NOT */}
      <div style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.45, margin: "0 2px 12px" }}>Owner and Team are labels on your public page. They give nobody a login to this organization or a seat on any studio&apos;s team.</div>
      {error ? (
        <div role="alert" style={{ fontSize: 11.5, color: "#F87171", marginBottom: 10 }}>
          {error}
        </div>
      ) : null}

      {members.length === 0 ? <div style={{ fontSize: 12, color: "var(--sub)", padding: "8px 2px 14px" }}>Nobody named yet. Ask a user or an artist below — they are shown on your page once they say yes.</div> : null}

      {members.map((m) => {
        const rc = ROLE_TINT[m.role];
        const pending = m.status === "asked";
        const face = photoUrl(m.avatarPath);
        return (
          <div key={m.id} style={{ ...bizCard, borderLeft: `4px solid ${rc}`, padding: "11px 13px" }} data-testid="org-team-row">
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <Link href={`/person/${m.userId}`} aria-label={`Open ${m.name}'s profile`} style={{ display: "flex", alignItems: "center", gap: 11, flex: 1, minWidth: 0, color: INK, textDecoration: "none" }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, overflow: "hidden", background: `linear-gradient(135deg,${rc},#7C3AED)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 900, flexShrink: 0 }}>
                  {face ? <Image src={face} alt="" width={36} height={36} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : m.name.split(" ").filter(Boolean).map((x) => x[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 900 }}>{m.name}</div>
                  {/* ASKED IS NOT JOINED */}
                  {pending ? (
                    <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, color: "#F59E0B", marginTop: 1 }}>⏳ Waiting on them to confirm · as {ROLE_WORD[m.role].toLowerCase()}</div>
                  ) : (
                    <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, color: rc, textTransform: "uppercase", marginTop: 1 }}>
                      {ROLE_WORD[m.role]}
                      {/* a studio owner owns ONE named studio — the label means nothing without it */}
                      {m.role === "studio_owner" && m.businessName ? ` · ${m.businessName}` : ""}
                    </div>
                  )}
                  <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 2 }}>
                    {pending ? `asked ${sinceWords(m.createdAt)}` : `since ${sinceWords(m.createdAt)}`}
                    {m.city ? ` · ${m.city}` : ""}
                  </div>
                </div>
              </Link>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
              {/* a row only offers what it can actually change: a label moves only once they have said yes */}
              {/* ⚠ THE LABEL IS A DROPDOWN NOW (20 Sep 2026), not a toggle — there
                  are four of them, and one of them names a studio. A plain
                  <select> so the whole list is one press on a phone. */}
              {!pending ? (
                <select
                  aria-label={`What ${m.name} is`}
                  disabled={busy}
                  value={m.role === "studio_owner" ? `studio_owner:${m.businessId ?? ""}` : m.role}
                  onChange={(e) => {
                    const [role, biz] = e.target.value.split(":");
                    void run(
                      () => setOrganizationMemberRoleAction({ memberId: m.id, role: role as OrgTeamRole, businessId: biz || null }),
                      `${m.name} → ${role === "studio_owner" ? "Studio owner" : ROLE_WORD[role as OrgTeamRole]}`
                    );
                  }}
                  style={{ fontSize: 10, fontWeight: 800, padding: "6px 10px", borderRadius: 999, cursor: "pointer", background: "var(--el)", color: "var(--text)", border: "none", fontFamily: "inherit" }}
                >
                  <option value="owner">Owner</option>
                  {/* one row per studio this organization runs — "Studio owner with
                      drop down for multiple studios", and naming it IS the grant */}
                  {studios.map((s) => (
                    <option key={s.id} value={`studio_owner:${s.id}`}>
                      Studio owner · {s.name}
                    </option>
                  ))}
                  <option value="event_team">Event team</option>
                  <option value="member">Other team member</option>
                </select>
              ) : null}
              <button
                type="button"
                disabled={busy}
                aria-label={pending ? `Withdraw the ask to ${m.name}` : `Remove ${m.name}`}
                onClick={() =>
                  void run(
                    () => (pending ? withdrawOrganizationAskAction({ memberId: m.id }) : removeOrganizationMemberAction({ memberId: m.id })),
                    pending ? `Withdrawn — ${m.name} is no longer being asked` : `${m.name} is off your page`
                  )
                }
                style={{ fontSize: 10, fontWeight: 800, padding: "6px 10px", borderRadius: 999, cursor: "pointer", background: "rgba(239,68,68,.14)", color: "#F87171", border: "none", fontFamily: "inherit" }}
              >
                {pending ? "Withdraw" : "Remove"}
              </button>
            </div>
          </div>
        );
      })}

      <div role="button" tabIndex={0} aria-label="Add to the team" onKeyDown={pressKey(() => setAdd((v) => !v))} onClick={() => setAdd((v) => !v)} style={{ ...bizBtn, marginTop: 4 }}>
        ＋ Add to the team
      </div>
      {/* SEARCH DANCEOS, THEN ASK THEM — nobody is named by this; your page is public */}
      {add ? (
        <div style={{ ...bizCard, marginTop: 8 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }} role="radiogroup" aria-label="Ask them as">
            {ASK_ROLES.map(([r, word]) => {
              const on = askRole === r;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`Ask as ${ROLE_WORD[r].toLowerCase()}`}
                  onClick={() => setAskRole(r)}
                  style={{ flex: 1, padding: "9px 0", borderRadius: 999, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", background: on ? "var(--text)" : "var(--el)", color: on ? "var(--solid)" : "var(--text)", border: "none" }}
                >
                  {word}
                </button>
              );
            })}
          </div>
          <PeoplePicker
            exclude={members.map((m) => m.userId)}
            pickLabel={(p) => `Ask ${p.fullName} to be named ${ASK_PHRASE[askRole]}`}
            onPick={(p) => {
              setAdd(false);
              void run(() => askOrganizationMemberAction({ userId: p.id, role: askRole }), `📨 ${p.fullName} asked to confirm`);
            }}
          />
        </div>
      ) : null}
      <Toast msg={toast} />
    </div>
  );
}
