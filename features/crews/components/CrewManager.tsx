"use client";

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
import { EvIcon } from "@/features/events/components/event-kit";
import { PeoplePicker } from "@/features/people/components/PeoplePicker";
import { DOS_DISPLAY, DOS_UI, INK, LILAC } from "@/lib/design/tokens";
import { CREW_GRAD, CREW_ROLE_TINT, CREW_ROLE_WORD, type Crew, type CrewEntry, type CrewMember } from "@/types/crew";
import { EV_TINT } from "@/types/event";
import { CrewFace, Toast, bizBtn, bizCard, pressKey, sinceWords } from "./crew-kit";

/** The crew desk — prototype S_crewmanage (16318-16480), lifted: the BizShell
 *  strip (photo and name, both doors to the crew's own page), the three tiles,
 *  Members | Battle record. Members: a row per person with the role's colour
 *  on its edge, the photo and the name one door, ASKED IS NOT JOINED ("⏳
 *  Waiting on them to confirm"), Promote / Make leader / Remove — a row only
 *  offers what it can actually change — and the ↑ ↓ that arrange the public
 *  roster; ＋ Add member opens SEARCH DANCEOS, THEN ASK THEM. Battle record: the
 *  events the crew entered, each a door to its page.
 *
 *  Departures, stated: the tiles read Members / Entered / Upcoming where the
 *  prototype's read Members / Battles won / Points — results and points need
 *  scoring, which no table holds yet (tracked in the backlog); practice
 *  attendance and pay per performance are not columns. "See crew ranking" waits
 *  for Step 25. */

const monthDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, d)));
};

export function CrewManager({ crew, members, entries, todayKey }: { crew: Crew; members: CrewMember[]; entries: CrewEntry[]; todayKey: string }) {
  const router = useRouter();
  const [seg, setSeg] = useState<"members" | "battles">("members");
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
  const upcoming = entries.filter((e) => e.endDate >= todayKey && e.eventStatus !== "completed").length;
  const SEGS: Array<["members" | "battles", string]> = [
    ["members", "Members"],
    ["battles", "Battle record"],
  ];
  const pageHref = `/crew/${crew.id}`;

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40 }}>
      {/* the strip: the photo and the name, both opening the crew's own page (BizShell) */}
      <div style={{ margin: "12px 16px 12px", borderRadius: 22, padding: "16px 16px 14px", background: `linear-gradient(135deg,${CREW_GRAD[0]},${CREW_GRAD[1]})`, color: "#fff", display: "flex", alignItems: "center", gap: 12 }}>
        <Link href={pageHref} aria-label={`Open ${crew.name}'s profile`} style={{ display: "block", borderRadius: 16, overflow: "hidden", border: "2px solid rgba(255,255,255,.55)", flexShrink: 0 }}>
          <CrewFace name={crew.name} size={52} grad={["rgba(255,255,255,.2)", "rgba(255,255,255,.2)"]} radius={14} />
        </Link>
        <Link href={pageHref} style={{ flex: 1, minWidth: 0, color: "#fff", textDecoration: "none" }}>
          <div style={{ fontSize: 19, fontWeight: 900, fontFamily: DOS_DISPLAY, letterSpacing: -0.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{crew.name}</div>
          <div style={{ fontSize: 11.5, opacity: 0.9, marginTop: 2 }}>
            {crew.style} · {crew.city}
          </div>
        </Link>
      </div>

      <div style={{ padding: "0 16px" }}>
        <div style={{ ...bizCard, borderLeft: "4px solid #EC4899", display: "flex", gap: 8 }}>
          {(
            [
              [String(confirmed.length), "Members", "#3B82F6"],
              [String(entries.length), "Entered", "#F59E0B"],
              [String(upcoming), "Upcoming", "#EC4899"],
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
        <div style={{ display: "flex", gap: 2, background: "var(--el)", borderRadius: 12, padding: 3, marginBottom: 12 }}>
          {SEGS.map(([k, l]) => (
            <div key={k} role="button" tabIndex={0} aria-pressed={seg === k} onKeyDown={pressKey(() => setSeg(k))} onClick={() => setSeg(k)} style={{ flex: 1, textAlign: "center", padding: "8px 2px", borderRadius: 9, cursor: "pointer", fontSize: 10, fontWeight: 800, background: seg === k ? "var(--solid)" : "transparent", color: seg === k ? "var(--text)" : "var(--sub)", boxShadow: seg === k ? "0 1px 4px rgba(0,0,0,.3)" : "none" }}>
              {l}
            </div>
          ))}
        </div>
        {error ? <div style={{ fontSize: 11.5, color: "#F87171", marginBottom: 10 }}>{error}</div> : null}

        {seg === "members" ? (
          <>
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
                      <div style={{ width: 36, height: 36, borderRadius: 11, background: `linear-gradient(135deg,${rc},#7C3AED)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 900, flexShrink: 0 }}>
                        {m.name.split(" ").filter(Boolean).map((x) => x[0]).join("").slice(0, 2).toUpperCase()}
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
            <div role="button" tabIndex={0} aria-label="Add member" onKeyDown={pressKey(() => setAdd((v) => !v))} onClick={() => setAdd((v) => !v)} style={{ ...bizBtn, marginTop: 4 }}>
              ＋ Add member
            </div>
            {/* SEARCH DANCEOS, THEN ASK THEM — nobody is added by this; a crew roster is a public page */}
            {add ? (
              <div style={{ ...bizCard, marginTop: 8 }}>
                <PeoplePicker
                  exclude={members.map((m) => m.userId)}
                  pickLabel={(p) => `Ask ${p.fullName} to join the crew`}
                  onPick={(p) => {
                    setAdd(false);
                    void run(() => askCrewMemberAction({ crewId: crew.id, userId: p.id }), `📨 ${p.fullName} asked to confirm joining the crew`);
                  }}
                />
              </div>
            ) : null}
          </>
        ) : null}

        {seg === "battles" ? (
          <>
            <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", fontFamily: DOS_UI, margin: "2px 0 8px" }}>
              BATTLE RECORD · {entries.length} event{entries.length === 1 ? "" : "s"} entered
            </div>
            {/* A ROW OPENS ITS EVENT, OR IT IS NOT A BUTTON — every entry here has an event behind it */}
            {entries.map((e) => {
              const done = e.eventStatus === "completed" || e.endDate < todayKey;
              const col = EV_TINT[e.eventCat];
              return (
                <Link key={e.bookingId} href={`/e/${e.eventShareSlug}`} aria-label={`Open ${e.eventTitle}`} style={{ ...bizCard, borderLeft: `4px solid ${done ? "var(--el)" : col}`, display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", color: INK, textDecoration: "none" }}>
                  <EvIcon cat={e.eventCat} size={18} color={col} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{e.eventTitle}</div>
                    <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>
                      {monthDay(e.startDate)} · {e.city} · {done ? "Completed" : "Entered"}
                    </div>
                  </div>
                  <b style={{ fontSize: 12.5, color: done ? "var(--sub)" : "#22C55E" }}>›</b>
                </Link>
              );
            })}
            {entries.length === 0 ? <div style={{ ...bizCard, textAlign: "center", fontSize: 11.5, color: "var(--sub)", border: "1.5px dashed var(--el)" }}>No events entered yet — enter one from its page, as the crew&apos;s leader.</div> : null}
          </>
        ) : null}
      </div>
      <Toast msg={toast} />
    </div>
  );
}
