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

/** AN ORGANIZATION'S TEAM — the five doors (push 2, 19 Sep 2026; keyed on the
 *  ORGANIZATION BUSINESS since 26 Sep 2026). Zod checks the shape; every RPC
 *  decides who may call it: only the organization's OWNER asks, relabels and
 *  withdraws; only the person asked answers; the owner or the person themselves
 *  removes. The `orgId` in an ask is a request, never an authority. */

export interface OrgTeamActionResult {
  error: string | null;
}

const uuid = z.string().uuid();
/* ⚠ THREE LABELS SINCE 26 Sep 2026: `studio_owner` is refused by the database
   now — an organization runs no studios, so there is no seat to grant */
const role = z.enum(["owner", "event_team", "member"]);

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

const revalidate = (orgId?: string | null) => {
  revalidatePath("/inbox");
  revalidatePath("/notifications");
  if (orgId) {
    revalidatePath(`/business/${orgId}/team`);
    revalidatePath(`/org/${orgId}`);
  }
};

export async function askOrganizationMemberAction(input: { orgId: string; userId: string; role: OrgAskRole }): Promise<OrgTeamActionResult> {
  const parsed = z.object({ orgId: uuid, userId: uuid, role }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const { supabase } = await requireUser();
  try {
    await askOrganizationMember(supabase, parsed.data.orgId, parsed.data.userId, parsed.data.role);
    revalidate(parsed.data.orgId);
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

/* the three below take the ORGANIZATION too, only so the right desk is
   revalidated — the RPC finds the row's own organization and re-checks the seat */
export async function withdrawOrganizationAskAction(input: { memberId: string; orgId?: string | null }): Promise<OrgTeamActionResult> {
  const parsed = z.object({ memberId: uuid, orgId: uuid.nullish() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const { supabase } = await requireUser();
  try {
    await withdrawOrganizationAsk(supabase, parsed.data.memberId);
    revalidate(parsed.data.orgId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not withdraw" };
  }
}

export async function removeOrganizationMemberAction(input: { memberId: string; orgId?: string | null }): Promise<OrgTeamActionResult> {
  const parsed = z.object({ memberId: uuid, orgId: uuid.nullish() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const { supabase } = await requireUser();
  try {
    await removeOrganizationMember(supabase, parsed.data.memberId);
    revalidate(parsed.data.orgId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not remove them" };
  }
}

export async function setOrganizationMemberRoleAction(input: { memberId: string; role: OrgTeamRole; orgId?: string | null }): Promise<OrgTeamActionResult> {
  const parsed = z.object({ memberId: uuid, role, orgId: uuid.nullish() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const { supabase } = await requireUser();
  try {
    await setOrganizationMemberRole(supabase, parsed.data.memberId, parsed.data.role);
    revalidate(parsed.data.orgId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not change the label" };
  }
}
