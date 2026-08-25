import type { MemberRole } from "@/repositories/tenants";

/** Step 12b. An invite offers trainer or staff only — owner is not grantable
 *  (the prototype's settings footnote, DanceOSApp.jsx:18434). */
export type InvitableRole = "trainer" | "staff";
export type InviteStatus = "pending" | "accepted" | "declined" | "revoked";

export interface TenantInvite {
  id: string;
  tenantId: string;
  name: string;
  email: string;
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
};

/** and the line under the name — what this role may actually do (18428-18429) */
export const MEMBER_GRANTS: Record<MemberRole, string> = {
  owner: "everything, including payouts",
  trainer: "register ✓ classes ✓ students ✓",
  staff: "students ✓ register when asked ✓",
};

export const MEMBER_ROLE_WORD: Record<MemberRole, string> = {
  owner: "Owner",
  trainer: "Trainer",
  staff: "Staff",
};

export const INVITABLE_ROLES: ReadonlyArray<readonly [InvitableRole, string]> = [
  ["trainer", "Trainer"],
  ["staff", "Staff"],
];
