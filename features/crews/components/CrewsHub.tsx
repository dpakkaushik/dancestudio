import Link from "next/link";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { CREW_TINT, type CrewSummary } from "@/types/crew";
import { DeskAddButton } from "@/features/settings/components/settings-kit";
import { SegmentedPanels } from "@/features/shell/components/SegmentedNav";
import { DeskBody, DeskTop } from "@/components/ui/DeskSections";
import { CrewI, dosToolPaint } from "./crew-kit";
import { ReclaimCrewButton } from "./ReclaimCrewButton";

/** The Crews hub — prototype S_bizhub with kind="crews" (2585-2691): TWO LISTS,
 *  BECAUSE THERE ARE TWO RELATIONSHIPS. "A crew you lead and a crew you dance in
 *  are not the same object with a flag on it: one has a roster … to keep, and
 *  the other has a page you read." The ones you run come first (Manage ›), the
 *  dashed Create crew door under them, and below, under their own heading, the
 *  crews you are simply IN (Profile ›). Where a row goes decides what pressing
 *  it does. */

function Row({ crew, own, sub }: { crew: CrewSummary; own: boolean; sub: string }) {
  const accent = CREW_TINT;
  return (
    <Link
      href={own ? `/crews/${crew.id}/manage` : `/crew/${crew.id}`}
      aria-label={`${crew.name} — ${own ? "manage the crew" : "open the profile"}`}
      style={{ display: "flex", alignItems: "center", gap: 11, background: "var(--card)", border: "1.5px solid var(--el)", borderLeft: `4px solid ${own ? accent : "var(--el)"}`, borderRadius: 16, padding: "12px 13px", marginBottom: 9, color: INK, textDecoration: "none" }}
    >
      <span style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: own ? `${accent}1c` : "var(--el)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CrewI size={17} color={own ? accent : "var(--sub)"} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{crew.name}</div>
        <div style={{ fontSize: 10, color: SUB, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
      </div>
      {/* the word on the right is the promise the tap keeps */}
      <span style={{ fontSize: 10.5, fontWeight: 800, color: own ? accent : SUB, flexShrink: 0 }}>{own ? "Manage ›" : "Profile ›"}</span>
    </Link>
  );
}

const sinceWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" }).format(new Date(iso));

/** THE CREWS YOU RUN — and the door that makes one. */
function LedColumn({ led }: { led: CrewSummary[] }) {
  return (
    <>
      {/* ＋ AT THE TOP, LIKE CLASSES AND EVENTS (20 Sep 2026) — it was a dashed
          row under the list, so somebody who leads several scrolled past them
          all to start one */}
      {/* opens over this hub (22 Sep 2026); `/crews/new` is still the page */}
      <DeskAddButton label="Create crew" href="?new=1" />
      {led.length ? (
        led.map((c) => <Row key={c.id} crew={c} own sub={`${c.members} member${c.members === 1 ? "" : "s"} · ${c.style} · ${c.city}`} />)
      ) : (
        <div style={{ fontSize: 11.5, color: SUB, padding: "0 2px 10px" }}>You have not created a crew yet.</div>
      )}
    </>
  );
}

/** THE CREWS YOU DANCE IN — somebody else's to run, yours to be on.
 *
 *  ⚠ …EXCEPT ONE: a crew you FOUNDED and handed over is in this column, because
 *  you are a member of it now. That is where "Take it back" belongs, and it is
 *  the only place a founder can reach it (30 Sep 2026). */
function MemberColumn({ member }: { member: Array<CrewSummary & { since: string; foundedByMe: boolean }> }) {
  return member.length ? (
    <>
      {member.map((c) => (
        <div key={c.id}>
          <Row crew={c} own={false} sub={`${c.style} · ${c.city} · member since ${sinceWords(c.since)}`} />
          {c.foundedByMe ? (
            <div style={{ margin: "-4px 2px 12px" }}>
              <div style={{ fontSize: 10.5, color: SUB, marginBottom: 2 }}>You started this crew and handed it over.</div>
              <ReclaimCrewButton crewId={c.id} crewName={c.name} />
            </div>
          ) : null}
        </div>
      ))}
    </>
  ) : (
    <div style={{ fontSize: 11.5, color: SUB, padding: "0 2px 10px" }}>You are not on anybody else&rsquo;s crew yet.</div>
  );
}

export function CrewsHub({
  led,
  member,
  show = "led",
}: {
  led: CrewSummary[];
  member: Array<CrewSummary & { since: string; foundedByMe: boolean }>;
  /** ⚠⚠ TWO COLUMNS, AND THEY ARE THE TWO RELATIONSHIPS (29 Sep 2026, the user:
   *  *"crew tab should have 2 colums for where you have created the crew and
   *  where you are a part of in the other column"*).
   *
   *  The prototype's own reason is why this is a segment rather than two stacked
   *  lists (S_bizhub 2585-2691): "a crew you lead and a crew you dance in are not
   *  the same object with a flag on it — one has a roster to keep, and the other
   *  has a page you read." They were stacked; somebody on six crews scrolled past
   *  all of them to reach the two they run.
   *
   *  ⚠ PRACTICES WAS THE THIRD SEGMENT HERE AND IS ITS OWN TILE NOW (`/practice`,
   *  the same message): a practice belongs to a crew, but the person looking for
   *  one is not asking a question about crews — they are asking what they are
   *  dancing this week, which is a Home question. */
  show?: "led" | "in";
}) {
  const accent = CREW_TINT;
  /** ⚠ NO SEGMENTS UNTIL THERE IS A CREW — somebody with none would otherwise be
      offered two columns that can only both say "nothing yet", which is an empty
      state for a question they never asked. They get the Create crew door and
      one line, which is the rule the hub has followed since it grew a segment. */
  const hasCrew = led.length > 0 || member.length > 0;
  /* the heading — the same paint, and the same word, as the tile you pressed */
  const hero = (
    <div style={{ borderRadius: 22, padding: "15px 17px 14px", marginBottom: 0, position: "relative", overflow: "hidden", color: "#fff", background: dosToolPaint(accent) }}>
      <div style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
      {/* the page's own `<h1>` — the chrome no longer prints a drill page's name (28 Sep 2026) */}
      <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: -0.5, position: "relative", fontFamily: DOS_DISPLAY, lineHeight: 1.18 }}>Crews</h1>
    </div>
  );
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40 }}>
      <div style={{ padding: "14px 16px 0" }}>
        {/* ⚠ SECTIONS (3 Oct 2026, C116): the heading and the two column pills in
            the TOP squircle, the shown column (Create crew included — it belongs
            to Yours) in the LOWER one. With no crew there are no pills, so the
            heading stands alone on top and the Create door below. */}
        {hasCrew ? (
          <SegmentedPanels
            /* the key is the SERVER's answer, so a link carrying `?show=` wins
               over whatever this control last showed (the my-classes note) */
            key={show}
            initial={show}
            label="Show"
            sections
            top={hero}
            segments={[
              { key: "led", href: "/crews", label: "Yours", n: led.length, aria: "The crews you created" },
              { key: "in", href: "/crews?show=in", label: "You are in", n: member.length, aria: "The crews you are a part of" },
            ]}
            panels={[
              { key: "led", node: <LedColumn led={led} /> },
              { key: "in", node: <MemberColumn member={member} /> },
            ]}
          />
        ) : (
          <>
            <DeskTop style={{ margin: "0 0 12px" }}>{hero}</DeskTop>
            <DeskBody style={{ margin: "0" }}>
              <LedColumn led={led} />
            </DeskBody>
          </>
        )}
      </div>
    </div>
  );
}
