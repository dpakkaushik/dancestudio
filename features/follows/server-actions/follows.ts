"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setCrewFollow, setFollow } from "@/repositories/follows";
import { setPersonFollow } from "@/repositories/publicPerson";
import type { FollowState } from "@/types/follow";

/** Step 15's one write, and its two siblings. The RPC decides everything that
 *  matters — you must be signed in and onboarded, the business must be listed,
 *  and you must not be on its team — so the action only validates the shape and
 *  passes it on. */

export interface FollowActionResult {
  state: FollowState | null;
  error: string | null;
}

const schema = z.object({
  tenantId: z.string().uuid(),
  on: z.boolean(),
});

export async function setFollowAction(input: { tenantId: string; on: boolean }): Promise<FollowActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { state: null, error: "Invalid request" };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  try {
    const state = await setFollow(supabase, parsed.data.tenantId, parsed.data.on);
    revalidatePath(`/studio/${parsed.data.tenantId}`);
    revalidatePath(`/artist/${parsed.data.tenantId}`);
    revalidatePath("/profile");
    revalidatePath("/discover");
    return { state, error: null };
  } catch (error: unknown) {
    return { state: null, error: error instanceof Error ? error.message : "Could not update that follow" };
  }
}

/** Following a PERSON (parity slice, 28 Aug 2026) — or, since 19 Sep 2026, a
 *  PUBLIC organization through the same door. The RPC decides everything that
 *  matters — signed in, onboarded, not yourself, they exist, the organization
 *  is public — so the action validates the shape and passes it on. */
const personSchema = z.object({
  userId: z.string().uuid(),
  on: z.boolean(),
});

export async function setPersonFollowAction(input: { userId: string; on: boolean }): Promise<FollowActionResult> {
  const parsed = personSchema.safeParse(input);
  if (!parsed.success) {
    return { state: null, error: "Invalid request" };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  try {
    const state = await setPersonFollow(supabase, parsed.data.userId, parsed.data.on);
    revalidatePath(`/person/${parsed.data.userId}`);
    revalidatePath(`/org/${parsed.data.userId}`);
    revalidatePath("/profile");
    return { state, error: null };
  } catch (error: unknown) {
    return { state: null, error: error instanceof Error ? error.message : "Could not update that follow" };
  }
}

/** Following a CREW (19 Sep 2026). The RPC refuses an organization account,
 *  the crew's own leader and its confirmed members. */
const crewSchema = z.object({
  crewId: z.string().uuid(),
  on: z.boolean(),
});

export async function setCrewFollowAction(input: { crewId: string; on: boolean }): Promise<FollowActionResult> {
  const parsed = crewSchema.safeParse(input);
  if (!parsed.success) {
    return { state: null, error: "Invalid request" };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  try {
    const state = await setCrewFollow(supabase, parsed.data.crewId, parsed.data.on);
    revalidatePath(`/crew/${parsed.data.crewId}`);
    revalidatePath("/profile");
    return { state, error: null };
  } catch (error: unknown) {
    return { state: null, error: error instanceof Error ? error.message : "Could not update that follow" };
  }
}
