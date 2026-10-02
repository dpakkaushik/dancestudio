import { redirect } from "next/navigation";
import { EnquiriesDesk } from "@/features/enquiries/components/EnquiriesDesk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActingAs } from "@/repositories/actingAs";

/** ENQUIRIES — YOUR OWN PROFILE'S DESK. ⚠ Since 2 Oct 2026 a studio's desk is
 *  `/business/{id}/enquiries` and a crew's `/crews/{id}/manage/enquiries` (the
 *  user: "should be seprate for both") — `EnquiriesDesk` carries the reasoning.
 *  An old `?as=` link is a promise (Rule 14), so it is resolved and REDIRECTED to
 *  that entity's own address rather than drawn here, where the chrome would
 *  dress it as the person's. */
export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  if (as) {
    const supabase = await createSupabaseServerClient();
    const actingAs = await resolveActingAs(supabase, as);
    if (actingAs?.kind === "crew") redirect(`/crews/${actingAs.id}/manage/enquiries`);
    if (actingAs) redirect(`/business/${actingAs.id}/enquiries`);
  }
  return <EnquiriesDesk as={null} />;
}
