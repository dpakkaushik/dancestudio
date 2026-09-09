"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  adminOpenSupportThread,
  markSupportRead,
  openSupportThread,
  postSupportMessage,
  setSupportThreadStatus,
} from "@/repositories/support";

/** The support conversation's writes (10 Sep 2026). One set of actions for both
 *  sides: the RPCs decide from `is_platform_admin()` which side a message lands
 *  on and who gets notified, so nothing here has to be told who is asking —
 *  which is also why an account cannot post as DanceOS by calling this. */

const bodySchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().trim().min(1, "Write your message").max(4000, "A message is at most 4000 characters"),
});

const openSchema = z.object({
  subject: z.string().trim().min(1, "Give it a subject").max(140),
  body: z.string().trim().min(1, "Write your message").max(4000),
  requestId: z.string().uuid().nullable().optional(),
});

const adminOpenSchema = z.object({
  accountId: z.string().uuid(),
  subject: z.string().trim().min(1, "Give it a subject").max(140),
  body: z.string().trim().min(1, "Write your message").max(4000),
});

const statusSchema = z.object({
  threadId: z.string().uuid(),
  status: z.enum(["open", "closed"]),
});

/* both sides' screens live at these two roots */
const refresh = (threadId: string) => {
  revalidatePath("/support");
  revalidatePath(`/support/${threadId}`);
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${threadId}`);
  revalidatePath("/admin");
  revalidatePath("/business");
};

export async function postSupportMessageAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = bodySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await postSupportMessage(supabase, parsed.data.threadId, parsed.data.body);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not send that" };
  }
  refresh(parsed.data.threadId);
  return { error: null };
}

/** An account opens a conversation. Pass the verification request id and the
 *  thread hangs on that decision, so a rejection and its answer sit together. */
export async function openSupportThreadAction(input: unknown): Promise<{ error: string | null; threadId: string | null }> {
  const parsed = openSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input", threadId: null };
  }
  const supabase = await createSupabaseServerClient();
  try {
    const threadId = await openSupportThread(supabase, parsed.data);
    refresh(threadId);
    return { error: null, threadId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not start that", threadId: null };
  }
}

/** An admin opens one — the onboarding nudge. */
export async function adminOpenSupportThreadAction(input: unknown): Promise<{ error: string | null; threadId: string | null }> {
  const parsed = adminOpenSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input", threadId: null };
  }
  const supabase = await createSupabaseServerClient();
  try {
    const threadId = await adminOpenSupportThread(supabase, parsed.data);
    refresh(threadId);
    return { error: null, threadId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not start that", threadId: null };
  }
}

export async function markSupportReadAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = z.object({ threadId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input" };
  }
  const supabase = await createSupabaseServerClient();
  await markSupportRead(supabase, parsed.data.threadId);
  return { error: null };
}

export async function setSupportThreadStatusAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input" };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await setSupportThreadStatus(supabase, parsed.data.threadId, parsed.data.status);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not do that" };
  }
  refresh(parsed.data.threadId);
  return { error: null };
}
