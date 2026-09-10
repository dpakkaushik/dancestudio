"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DOS_CITIES } from "@/lib/constants/cities";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setTenantLocation } from "@/repositories/tenants";

/** SAVING A PLACE (11 Sep 2026).
 *
 *  Rule 6: the numbers arrived from a browser, so they are validated here and
 *  AGAIN inside `set_tenant_location`, which re-checks ownership and the same
 *  bounds. Two checks rather than one because these two are reached by
 *  different doors — a server action and a direct RPC call — and each has to
 *  hold on its own.
 *
 *  India's box is the bound in both places. It is not a precision check; it is
 *  the difference between a typo and a studio in the Bay of Bengal. */
const schema = z.object({
  tenantId: z.string().uuid(),
  lat: z.number().min(6).max(37.5),
  lng: z.number().min(68).max(97.5),
  area: z.string().trim().max(140).nullable(),
  /* the closed list, or nothing — the RPC refuses anything else anyway */
  city: z.enum(DOS_CITIES).nullable(),
});

export interface LocationActionResult {
  error: string | null;
}

export async function setTenantLocationAction(input: {
  tenantId: string;
  lat: number;
  lng: number;
  area: string | null;
  city: string | null;
}): Promise<LocationActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first ? `${first.path.join(".") || "location"}: ${first.message}` : "That is not a place" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  try {
    await setTenantLocation(supabase, parsed.data);
    revalidatePath(`/studio/${parsed.data.tenantId}`);
    revalidatePath(`/artist/${parsed.data.tenantId}`);
    /* the point is what Discover measures from, so its lists are now stale */
    revalidatePath("/discover");
    revalidatePath("/business");
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save that place" };
  }
}
