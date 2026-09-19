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
import { reorderTenantMembers } from "@/repositories/tenants";

/** Step 12b staff actions. Authorization is NOT here — it is in the RPCs, which
 *  is the only place that can be trusted (owner-only to ask, and only the person
 *  asked may answer). What an invite may SAY is validated here. */

export interface StaffActionResult {
  error: string | null;
}

/* VISITING FACULTY IS A SEAT THE DESK CAN HAND OUT (19 Sep 2026) — `set_member_role`
   has admitted it since 18 Sep and only this list kept it out */
const ROLE = z.enum(["trainer", "staff", "visiting_faculty"]);

const inviteSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().trim().min(1, "Who is it?").max(120),
  email: z.string().trim().toLowerCase().email("That is not an email address").max(254),
  role: ROLE,
});

const inviteIdSchema = z.object({ tenantId: z.string().uuid(), inviteId: z.string().uuid() });
const memberSchema = z.object({ tenantId: z.string().uuid(), userId: z.string().uuid() });
const roleSchema = memberSchema.extend({ role: ROLE });
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

const revalidateDesk = (tenantId: string) => {
  revalidatePath(`/business/${tenantId}/staff`);
  // the class form's people pickers read the same team
  revalidatePath(`/business/${tenantId}/classes`);
};

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export async function inviteToTenantAction(input: {
  tenantId: string;
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
    revalidateDesk(parsed.data.tenantId);
    return { error: null };
  } catch (error: unknown) {
    return { error: message(error, "Could not send that invite") };
  }
}

/** ASKED BY NAME (19 Sep 2026) — the people picker's half of the same door.
 *  The RPC decides everything that matters; this checks the shape. */
export async function invitePersonAction(input: {
  tenantId: string;
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
    revalidateDesk(parsed.data.tenantId);
    return { error: null };
  } catch (error: unknown) {
    return { error: message(error, "Could not ask them") };
  }
}

/** THE ORDER (19 Sep 2026) — the owner's, and the RPC says so. */
export async function reorderMembersAction(input: {
  tenantId: string;
  userIds: string[];
}): Promise<StaffActionResult> {
  const parsed = z.object({ tenantId: z.string().uuid(), userIds: z.array(z.string().uuid()).max(100) }).safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid order" };
  }
  const supabase = await requireUser();
  try {
    await reorderTenantMembers(supabase, parsed.data.tenantId, parsed.data.userIds);
    revalidateDesk(parsed.data.tenantId);
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
  tenantId: string;
  userId: string;
  amountInr: number;
  method: string;
  status: string;
  paidOn?: string | null;
  note?: string | null;
}): Promise<StaffActionResult> {
  const parsed = z
    .object({
      tenantId: z.string().uuid(),
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
      tenantId: parsed.data.tenantId,
      userId: parsed.data.userId,
      amountInr: parsed.data.amountInr,
      method: parsed.data.method,
      status: parsed.data.status,
      paidOn: parsed.data.paidOn ?? null,
      note: parsed.data.note ?? null,
    });
    revalidateDesk(parsed.data.tenantId);
    /* it is an expense the moment it is written — the ledger that prints it */
    revalidatePath(`/business/${parsed.data.tenantId}/earnings`);
    revalidatePath("/earnings");
    return { error: null };
  } catch (error: unknown) {
    return { error: message(error, "Could not record that payment") };
  }
}

export async function revokeInviteAction(input: {
  tenantId: string;
  inviteId: string;
}): Promise<StaffActionResult> {
  const parsed = inviteIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid invite" };
  }
  const supabase = await requireUser();
  try {
    await revokeInvite(supabase, parsed.data.inviteId);
    revalidateDesk(parsed.data.tenantId);
    return { error: null };
  } catch (error: unknown) {
    return { error: message(error, "Could not withdraw that invite") };
  }
}

export async function setMemberRoleAction(input: {
  tenantId: string;
  userId: string;
  role: string;
}): Promise<StaffActionResult> {
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid role" };
  }
  const supabase = await requireUser();
  try {
    await setMemberRole(supabase, parsed.data);
    revalidateDesk(parsed.data.tenantId);
    return { error: null };
  } catch (error: unknown) {
    return { error: message(error, "Could not change what they may do") };
  }
}

export async function removeMemberAction(input: {
  tenantId: string;
  userId: string;
}): Promise<StaffActionResult> {
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid member" };
  }
  const supabase = await requireUser();
  try {
    await removeMember(supabase, parsed.data);
    revalidateDesk(parsed.data.tenantId);
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
