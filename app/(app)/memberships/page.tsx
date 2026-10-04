import { redirect } from "next/navigation";
import { MembershipsScreen } from "@/features/memberships/components/MembershipsScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findBusinessCardFacts } from "@/repositories/discovery";
import { findMyMemberships, findPassUsesMany } from "@/repositories/memberships";

/** /memberships — the Memberships tile (18 Sep 2026's grid), built 19 Sep 2026:
 *  the passes you HOLD, with their progress bars.
 *
 *  ⚠⚠ IT SELLS NOTHING ANY MORE (4 Oct 2026, the user: "remove membership
 *  creation from artists and remove the ones previously created or purchased.
 *  memberships can only be created by studios"). Until then an artist's page
 *  sold from here too, on a Manage side; that side, its `?new=1` form and the
 *  read behind them are gone, and `save_membership` refuses an artist page in
 *  words. A STUDIO's memberships live on the studio's own home
 *  (`/business/{id}/memberships`), where they have since 21 Sep. */
export default async function MembershipsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const passes = await findMyMemberships(supabase).catch(() => []);

  /** ⚠ WHO SOLD YOU THIS PASS, WITH THEIR FACE (28 Sep 2026, the user:
   *  "membership should have studio or artist photo with name"). The NAME has
   *  ridden on `my_memberships` all along; the photo is ONE second query over the
   *  businesses the passes name (`findBusinessCardFacts`), never one per row, and
   *  it degrades to initials rather than failing. */
  const sellerIds = [...new Set(passes.map((p) => p.businessId))];
  const [sellerFacts, usesByPass] = await Promise.all([
    sellerIds.length > 0 ? findBusinessCardFacts(supabase, sellerIds).catch(() => new Map()) : Promise.resolve(new Map()),
    /* what each pass you hold was spent on (30 Sep 2026) — the holder's own history */
    findPassUsesMany(supabase, passes),
  ]);
  const sellerPhotos: Record<string, string | null> = {};
  sellerIds.forEach((id) => {
    sellerPhotos[id] = sellerFacts.get(id)?.photoPath ?? null;
  });
  return <MembershipsScreen passes={passes} selling={[]} canSell={false} sellerPhotos={sellerPhotos} usesByPass={usesByPass} openOnBooked seller={null} />;
}
