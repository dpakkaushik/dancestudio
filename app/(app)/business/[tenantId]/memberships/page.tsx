import { NotBuiltYet } from "@/features/shell/components/NotBuiltYet";

/** /business/{tenantId}/memberships — the Memberships tile on a studio's home
 *  (18 Sep 2026). The prototype's S_memberships (16846): the packs and plans a
 *  studio sells, by sessions or by months. A money screen, so it waits on the
 *  live Cashfree account. Go back lands on the studio's own home. */
export default async function StudioMembershipsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  return (
    <NotBuiltYet
      tool="memberships"
      what="Class packs and plans this studio sells — by sessions or by months, priced and valid for a period."
      back={`/business/${tenantId}`}
      backLabel="Back to the studio"
    />
  );
}
