import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyMemberships as findMyTeams } from "@/repositories/tenants";

/** /assets — kept as an ADDRESS, not a page (21 Sep 2026, Rule 14: a link handed
 *  out is a promise, and the installed TWA reopens on the last URL it showed).
 *
 *  It was the Assets tile's target on an artist's grid while assets were a
 *  "nothing here yet" stub. Assets belong to a BUSINESS, so the tile points at
 *  the artist's own page's desk now — the same move the Earnings tile made on
 *  20 Sep for the same reason — and this sends anybody holding the old link
 *  there. Somebody who owns no business at all goes to the hub, which is where
 *  a business is made. */
export default async function AssetsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const teams = await findMyTeams(supabase).catch(() => []);
  /* an artist's own page first — this address was an artist's tile — then any
     other business they own, so the redirect is never a dead end for a studio
     owner who typed it */
  const owned = teams.filter((m) => m.memberRole === "owner");
  const page = owned.find((m) => m.tenant.type === "artist_page") ?? owned[0] ?? null;
  redirect(page ? `/business/${page.tenant.id}/assets` : "/business");
}
