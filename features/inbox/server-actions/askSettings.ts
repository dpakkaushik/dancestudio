"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setMyInboxOff, setRoomRequests } from "@/repositories/askSettings";

/** The Inbox's request and invite settings (3 Oct 2026). The RPCs decide who
 *  may change what — a person their own kinds, a studio's owner its room
 *  requests — so these validate the shape and pass it on. */

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

const offSchema = z.object({ off: z.array(z.enum(["teach", "assist", "team", "crew"])).max(4) });

export async function setInboxOffAction(input: { off: string[] }): Promise<{ error: string | null }> {
  const parsed = offSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown kind of ask" };
  }
  const supabase = await requireUser();
  try {
    await setMyInboxOff(supabase, parsed.data.off);
    revalidatePath("/inbox");
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save that" };
  }
}

const roomSchema = z.object({ businessId: z.string().uuid(), on: z.boolean() });

export async function setRoomRequestsAction(input: { businessId: string; on: boolean }): Promise<{ error: string | null }> {
  const parsed = roomSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid request" };
  }
  const supabase = await requireUser();
  try {
    await setRoomRequests(supabase, parsed.data.businessId, parsed.data.on);
    revalidatePath(`/business/${parsed.data.businessId}/inbox`);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save that" };
  }
}
