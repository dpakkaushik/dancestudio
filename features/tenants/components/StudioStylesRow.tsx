"use client";

import { useRouter } from "next/navigation";
import { useRecordLists } from "@/features/profiles/components/RecordLists";
import { StylesRowEditor } from "@/features/profiles/components/StylesRowEditor";
import { updateTenantProfileAction } from "@/features/settings/server-actions/plans";
import type { StudioLinkTarget } from "./StudioLinksRow";

/** A STUDIO'S DANCE STYLES, EDITED WHERE A PERSON'S ARE (21 Sep 2026).
 *
 *  ⚠ THE ROW ITSELF IS `StylesRowEditor` SINCE 26 Sep 2026 — one component for
 *  a person, a business and a crew. What is this file's is the DOOR and the
 *  floor's words: `update_business_profile` refuses a studio with no style
 *  (19 Sep — "it is what Discover files it under"), so Remove is disabled on
 *  the last one with that reason on it. An ARTIST PAGE and an ORGANIZATION
 *  have no such floor, which is why the words are passed in rather than assumed.
 *
 *  ⚠ IT SENDS THE FIELDS IT IS NOT EDITING BACK UNCHANGED, exactly as the links
 *  row does and for the same reason: the RPC takes the whole profile — and the
 *  links come off the home's `RecordLists`, never off the prop, so a link saved
 *  a moment earlier is not written back over. */
export function StudioStylesRow({
  tenant,
  canEdit,
  isStudio,
  fallback = [],
}: {
  tenant: StudioLinkTarget;
  canEdit: boolean;
  isStudio: boolean;
  /** ⚠ WHAT IT TEACHES, OFF ITS PUBLISHED CLASSES — shown only while the FIELD
   *  is empty, which is the public page's own rule (19 Sep 2026): for the twelve
   *  studios that predate the field, without this their home would go from
   *  naming their styles to naming none, which reads as data lost. */
  fallback?: string[];
}) {
  const router = useRouter();
  const { lists } = useRecordLists();
  return (
    <StylesRowEditor
      canEdit={canEdit}
      aria={(s) => `${s} — a style this business teaches`}
      lastWords={isStudio ? "A studio says at least one dance style — it is what Discover files it under" : "Name at least one style"}
      fallback={fallback}
      save={async (next) => {
        const out = await updateTenantProfileAction({
          tenantId: tenant.id,
          styles: next,
          /* unchanged, and sent because the door takes the whole profile */
          socials: lists.socials,
          foundedYear: tenant.foundedYear,
          phone: tenant.phone,
          contactEmail: tenant.contactEmail,
          enquiryTypes: tenant.enquiryTypes,
          accepts: tenant.accepts,
        });
        if (!out.error) router.refresh();
        return out.error;
      }}
    />
  );
}
