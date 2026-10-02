"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  askCrewMember,
  createCrew,
  reclaimCrew,
  removeCrewMember,
  reorderCrewMembers,
  respondToCrewAsk,
  setCrewMemberRole,
  setCrewSocials,
  setCrewStyles,
  updateCrew,
  withdrawCrewAsk,
} from "@/repositories/crews";

/** Step 22's writes. The RPCs hold every rule — who leads the crew, who may
 *  answer an ask, that the leader cannot leave — so the actions validate shape
 *  and pass through. Every roster change is a classPerson about a PERSON on a public
 *  page, which is why adding somebody is an ask and never a write. */

export interface CrewActionResult {
  error: string | null;
  crewId?: string;
  /** a crew that was made whose number and email did not land — said, never swallowed */
  note?: string;
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

/* any city the map names (11 Sep 2026) — see features/geo/server-actions/location.ts */
const city = z.string().trim().min(1, "Which city is the crew in?").max(120);
const style = z.string().trim().min(1).max(40);
const uuid = z.string().uuid();

const phoneShape = z.string().trim().regex(/^\+?[0-9][0-9 ]{7,17}$/, "A mobile number is 8 to 18 digits");
const emailShape = z.string().trim().email("That is not an email address").max(254);

/* ⚠ A MOBILE NUMBER AND AN EMAIL ARE REQUIRED, AND THEY ARE THE CREW'S (26 Sep
   2026, the user: "all profiles created from user or artist require a mobile
   number, email etc for the studio, crew, organization … editable to the user
   who creates that profile and not take directly what the user used for their
   login"). `create_crew` keeps its four arguments; the two land through
   `update_crew` the moment the row exists — two doors rather than a changed
   creation signature, exactly as a studio's pin and an organization's number do. */
/* ⚠ THE STYLES ARE A LIST (2 Oct 2026, the user: "dance style filter while
   creating studio and crew should be multi filter"). `create_crew` still takes
   ONE style and keeps it as `crews.style`, so the FIRST is sent there — the main
   style, which the trigger also makes the list — and the rest land through
   `set_crew_styles` once the row exists. Twelve is the column's own CHECK. */
const createSchema = z.object({
  name: z.string().trim().min(1, "Name your crew first").max(64),
  city,
  styles: z.array(style).min(1, "Pick a dance style").max(12, "Twelve styles at most"),
  phone: phoneShape,
  email: emailShape,
  memberIds: z.array(uuid).max(50),
});

export async function createCrewAction(input: z.input<typeof createSchema>): Promise<CrewActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the crew's details" };
  const supabase = await requireUser();
  try {
    const { phone, email, styles, ...base } = parsed.data;
    /* one live copy of each, in the order picked — the first is the main style */
    const list = [...new Set(styles)];
    const rest = { ...base, style: list[0] };
    const crew = await createCrew(supabase, rest);
    /* the number and the address, then the rest of the styles: a crew that
       exists with neither is still a crew, so a refusal here is reported rather
       than undoing the row — each said in words, never swallowed */
    const missed: string[] = [];
    try {
      await updateCrew(supabase, { crewId: crew.id, name: rest.name, city: rest.city, style: rest.style, contactEmail: email, phone, phonePublic: false });
    } catch (error: unknown) {
      missed.push(`its number and email could not be saved just now — ${error instanceof Error ? error.message : "add them from the crew's home"}`);
    }
    /* ⚠ AFTER `update_crew`, deliberately: that door rewrites `style`, and the
       list is written last so nothing after it can touch it. Only when there is
       more than the first — the trigger has already made the list `[style]`. */
    if (list.length > 1) {
      try {
        await setCrewStyles(supabase, crew.id, list);
      } catch (error: unknown) {
        missed.push(`only ${rest.style} was kept as its style — ${error instanceof Error ? error.message : "add the others from the crew's home"}`);
      }
    }
    revalidateCrews(crew.id);
    if (missed.length) return { error: null, crewId: crew.id, note: `Crew created, but ${missed.join("; and ")}.` };
    return { error: null, crewId: crew.id };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not create the crew" };
  }
}

/* THE LIST OF STYLES AND THE LINKS (26 Sep 2026) — the two doors the crew's home
   band writes through; both RPCs re-check that the caller leads the crew */
export async function setCrewStylesAction(input: { crewId: string; styles: string[] }): Promise<CrewActionResult> {
  const parsed = z.object({ crewId: uuid, styles: z.array(z.string().trim().min(1).max(40)).min(1, "A crew dances at least one style").max(12) }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the styles" };
  const supabase = await requireUser();
  try {
    await setCrewStyles(supabase, parsed.data.crewId, parsed.data.styles);
    revalidateCrews(parsed.data.crewId);
    return { error: null, crewId: parsed.data.crewId };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save the styles" };
  }
}

export async function setCrewSocialsAction(input: { crewId: string; socials: Array<{ platform: string; url: string }> }): Promise<CrewActionResult> {
  const parsed = z
    .object({ crewId: uuid, socials: z.array(z.object({ platform: z.string().trim().min(1).max(40), url: z.string().trim().url().max(300) })).max(12) })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the links" };
  const supabase = await requireUser();
  try {
    await setCrewSocials(supabase, parsed.data.crewId, parsed.data.socials);
    revalidateCrews(parsed.data.crewId);
    return { error: null, crewId: parsed.data.crewId };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save the links" };
  }
}

/* the crew's Edit sheet (19 Sep 2026) — name, city, style, and the Mail button's
   address: omitted → unchanged, null → cleared */
const updateSchema = z.object({
  crewId: uuid,
  name: z.string().trim().min(1, "Name your crew first").max(64),
  city,
  style,
  contactEmail: z.string().trim().email("that is not an email address").max(254).nullable().optional(),
  /* CALL IS A TOGGLE (push 2): the crew's number, and whether its page dials it */
  phone: z.string().trim().regex(/^\+?[0-9][0-9 ]{7,17}$/, "a phone number is 8 to 18 digits").nullable().optional(),
  phonePublic: z.boolean().optional(),
});

export async function updateCrewAction(input: z.input<typeof updateSchema>): Promise<CrewActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the crew's details" };
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

/** ⚠⚠ THE FOUNDER TAKES THE CREW BACK (30 Sep 2026).
 *
 *  "Make leader" hands a crew over — `set_crew_member_role` demotes the
 *  incumbent and moves `crews.leader_id` in the same statement — and until now
 *  that was a ONE-WAY DOOR: the founder became a plain member, `is_crew_leader`
 *  answered false for them, and they could not take it back, remove the new
 *  leader, or hand it on. ⚠ The user asked for this as "when 2 or more crew
 *  leaders are there", and a crew CANNOT have two; this is the same deadlock in
 *  the shape the database actually has.
 *
 *  Every guard is the RPC's — only `crews.created_by`, never when they already
 *  lead it, and they must still be a confirmed member — and its words are what
 *  the screen prints on a refusal. */
export async function reclaimCrewAction(input: { crewId: string }): Promise<CrewActionResult> {
  const parsed = z.object({ crewId: uuid }).safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await requireUser();
  try {
    await reclaimCrew(supabase, parsed.data.crewId);
    revalidateCrews(parsed.data.crewId);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not take the crew back" };
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

/* ⚠ `respondToPartnerAskAction` went with events (29 Sep 2026) — it answered a
   duet ask from the Requests desk, and there is nothing to be asked to. */
