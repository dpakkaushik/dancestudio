"use client";

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
import { DOS_TOOLS, DeskHero, SheetHandle, sheetBody, sheetWrap } from "@/features/businesses/components/biz-kit";
import { DeskBody, DeskMiddle, DeskTop } from "@/components/ui/DeskSections";
import { FigureHead } from "@/components/ui/FigureHead";
import { ToolActions, ToolBody, ToolCard, ToolFacts, ToolHead, toolBtn } from "@/components/ui/ToolCard";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, MUTED } from "@/lib/design/tokens";
import { CREW_ROLE_TINT, CREW_ROLE_WORD, type Crew, type CrewMember, type CrewRole } from "@/types/crew";
import { Toast, bizCard, sinceWords } from "./crew-kit";

/** a crew member's card wears the Team tool's colour; the role keeps its own on the eyebrow */
const TEAM_TINT = DOS_TOOLS.team.c;

/** the roster's groups, in the crew's own order — the leader first */
const ROLE_ORDER: ReadonlyArray<CrewRole> = ["leader", "member", "trainee"];
/** the plural a group and its counter are headed by, as the studio desk's are */
const CREW_ROLE_PLURAL: Record<CrewRole, string> = { leader: "Leader", member: "Members", trainee: "Trainees" };

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
      <DeskTop style={{ paddingBottom: 4 }}>
      {/* ⚠ THE TOP SECTION (3 Oct 2026, C116) — the hero and Add.
          ⚠ NOTHING BETWEEN THE HEADING AND THE BUTTON (4 Oct 2026, the user:
          "remove such headings from all tools in any profile") — the
          "{crew} · {style} · {city}" line went, as the studio's did */}
      <DeskHero tool="team" as="h1" margin="0 0 12px" />

            {/* ⚠ THE SHARED ＋, ON TOP, IN THE SAME WORDS AS EVERY OTHER TEAM DESK
                (21 Sep 2026, the user: "fix Team pages for all kinds of profile
                types"). This was a hand-rolled `div role="button"` wearing
                crew-kit's DASHED `bizBtn`, sitting at the FOOT of the roster and
                reading "＋ Add member", while a studio's and an organization's
                said "Add a team member" on the solid pill at the top. It is the
                third desk of three and the last one still doing it its own way —
                the organization's was corrected on 21 Sep and this one was
                missed, which is exactly the shape of C36. */}
            <DeskAddButton label="Add Team Members" onClick={() => setAdd(true)} />
      </DeskTop>

      {/* ⚠ THE MIDDLE SECTION, IN THE STUDIO DESK'S SHAPE (4 Oct 2026, the user:
          "Crew team not looking the same should be how its for studio and
          artist") — the same `ToolFacts` boxes the studio's and the artist's Team
          desks draw: the total first, then a count per role in the role's own
          colour (0 included), and who has not answered yet. Counted off the
          roster below, never stored. The test ids are the old tiles' own. */}
      <DeskMiddle>
        <ToolFacts
          tint={DOS_TOOLS.team.c}
          items={[
            { label: confirmed.length === 1 ? "Member" : "Total members", value: confirmed.length, testId: "crew-tile-members" },
            { label: "Waiting", value: asked.length, testId: "crew-tile-waiting", tint: asked.length > 0 ? "#F59E0B" : undefined },
          ]}
        />
        <ToolFacts
          tint={DOS_TOOLS.team.c}
          style={{ marginTop: 6 }}
          items={ROLE_ORDER.map((r) => {
            const n = confirmed.filter((m) => m.role === r).length;
            return { label: CREW_ROLE_PLURAL[r], value: n, testId: `crew-count-${r}`, tint: n > 0 ? CREW_ROLE_TINT[r] : undefined };
          })}
        />
      </DeskMiddle>

      <DeskBody>
        {/* ⚠ THE LOWER SECTION (3 Oct 2026, C116) — the roster, GROUPED BY ROLE
            under the studio desk's own heads (a dot, the role, the count) since
            4 Oct 2026 — it was one flat stack */}
        {error ? <div style={{ fontSize: 11.5, color: "#F87171", marginBottom: 10 }}>{error}</div> : null}
        {ROLE_ORDER.map((role) => {
          const group = members.filter((m) => m.role === role);
          if (!group.length) return null;
          const col = CREW_ROLE_TINT[role];
          return (
            <div key={role} style={{ marginBottom: 14 }}>
              <FigureHead
                align="center"
                margin="2px 0 7px"
                title={
                  <>
                    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: col, flexShrink: 0 }} />
                    <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase", color: INK }}>{CREW_ROLE_PLURAL[role]}</span>
                  </>
                }
                figure={<span style={{ fontSize: 10.5, fontWeight: 800, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{group.length}</span>}
              />
            {group.map((m, gi) => {
              const rc = CREW_ROLE_TINT[m.role];
              const pending = m.status === "asked";
              /* ⚠ they swap with their NEIGHBOUR IN THE SAME GROUP — the studio
                 desk's rule; the stored order is still one order for the crew */
              const canMove = (d: -1 | 1) => Boolean(group[gi + d]);
              const move = (d: -1 | 1) => {
                const partner = group[gi + d];
                if (!partner) return;
                const nx = members.map((x) => x.id);
                const a = nx.indexOf(m.id);
                const b = nx.indexOf(partner.id);
                if (a < 0 || b < 0) return;
                [nx[a], nx[b]] = [nx[b], nx[a]];
                void run(() => reorderCrewMembersAction({ crewId: crew.id, memberIds: nx }), "Order saved");
              };
              /* ⚠⚠ A CREW MEMBER CARD (3 Oct 2026, the user: *"better and bigger
                 cards for … Team … each has a profile linked to it which should be
                 visible with profile pic and name and big … buttons segregated"*) —
                 the studio's Team desk wears the same card. THE PHOTO AND THE NAME
                 ARE ONE DOOR (16358), at a profile's size; the role in its own colour
                 rides above the name; ASKED IS NOT JOINED is said in the body; the
                 arrows stay beside the person they move; and Promote / Make leader /
                 Remove sit on their own bar — a card only offers what it can change. */
              return (
                /* ⚠ THE TEAM TOOL'S COLOUR, NO EDGE (4 Oct 2026, the user: "all team
                   member cards … Team member color theme cards and buttons. remove
                   bold line from left of the card") — the role keeps its colour on
                   the eyebrow alone */
                <ToolCard key={m.id} dim={pending}>
                  <ToolHead
                    tint={TEAM_TINT}
                    eyebrowTint={rc}
                    name={m.name}
                    photoPath={m.avatarPath ?? null}
                    href={`/person/${m.userId}`}
                    hrefLabel={`Open ${m.name}'s profile`}
                    /* the row's word, exactly — `CREW_ROLE_WORD` ("Member") */
                    eyebrow={pending ? "Asked to join" : CREW_ROLE_WORD[m.role]}
                    sub={m.city ?? null}
                    right={
                      /* the crew's profile shows them in this order, so the order has to be movable HERE */
                      <span style={{ display: "flex", flexDirection: "column", gap: 2, pointerEvents: "auto" }}>
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
                              style={{ width: 26, height: 24, lineHeight: "23px", textAlign: "center", borderRadius: 8, fontSize: 12, fontWeight: 900, background: "var(--el)", color: off ? "var(--muted)" : "var(--text)", opacity: off ? 0.4 : 1, cursor: off ? "default" : "pointer", border: "none", padding: 0, fontFamily: "inherit" }}
                            >
                              {g}
                            </button>
                          );
                        })}
                      </span>
                    }
                  />
                  <ToolBody>
                    <ToolFacts
                      tint={TEAM_TINT}
                      items={[
                        { label: pending ? "Asked" : "On the crew since", value: sinceWords(m.createdAt) },
                        { label: "Status", value: pending ? "Waiting" : "Confirmed", tint: pending ? "#F59E0B" : "#22C55E" },
                      ]}
                    />
                    {/* ASKED IS NOT JOINED */}
                    {pending ? <div style={{ fontSize: 11, fontWeight: 800, color: "#F59E0B", marginTop: 8 }}>⏳ Waiting on them to confirm</div> : null}
                  </ToolBody>
                  {m.role !== "leader" ? (
                    <ToolActions>
                      {/* AND THE LEADER IS NOT OFFERED "MAKE LEADER" — a card only offers what it can actually change */}
                      {!pending ? (
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
                          style={toolBtn("tinted", TEAM_TINT)}
                        >
                          {m.role === "trainee" ? "Promote" : "Make leader"}
                        </button>
                      ) : null}
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
                        style={toolBtn("danger", TEAM_TINT)}
                      >
                        {pending ? "Withdraw" : "Remove"}
                      </button>
                    </ToolActions>
                  ) : null}
                </ToolCard>
              );
            })}
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
                <div role="dialog" aria-modal="true" aria-label="Add Team Members" onClick={(e) => e.stopPropagation()} style={sheetBody}>
                  <SheetHandle />
                  {/* ⚠ 17px AND THE DISPLAY FACE (27 Sep 2026) — the studio's and
                      the organization's add sheets both head themselves that way,
                      and this one was 16px in the UI face. One sheet, one title. */}
                  {/* ⚠ nothing under the heading, as on the studio's add sheet (4 Oct 2026) */}
                  <div style={{ marginBottom: 12 }}>
                    <b style={{ fontSize: 17, fontFamily: DOS_DISPLAY }}>Add Team Members</b>
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
      </DeskBody>
      <Toast msg={toast} />
    </div>
  );
}
