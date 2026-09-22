import { notFound, redirect } from "next/navigation";
import { AssetForm } from "@/features/assets/components/AssetForm";
import { AssetsDesk } from "@/features/assets/components/AssetsDesk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findBusinessAssets } from "@/repositories/assets";
import { findMyMemberships as findMyTeams } from "@/repositories/tenants";

/** /business/{tenantId}/assets — ONE DESK FOR ALL THREE KINDS (21 Sep 2026, the
 *  user: "Fix assets for both artist, studio and organization").
 *
 *  A studio's, an artist page's, and an organization's own hosting row all pass
 *  through here, because all three are `businesses` and assets hang off a
 *  business. It replaces the prototype's "nothing here yet", which the tile has
 *  opened since 18 Sep — and an ORGANIZATION never had the tile at all.
 *
 *  ⚠ THE OWNER'S, and the database says so too (`is_business_owner` in the only
 *  SELECT policy on `assets`). Inventory and what it is worth is the Earnings
 *  desk's kind of fact, not the register's: a trainer has no business reading
 *  what the floor cost. So this is a presentation gate over a REAL one, not
 *  instead of one. */
export default async function BusinessAssetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { tenantId } = await params;
  /* ⚠ THE FORM OPENS OVER THE DESK (22 Sep 2026), and `?new=1` is what says so —
     the same shape as the gear's `?settings=1`. The gate needs no second check
     here for once: this whole page is the owner's, and a non-owner is redirected
     four lines below before anything is rendered at all. */
  const opening = (await searchParams).new === "1";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  /* MEMBERSHIP IS THE SPINE — `findMyTeams` says `user_id = auth.uid()` out loud,
     so this asks whether THIS person is on THIS business rather than whether the
     row happens to be readable (RLS is a ceiling, not a scope) */
  const teams = await findMyTeams(supabase).catch(() => []);
  const seat = teams.find((m) => m.tenant.id === tenantId);
  if (!seat) {
    notFound();
  }
  if (seat.memberRole !== "owner") {
    redirect(`/business/${tenantId}`);
  }
  const assets = await findBusinessAssets(supabase, tenantId).catch(() => []);
  return (
    <>
      <AssetsDesk businessId={tenantId} businessName={seat.tenant.name} assets={assets} />
      {opening ? <AssetForm businessId={tenantId} businessName={seat.tenant.name} /> : null}
    </>
  );
}
