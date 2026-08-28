"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DOS_CITIES } from "@/lib/constants/cities";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  askCrewMember,
  createCrew,
  removeCrewMember,
  reorderCrewMembers,
  respondToCrewAsk,
  respondToPartnerAsk,
  setCrewMemberRole,
  updateCrew,
  withdrawCrewAsk,
} from "@/repositories/crews";

/** Step 22's writes. The RPCs hold every rule — who leads the crew, who may
 *  answer an ask, that the leader cannot leave — so the actions validate shape
 *  and pass through. Every roster change is a claim about a PERSON on a public
 *  page, which is why adding somebody is an ask and never a write. */

export interface CrewActionResult {
  error: string | null;
  crewId?: string;
}

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

function revalidateCrews(crewId?: string) {
  revalidatePath("/crews");
  revalidatePath("/inbox");
  revalidatePath("/discover");
  if (crewId) {
    revalidatePath(`/crews/${crewId}/manage`);
    revalidatePath(`/crew/${crewId}`);
  }
  revalidatePath("/crews/[crewId]/manage", "page");
  revalidatePath("/crew/[crewId]", "page");
}

const city = z.enum(DOS_CITIES);
const style = z.string().trim().min(1).max(40);
const uuid = z.string().uuid();

const createSchema = z.object({
  name: z.string().trim().min(1, "Name your crew first").max(64),
  city,
  style,
  memberIds: z.array(uuid).max(50),
});

export async function createCrewAction(input: z.input<typeof createSchema>): Promise<CrewActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the crew's details" };
  const supabase = await requireUser();
  try {
    const crew = await createCrew(supabase, parsed.data);
    revalidateCrews(crew.id);
    return { error: null, crewId: crew.id };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not create the crew" };
  }
}

const updateSchema = z.object({ crewId: uuid, name: z.string().trim().min(1).max(64), city, style });

export async function updateCrewAction(input: z.input<typeof updateSchema>): Promise<CrewActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the crew's details" };
  const supabase = await requireUser();
  try {
    await updateCrew(supabase, parsed.data);
    revalidateCrews(parsed.data.crewId);
    return { error: null, crewId: parsed.data.crewId };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save the crew" };
  }
}

export async function askCrewMemberAction(input: { crewId: string; userId: string }): Promise<CrewActionResult> {
  const parsed = z.object({ crewId: uuid, userId: uuid }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await requireUser();
  try {
    await askCrewMember(supabase, parsed.data.crewId, parsed.data.userId);
    revalidateCrews(parsed.data.crewId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not ask them" };
  }
}

export async function respondToCrewAskAction(input: { memberId: string; accept: boolean }): Promise<CrewActionResult> {
  const parsed = z.object({ memberId: uuid, accept: z.boolean() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await requireUser();
  try {
    await respondToCrewAsk(supabase, parsed.data.memberId, parsed.data.accept);
    revalidateCrews();
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not answer" };
  }
}

export async function withdrawCrewAskAction(input: { memberId: string; crewId?: string }): Promise<CrewActionResult> {
  const parsed = z.object({ memberId: uuid, crewId: uuid.optional() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await requireUser();
  try {
    await withdrawCrewAsk(supabase, parsed.data.memberId);
    revalidateCrews(parsed.data.crewId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not withdraw" };
  }
}

export async function removeCrewMemberAction(input: { memberId: string; crewId?: string }): Promise<CrewActionResult> {
  const parsed = z.object({ memberId: uuid, crewId: uuid.optional() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await requireUser();
  try {
    await removeCrewMember(supabase, parsed.data.memberId);
    revalidateCrews(parsed.data.crewId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not remove them" };
  }
}

export async function setCrewMemberRoleAction(input: { memberId: string; crewId: string; role: "leader" | "member" | "trainee" }): Promise<CrewActionResult> {
  const parsed = z.object({ memberId: uuid, crewId: uuid, role: z.enum(["leader", "member", "trainee"]) }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await requireUser();
  try {
    await setCrewMemberRole(supabase, parsed.data.memberId, parsed.data.role);
    revalidateCrews(parsed.data.crewId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not change their role" };
  }
}

export async function reorderCrewMembersAction(input: { crewId: string; memberIds: string[] }): Promise<CrewActionResult> {
  const parsed = z.object({ crewId: uuid, memberIds: z.array(uuid).max(200) }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await requireUser();
  try {
    await reorderCrewMembers(supabase, parsed.data.crewId, parsed.data.memberIds);
    revalidateCrews(parsed.data.crewId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save the order" };
  }
}

export async function respondToPartnerAskAction(input: { bookingId: string; accept: boolean }): Promise<CrewActionResult> {
  const parsed = z.object({ bookingId: uuid, accept: z.boolean() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await requireUser();
  try {
    await respondToPartnerAsk(supabase, parsed.data.bookingId, parsed.data.accept);
    revalidatePath("/inbox");
    revalidatePath("/e/[slug]", "page");
    revalidatePath("/business/[tenantId]/events/[eventId]", "page");
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not answer" };
  }
}
