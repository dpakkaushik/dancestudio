import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActingAs } from "@/repositories/actingAs";

/** ⚠ AN ADDRESS, NOT A PAGE (2 Oct 2026, the user: *"shift back enquiries to
 *  inbox from home tools for all profiles"*). Enquiries are the Inbox's third
 *  desk again, so this lands there — and an old `?as=` link lands on that
 *  studio's or crew's own Inbox (Rule 14: a handed-out link is a promise). */
export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  if (as) {
    const supabase = await createSupabaseServerClient();
    const actingAs = await resolveActingAs(supabase, as);
    if (actingAs?.kind === "crew") redirect(`/crews/${actingAs.id}/inbox?show=enquiries`);
    if (actingAs) redirect(`/business/${actingAs.id}/inbox?show=enquiries`);
  }
  redirect("/inbox?show=enquiries");
}
