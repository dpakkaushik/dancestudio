"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  askCrewMemberAction,
  removeCrewMemberAction,
  reorderCrewMembersAction,
  setCrewMemberRoleAction,
  withdrawCrewAskAction,
  type CrewActionResult,
} from "@/features/crews/server-actions/crews";
import { PeoplePicker } from "@/features/people/components/PeoplePicker";
import { DeskAddButton } from "@/features/settings/components/settings-kit";
import { DeskHero, SheetHandle, sheetBody, sheetWrap } from "@/features/businesses/components/biz-kit";
import { photoUrl } from "@/lib/media/photo";
import { DOS_DISPLAY, DOS_UI, INK, LILAC } from "@/lib/design/tokens";
import { CREW_ROLE_TINT, CREW_ROLE_WORD, type Crew, type CrewMember } from "@/types/crew";
import { Toast, bizCard, sinceWords } from "./crew-kit";

/** THE CREW'S TEAM DESK — prototype S_crewmanage (16318-16480), lifted: the
 *  tiles, then a row per person with the role's colour on its edge, the photo
 *  and the name one door, ASKED IS NOT JOINED ("⏳ Waiting on them to confirm"),
 *  Promote / Make leader / Remove — a row only offers what it can actually
 *  change — and the ↑ ↓ that arrange the public roster; ＋ Add a team member
 *  opens SEARCH DANCEOS, THEN ASK THEM. It is headed by the tool's own hero the
 *  way every other desk is (18 Sep 2026: "all heading when inside the page
 *  should have similar design as Crew, Calendar etc."), and the BizShell strip
 *  with the photo and the picker lives on the crew's home, where the identity
 *  belongs.
 *
 *  ⚠⚠ IT DREW TWO SECTIONS UNTIL 29 Sep 2026 — Members and the BATTLE RECORD,
 *  picked by a `section` prop, which is why the crew's home had a Team tile and
 *  an Events tile. The battle record was the events the crew had entered, each a
 *  door to its page, with "See crew ranking" under it; it went with events, and
 *  with it the `entries` and `todayKey` props and the whole `section` fork. The
 *  crew's own board row survives (Step 25) and is reached from Stats.
 *
 *  Departures still standing: the prototype's tiles read Members / Battles won /
 *  Points — results and points need scoring, which no table holds. */

export function CrewManager({ crew, members }: { crew: Crew; members: CrewMember[] }) {
  const router = useRouter();
  const [add, setAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2300);
  };
  const run = async (op: () => Promise<CrewActionResult>, done: string) => {
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
  const asked = members.filter((m) => m.status === "asked");

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "0 16px 40px", boxSizing: "border-box" }}>
      {/* the tool's hero, as every desk wears it; the line under it says whose */}
      <DeskHero tool="team" as="h1" margin="12px 0 8px" />
      <Link href={`/crews/${crew.id}/manage`} aria-label={`Back to ${crew.name}'s home`} style={{ display: "block", fontSize: 11, fontWeight: 800, color: "var(--sub)", textDecoration: "none", margin: "0 2px 12px" }}>
        {crew.name} · {crew.style} · {crew.city}
      </Link>

      <div>
        <div style={{ ...bizCard, borderLeft: "4px solid #EC4899", display: "flex", gap: 8 }}>
          {(
            [
              /* ⚠ THE THREE TILES WERE Members · Entered · Upcoming, and the two
                 that counted EVENTS went on 29 Sep 2026. A one-tile strip reads
                 as a broken row, so the two facts this desk actually has take
                 their places — who has said yes, and who has not answered yet,
                 which is the distinction the roster below is built on
                 ("ASKED IS NOT JOINED"). Nothing is invented to fill a gap. */
              [String(confirmed.length), "Members", "#3B82F6"],
              [String(asked.length), "Waiting", "#F59E0B"],
            ] as Array<[string, string, string]>
          ).map(([v, l, col]) => (
            <div key={l} style={{ flex: 1, textAlign: "center", background: "var(--el)", borderRadius: 12, padding: "9px 3px", borderTop: `3px solid ${col}` }}>
              <div style={{ fontSize: 13, fontWeight: 900 }} data-testid={`crew-tile-${l.toLowerCase()}`}>
                {v}
              </div>
              <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--sub)", marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
        {error ? <div style={{ fontSize: 11.5, color: "#F87171", marginBottom: 10 }}>{error}</div> : null}

            {/* ⚠ THE SHARED ＋, ON TOP, IN THE SAME WORDS AS EVERY OTHER TEAM DESK
                (21 Sep 2026, the user: "fix Team pages for all kinds of profile
                types"). This was a hand-rolled `div role="button"` wearing
                crew-kit's DASHED `bizBtn`, sitting at the FOOT of the roster and
                reading "＋ Add member", while a studio's and an organization's
                said "Add a team member" on the solid pill at the top. It is the
                third desk of three and the last one still doing it its own way —
                the organization's was corrected on 21 Sep and this one was
                missed, which is exactly the shape of C36. */}
            <DeskAddButton label="Add a team member" onClick={() => setAdd(true)} />
            {members.map((m, i) => {
              const rc = CREW_ROLE_TINT[m.role];
              const pending = m.status === "asked";
              const canMove = (d: -1 | 1) => (d < 0 ? i > 0 : i < members.length - 1);
              const move = (d: -1 | 1) => {
                if (!canMove(d)) return;
                const nx = members.slice();
                const j = i + d;
                [nx[i], nx[j]] = [nx[j], nx[i]];
                void run(() => reorderCrewMembersAction({ crewId: crew.id, memberIds: nx.map((x) => x.id) }), "Order saved");
              };
              return (
                <div key={m.id} style={{ ...bizCard, borderLeft: `4px solid ${rc}`, padding: "11px 13px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    {/* THE PHOTO AND THE NAME ARE THE SAME DOOR (16358): "tapping a
                        name and expecting nothing to happen is not something anyone
                        does". The person page landed with the first parity slice, so
                        both the face and the name open it. */}
                    <Link href={`/person/${m.userId}`} aria-label={`Open ${m.name}'s profile`} style={{ display: "flex", alignItems: "center", gap: 11, flex: 1, minWidth: 0, color: INK, textDecoration: "none" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 11, overflow: "hidden", background: `linear-gradient(135deg,${rc},#7C3AED)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 900, flexShrink: 0 }}>
                        {photoUrl(m.avatarPath) ? <Image src={photoUrl(m.avatarPath)!} alt="" width={36} height={36} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
                        {photoUrl(m.avatarPath) ? null : (
                        <>{m.name.split(" ").filter(Boolean).map((x) => x[0]).join("").slice(0, 2).toUpperCase()}</>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 900 }}>{m.name}</div>
                        {/* ASKED IS NOT JOINED */}
                        {pending ? (
                          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, color: "#F59E0B", marginTop: 1 }}>⏳ Waiting on them to confirm</div>
                        ) : (
                          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, color: rc, textTransform: "uppercase", marginTop: 1 }}>{CREW_ROLE_WORD[m.role]}</div>
                        )}
                        <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 2 }}>
                          {pending ? `asked ${sinceWords(m.createdAt)}` : `since ${sinceWords(m.createdAt)}`}
                          {m.city ? ` · ${m.city}` : ""}
                        </div>
                      </div>
                    </Link>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                    {/* AND THE LEADER IS NOT OFFERED "MAKE LEADER" — a row only offers what it can actually change */}
                    {m.role !== "leader" && !pending ? (
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={m.role === "trainee" ? `Promote ${m.name}` : `Make ${m.name} leader`}
                        onClick={() =>
                          void run(
                            () => setCrewMemberRoleAction({ memberId: m.id, crewId: crew.id, role: m.role === "trainee" ? "member" : "leader" }),
                            `${m.name} → ${m.role === "trainee" ? "Member" : "Leader"}`
                          )
                        }
                        style={{ fontSize: 10, fontWeight: 800, padding: "6px 10px", borderRadius: 999, cursor: "pointer", background: "var(--el)", color: "var(--text)", border: "none", fontFamily: "inherit" }}
                      >
                        {m.role === "trainee" ? "Promote" : "Make leader"}
                      </button>
                    ) : null}
                    {m.role !== "leader" ? (
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={pending ? `Withdraw the ask to ${m.name}` : `Remove ${m.name}`}
                        onClick={() =>
                          void run(
                            () => (pending ? withdrawCrewAskAction({ memberId: m.id, crewId: crew.id }) : removeCrewMemberAction({ memberId: m.id, crewId: crew.id })),
                            pending ? `Withdrawn — ${m.name} is no longer being asked` : `${m.name} removed from the crew`
                          )
                        }
                        style={{ fontSize: 10, fontWeight: 800, padding: "6px 10px", borderRadius: 999, cursor: "pointer", background: "rgba(239,68,68,.14)", color: "#F87171", border: "none", fontFamily: "inherit" }}
                      >
                        {pending ? "Withdraw" : "Remove"}
                      </button>
                    ) : null}
                    {/* the crew's profile shows them in this order, so the order has to be movable HERE */}
                    <span style={{ marginLeft: "auto", display: "flex", gap: 4, flexShrink: 0 }}>
                      {(
                        [
                          ["↑", -1],
                          ["↓", 1],
                        ] as Array<[string, -1 | 1]>
                      ).map(([g, d]) => {
                        const off = !canMove(d);
                        return (
                          <button
                            key={g}
                            type="button"
                            disabled={off || busy}
                            aria-label={`Move ${m.name} ${d < 0 ? "up" : "down"}`}
                            onClick={() => move(d)}
                            style={{ width: 26, height: 26, lineHeight: "25px", textAlign: "center", borderRadius: 8, fontSize: 12, fontWeight: 900, background: "var(--el)", color: off ? "var(--muted)" : "var(--text)", opacity: off ? 0.4 : 1, cursor: off ? "default" : "pointer", border: "none", padding: 0, fontFamily: "inherit" }}
                          >
                            {g}
                          </button>
                        );
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
            {/* an empty roster said nothing at all, while the other two desks each
                said something — so a leader whose asks were all declined read the
                three tiles and a button and no words */}
            {members.length === 0 ? (
              <div style={{ ...bizCard, textAlign: "center", fontSize: 12, color: "var(--sub)", border: "1.5px dashed var(--el)", lineHeight: 1.5 }}>
                Nobody in the crew yet. Ask somebody above — they are on the crew&rsquo;s page once they say yes.
              </div>
            ) : null}
            {/* SEARCH DANCEOS, THEN ASK THEM — nobody is added by this; a crew roster is a public page */}
            {add ? (
              <div onClick={() => setAdd(false)} style={sheetWrap}>
                <div role="dialog" aria-modal="true" aria-label="Add a team member" onClick={(e) => e.stopPropagation()} style={sheetBody}>
                  <SheetHandle />
                  {/* ⚠ 17px AND THE DISPLAY FACE (27 Sep 2026) — the studio's and
                      the organization's add sheets both head themselves that way,
                      and this one was 16px in the UI face. One sheet, one title. */}
                  <b style={{ fontSize: 17, fontFamily: DOS_DISPLAY }}>Add a team member</b>
                  <div style={{ fontSize: 11.5, color: "var(--sub)", margin: "3px 0 12px", lineHeight: 1.5 }}>
                    They accept before their name is on the crew&rsquo;s page — nobody is put on a roster without saying yes.
                  </div>
                  <PeoplePicker
                    exclude={members.map((m) => m.userId)}
                    pickLabel={(p) => `Ask ${p.fullName} to join the crew`}
                    onPick={(p) => {
                      setAdd(false);
                      void run(() => askCrewMemberAction({ crewId: crew.id, userId: p.id }), `📨 ${p.fullName} asked to confirm joining the crew`);
                    }}
                  />
                </div>
              </div>
            ) : null}
      </div>
      <Toast msg={toast} />
    </div>
  );
}
