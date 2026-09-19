"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  askOrganizationMember,
  removeOrganizationMember,
  respondToOrganizationAsk,
  setOrganizationMemberRole,
  withdrawOrganizationAsk,
  type OrgAskRole,
  type OrgTeamRole,
} from "@/repositories/organizationTeam";

/** AN ORGANIZATION'S TEAM — the five doors (push 2, 19 Sep 2026). Zod checks
 *  the shape; every RPC decides who may call it: only an organization asks,
 *  relabels and withdraws; only the person asked answers; the organization or
 *  the person themselves removes. */

export interface OrgTeamActionResult {
  error: string | null;
}

const uuid = z.string().uuid();
/* ⚠ THE ASK AND THE LABEL TAKE DIFFERENT SETS (20 Sep 2026): `studio_owner`
   grants a real owner seat on a studio, so it may only be set on somebody who
   has already confirmed — the RPC refuses it on an ask, and so does this. */
const askRole = z.enum(["owner", "event_team", "member"]);
const labelRole = z.enum(["owner", "studio_owner", "event_team", "member"]);

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return { supabase, userId: user.id };
}

const revalidate = (orgId?: string) => {
  revalidatePath("/business/team");
  revalidatePath("/inbox");
  revalidatePath("/notifications");
  if (orgId) revalidatePath(`/org/${orgId}`);
};

export async function askOrganizationMemberAction(input: { userId: string; role: OrgAskRole }): Promise<OrgTeamActionResult> {
  const parsed = z.object({ userId: uuid, role: askRole }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const { supabase, userId } = await requireUser();
  try {
    await askOrganizationMember(supabase, parsed.data.userId, parsed.data.role);
    revalidate(userId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not ask them" };
  }
}

export async function respondToOrganizationAskAction(input: { memberId: string; accept: boolean }): Promise<OrgTeamActionResult> {
  const parsed = z.object({ memberId: uuid, accept: z.boolean() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const { supabase } = await requireUser();
  try {
    await respondToOrganizationAsk(supabase, parsed.data.memberId, parsed.data.accept);
    revalidate();
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not answer" };
  }
}

export async function withdrawOrganizationAskAction(input: { memberId: string }): Promise<OrgTeamActionResult> {
  const parsed = z.object({ memberId: uuid }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const { supabase, userId } = await requireUser();
  try {
    await withdrawOrganizationAsk(supabase, parsed.data.memberId);
    revalidate(userId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not withdraw" };
  }
}

export async function removeOrganizationMemberAction(input: { memberId: string }): Promise<OrgTeamActionResult> {
  const parsed = z.object({ memberId: uuid }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const { supabase, userId } = await requireUser();
  try {
    await removeOrganizationMember(supabase, parsed.data.memberId);
    revalidate(userId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not remove them" };
  }
}

export async function setOrganizationMemberRoleAction(input: { memberId: string; role: OrgTeamRole; businessId?: string | null }): Promise<OrgTeamActionResult> {
  const parsed = z.object({ memberId: uuid, role: labelRole, businessId: uuid.nullish() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const { supabase, userId } = await requireUser();
  try {
    await setOrganizationMemberRole(supabase, parsed.data.memberId, parsed.data.role, parsed.data.businessId ?? null);
    revalidate(userId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not change the label" };
  }
}
