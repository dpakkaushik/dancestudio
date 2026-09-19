import type { MemberRole } from "@/repositories/tenants";

/** Step 12b. An invite offers a seat, never the owner's — that one is not
 *  grantable (the prototype's settings footnote, DanceOSApp.jsx:18434).
 *  ⚠ VISITING FACULTY JOINED THE LIST ON 19 Sep 2026: the seat has existed since
 *  18 Sep (an outside teacher who accepts a class gets it) and the Team desk
 *  could not hand it out, which made "label them according to what profile I am
 *  in" impossible to satisfy for a studio. */
export type InvitableRole = "trainer" | "staff" | "visiting_faculty";
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
};

/** and the line under the name — what this role may actually do (18428-18429).
 *  18 Sep 2026: classes are the OWNER's to create and edit; faculty teach them,
 *  run the register and see their students. */
export const MEMBER_GRANTS: Record<MemberRole, string> = {
  owner: "everything, including classes and payouts",
  trainer: "register ✓ students ✓ teaches the classes they accept",
  staff: "students ✓ register when asked ✓",
  visiting_faculty: "teaches the class they accepted · register on it",
};

/** THE WORDS ON THE TEAM DESK (18 Sep 2026, the user: "add Faculty, Assistants and
 *  other type of members"; an outside teacher who accepts "becomes Visiting
 *  Faculty in Team"). `trainer` is the role's name in the database and Faculty
 *  is its word on the screen. */
export const MEMBER_ROLE_WORD: Record<MemberRole, string> = {
  owner: "Owner",
  trainer: "Faculty",
  staff: "Staff",
  visiting_faculty: "Visiting faculty",
};

export const INVITABLE_ROLES: ReadonlyArray<readonly [InvitableRole, string]> = [
  ["trainer", "Faculty"],
  ["visiting_faculty", "Visiting faculty"],
  ["staff", "Staff"],
];

/** THE LABELS THIS PROFILE HAS TO GIVE (19 Sep 2026, the user: "Should be able
 *  to Label them according to what profile I am in. and labels available for
 *  that with permissions section"). A STUDIO has faculty, visiting faculty and
 *  staff; an ARTIST PAGE is one person's, so what it hands out is help — an
 *  assistant is `staff`, and somebody who teaches a class of theirs is faculty.
 *  Visiting faculty is a studio's word for a guest teacher and means nothing on
 *  an artist's own page, so it is not offered there. */
export const rolesFor = (type: "studio" | "artist_page" | "org"): ReadonlyArray<readonly [InvitableRole, string]> =>
  type === "studio"
    ? INVITABLE_ROLES
    : ([
        ["trainer", "Faculty"],
        ["staff", "Assistant"],
      ] as const);

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
  staff: "Sees the students desk, and runs a register on a class they are asked onto.",
};
