import Link from "next/link";
import { DOS_UI, INK, LILAC, SUB, TAB_TITLE } from "@/lib/design/tokens";
import { CREW_TINT, type CrewSummary } from "@/types/crew";
import { DeskAddButton } from "@/features/settings/components/settings-kit";
import { SegmentedPanels } from "@/features/shell/components/SegmentedNav";
import { DeskBody, DeskTop } from "@/components/ui/DeskSections";
import { ToolActions, ToolBody, ToolCard, ToolChip, ToolFacts, ToolHead, toolBtn } from "@/components/ui/ToolCard";
import { CrewI } from "./crew-kit";
import { ReclaimCrewButton } from "./ReclaimCrewButton";
import { CrewInvites, InviteHeadButtons, type CrewInviteRow } from "@/features/inbox/components/JoinInvites";
import type { AnsweredInviteRow } from "@/features/inbox/inviteRows";
import type { AskKind } from "@/repositories/askSettings";

/** The Crews hub — prototype S_bizhub with kind="crews" (2585-2691): TWO LISTS,
 *  BECAUSE THERE ARE TWO RELATIONSHIPS. "A crew you lead and a crew you dance in
 *  are not the same object with a flag on it: one has a roster … to keep, and
 *  the other has a page you read." The ones you run come first (Manage ›), the
 *  dashed Create crew door under them, and below, under their own heading, the
 *  crews you are simply IN (Profile ›). Where a row goes decides what pressing
 *  it does. */

const sinceWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" }).format(new Date(iso));

/** A CREW CARD (3 Oct 2026, the user: *"better and bigger cards … each has a
 *  profile linked to it … visible with profile pic and name and big"*). The
 *  profile IS the crew: its picture and its name lead, then the figures a crew is
 *  read by — how many dance in it, what it dances, since when — then the doors.
 *
 *  ⚠ THE WHOLE CARD STILL OPENS WHERE THE ROW DID — the desk for a crew you lead,
 *  its page for one you are in — through the stretched link, under the same
 *  accessible name the hub has always given it. The buttons are the two doors
 *  said out loud, on their own bar. */
function CrewCard({ crew, own, since, foundedByMe = false }: { crew: CrewSummary; own: boolean; since: string; foundedByMe?: boolean }) {
  const tint = CREW_TINT;
  return (
    <ToolCard href={own ? `/crews/${crew.id}/manage` : `/crew/${crew.id}`} hrefLabel={`${crew.name} — ${own ? "manage the crew" : "open the profile"}`}>
      {/* ⚠ THE FACE AND THE NAME ARE THE DOOR TO THE CREW'S PROFILE (4 Oct 2026,
          the user: "profile pic of crew and name should take to profile page of
          that crew") — so the Public page and Open profile buttons went. On a
          crew you lead the rest of the card still opens its desk; on one you
          dance in the whole card already IS that door, so the head adds none.
          ⚠ The label avoids "open the profile", which the card's own stretched
          link carries — Playwright matches a name by substring. And the eyebrow
          no longer says "you lead it / you dance in it" (the same message) — the
          LEADER / MEMBER chip says it once. */}
      <ToolHead
        tint={tint}
        name={crew.name}
        photoPath={crew.photo}
        icon={<CrewI size={24} color="#fff" />}
        href={own ? `/crew/${crew.id}` : undefined}
        hrefLabel={own ? `${crew.name} — view its profile page` : undefined}
        eyebrow={foundedByMe ? "Crew · you started it" : "Crew"}
        sub={crew.city}
        right={<ToolChip word={own ? "LEADER" : "MEMBER"} fg={own ? tint : SUB} bg={own ? `${tint}18` : "var(--el)"} />}
      />
      <ToolBody>
        {/* ⚠ NO "DANCES" TILE (3 Oct 2026, the user: "can remove dances from crew
            cards") — the crew's styles are its own page's business; the card is
            read by how many dance in it and since when */}
        <ToolFacts
          tint={tint}
          items={[
            { label: crew.members === 1 ? "Member" : "Members", value: crew.members },
            { label: own ? "Since" : "Joined", value: sinceWords(since) },
          ]}
        />
        {foundedByMe ? <div style={{ fontSize: 11, color: SUB, marginTop: 9, lineHeight: 1.45 }}>You started this crew and handed it over.</div> : null}
      </ToolBody>
      {/* ⚠ "Manage Crew", capital C, in the tinted paint Open profile wore (4 Oct
          2026, the user). A crew you dance in has no button left — unless you
          founded it and handed it over, where "Take {crew} back" still lives. */}
      {own ? (
        <ToolActions>
          <Link href={`/crews/${crew.id}/manage`} style={toolBtn("tinted", tint)}>
            Manage Crew
          </Link>
        </ToolActions>
      ) : foundedByMe ? (
        <ToolActions>
          {/* ⚠ THE FOUNDER'S DOOR BACK (30 Sep 2026), still named "Take {crew} back" */}
          <ReclaimCrewButton crewId={crew.id} crewName={crew.name} wrapStyle={{ flex: "1 1 0", minWidth: 0 }} buttonStyle={{ ...toolBtn("secondary", tint), width: "100%", color: tint }} />
        </ToolActions>
      ) : null}
    </ToolCard>
  );
}

/** THE CREWS YOU RUN — and the door that makes one. */
function LedColumn({ led }: { led: CrewSummary[] }) {
  return (
    <>
      {/* ⚠ ADD CREW LEFT THIS COLUMN FOR THE TOP SQUIRCLE (11 Oct 2026, the user:
          "add crew … below the heading above the column") — it is drawn under
          the hero in `CrewsHub`, so it is there whichever column is open */}
      {led.length ? (
        led.map((c) => <CrewCard key={c.id} crew={c} own since={c.createdAt} />)
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
function MemberColumn({ member, asks }: { member: Array<CrewSummary & { since: string; foundedByMe: boolean }>; asks: CrewInviteRow[] }) {
  return (
    <>
      {/* ⚠ THE ASKS FIRST (11 Oct 2026) — a crew leader asking you onto their
          roster is answered here, not in the Inbox */}
      <CrewInvites asks={asks} />
      {member.length ? (
        member.map((c) => <CrewCard key={c.id} crew={c} own={false} since={c.since} foundedByMe={c.foundedByMe} />)
      ) : asks.length ? null : (
        <div style={{ fontSize: 11.5, color: SUB, padding: "0 2px 10px" }}>You are not on anybody else&rsquo;s crew yet.</div>
      )}
    </>
  );
}

export function CrewsHub({
  led,
  member,
  show = "led",
  asks = [],
  inboxOff = [],
  answered = [],
}: {
  /** the crew asks this person has already answered — the head's Answered sheet */
  answered?: AnsweredInviteRow[];
  /** the crew asks waiting on this person (11 Oct 2026) — the top of Member */
  asks?: CrewInviteRow[];
  /** the kinds of ask switched off — the gear carries the "crew" one */
  inboxOff?: AskKind[];
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
  /* ⚠ an ask waiting on you counts (11 Oct 2026): somebody with no crew yet but
     one leader asking them must still reach the Member column to answer it */
  const hasCrew = led.length > 0 || member.length > 0 || asks.length > 0;
  /* the heading — the same paint, and the same word, as the tile you pressed */
  const hero = (
    <div data-testid="desk-hero" style={{ margin: "-14px -14px 0", padding: "16px 16px 6px", borderRadius: "21px 21px 0 0", position: "relative", color: INK, background: `linear-gradient(180deg, ${accent}66 0%, ${accent}26 60%, transparent 100%)` }}>
      {/* the page's own `<h1>` — the chrome no longer prints a drill page's name (28 Sep 2026) */}
      <h1 style={{ ...TAB_TITLE, color: INK, position: "relative" }}>Crews</h1>
      {/* the "crew" invite switch, moved here from the Inbox with the asks (11 Oct
          2026), and the asks already answered — the top-right pair Classes wears */}
      <InviteHeadButtons
        answered={answered}
        answeredTestId="crews-answered"
        answeredListTestId="crews-answered-list"
        settings={{ testId: "crews-settings", kind: "crew", off: inboxOff, title: "Crew invites" }}
      />
    </div>
  );
  /* ＋ ADD CREW, UNDER THE HEADING AND ABOVE THE COLUMNS (11 Oct 2026, the user).
     Opens over this hub (22 Sep 2026); the old `/crews/new` forwards here.
     "Add Crew", not "Create crew" (4 Oct 2026) — the form's own submit says that. */
  const top = (
    <>
      {hero}
      <DeskAddButton label="Add Crew" href="?new=1" inTop />
    </>
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
            top={top}
            segments={[
              /* ⚠ MANAGE · MEMBER (3 Oct 2026, the user: "crew columns name- Manage
                 and Member") — the words say what you DO with each crew; the arias
                 stay the sentences a locator and a screen reader read */
              { key: "led", href: "/crews", label: "Manage", n: led.length, aria: "The crews you created" },
              { key: "in", href: "/crews?show=in", label: "Member", n: member.length + asks.length, aria: "The crews you are a part of" },
            ]}
            panels={[
              { key: "led", node: <LedColumn led={led} /> },
              { key: "in", node: <MemberColumn member={member} asks={asks} /> },
            ]}
          />
        ) : (
          <>
            <DeskTop style={{ margin: "0 0 12px" }}>{top}</DeskTop>
            <DeskBody style={{ margin: "0" }}>
              <LedColumn led={led} />
            </DeskBody>
          </>
        )}
      </div>
    </div>
  );
}
