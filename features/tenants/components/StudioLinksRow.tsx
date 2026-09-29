"use client";

import { useRouter } from "next/navigation";
import { updateTenantProfileAction } from "@/features/settings/server-actions/plans";
import { LinksRowEditor } from "@/features/profiles/components/LinksRowEditor";
import { useRecordLists } from "@/features/profiles/components/RecordLists";
import type { SocialLink } from "@/types/profile";
import type { BusinessType } from "@/types/tenant";

/** A STUDIO'S LINKS, EDITED WHERE A PERSON'S ARE (20 Sep 2026, the user: "edit
 *  profile for studio not consistent with how its done for Artist and users. for
 *  social media links, photos etc.").
 *
 *  ⚠ THE ROW ITSELF IS `LinksRowEditor` SINCE 26 Sep 2026 — one component for a
 *  person, a business and a crew. What is this file's is the DOOR:
 *  `update_business_profile`, which re-checks ownership inside and refuses
 *  anything that is not an http(s) address.
 *
 *  ⚠ IT SENDS THE FIELDS IT IS NOT EDITING BACK UNCHANGED. The RPC takes the
 *  whole profile, so a save that omitted the styles would empty them — and a
 *  studio with no style is refused outright (19 Sep). Everything but `socials`
 *  rides through exactly as it came in.
 *
 *  ⚠ AND IT IS THE OWNER'S. A trainer may read the row and is offered no ＋:
 *  `update_business_profile` refuses them, and a control that exists only to be
 *  refused is noise. */
/** ⚠ EXACTLY THE FIELDS IT SENDS, AND NOT `PublicBusiness` (20 Sep 2026). The row
 *  is drawn for the whole team off the studio's own `Business` and edited by the
 *  owner; naming the wider type would have meant a cast at the call site, and a
 *  cast is how a missing field becomes a runtime `undefined` that wipes a column
 *  the RPC then refuses. This is the contract, so the compiler checks it. */
export interface StudioLinkTarget {
  id: string;
  /** ⚠ WHAT KIND OF BUSINESS (27 Sep 2026) — not sent by the links row, but the
   *  contact editor shares this contract and the ENQUIRY KINDS it now offers are
   *  decided by the type (`enquiryTypesFor`). Added here rather than casting at
   *  the call site, for the reason the note above gives. */
  type: BusinessType;
  socials: SocialLink[];
  styles: string[];
  foundedYear: number | null;
  phone: string | null;
  contactEmail: string | null;
  enquiryTypes: string[] | null;
  accepts: { upi: boolean; cards: boolean; cash: boolean; bank: boolean };
}

export function StudioLinksRow({ business, canEdit }: { business: StudioLinkTarget; canEdit: boolean }) {
  const router = useRouter();
  const { lists } = useRecordLists();
  return (
    <LinksRowEditor
      canEdit={canEdit}
      save={async (next) => {
        const out = await updateTenantProfileAction({
          businessId: business.id,
          socials: next,
          /* unchanged, and sent because the door takes the whole profile — off
             the home's lists, never the prop (the 26 Sep e2e find) */
          styles: lists.styles,
          foundedYear: business.foundedYear,
          phone: business.phone,
          contactEmail: business.contactEmail,
          enquiryTypes: business.enquiryTypes,
          accepts: business.accepts,
        });
        if (!out.error) router.refresh();
        return out.error;
      }}
    />
  );
}
