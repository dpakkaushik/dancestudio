"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DOS_CITIES } from "@/lib/constants/cities";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantWithOwner } from "@/repositories/tenants";

export interface TenantActionState {
  error: string | null;
  created?: boolean;
}

const createTenantSchema = z
  .object({
    name: z.string().trim().min(1, "Give it a name").max(140),
    type: z.enum(["studio", "trainer_business"]),
    area: z.string().trim().max(140).optional(),
    city: z.string().trim().max(120).optional(),
  })
  .refine((d) => !d.city || (DOS_CITIES as readonly string[]).includes(d.city), {
    message: "Pick a city from the list",
  })
  .refine((d) => d.type !== "studio" || (d.city && d.city.length > 0), {
    message: "A studio needs a city",
  })
  .refine((d) => d.type !== "studio" || (d.area && d.area.length > 0), {
    message: "A studio needs its area",
  });

export async function createTenantAction(
  _prev: TenantActionState,
  formData: FormData
): Promise<TenantActionState> {
  const parsed = createTenantSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    area: (formData.get("area") as string) || undefined,
    city: (formData.get("city") as string) || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  try {
    await createTenantWithOwner(supabase, {
      name: parsed.data.name,
      type: parsed.data.type,
      area: parsed.data.area ?? null,
      city: parsed.data.city ?? null,
    });
  } catch (error: unknown) {
    return {
      error: error instanceof Error ? error.message : "Could not create the business",
    };
  }

  // a redirect to /business would land on the same route and leave the sheet's
  // client state open — refresh the list and let the sheet close itself instead
  revalidatePath("/business");
  return { error: null, created: true };
}
