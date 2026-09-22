"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setMyToolOrder } from "@/repositories/layout";

/** ARRANGING A TOOL GRID (22 Sep 2026).
 *
 *  `set_my_layout` decides everything that matters — it is scoped to
 *  `auth.uid()` inside with no `p_user_id` to aim at anybody else, and the
 *  `profiles_layout_shape` CHECK is what actually bounds what may be stored — so
 *  this action validates the SHAPE and passes it on (Rule 6: the client's word
 *  is never trusted, and Rule 5: the database is reached through a repository).
 *
 *  ⚠ The two bounds below are the CHECK's own, restated rather than assumed: a
 *  key the database would refuse should come back as "Invalid request" here
 *  rather than as a raised exception after the press. */
const schema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_:-]{0,79}$/),
  order: z.array(z.string().min(1).max(40)).max(40),
});

export interface ToolOrderResult {
  error: string | null;
}

/** ⚠ **NO `revalidatePath`, ON PURPOSE.** The arranging list holds the order in
 *  the browser while somebody is moving tiles, so revalidating would re-render
 *  the server tree under them on every press and fight the state they can see.
 *  The stored order is read on the next real navigation, which is when it
 *  matters. An empty `order` is how the door is told to FORGET the key — that is
 *  the migration's own `layout - p_key` branch, and it is what Reset sends. */
export async function setToolOrderAction(input: { key: string; order: string[] }): Promise<ToolOrderResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid request" };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  try {
    await setMyToolOrder(supabase, parsed.data.key, parsed.data.order);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save that order" };
  }
}
