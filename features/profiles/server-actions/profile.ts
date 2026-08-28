"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateMyProfile } from "@/repositories/profiles";

/** The Profile tab's one write (S_profiletab: Edit profile 11364, the links
 *  sheet 11161, the styles sheet 11217 — three sheets, one record). Zod checks
 *  the shape; the RPC re-checks it and scopes the write to the caller. */

const schema = z.object({
  fullName: z.string().trim().min(1).max(120),
  city: z.string().trim().max(120).nullable(),
  age: z.number().int().min(13).max(99).nullable(),
  about: z.string().trim().max(220).nullable(),
  socials: z
    .array(
      z.object({
        platform: z.string().trim().min(1).max(40),
        url: z.string().trim().url().max(300),
      })
    )
    .max(12),
  styles: z.array(z.string().trim().min(1).max(40)).max(12),
});

export type MyProfileInput = z.infer<typeof schema>;

export async function updateMyProfileAction(input: MyProfileInput): Promise<{ error: string | null }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first ? `${first.path.join(".") || "profile"}: ${first.message}` : "Invalid request" };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  try {
    await updateMyProfile(supabase, {
      ...parsed.data,
      city: parsed.data.city || null,
      about: parsed.data.about || null,
    });
    revalidatePath("/profile");
    revalidatePath("/");
    revalidatePath(`/person/${user.id}`);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save your profile" };
  }
}
