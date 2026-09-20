import type { MemberRole } from "@/repositories/tenants";

/** Step 12b. An invite offers a seat, never the owner's — that one is not
 *  grantable (the prototype's settings footnote, DanceOSApp.jsx:18434).
 *  ⚠ VISITING FACULTY JOINED THE LIST ON 19 Sep 2026: the seat has existed since
 *  18 Sep (an outside teacher who accepts a class gets it) and the Team desk
 *  could not hand it out, which made "label them according to what profile I am
 *  in" impossible to satisfy for a studio. */
export type InvitableRole = "trainer" | "staff" | "visiting_faculty" | "assistant";
export type InviteStatus = "pending" | "accepted" | "declined" | "revoked";

export interface TenantInvite {
  id: string;
  tenantId: string;
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
  tenantId: string;
  tenantName: string;
  memberRole: InvitableRole;
  code: string;
  /** the name the studio typed for them */
  invitedName: string;
  createdAt: string;
}

/** What the /join/{code} screen is allowed to say. The address is masked: a
 *  forwarded link must not hand out somebody else's email. */
export interface InvitePreview {
  tenantId: string;
  tenantName: string;
  memberRole: InvitableRole;
  invitedName: string;
  status: InviteStatus;
  emailHint: string;
  isForMe: boolean;
}

/** The prototype prints a LEVEL beside each person (18428-18432): Admin for the
 *  people who run the place, Staff for the rest. Our roles are the real thing
 *  underneath; this is only the word on the badge. */
export const MEMBER_LEVEL: Record<MemberRole, string> = {
  owner: "Admin",
  trainer: "Admin",
  staff: "Staff",
  visiting_faculty: "Faculty",
  assistant: "Staff",
};

/** and the line under the name — what this role may actually do (18428-18429).
 *  18 Sep 2026: classes are the OWNER's to create and edit; faculty teach them,
 *  run the register and see their students. */
export const MEMBER_GRANTS: Record<MemberRole, string> = {
  owner: "everything, including classes and payouts",
  trainer: "register ✓ students ✓ teaches the classes they accept",
  staff: "students ✓ register when asked ✓",
  visiting_faculty: "teaches the class they accepted · register on it",
  assistant: "assists on the classes they accept · register when asked ✓",
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

export const MEMBER_LABEL: Record<MemberRole, MemberLabel> = {
  owner: { short: "Owners", colour: "#F2C14E" },
  trainer: { short: "Faculty", colour: "#0D9488", teach: true, assist: true },
  visiting_faculty: { short: "Visiting faculty", colour: "#8B5CF6", teach: true, assist: true },
  assistant: { short: "Class assistants", colour: "#3B82F6", assist: true },
  staff: { short: "Other team members", colour: "#64748B" },
};

/** the order the groups are drawn in — the prototype's own `order` (2131-2141):
 *  who runs it, who teaches, who assists, then everybody else */
export const MEMBER_LABEL_ORDER: ReadonlyArray<MemberRole> = ["owner", "trainer", "visiting_faculty", "assistant", "staff"];

export const INVITABLE_ROLES: ReadonlyArray<readonly [InvitableRole, string]> = [
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
 *  a person's own page has no faculty, it has help. */
export const rolesFor = (type: "studio" | "artist_page" | "org"): ReadonlyArray<readonly [InvitableRole, string]> =>
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
export const labelsFor = (type: "studio" | "artist_page" | "org"): ReadonlyArray<readonly [MemberRole, string]> =>
  [["owner", "Owner"] as const, ...rolesFor(type)];

/** WHAT EACH LABEL ACTUALLY CARRIES — the permissions section beside the labels
 *  (19 Sep 2026). One line per thing a seat may do, so the owner reads the
 *  consequence rather than the word. These are the rules the database keeps, not
 *  a wish list: every one of them is enforced by a policy or an RPC. */
export const MEMBER_POWERS: Record<InvitableRole | "owner", ReadonlyArray<readonly [string, boolean]>> = {
  owner: [
    ["Create and edit classes", true],
    ["Run any register", true],
    ["See and settle refunds", true],
    ["Pay the team", true],
    ["Change what the business says", true],
  ],
  trainer: [
    ["Create and edit classes", false],
    ["Run any register", true],
    ["See and settle refunds", false],
    ["Pay the team", false],
    ["Change what the business says", false],
  ],
  visiting_faculty: [
    ["Create and edit classes", false],
    ["Run any register", false],
    ["See and settle refunds", false],
    ["Pay the team", false],
    ["Change what the business says", false],
  ],
  assistant: [
    ["Create and edit classes", false],
    ["Run any register", false],
    ["See and settle refunds", false],
    ["Pay the team", false],
    ["Change what the business says", false],
  ],
  staff: [
    ["Create and edit classes", false],
    ["Run any register", false],
    ["See and settle refunds", false],
    ["Pay the team", false],
    ["Change what the business says", false],
  ],
};

/** the one line under a label that says what is NOT on the list above */
export const MEMBER_POWER_NOTE: Record<InvitableRole | "owner", string> = {
  owner: "The owner's seat cannot be given away.",
  trainer: "Runs the register on this business's classes and sees its students.",
  visiting_faculty: "Teaches the class they accepted, and runs the register on that one only.",
  assistant: "Assists on the classes they are asked onto, and runs a register when it is handed to them.",
  staff: "Sees the students desk, and runs a register on a class they are asked onto.",
};
