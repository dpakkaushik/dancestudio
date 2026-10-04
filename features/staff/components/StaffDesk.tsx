"use client";

import { KIND_WORD, kindOf } from "@/types/profile";

import { useState, useSyncExternalStore } from "react";
import { FigureHead } from "@/components/ui/FigureHead";
import { QRBlock } from "@/components/ui/QRBlock";
import { CENTER_CARD, CENTER_SCRIM } from "@/components/ui/centerModal";
import { dosKey } from "@/features/classes/components/ShareSheet";
import { Toast, bizCard } from "@/features/crews/components/crew-kit";
import { PeoplePicker } from "@/features/people/components/PeoplePicker";
import { money as rupees } from "@/features/payouts/components/earnings-kit";
import {
  invitePersonAction,
  inviteToBusinessAction,
  payTeamMemberAction,
  reorderMembersAction,
  revokeInviteAction,
} from "@/features/staff/server-actions/staff";
import Link from "next/link";
import { DeskAddButton } from "@/features/settings/components/settings-kit";
import { DeskBody, DeskMiddle, DeskTop } from "@/components/ui/DeskSections";
import { ToolActions, ToolBody, ToolCard, ToolChip, ToolFace, ToolFacts, ToolHead, toolBtn } from "@/components/ui/ToolCard";
import { DOS_TOOLS, DeskHero, SheetHandle, sheetBody, sheetWrap } from "@/features/businesses/components/biz-kit";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, MUTED, SUB } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import type { TeamMember } from "@/repositories/businesses";
import type { PayoutMethod, PayoutRecord, PayoutStatus } from "@/types/payout";
import type { BusinessType } from "@/types/business";
import {
  MEMBER_LABEL,
  MEMBER_LABEL_ORDER,
  MEMBER_ROLE_WORD,
  labelsFor,
  rolesFor,
  type InvitableRole,
  type BusinessInvite,
} from "@/types/staff";

/** Staff & permissions — lifted from the prototype's settings segment
 *  (DanceOSApp.jsx:18427-18435): one card per person with the level badge on the
 *  right and "role · what they may do" underneath, the footnote that says what
 *  cannot be granted, and the dashed "＋ Invite staff or team member" button.
 *
 *  The prototype's invite offers "QR / mobile / search", and since 19 Sep 2026
 *  so does this — the user: "Team should only be able to add team member by
 *  typing name, number, email or scan … similar suggestion as we get for other
 *  person dropdowns with photo and name". So the way in is the app's one
 *  `PeoplePicker` (a name, a mobile number, or a scanned profile link, with a
 *  picture on every row). The QR is kept exactly: it is what you hold up in the
 *  room.
 *
 *  ⚠ AND SINCE 20 SEP 2026 THE PICKER IS THE ONLY WAY IN (the user: "Remove
 *  option to add by email and remove permission section just for labelling").
 *  What that costs, said plainly: somebody with no DanceOS account cannot be
 *  asked onto a team at all. The email form, `invite_to_business`, the
 *  `business_invites.email` column and `/join/{code}` all STAY — an invite
 *  already sent has to stay acceptable (Rule 14) — but nothing here offers one.
 *
 *  THREE MORE THINGS, all the user's:
 *   · LABELS COME FROM THE PROFILE YOU ARE IN (`rolesFor`) — a studio hands out
 *     Faculty, Visiting faculty and Staff; an artist page hands out Faculty and
 *     Assistant. The PERMISSIONS table that stood beside them is gone (20 Sep
 *     2026): every member's own row already prints what their seat carries.
 *   · THE ORDER IS THE OWNER'S (`reorder_business_members`) — ▲▼ on every row,
 *     the crew desk's own control.
 *   · PAY THEM, WITH A METHOD, AND SEE WHAT HAS BEEN PAID. The payment lands in
 *     `payouts`, which IS the Earnings desk's MONEY OUT — so it is an expense
 *     the moment it is written, not a second ledger.
 *     ⚠ THE BUTTON IS ON THE ROW SINCE 20 SEP 2026. It was inside the member
 *     sheet, which opens only for a NON-owner — and an account whose every
 *     business has a team of one could never reach it, which is why the user
 *     asked whether it had been built at all.
 *
 *  The waiting rows wear the prototype's own "⏳ Invited" treatment (18578). */

const CARD = "var(--card)";
const EL = "var(--el)";
const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/** ⚠ THE SHARED CARD, NOT A LOCAL ONE (27 Sep 2026, the user: *"fix team layout
 *  for all types of profiles should be clean"*). This was declared here as
 *  `{ background, borderRadius: 16, padding: 14 }` — no BORDER — while the
 *  organization's and the crew's Team rows are `bizCard`, which has one. So a
 *  studio's roster was the one of the three whose rows had no outline, and the
 *  padding differed by a pixel either way. It keeps its name so the three call
 *  sites below read as they did; what changed is where it comes from. */
const card = bizCard;

/* the page's own origin, read the sanctioned way (no impure render access) —
   the same pattern ShareSheet uses for the booking link */
const subscribeNever = () => () => {};
const readOrigin = () => window.location.origin;
const readServerOrigin = () => "";

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: CARD,
  border: `1.5px solid ${EL}`,
  borderRadius: 12,
  padding: "11px 12px",
  fontSize: 13,
  color: INK,
  outline: "none",
  fontFamily: "inherit",
};

/** ⚠ THE SHARED SHEET, NOT A LOCAL COPY OF IT (21 Sep 2026). These were declared
 *  here — the same scrim, the same radius, the same max width as `biz-kit`'s —
 *  and the copy had dropped ONE line, `animation: SHEET_ANIMATION`, so every
 *  sheet on this desk APPEARED while the organization's and the crew's slid up.
 *  Nothing typed can see that; you only notice it beside another desk, which is
 *  the whole of what the user asked to be fixed. `sheet` keeps its name so the
 *  eight call sites below read as they did. */
const sheet = sheetBody;

/* DosTeamRow's marks (18560-18565): the label wears its own colour, the person's
   kind rides beside it.
   ⚠ `LEVEL_TINT` — two colours keyed on "Admin" / "Staff" — is DELETED (20 Sep
   2026). The roster is grouped by LABEL now and every label carries its own ink
   (`MEMBER_LABEL`), so a second colour scale keyed on a coarser word would paint
   Faculty and Visiting faculty and Assistant all the same orange, which is the
   opposite of what the grouping is for.
   ⚠ The face's own gradient and initials helpers went on 3 Oct 2026: the shared
   `ToolFace` draws them, in the label's colour. */


const PAY_METHODS: ReadonlyArray<readonly [PayoutMethod, string]> = [
  ["upi", "UPI"],
  ["bank_transfer", "Bank transfer"],
  ["cash", "Cash"],
  ["other", "Other"],
];
const PAY_STATES: ReadonlyArray<readonly [PayoutStatus, string]> = [
  ["done", "Paid"],
  ["in_transit", "In transit"],
  ["on_hold", "On hold"],
];

export function StaffDesk({
  businessId,
  businessType,
  team,
  invites,
  payments = [],
  isOwner,
  meUserId,
}: {
  businessId: string;
  businessName: string;
  /** which labels this profile has to give (19 Sep 2026) */
  businessType: BusinessType;
  team: TeamMember[];
  invites: BusinessInvite[];
  /** everything this business has paid its people — the history, filtered per row */
  payments?: PayoutRecord[];
  isOwner: boolean;
  meUserId: string;
}) {
  /** the invite link is this deployment's own /join/{code} */
  const origin = useSyncExternalStore(subscribeNever, readOrigin, readServerOrigin);
  /* ⚠ THE PUBLIC FACE OF THE BUSINESS THIS DESK BELONGS TO (21 Sep 2026): a
     studio has a page of its own; an ARTIST PAGE does not — an artist IS their
     profile since 18 Sep (R24), so the door is the OWNER's person page, taken
     from the roster rather than from `/artist/{id}`, which only redirects there */
  const [addOpen, setAddOpen] = useState(false);
  const [shareInvite, setShareInvite] = useState<BusinessInvite | null>(null);
  /* the add sheet's two ways in: pick somebody on DanceOS, or ask an address */
  /* ⚠ ONE WAY IN SINCE 20 SEP 2026 — the picker. "By email" is gone at the
     user's word; this stays a constant so the email FORM below (and the RPC,
     the column and /join/{code} behind it) is kept rather than deleted, which
     is what lets an invite already sent still be accepted. */
  const addBy: "person" | "email" = "person";
  const [form, setForm] = useState<{ name: string; email: string; role: InvitableRole }>({
    name: "",
    email: "",
    role: "trainer",
  });
  /* ⚠ WHO IS BEING PAID, ITS OWN STATE (3 Oct 2026): Pay on the card opened the
     manage sheet AND the pay sheet over it, so cancelling a payment landed on a
     sheet nobody had asked for. The manage sheet carries no payment controls now
     (the user: *"manage page for team without option to see history and record
     payment in it"*), so the two never open together. */
  const [payFor, setPayFor] = useState<TeamMember | null>(null);
  const [pay, setPay] = useState<{ amount: string; method: PayoutMethod; status: PayoutStatus; note: string }>({ amount: "", method: "upi", status: "done", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /* system back closes the sheet that is open, exactly as tapping the scrim does */
  useCloseOnBack(() => setAddOpen(false), addOpen);
  useCloseOnBack(() => setShareInvite(null), Boolean(shareInvite));
  useCloseOnBack(() => setPayFor(null), Boolean(payFor));

  /** the labels this profile has to give, and the seats already on the team */
  const roles = rolesFor(businessType);
  /* ⚠ the member sheet may hand over OWNER; an invite may not (20 Sep 2026) */
  const labels = labelsFor(businessType);
  const onTeam = team.map((m) => m.userId);
  const paidTo = (userId: string) => payments.filter((p) => p.userId === userId);
  /** how many hold each label, in the roster's own order — ⚠ EVERY label this
   *  profile hands out, 0 included (4 Oct 2026, the user: "count for each role
   *  should be mentioned even if 0"), plus any label somebody holds that this
   *  profile no longer offers. Three to a row, so the words stay whole. */
  const shown = new Set<string>([...labels.map(([r]) => r), ...team.map((m) => m.role)]);
  const roleCounts = MEMBER_LABEL_ORDER.filter((r) => shown.has(r)).map((r) => {
    const n = team.filter((m) => m.role === r).length;
    return { label: MEMBER_LABEL[r].short, value: n, testId: `team-count-${r}`, tint: n > 0 ? MEMBER_LABEL[r].colour : undefined };
  });
  const roleRows: (typeof roleCounts)[] = [];
  for (let i = 0; i < roleCounts.length; i += 3) roleRows.push(roleCounts.slice(i, i + 3));

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  const run = async (op: () => Promise<{ error: string | null }>, doneMsg: string | null) => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const out = await op();
    setBusy(false);
    if (out.error) {
      setError(out.error);
      return false;
    }
    if (doneMsg) fire(doneMsg);
    return true;
  };

  const joinLink = (code: string) => `${origin}/join/${code}`;
  const canInvite = form.name.trim().length > 0 && form.email.trim().includes("@");

  return (
    <div
      style={{
        background: LILAC,
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        minHeight: "100vh",
        padding: "0 16px 40px",
        boxSizing: "border-box",
      }}
    >
      {/* ⚠⚠ THE SHARED HERO, AND A REAL <h1> (21 Sep 2026, the user: "fix Team
          pages for all kinds of profile types"). This was a HAND-COPY of
          `DeskHero` — the same paint and the same geometry, drawn from the same
          `dosToolPaint(DOS_TOOLS.team.c)` — with the title as a `<div>`, so this
          page had **no heading at all** for a screen reader while the crew's and
          the organization's Team desks both render `<h1>Team</h1>`. A copy that
          looks identical and is not the same element is the worst kind, because
          nothing on screen ever shows it drifting.
          ⚠ AND IT NAMES THE BUSINESS, which the other two desks already did: an
          organization runs several studios, and the tool hero names the tool. */}
      <DeskTop style={{ paddingBottom: 4 }}>
      {/* ⚠ THE TOP SECTION (3 Oct 2026, C116) — the hero, whose team it is, and Add */}
      {/* ⚠ NOTHING BETWEEN THE HEADING AND THE BUTTON (4 Oct 2026, the user) */}
      <DeskHero tool="team" as="h1" margin="0 0 12px" />

      {/* ＋ ADD, AT THE TOP, THE WAY CLASSES AND EVENTS OPEN (20 Sep 2026, the
          user: "Add button for team, room, crew to be similar to add class and
          event and should be on top of the page"). It was a dashed row at the
          FOOT of the roster, so on a studio with a real team you scrolled past
          everybody to add somebody. */}
      {/* ⚠ "Add a team member" — the prototype's own words (18673), and the
          user's: *"butoon should say add team member"*. It read "Invite staff or
          team member", which is the DASHED row's wording from the settings
          segment (18435) carried onto a pill it no longer belongs on: "staff" is
          not a seat any more (it is "Other team member" since 20 Sep) and the
          sheet behind it asks somebody by NAME, not by post. */}
      {isOwner ? (
        <DeskAddButton
          label="Add Team Members"
          onClick={() => {
            setForm({ name: "", email: "", role: "trainer" });
            setError(null);
            setAddOpen(true);
          }}
        />
      ) : null}
      </DeskTop>

      {/* ⚠ THE MIDDLE SECTION (4 Oct 2026, the user: "section in between with
          total members count below count member role wise") — counted off the
          roster below, never stored */}
      <DeskMiddle>
        <ToolFacts tint={DOS_TOOLS.team.c} items={[{ label: team.length === 1 ? "Member" : "Total members", value: team.length, testId: "team-total" }]} />
        {roleRows.map((row, i) => (
          <ToolFacts key={i} tint={DOS_TOOLS.team.c} style={{ marginTop: 6 }} items={row} />
        ))}
      </DeskMiddle>

      <DeskBody style={{ paddingBottom: 4 }}>
      {/* ⚠ THE LOWER SECTION (3 Oct 2026, C116) — the roster and what it says */}
      {/* ── THE ROSTER, GROUPED BY LABEL (20 Sep 2026) ──────────────────────
          The user held up the prototype's own Team screen: *"fix team view like
          this"*. S_team (18679-18698) does not draw a list of people — it draws
          a group per LABEL, each headed by the label's colour as a dot, its
          short plural, the count, and a badge saying what that seat may do. This
          desk was a flat stack of cards, so a studio with a dozen people had no
          shape at all and you read twelve names to find the one assistant.

          Three things the heading carries, all the prototype's (18680-18688):
          the DOT in the label's own ink, "· N", and CAN TAKE A CLASS / CAN
          ASSIST — which is not decoration, it is the rule `can_run_register_for_class`
          keeps, said where somebody is choosing a label.

          ⚠ THE PEOPLE WHO HAVE NOT ANSWERED SIT IN THEIR OWN GROUP, not in a
          block underneath it (18578's "⏳ Invited" treatment, on the row rather
          than beside it). Somebody asked to be a class assistant IS what the
          Class assistants group is about; parking them below the whole roster
          made the group's count and the group's rows disagree. The count says
          so: it is members + waiting, because that is what you asked for.

          ⚠ AND NO DRAG HANDLE, though the prototype's row has one (18692-18696)
          and the screenshot shows it. Its gesture is a 220 ms hold, a pointer
          capture and a per-row measurement that commits to localStorage; ours
          would have to commit a SERVER action, so it is its own slice and it is
          on the backlog. ▲▼ are drawn instead — they are in the same screenshot,
          they already work, and six grey dots that do nothing would be the same
          lie as a tile that opens nothing. */}
      {MEMBER_LABEL_ORDER.map((role) => {
        const L = MEMBER_LABEL[role];
        const members = team.filter((m) => m.role === role);
        /* an owner is never INVITED (the seat is not grantable through an
           invite — `rolesFor` leaves it out), so that group never has a waiting
           row; the others may */
        const waiting = invites.filter((inv) => inv.memberRole === role);
        if (!members.length && !waiting.length) return null;
        return (
          <div key={role} style={{ marginBottom: 14 }}>
            {/* the heading (18680-18688), with the rule between it and its count
                since 22 Sep 2026 — it was "· N", which reads as punctuation
                between two words rather than as a heading and its figure.
                ⚠ `align="center"`, because the title here begins with a DOT and
                a baseline would drop the rule onto the text's own baseline. The
                capability badge rides AFTER the figure, where it always did. */}
            <FigureHead
              align="center"
              margin="2px 0 7px"
              title={
                <>
                  {/* ⚠ a FRAGMENT, so the dot and the label are two flex children
                      of the head itself and the row's own gap spaces them — a
                      margin here would be added to that gap */}
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: L.colour, flexShrink: 0 }} />
                  <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase", color: INK }}>{L.short}</span>
                </>
              }
              figure={<span style={{ fontSize: 10.5, fontWeight: 800, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{members.length + waiting.length}</span>}
              after={
                L.teach ? (
                  <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.4, padding: "2px 7px", borderRadius: 999, background: `${L.colour}22`, color: L.colour, flexShrink: 0 }}>CAN TAKE A CLASS</span>
                ) : L.assist ? (
                  <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.4, padding: "2px 7px", borderRadius: 999, background: `${L.colour}22`, color: L.colour, flexShrink: 0 }}>CAN ASSIST</span>
                ) : null
              }
            />

            {members.map((m, i) => {
              const mine = m.userId === meUserId;
              /* ⚠⚠ AN OWNER'S CARD OPENS TOO (29 Sep 2026, the user: *"owners can
                 also be paid from the studio"*). `record_team_payment` asks only
                 that they "are, or have been, on this team" — so the sheet opens on
                 every row for an owner of the desk, and each control inside decides
                 for itself (the powers block is still not drawn for an owner, and
                 Remove is still not offered for one). */
              const manageable = isOwner;
              const paid = paidTo(m.userId);
              const paidTotal = paid.reduce((n, p) => n + p.amountInr, 0);
              /* ⚠ NO POWERS ON THE CARD (4 Oct 2026, the user: "remove powers from
                 card") — they are the Manage sheet's, on the Member Detail page */
              /* ⚠⚠ A TEAM CARD (3 Oct 2026, the user: *"better and bigger cards …
                 each has a profile linked to it which should be visible with profile
                 pic and name and big … buttons segregated"*). The PERSON leads —
                 their face and name at a profile's size, and a door to their page,
                 which this desk's row could not have while the ROW was the manage
                 control (21 Sep). Their label in its own colour and what they are on
                 DanceOS ride above the name; what they dance and where under it;
                 then the three figures a team row is read by; then the buttons on a
                 bar of their own — Pay, History, Manage — so arranging, paying and
                 opening the sheet are three presses that cannot be confused. */
              return (
                <ToolCard key={m.userId} edge={L.colour}>
                  <ToolHead
                    tint={L.colour}
                    name={m.name}
                    photoPath={m.avatarPath}
                    href={`/person/${m.userId}`}
                    hrefLabel={`${m.name} — their profile`}
                    eyebrow={`${MEMBER_ROLE_WORD[m.role]} · ${KIND_WORD[kindOf(m.isArtist)]}`}
                    /* ⚠ NO DANCE STYLES ON A TEAM CARD (4 Oct 2026, the user) — the city alone */
                    sub={m.city || null}
                    right={
                      <>
                      {/* ⚠ "You", capital Y, as a pill on the top right (4 Oct 2026) */}
                      {mine ? <ToolChip word="You" fg={L.colour} bg={`${L.colour}1c`} testId="team-you" /> : null}
                      {/* ── THE ORDER, WITHIN THE GROUP (20 Sep 2026) ── they swap with
                         their NEIGHBOUR IN THE SAME GROUP; the stored `sort` is still
                         one global order. Drawn even for a group of one, disabled —
                         a control that comes and goes is harder to find. */}
                      {isOwner ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {([-1, 1] as const).map((dir) => {
                            const partner = members[i + dir];
                            const off = !partner || busy;
                            return (
                              <button
                                key={dir}
                                type="button"
                                disabled={off}
                                aria-label={dir === -1 ? `Move ${m.name} up` : `Move ${m.name} down`}
                                onClick={() => {
                                  if (!partner) return;
                                  const next = team.map((x) => x.userId);
                                  const a = next.indexOf(m.userId);
                                  const b = next.indexOf(partner.userId);
                                  if (a < 0 || b < 0) return;
                                  [next[a], next[b]] = [next[b], next[a]];
                                  void run(() => reorderMembersAction({ businessId, userIds: next }), null);
                                }}
                                style={{ fontSize: 12, lineHeight: 1.1, padding: "3px 7px", background: off ? "transparent" : "var(--el)", borderRadius: 8, border: "none", cursor: off ? "default" : "pointer", color: off ? EL : SUB, fontFamily: "inherit" }}
                              >
                                {dir === -1 ? "↑" : "↓"}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                      </>
                    }
                  />
                  <ToolBody>
                    <ToolFacts
                      tint={L.colour}
                      items={[
                        { label: "Paid", value: rupees(paidTotal) },
                        { label: paid.length === 1 ? "Payment" : "Payments", value: paid.length },
                      ]}
                    />
                    {/* ⚠ NO "Nothing paid yet" LINE (4 Oct 2026, the user) — the Paid
                        and Payments tiles above already say it */}
                  </ToolBody>
                  {manageable ? (
                    <ToolActions>
                      <button
                        type="button"
                        aria-label={`Pay ${m.name}`}
                        onClick={() => { setPay({ amount: "", method: "upi", status: "done", note: "" }); setError(null); setPayFor(m); }}
                        style={toolBtn("primary", L.colour)}
                      >
                        Pay
                      </button>
                      {/* ⚠ "MEMBER DETAIL", AND NO MANAGE BUTTON (4 Oct 2026, the
                          user: "Remove manage button from card and shift inside
                          history page on top right as a pill. history to be renamed
                          as Member Detail") — the sheet is the pill on that page */}
                      <Link href={`/business/${businessId}/staff/${m.userId}`} aria-label={`Member Detail — ${m.name}`} style={toolBtn("tinted", L.colour)}>
                        Member Detail ›
                      </Link>
                    </ToolActions>
                  ) : null}
                </ToolCard>
              );
            })}

            {/* ── asked, and not answered yet (18578) — in the group they were
                asked INTO, wearing the same card so the group reads as one list ── */}
            {waiting.map((inv) => {
              const declined = inv.status === "declined";
              return (
                <ToolCard key={inv.id} edge={L.colour} dim={declined}>
                  <ToolHead
                    tint={L.colour}
                    name={inv.name}
                    photoPath={null}
                    eyebrow={`${MEMBER_ROLE_WORD[inv.memberRole]} · asked`}
                    sub={inv.email ?? null}
                    right={<ToolChip word={declined ? "SAID NO" : "WAITING"} fg={declined ? "#F87171" : "#F59E0B"} bg={declined ? "#F8717118" : "#F59E0B18"} />}
                  />
                  <ToolBody>
                    <div style={{ fontSize: 11, fontWeight: 800, color: declined ? "#F87171" : "#F59E0B" }}>
                      {declined ? "✕ They said no to being on your team" : "⏳ Waiting on them to confirm"}
                    </div>
                  </ToolBody>
                  {isOwner && (
                    <ToolActions>
                      <button type="button" aria-label={`Show the invite for ${inv.name}`} onClick={() => setShareInvite(inv)} style={toolBtn("secondary", L.colour)}>
                        Show QR &amp; link
                      </button>
                      <button
                        type="button"
                        aria-label={`Withdraw the invite for ${inv.name}`}
                        onClick={() => run(() => revokeInviteAction({ businessId, inviteId: inv.id }), `${inv.name} — invite withdrawn`)}
                        style={toolBtn("danger", L.colour)}
                      >
                        Withdraw
                      </button>
                    </ToolActions>
                  )}
                </ToolCard>
              );
            })}
          </div>
        );
      })}

      {/* ⚠ A TEAM OF ONE IS WHY PAY LOOKED MISSING (20 Sep 2026). Everything a
          team desk does — labelling, ordering, paying — needs somebody other
          than the owner on it, so when there is nobody the desk says so and
          points at the one thing that changes it. */}
      {/* ⚠ THE EMPTY STATE IS THE ONE SHAPE ALL THREE TEAM DESKS WEAR (27 Sep
          2026): a dashed, centred `bizCard`, which is also what Assets, Invoices
          and Refunds draw. This was a solid card with a coloured left edge — the
          same paint as a ROSTER ROW — so on a team of one the "nobody here yet"
          note read as a person. */}
      {isOwner && team.length === 1 && invites.length === 0 ? (
        <div style={{ ...card, textAlign: "center", border: "1.5px dashed var(--el)", padding: "18px 14px", lineHeight: 1.5 }}>
          <div style={{ fontSize: 12.5, fontWeight: 900 }}>Nobody else on the team yet</div>
          <div style={{ fontSize: 11.5, color: SUB, marginTop: 4 }}>
            Ask somebody on, and you can label them, put them in order and record what you pay them.
          </div>
        </div>
      ) : null}

      {/* ⚠ THE §10.9 FOOTNOTE IS GONE (27 Sep 2026, the user: the app stops
          explaining itself). It was the prototype's own line (18434) lifted
          verbatim — and verbatim is what made it wrong here: "§10.9" is a
          section number in a document this app does not have, "attachments" is
          not a word DanceOS uses, and the rule it stated (consent before a seat)
          is said where it happens, in the add sheet. Neither of the other two
          Team desks carries a footnote. */}

      {/* what stays is the sentence for somebody who cannot invite, because its
          job was never the button — it was saying why there isn't one */}
      {isOwner ? null : (
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>
          Only the owner can invite or remove people.
        </div>
      )}

      {/* ⚠ `role="alert"`, like the other two desks: a refusal that is only a
          red line is a refusal a screen reader never hears */}
      {error && <div role="alert" style={{ fontSize: 11.5, color: "#F87171", fontWeight: 700, marginTop: 10 }}>{error}</div>}
      </DeskBody>

      {/* ── invite: name, email, what they may do ── */}
      {addOpen && (
        <div onClick={() => setAddOpen(false)} style={sheetWrap}>
          <div
            role="dialog"
            aria-modal="true"
            /* the sheet answers to the same words as the button that opens it
               (20 Sep 2026) — the prototype's own `aria-label` at 18788 */
            aria-label="Add Team Members"
            onClick={(e) => e.stopPropagation()}
            style={sheet}
          >
            <SheetHandle />
            {/* ⚠ NOTHING UNDER THE HEADING (4 Oct 2026, the user) */}
            <b style={{ display: "block", fontSize: 17, fontFamily: DOS_DISPLAY, marginBottom: 14 }}>Add Team Members</b>

            {/* THE LABEL IS CHOSEN FIRST, because it is what they are being
                asked to be — and the picker below asks them in one press */}
            <div style={{ fontSize: 12, color: SUB, margin: "0 0 4px" }}>Role</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {roles.map(([k, word]) => {
                const on = form.role === k;
                return (
                  <span
                    role="button"
                    tabIndex={0}
                    onKeyDown={dosKey}
                    key={k}
                    aria-pressed={on}
                    onClick={() => setForm({ ...form, role: k })}
                    style={{
                      fontSize: 11.5,
                      fontWeight: 800,
                      padding: "7px 12px",
                      borderRadius: 999,
                      cursor: "pointer",
                      background: on ? "var(--text)" : CARD,
                      color: on ? "var(--solid)" : SUB,
                      border: `1.5px solid ${on ? "var(--text)" : EL}`,
                    }}
                  >
                    {word}
                  </span>
                );
              })}
            </div>
            {/* ⚠ NO PERMISSIONS BLOCK, AND NO "BY EMAIL" (20 Sep 2026, the
                user: "Remove option to add by email and remove permission
                section just for labelling").
                The labels are what this sheet is for; what each one carries is
                the database's business, said on the member's own row rather
                than as a five-line table over the choice.
                ⚠ AND WHAT REMOVING THE ADDRESS COSTS, said out loud: somebody
                with NO DanceOS account cannot be asked onto a team at all now —
                the picker cannot find them by definition. The column, the RPC
                and /join/{code} all STAY (Rule 14: invites already sent must
                still be acceptable), so this is the door closing, not the road.
                ── */}
            <div style={{ margin: "14px 0 0" }} />

            {addBy === "person" ? (
              /* the app's one people search — a name, a mobile number, or a
                 scanned profile link, every row with its picture (R27).
                 ⚠ IT WEARS THE PICKER'S OWN CLOTHES SINCE 21 Sep 2026: this call
                 overrode all four of them — its own eyebrow, its own
                 placeholder, "Ask" without the chevron, and `SKY`, which is
                 CYAN — while the organization's and the crew's Team desks both
                 take the defaults. One widget, three visual identities, on three
                 pages doing the same job. `ariaLabel` stays, because it is the
                 only one that says what THIS search is for rather than how it
                 looks. */
              <PeoplePicker
                ariaLabel="Search for somebody to add"
                exclude={[meUserId, ...onTeam]}
                pickLabel={(p) => `Ask ${p.fullName}`}
                onPick={async (p) => {
                  const done = await run(
                    () => invitePersonAction({ businessId, userId: p.id, role: form.role }),
                    `📨 ${p.fullName} asked — they accept to join`
                  );
                  if (done) setAddOpen(false);
                }}
              />
            ) : (
              <>
                {/* the address is for somebody who is NOT on DanceOS yet — which
                    is exactly what the picker above cannot find */}
                <div style={{ fontSize: 10.5, color: "var(--muted)", marginBottom: 8, lineHeight: 1.5 }}>
                  For somebody who has no DanceOS account yet. They sign in with this address to accept.
                </div>
                <div style={{ fontSize: 12, color: SUB, margin: "0 0 4px" }}>Name</div>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Vikram Bhatt"
                  aria-label="Their name"
                  style={inputStyle}
                />
                <div style={{ fontSize: 12, color: SUB, margin: "12px 0 4px" }}>Email they sign in with</div>
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="name@example.com"
                  inputMode="email"
                  autoCapitalize="none"
                  aria-label="Their email"
                  style={inputStyle}
                />
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={dosKey}
                  aria-label="Send invite"
                  onClick={async () => {
                    if (!canInvite) return;
                    const done = await run(
                      () =>
                        inviteToBusinessAction({
                          businessId,
                          name: form.name,
                          email: form.email,
                          role: form.role,
                        }),
                      `📨 ${form.name.trim()} invited — they accept to join`
                    );
                    if (done) setAddOpen(false);
                  }}
                  style={{
                    marginTop: 14,
                    textAlign: "center",
                    padding: "13px",
                    borderRadius: 999,
                    background: canInvite ? "var(--text)" : EL,
                    color: canInvite ? "var(--solid)" : "var(--muted)",
                    fontWeight: 800,
                    fontSize: 13.5,
                    cursor: canInvite ? "pointer" : "default",
                  }}
                >
                  {busy ? "Sending…" : "Send invite"}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── the QR the prototype promised: hold it up, or send the link ── */}
      {shareInvite && (
        /* centred, like every QR (2 Oct 2026) */
        <div onClick={() => setShareInvite(null)} style={CENTER_SCRIM}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Invite for ${shareInvite.name}`}
            onClick={(e) => e.stopPropagation()}
            style={{ ...CENTER_CARD, textAlign: "center" }}
          >
            <b style={{ fontSize: 17, fontFamily: DOS_DISPLAY }}>{shareInvite.name}</b>
            <div style={{ fontSize: 11.5, color: SUB, margin: "3px 0 14px" }}>
              Invited as {MEMBER_ROLE_WORD[shareInvite.memberRole].toLowerCase()} · {shareInvite.email}
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <QRBlock code={joinLink(shareInvite.code)} size={168} label="Invite code" />
            </div>
            <div
              style={{
                background: CARD,
                border: `1.5px solid ${EL}`,
                borderRadius: 12,
                padding: "10px 12px",
                fontSize: 11,
                fontFamily: DOS_MONO,
                color: SUB,
                wordBreak: "break-all",
                marginBottom: 10,
              }}
            >
              {joinLink(shareInvite.code)}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.55, marginBottom: 14 }}>
              Show the square or send the link. Either way they sign in as{" "}
              <b style={{ color: SUB }}>{shareInvite.email}</b> to accept — a link that reaches the wrong person
              cannot join your business.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                aria-label="Copy invite link"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(joinLink(shareInvite.code));
                    fire("Link copied");
                  } catch {
                    fire("Copy failed — long-press the link");
                  }
                }}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "12px",
                  borderRadius: 999,
                  background: CARD,
                  border: `1.5px solid ${EL}`,
                  fontWeight: 800,
                  fontSize: 12.5,
                  cursor: "pointer",
                  color: "var(--text)",
                }}
              >
                Copy link
              </span>
              <span
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                onClick={() => setShareInvite(null)}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "12px",
                  borderRadius: 999,
                  background: "var(--text)",
                  color: "var(--solid)",
                  fontWeight: 900,
                  fontSize: 12.5,
                  cursor: "pointer",
                }}
              >
                Done
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── RECORD A PAYMENT — with the method, which is the user's own ask
          ("payment for team members should also give option for payment
          methods"). The four are the ones the ledger already knows. Opened by
          Pay on the card, on its own (3 Oct 2026). ── */}
      {payFor && (
        <div onClick={() => setPayFor(null)} style={sheetWrap}>
          <div role="dialog" aria-modal="true" aria-label={`Pay ${payFor.name}`} onClick={(e) => e.stopPropagation()} style={sheet}>
            <SheetHandle />
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
              <ToolFace name={payFor.name} photoPath={payFor.avatarPath} tint={MEMBER_LABEL[payFor.role].colour} size={44} />
              <div style={{ minWidth: 0 }}>
                <b style={{ display: "block", fontSize: 17, fontFamily: DOS_DISPLAY }}>Pay {payFor.name}</b>
                <div style={{ fontSize: 11.5, color: SUB, marginTop: 2 }}>{MEMBER_ROLE_WORD[payFor.role]} · lands in your Earnings as an expense</div>
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: SUB, margin: "0 0 14px", lineHeight: 1.5 }}>
              DanceOS records what you have paid — it does not move the money.
            </div>

            <div style={{ fontSize: 12, color: SUB, margin: "0 0 4px" }}>Amount</div>
            <input
              value={pay.amount}
              onChange={(e) => setPay({ ...pay, amount: e.target.value.replace(/[^0-9]/g, "") })}
              placeholder="e.g. 9000"
              inputMode="numeric"
              aria-label="Amount in rupees"
              style={inputStyle}
            />

            <div style={{ fontSize: 12, color: SUB, margin: "12px 0 4px" }}>How you paid</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PAY_METHODS.map(([k, word]) => {
                const on = pay.method === k;
                return (
                  <button key={k} type="button" aria-pressed={on} aria-label={word} onClick={() => setPay({ ...pay, method: k })} style={{ fontSize: 11.5, fontWeight: 800, padding: "7px 12px", borderRadius: 999, cursor: "pointer", background: on ? "var(--text)" : CARD, color: on ? "var(--solid)" : SUB, border: `1.5px solid ${on ? "var(--text)" : EL}`, fontFamily: "inherit" }}>
                    {word}
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 12, color: SUB, margin: "12px 0 4px" }}>Where it stands</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PAY_STATES.map(([k, word]) => {
                const on = pay.status === k;
                return (
                  <button key={k} type="button" aria-pressed={on} aria-label={word} onClick={() => setPay({ ...pay, status: k })} style={{ fontSize: 11.5, fontWeight: 800, padding: "7px 12px", borderRadius: 999, cursor: "pointer", background: on ? "var(--text)" : CARD, color: on ? "var(--solid)" : SUB, border: `1.5px solid ${on ? "var(--text)" : EL}`, fontFamily: "inherit" }}>
                    {word}
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 12, color: SUB, margin: "12px 0 4px" }}>Note (optional)</div>
            <input
              value={pay.note}
              onChange={(e) => setPay({ ...pay, note: e.target.value })}
              placeholder="e.g. September"
              aria-label="Note"
              maxLength={200}
              style={inputStyle}
            />

            {error ? <div role="alert" style={{ fontSize: 11.5, color: "#F87171", fontWeight: 700, marginTop: 10 }}>{error}</div> : null}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => setPayFor(null)} style={{ flex: 1, textAlign: "center", padding: "12px", borderRadius: 999, background: CARD, border: `1.5px solid ${EL}`, fontWeight: 800, fontSize: 12.5, cursor: "pointer", color: INK, fontFamily: "inherit" }}>
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || Number(pay.amount) < 1}
                aria-label="Record this payment"
                onClick={async () => {
                  const who = payFor;
                  const done = await run(
                    () =>
                      payTeamMemberAction({
                        businessId,
                        userId: who.userId,
                        amountInr: Number(pay.amount),
                        method: pay.method,
                        status: pay.status,
                        note: pay.note.trim() || null,
                      }),
                    `${rupees(Number(pay.amount))} recorded for ${who.name}`
                  );
                  if (done) setPayFor(null);
                }}
                style={{ flex: 1.4, textAlign: "center", padding: "12px", borderRadius: 999, background: Number(pay.amount) >= 1 ? "var(--text)" : EL, color: Number(pay.amount) >= 1 ? "var(--solid)" : "var(--muted)", fontWeight: 900, fontSize: 12.5, cursor: Number(pay.amount) >= 1 ? "pointer" : "default", border: "none", fontFamily: "inherit" }}
              >
                {busy ? "Recording…" : "Record payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⚠ THE SHARED TOAST (27 Sep 2026) — this was a byte-identical copy of
          `crew-kit`'s, declared inline, which is the same shape as the sheet
          styles 21 Sep found here: a copy that matches today and drifts the day
          one of the two is touched. */}
      <Toast msg={toast} />
    </div>
  );
}
