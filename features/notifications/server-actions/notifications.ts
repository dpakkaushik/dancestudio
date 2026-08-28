"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearNotifications, markNotificationsRead, setNotificationPrefs } from "@/repositories/notifications";
import { DEFAULT_PREFS, type NotificationKind } from "@/types/notification";

/** Step 24's writes. Nothing here raises a notification — triggers do that
 *  where the fact happens. These are the three things a person does with the
 *  ones they have: read them, clear them, and decide what reaches them. */

export interface NotificationActionResult {
  error: string | null;
  n?: number;
}

const KINDS = ["enquiry", "booking", "money", "people", "event", "class"] as const;
const target = z.object({ ids: z.array(z.string().uuid()).max(200).optional(), kind: z.enum(KINDS).optional() });

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

const revalidate = () => {
  revalidatePath("/notifications");
  /* the bell sits in the chrome, so every route draws it */
  revalidatePath("/", "layout");
};

export async function markNotificationsReadAction(input: { ids?: string[]; kind?: NotificationKind }): Promise<NotificationActionResult> {
  const parsed = target.safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const supabase = await requireUser();
  try {
    const n = await markNotificationsRead(supabase, parsed.data);
    revalidate();
    return { error: null, n };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not mark those read" };
  }
}

export async function clearNotificationsAction(input: { ids?: string[]; kind?: NotificationKind }): Promise<NotificationActionResult> {
  const parsed = target.safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  if (!parsed.data.ids?.length && !parsed.data.kind) return { error: "Say which notifications to clear" };
  const supabase = await requireUser();
  try {
    const n = await clearNotifications(supabase, parsed.data);
    revalidate();
    return { error: null, n };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not clear those" };
  }
}

const prefsSchema = z.object({
  kinds: z.record(z.enum(KINDS), z.boolean()),
  push: z.boolean(),
  whatsapp: z.boolean(),
  email: z.boolean(),
});

export async function setNotificationPrefsAction(input: z.input<typeof prefsSchema>): Promise<NotificationActionResult> {
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid settings" };
  const supabase = await requireUser();
  try {
    await setNotificationPrefs(supabase, {
      /* a partial map is filled in from the defaults, never the other way round */
      kinds: { ...DEFAULT_PREFS.kinds, ...parsed.data.kinds },
      push: parsed.data.push,
      whatsapp: parsed.data.whatsapp,
      email: parsed.data.email,
    });
    revalidate();
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save that" };
  }
}
