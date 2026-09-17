import { NotBuiltYet } from "@/features/shell/components/NotBuiltYet";

/** /assets — the Assets tile on an artist's Home (18 Sep 2026). The prototype's
 *  S_assets (16791): your inventory and what it is worth — sound, floors,
 *  equipment. Not built; the tile says so honestly. */
export default function AssetsPage() {
  return <NotBuiltYet tool="Assets" what="Your inventory and what it is worth — sound, floors, equipment." />;
}
