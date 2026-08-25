"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  acceptInvite,
  declineInvite,
  inviteToTenant,
  removeMember,
  revokeInvite,
  setMemberRole,
} from "@/repositories/invites";

/** Step 12b staff actions. Authorization is NOT here — it is in the RPCs, which
 *  is the only place that can be trusted (owner-only to ask, and only the person
 *  asked may answer). What an invite may SAY is validated here. */

export interface StaffActionResult {
  error: string | null;
}

const ROLE = z.enum(["trainer", "staff"]);

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
