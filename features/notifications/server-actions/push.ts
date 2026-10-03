"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** A PHONE TURNS PUSH ON OR OFF (3 Oct 2026). The subscription is made in the
 *  browser (only it holds the device's keys); what comes through here is the
 *  address and the two public keys, and the RPC records them against the
 *  SIGNED-IN person — there is no user id to send, so nobody can register a
 *  device as somebody else. */

const sub = z.object({
  endpoint: z.string().url().startsWith("https://").max(1000),
  p256dh: z.string().min(40).max(200),
  auth: z.string().min(10).max(100),
  userAgent: z.string().max(400).optional(),
});

export async function savePushSubscriptionAction(input: z.infer<typeof sub>): Promise<{ error: string | null }> {
  const parsed = sub.safeParse(input);
  if (!parsed.success) return { error: "That is not a push address this app can use." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.p256dh,
    p_auth: parsed.data.auth,
    p_user_agent: parsed.data.userAgent ?? null,
  });
  return { error: error ? error.message : null };
}

export async function removePushSubscriptionAction(input: { endpoint: string }): Promise<{ error: string | null }> {
  const parsed = z.string().url().max(1000).safeParse(input.endpoint);
  if (!parsed.success) return { error: "Invalid address" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_push_subscription", { p_endpoint: parsed.data });
  return { error: error ? error.message : null };
}
