"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Toast, bizCard, sinceWords } from "@/features/crews/components/crew-kit";
import {
  askOrganizationMemberAction,
  removeOrganizationMemberAction,
  setOrganizationMemberRoleAction,
  withdrawOrganizationAskAction,
  type OrgTeamActionResult,
} from "@/features/organization/server-actions/team";
import { PeoplePicker } from "@/features/people/components/PeoplePicker";
import { DeskAddButton } from "@/features/settings/components/settings-kit";
import { DeskHero, SheetHandle, sheetBody, sheetWrap } from "@/features/tenants/components/biz-kit";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { DOS_DISPLAY, DOS_UI, INK, LILAC } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { OrgAskRole, OrgTeamMember, OrgTeamRole } from "@/repositories/organizationTeam";

/** AN ORGANIZATION'S TEAM DESK — `/business/{id}/team`, the Team tile on an
 *  organization's own home (push 2, 19 Sep 2026; the user: "You add a user or
 *  artist in Team section for organization to label them as owner"). Until then
 *  the tile opened the prototype's own "nothing here yet", because an
 *  organization was ONE LOGIN (8 Sep 2026) and there was no table to put a
 *  person in.
 *
 *  ⚠ THE LOGIN IS RETIRED (26 Sep 2026): an organization is a `businesses` row a
 *  person opens, and this desk is that organization's, keyed on its id —
 *  `/business/team` was the login's one desk and redirects to `/organizations`.
 *  What it keeps is `organization_members`: the people the organization NAMES
 *  on its public page — as its OWNER, on its EVENT TEAM, or as a member — each
 *  ASKED and CONFIRMED like every roster in this app (a crew's, a class's, a
 *  studio's), because a public page is a claim about the person on it. Owner
 *  and Member are LABELS; Event team may run its events (R40). ⚠ `studio_owner`
 *  is GONE with the studios: an organization runs none, so there is no seat to
 *  hand out and the dropdown that named a studio is deleted rather than left
 *  empty. The desk is the crew desk's shape (S_crewmanage 16318, one section). */

/* ⚠ THREE LABELS SINCE 26 Sep 2026 (Owner · Event team · Other team member) */
const ROLE_TINT: Record<OrgTeamRole, string> = { owner: "#F59E0B", event_team: "#8B5CF6", member: "#3B82F6" };
const ROLE_WORD: Record<OrgTeamRole, string> = { owner: "Owner", event_team: "Event team", member: "Other team member" };
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

export function OrgTeamDesk({ orgId, orgName, members }: { /** the ORGANIZATION BUSINESS this desk is (26 Sep 2026) */ orgId: string; orgName: string; members: OrgTeamMember[] }) {
  const router = useRouter();
  const [add, setAdd] = useState(false);
  const [askRole, setAskRole] = useState<OrgAskRole>("member");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* system back closes the sheet, exactly as tapping the scrim does */
  useCloseOnBack(() => setAdd(false), add);
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
      <div style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.45, margin: "0 2px 12px" }}>Owner and Team are labels on this organization&apos;s public page; Event team may run its events. Nobody here gets a login or a seat on any studio.</div>
      {error ? (
        <div role="alert" style={{ fontSize: 11.5, color: "#F87171", marginBottom: 10 }}>
          {error}
        </div>
      ) : null}

      {/* ＋ ON TOP, like Team, Rooms, Crews, Classes and Events (21 Sep 2026) */}
      <DeskAddButton
        label="Add a team member"
        onClick={() => {
          setError(null);
          setAdd(true);
        }}
      />

      {members.length === 0 ? <div style={{ fontSize: 12, color: "var(--sub)", padding: "8px 2px 14px" }}>Nobody named yet. Ask a user or an artist above — they are shown on your page once they say yes.</div> : null}

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
              {/* ⚠ THE LABEL IS A DROPDOWN (20 Sep 2026), not a toggle — a plain
                  <select> so the whole list is one press on a phone. The studio
                  rows it carried are gone with the studios (26 Sep 2026). */}
              {!pending ? (
                <select
                  aria-label={`What ${m.name} is`}
                  disabled={busy}
                  value={m.role}
                  onChange={(e) => {
                    const role = e.target.value as OrgTeamRole;
                    void run(() => setOrganizationMemberRoleAction({ memberId: m.id, role, orgId }), `${m.name} → ${ROLE_WORD[role]}`);
                  }}
                  style={{ fontSize: 10, fontWeight: 800, padding: "6px 10px", borderRadius: 999, cursor: "pointer", background: "var(--el)", color: "var(--text)", border: "none", fontFamily: "inherit" }}
                >
                  <option value="owner">Owner</option>
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
                    () => (pending ? withdrawOrganizationAskAction({ memberId: m.id, orgId }) : removeOrganizationMemberAction({ memberId: m.id, orgId })),
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

      {/* ⚠ THE SHEET IS WHERE THE ASK LIVES NOW, AND IT OPENS FROM THE TOP
          (21 Sep 2026, the user: "fix add team member for studio and
          organization as well"). This desk was the one the 20 Sep "＋ on top"
          pass missed: its control was a hand-rolled `div role="button"` reading
          "＋ Add to the team" at the FOOT of the roster, opening a card that
          expanded in place — so an organization with a real team scrolled past
          everybody to add somebody, and the two Team desks in this app looked
          and behaved like two different products. It is the shared
          `DeskAddButton` and the same sheet a studio's raises now; the words are
          the studio's own ("Add a team member"), which is what the user asked
          that desk to say on 20 Sep. */}
      {/* SEARCH DANCEOS, THEN ASK THEM — nobody is named by this; your page is public */}
      {add ? (
        <div onClick={() => setAdd(false)} style={sheetWrap}>
          <div role="dialog" aria-modal="true" aria-label="Add a team member" onClick={(e) => e.stopPropagation()} style={sheetBody}>
            <SheetHandle />
            <b style={{ fontSize: 17, fontFamily: DOS_DISPLAY }}>Add a team member</b>
            <div style={{ fontSize: 11.5, color: "var(--sub)", margin: "3px 0 14px", lineHeight: 1.5 }}>They accept before their name is on your page — nobody is named without saying yes.</div>

            <div style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 6px" }}>What they may do</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }} role="radiogroup" aria-label="Ask them as">
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
                void run(() => askOrganizationMemberAction({ orgId, userId: p.id, role: askRole }), `📨 ${p.fullName} asked to confirm`);
              }}
            />
          </div>
        </div>
      ) : null}
      <Toast msg={toast} />
    </div>
  );
}
