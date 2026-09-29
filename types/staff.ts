import type { MemberRole } from "@/repositories/businesses";

/** Step 12b. An invite offers a seat, never the owner's — that one is not
 *  grantable (the prototype's settings footnote, DanceOSApp.jsx:18434).
 *  ⚠ VISITING FACULTY JOINED THE LIST ON 19 Sep 2026: the seat has existed since
 *  18 Sep (an outside teacher who accepts a class gets it) and the Team desk
 *  could not hand it out, which made "label them according to what profile I am
 *  in" impossible to satisfy for a studio. */
/** ⚠ `manager` JOINED THE LIST ON 28 Sep 2026, and `owner` still has not.
 *  Ownership is handed over on the desk to somebody who has already said yes —
 *  Step 12b's rule, and `invite_person_to_business` still refuses it in words.
 *  A MANAGER may be invited, because accepting the invite IS the consent and
 *  managing is not owning. */
export type InvitableRole = "manager" | "trainer" | "staff" | "visiting_faculty" | "assistant";
export type InviteStatus = "pending" | "accepted" | "declined" | "revoked";

export interface TenantInvite {
  id: string;
  businessId: string;
  name: string;
  /** null when the invite names a PERSON rather than an address (19 Sep 2026) */
  email: string | null;
  /** the person invited, when they were picked from the people search */
  userId: string | null;
  memberRole: InvitableRole;
  /** the shareable / scannable half — /join/{code} is what the QR draws */
  code: string;
  status: InviteStatus;
  createdAt: string;
}

/** An invite waiting for the signed-in person, found by the address they sign
 *  in with — so being asked onto a team arrives in-app, no link required. */
export interface PendingInvite {
  inviteId: string;
  businessId: string;
  businessName: string;
  memberRole: InvitableRole;
  code: string;
  /** the name the studio typed for them */
  invitedName: string;
  createdAt: string;
}

/** What the /join/{code} screen is allowed to say. The address is masked: a
 *  forwarded link must not hand out somebody else's email. */
export interface InvitePreview {
  businessId: string;
  businessName: string;
  memberRole: InvitableRole;
  invitedName: string;
  status: InviteStatus;
  emailHint: string;
  isForMe: boolean;
}

/** and the line under the name — what this role may actually do (18428-18429).
 *  18 Sep 2026: classes are the OWNER's to create and edit; faculty teach them
 *  and run the register.
 *
 *  ⚠⚠ RE-WRITTEN 28 Sep 2026, AND IT IS A CORRECTION RATHER THAN A POLISH.
 *  These are not decoration: this map is printed in the member sheet an owner
 *  reads before handing out a seat (StaffDesk:832) and on the JOIN screen, as
 *  "You would have {…}" — the sentence somebody is agreeing to. `trainer` said
 *  "students ✓" and `staff` said "students ✓", and the user's rule this day is
 *  that neither gets the business at all: no home, no Students desk, no Team, no
 *  Rooms, no money. So both lines promised a door that had just been shut, to
 *  the one person who is deciding whether to accept a seat on the strength of
 *  them. ⚠ What they KEEP is said out loud, because it is not nothing — their
 *  own classes, the register on them, and their earnings.
 *
 *  ⚠ `manager` CANNOT BE HANDED OUT YET (`business_members_member_role_check`
 *  admits five values and this is not one of them), so this line describes a
 *  seat nothing can create until the held migration applies. It is here so the
 *  vocabulary is one thing rather than two, and so the compiler refuses a map
 *  that has forgotten it. */
export const MEMBER_GRANTS: Record<MemberRole, string> = {
  owner: "everything, including the money, the subscription and who else runs it",
  /* ⚠ WHAT A MANAGER READS AND WHAT THEY MOVE ARE TWO DIFFERENT THINGS, and the
     first cut of this line said "except its money", which is not what the gates
     do. Invoices, Payments and Refunds were readable by ANY member until 28 Sep
     2026 — a manager reading them is a NARROWING that stops short of the owner,
     not a widening — while every CONTROL on them is still `role === "owner"`:
     settling a refund, the accepted-methods switches, Earnings, the
     subscription, the verification, the GST number and handing out seats. */
  manager: "the business and every desk on it — its ledgers to read, and none of its money to move, its plan or its badge",
  trainer: "the classes they accept — the register on them, and what they are paid",
  staff: "a place on the team, and a register on a class they are asked onto",
  visiting_faculty: "the class they accepted · the register on that one",
  assistant: "the classes they assist on · a register when it is handed to them",
};

/** THE WORDS ON THE TEAM DESK (18 Sep 2026, the user: "add Faculty, Assistants and
 *  other type of members"; an outside teacher who accepts "becomes Visiting
 *  Faculty in Team"). `trainer` is the role's name in the database and Faculty
 *  is its word on the screen. */
/** ⚠ `staff` READS "Other team member" SINCE 20 Sep 2026. The user's list gives a
 *  studio five seats — Owners · Faculty · Visiting Faculty · Assistants · Other
 *  Team Members — so `staff` stopped being the catch-all called "Staff" and
 *  became the honest last one, and `assistant` is its own seat. */
export const MEMBER_ROLE_WORD: Record<MemberRole, string> = {
  owner: "Owner",
  manager: "Manager",
  trainer: "Faculty",
  staff: "Other team member",
  visiting_faculty: "Visiting faculty",
  assistant: "Assistant",
};

/** THE LABEL REGISTRY — ONE ROW PER SEAT (20 Sep 2026, the user, holding up the
 *  prototype's own Team screen: *"fix team view like this"*).
 *
 *  `DOS_TEAM_LABELS` (DanceOSApp.jsx:2130-2141) is what S_team groups by: each
 *  label carries a COLOUR, a SHORT PLURAL for its heading, and whether the seat
 *  may take a class or assist on one — which is the badge beside the count. The
 *  Team desk was a flat list of cards until today, so a studio with a dozen
 *  people had no shape at all.
 *
 *  ⚠ THE VOCABULARY IS OURS, NOT THE PROTOTYPE'S, and that is the user's own
 *  decision (20 Sep 2026). The prototype offers Videographer, Music Editor,
 *  Artist Manager, Photographer and labels a studio types in itself; ours are the
 *  five `member_role` values a CHECK constraint allows, so the LOOK is lifted and
 *  the WORDS are the ones the database will accept. Adding the other four is one
 *  migration — and it has to move TWO CHECKs, `business_members` and
 *  `business_invites`, which is the pair that was missed on 19 Sep.
 *
 *  ⚠ AND VISITING FACULTY STAYS, though the prototype deleted it ("a THIRD
 *  teaching label … carried no different permission", 2133-2136). In THIS app it
 *  carries a different origin: accepting a class ask seats an outside teacher as
 *  `visiting_faculty` (R19), so removing it would break the door that creates it.
 *
 *  The colours are the prototype's own where a seat matches — gold for the owner,
 *  teal for faculty, blue for the class assistant (2131-2137). Visiting faculty
 *  takes the violet its Music Editor had, because it needs to be tellable from
 *  faculty's teal at a glance; "other team member" takes the neutral slate the
 *  prototype falls back to (2160), which is the honest colour for a seat that is
 *  defined by not being one of the others. */
export interface MemberLabel {
  /** the plural that heads the group — "Owners", "Class assistants" (2131's `short`) */
  short: string;
  /** the label's own ink: the dot, the row's left edge and the word on the row */
  colour: string;
  /** the badge beside the count: a seat a class can be HANDED to */
  teach?: boolean;
  /** …or one that can be put on somebody else's class */
  assist?: boolean;
}

/** ⚠ MANAGER'S COLOUR IS A ROSE, AND IT IS CHECKED RATHER THAN PICKED. The five
 *  that existed sit at hue 42° (gold), 175° (teal), 217° (blue), 258° (violet)
 *  and 215° (slate) — so the widest empty band on this dial is the warm side
 *  past violet, and `#BE123C` lands at 348°, more than 60° from every one of
 *  them. ⚠ It is deliberately NOT a second amber: Manager sits beside Owner in
 *  meaning, which is exactly why the two must not be told apart by brightness. */
export const MEMBER_LABEL: Record<MemberRole, MemberLabel> = {
  owner: { short: "Owners", colour: "#F2C14E" },
  manager: { short: "Managers", colour: "#BE123C" },
  trainer: { short: "Faculty", colour: "#0D9488", teach: true, assist: true },
  visiting_faculty: { short: "Visiting faculty", colour: "#8B5CF6", teach: true, assist: true },
  assistant: { short: "Class assistants", colour: "#3B82F6", assist: true },
  staff: { short: "Other team members", colour: "#64748B" },
};

/** the order the groups are drawn in — the prototype's own `order` (2131-2141):
 *  who runs it, who teaches, who assists, then everybody else */
export const MEMBER_LABEL_ORDER: ReadonlyArray<MemberRole> = ["owner", "manager", "trainer", "visiting_faculty", "assistant", "staff"];

export const INVITABLE_ROLES: ReadonlyArray<readonly [InvitableRole, string]> = [
  ["manager", "Manager"],
  ["trainer", "Faculty"],
  ["visiting_faculty", "Visiting faculty"],
  ["assistant", "Assistant"],
  ["staff", "Other team member"],
];

/** THE LABELS THIS PROFILE HAS TO GIVE (19 Sep 2026, the user: "Should be able
 *  to Label them according to what profile I am in. and labels available for
 *  that with permissions section"). A STUDIO has faculty, visiting faculty and
 *  staff; an ARTIST PAGE is one person's, so what it hands out is help.
 *  Visiting faculty is a studio's word for a guest teacher and means nothing on
 *  an artist's own page, so it is not offered there.
 *
 *  ⚠ RE-CUT TO THE USER'S LIST, 20 Sep 2026: a STUDIO now offers Faculty ·
 *  Visiting faculty · Assistant · Other team member (Assistant is its own seat
 *  since this migration — it used to be `staff` wearing that word on an artist's
 *  page only), and an ARTIST PAGE offers exactly what their list gave it,
 *  "1. Assistant, 2. Other Team Members" — so Faculty comes OFF an artist page:
 *  a person's own page has no faculty, it has help.
 *
 *  ⚠ AND A MANAGER IS A STUDIO'S ALONE (28 Sep 2026). An artist page is ONE
 *  PERSON'S public face — there is no business under it for somebody else to
 *  run, only help to be given — so it keeps the two it had.
 *  ⚠ The `org` arm went with organizations on 29 Sep 2026: an organization's
 *  labels were its own list (`OrgTeamDesk`) rather than this one, so what this
 *  function loses is a `type` value it never branched on. */
export const rolesFor = (type: "studio" | "artist_page"): ReadonlyArray<readonly [InvitableRole, string]> =>
  type === "studio"
    ? INVITABLE_ROLES
    : ([
        ["assistant", "Assistant"],
        ["staff", "Other team member"],
      ] as const);

/** ⚠ WHAT THE MEMBER SHEET MAY SET — the invite's list PLUS Owner (20 Sep 2026,
 *  the user's answer 3: a studio's own desk can make somebody its owner).
 *
 *  It is deliberately NOT `rolesFor`, because the two lists answer different
 *  questions. An INVITE is offered to somebody who has not agreed to anything
 *  yet, and `invite_to_business` / `invite_person_to_business` both still refuse
 *  `owner` — Step 12b's rule, unchanged. This list relabels somebody who is
 *  ALREADY on the team and already consented to be there, which is what
 *  `set_member_role` now admits. The database refuses to demote the last owner,
 *  so the desk cannot leave a studio ownerless however the chips are pressed. */
export const labelsFor = (type: "studio" | "artist_page"): ReadonlyArray<readonly [MemberRole, string]> =>
  [["owner", "Owner"] as const, ...rolesFor(type)];

/* ⚠ `MEMBER_POWERS` — the ticked five-line permissions table — was here and is
   gone (28 Sep 2026, the dead-code sweep). It was the data behind the
   PERMISSIONS block the Team desk stopped drawing on 20 Sep ("NO PERMISSIONS
   BLOCK", StaffDesk:606), so it had been a table nothing rendered for eight days.

   ⚠⚠ AND `MEMBER_POWER_NOTE` WENT THE SAME WAY LATER THE SAME DAY, for the same
   reason and with a sharper lesson. It read as the app's own permissions sheet —
   this file has cited it TWICE as the thing that was RIGHT while the code was
   wrong (21 Sep, the students desk; 28 Sep, this row) — and a grep for its name
   found it in CLAUDE.md and nowhere else in `app/`, `features/` or `components/`.
   **So the sentence this repo twice held up as the promise the code had broken
   was itself being shown to nobody.** What a person actually reads before
   accepting a seat is `MEMBER_GRANTS`, on the member sheet and on the join
   screen, and that is where the corrected words now are. The rules themselves
   are the database's, unchanged. */
