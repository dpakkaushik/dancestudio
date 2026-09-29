"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  acceptInvite,
  declineInvite,
  invitePersonToTenant,
  inviteToTenant,
  removeMember,
  revokeInvite,
  setMemberRole,
} from "@/repositories/invites";
import { recordTeamPayment } from "@/repositories/payouts";
import { reorderTenantMembers, setTenantMemberPowers, type MemberRole } from "@/repositories/tenants";
import { INVITABLE_ROLES, MEMBER_LABEL_ORDER, type InvitableRole } from "@/types/staff";

/** Step 12b staff actions. Authorization is NOT here — it is in the RPCs, which
 *  is the only place that can be trusted (owner-only to ask, and only the person
 *  asked may answer). What an invite may SAY is validated here. */

export interface StaffActionResult {
  error: string | null;
}

/* VISITING FACULTY IS A SEAT THE DESK CAN HAND OUT (19 Sep 2026) — `set_member_role`
   has admitted it since 18 Sep and only this list kept it out. ⚠ ASSISTANT joined
   it on 20 Sep (the user's list E): an artist page hands out Faculty and
   Assistant, a studio all four. The RPC and both CHECKs decide; this is shape.

   ⚠⚠ AND THESE TWO ARE DERIVED NOW RATHER THAN TYPED (28 Sep 2026), because
   `manager` found the third copy of this vocabulary the hard way. It lives in
   `business_members_member_role_check`, in `business_invites_member_role_check`
   — THE PAIR that 19 Sep missed — in `set_member_role`'s own guard, and HERE.
   The migration moved the first three and the desk offered the word, so the
   button appeared, the RPC would have taken it, and this enum refused it before
   the request ever left the server: 19 Sep's bug exactly, one layer further out.
   Reading them off `INVITABLE_ROLES` and `MEMBER_LABEL_ORDER` means a sixth
   label cannot be forgotten here again. */
const INVITABLE = INVITABLE_ROLES.map(([k]) => k) as [InvitableRole, ...InvitableRole[]];
const ROLE = z.enum(INVITABLE);

const inviteSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().trim().min(1, "Who is it?").max(120),
  email: z.string().trim().toLowerCase().email("That is not an email address").max(254),
  role: ROLE,
});

const inviteIdSchema = z.object({ businessId: z.string().uuid(), inviteId: z.string().uuid() });
const memberSchema = z.object({ businessId: z.string().uuid(), userId: z.string().uuid() });
const roleSchema = memberSchema.extend({ role: ROLE });
/* ⚠ THE RELABEL TAKES A WIDER SET THAN THE INVITE, AND THEY ARE TWO SCHEMAS FOR
   THAT REASON (20 Sep 2026, the user's answer 3). An INVITE may still never hand
   out `owner` — `roleSchema` above, and both invite RPCs refuse it — but a
   studio's desk may promote somebody already on the team, which is what
   `set_member_role` now admits. Widening the one schema both used would have
   quietly let an invite offer the owner seat; typecheck caught it. */
const relabelSchema = memberSchema.extend({ role: z.enum([...MEMBER_LABEL_ORDER] as [MemberRole, ...MemberRole[]]) });
const powersSchema = memberSchema.extend({ canAttendance: z.boolean(), canRefunds: z.boolean() });
const codeSchema = z.object({ code: z.string().trim().min(8).max(24) });

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return supabase;
}

const revalidateDesk = (businessId: string) => {
  revalidatePath(`/business/${businessId}/staff`);
  // the class form's people pickers read the same team
  revalidatePath(`/business/${businessId}/classes`);
};

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export async function inviteToTenantAction(input: {
  businessId: string;
  name: string;
  email: string;
  role: string;
}): Promise<StaffActionResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid invite" };
  }
  const supabase = await requireUser();
  try {
    await inviteToTenant(supabase, parsed.data);
    revalidateDesk(parsed.data.businessId);
    return { error: null };
  } catch (error: unknown) {
    return { error: message(error, "Could not send that invite") };
  }
}

/** ASKED BY NAME (19 Sep 2026) — the people picker's half of the same door.
 *  The RPC decides everything that matters; this checks the shape. */
export async function invitePersonAction(input: {
  businessId: string;
  userId: string;
  role: string;
}): Promise<StaffActionResult> {
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid invite" };
  }
  const supabase = await requireUser();
  try {
    await invitePersonToTenant(supabase, parsed.data);
    revalidateDesk(parsed.data.businessId);
    return { error: null };
  } catch (error: unknown) {
    return { error: message(error, "Could not ask them") };
  }
}

/** THE ORDER (19 Sep 2026) — the owner's, and the RPC says so. */
export async function reorderMembersAction(input: {
  businessId: string;
  userIds: string[];
}): Promise<StaffActionResult> {
  const parsed = z.object({ businessId: z.string().uuid(), userIds: z.array(z.string().uuid()).max(100) }).safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid order" };
  }
  const supabase = await requireUser();
  try {
    await reorderTenantMembers(supabase, parsed.data.businessId, parsed.data.userIds);
    revalidateDesk(parsed.data.businessId);
    return { error: null };
  } catch (error: unknown) {
    return { error: message(error, "Could not save the order") };
  }
}

/** PAYING SOMEBODY ON THE TEAM (19 Sep 2026) ⚠ money. The amount is the owner's
 *  to state — it is not a bill for sessions taught (that is `recordPayout`) —
 *  and it lands in the same ledger, so the Earnings desk counts it as an
 *  expense straight away. Nothing moves through code: this records a payment
 *  the studio has already made, which is Step 13's own limit. */
export async function payTeamMemberAction(input: {
  businessId: string;
  userId: string;
  amountInr: number;
  method: string;
  status: string;
  paidOn?: string | null;
  note?: string | null;
}): Promise<StaffActionResult> {
  const parsed = z
    .object({
      businessId: z.string().uuid(),
      userId: z.string().uuid(),
      amountInr: z.coerce.number().int().min(1, "A payment is at least ₹1").max(10000000),
      method: z.enum(["bank_transfer", "upi", "cash", "other"]),
      status: z.enum(["done", "in_transit", "on_hold"]),
      paidOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      note: z.string().trim().max(200).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payment" };
  }
  const supabase = await requireUser();
  try {
    await recordTeamPayment(supabase, {
      businessId: parsed.data.businessId,
      userId: parsed.data.userId,
      amountInr: parsed.data.amountInr,
      method: parsed.data.method,
      status: parsed.data.status,
      paidOn: parsed.data.paidOn ?? null,
      note: parsed.data.note ?? null,
    });
    revalidateDesk(parsed.data.businessId);
    /* it is an expense the moment it is written — the ledger that prints it */
    revalidatePath(`/business/${parsed.data.businessId}/earnings`);
    revalidatePath("/earnings");
    return { error: null };
  } catch (error: unknown) {
    return { error: message(error, "Could not record that payment") };
  }
}

export async function revokeInviteAction(input: {
  businessId: string;
  inviteId: string;
}): Promise<StaffActionResult> {
  const parsed = inviteIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid invite" };
  }
  const supabase = await requireUser();
  try {
    await revokeInvite(supabase, parsed.data.inviteId);
    revalidateDesk(parsed.data.businessId);
    return { error: null };
  } catch (error: unknown) {
    return { error: message(error, "Could not withdraw that invite") };
  }
}

export async function setMemberRoleAction(input: {
  businessId: string;
  userId: string;
  role: string;
}): Promise<StaffActionResult> {
  const parsed = relabelSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid role" };
  }
  const supabase = await requireUser();
  try {
    await setMemberRole(supabase, parsed.data);
    revalidateDesk(parsed.data.businessId);
    return { error: null };
  } catch (error: unknown) {
    return { error: message(error, "Could not change what they may do") };
  }
}

/** THE TWO STANDING POWERS (20 Sep 2026, the user: "permission given by Artist
 *  or Studio for managing Attendance and Refunds"). Shape only — the RPC decides
 *  who may grant, refuses an owner (who already holds both) and refuses somebody
 *  who is not on the team. */
export async function setMemberPowersAction(input: {
  businessId: string;
  userId: string;
  canAttendance: boolean;
  canRefunds: boolean;
}): Promise<StaffActionResult> {
  const parsed = powersSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }
  const supabase = await requireUser();
  try {
    await setTenantMemberPowers(supabase, parsed.data.businessId, parsed.data.userId, parsed.data.canAttendance, parsed.data.canRefunds);
    revalidateDesk(parsed.data.businessId);
    return { error: null };
  } catch (error: unknown) {
    return { error: message(error, "Could not change what they may do") };
  }
}

export async function removeMemberAction(input: {
  businessId: string;
  userId: string;
}): Promise<StaffActionResult> {
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid member" };
  }
  const supabase = await requireUser();
  try {
    await removeMember(supabase, parsed.data);
    revalidateDesk(parsed.data.businessId);
    return { error: null };
  } catch (error: unknown) {
    return { error: message(error, "Could not remove them") };
  }
}

/** The invited person's own act. Consent lives in the RPC: the signed-in email
 *  must match the invite, so holding the link is never enough. */
export async function acceptInviteAction(input: { code: string }): Promise<StaffActionResult> {
  const parsed = codeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "That invite link is not valid" };
  }
  const supabase = await requireUser();
  try {
    await acceptInvite(supabase, parsed.data.code);
    revalidatePath("/");
    revalidatePath("/business");
    return { error: null };
  } catch (error: unknown) {
    return { error: message(error, "Could not join the team") };
  }
}

export async function declineInviteAction(input: { code: string }): Promise<StaffActionResult> {
  const parsed = codeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "That invite link is not valid" };
  }
  const supabase = await requireUser();
  try {
    await declineInvite(supabase, parsed.data.code);
    revalidatePath("/");
    return { error: null };
  } catch (error: unknown) {
    return { error: message(error, "Could not answer that invite") };
  }
}
