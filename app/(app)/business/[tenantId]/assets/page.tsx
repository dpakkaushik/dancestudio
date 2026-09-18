import { NotBuiltYet } from "@/features/shell/components/NotBuiltYet";

/** /business/{tenantId}/assets — the Assets tile on a studio's home (18 Sep
 *  2026). The prototype's S_assets (16791): the studio's inventory and its
 *  value — sound, floors, mirrors, equipment. Go back lands on the studio's home. */
export default async function StudioAssetsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  return (
    <NotBuiltYet
      tool="assets"
      what="This studio’s inventory and what it is worth — sound, floors, mirrors, equipment."
      back={`/business/${tenantId}`}
      backLabel="Back to the studio"
    />
  );
}
