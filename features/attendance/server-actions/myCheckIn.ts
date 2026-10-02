"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dosClassLabel } from "@/lib/constants/styles";

/** THE QR SHEET'S QUESTION (2 Oct 2026, the user: *"while showing your qr code
 *  for checking in on any class once the person confirms check in should show
 *  class confirmed"*): has the door let ME in since I opened the code?
 *
 *  ⚠ It reads only the caller's OWN attendance rows (`user_id` out loud — a
 *  studio's members read their whole register, and RLS is a ceiling, not a
 *  scope), takes no user id from the client, and answers null on any failure:
 *  a poll that throws would take the sheet down with it. */

const sinceSchema = z.string().datetime({ offset: true });

export interface MyCheckIn {
  classLabel: string;
  at: string;
}

export async function myCheckInSinceAction(sinceIso: string): Promise<MyCheckIn | null> {
  const since = sinceSchema.safeParse(sinceIso);
  if (!since.success) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("attendance")
    .select("created_at, classes (style, level)")
    .eq("user_id", user.id)
    .gt("created_at", since.data)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const cls = (Array.isArray(data.classes) ? data.classes[0] : data.classes) as { style: string; level: string } | null;
  return { classLabel: cls ? dosClassLabel(cls.style, cls.level) : "Your class", at: data.created_at as string };
}
