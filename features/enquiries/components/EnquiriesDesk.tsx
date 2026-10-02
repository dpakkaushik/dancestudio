import { redirect } from "next/navigation";
import { EnquirySettings } from "@/features/enquiries/components/EnquirySettings";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { DOS_TINT } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActingAs } from "@/repositories/actingAs";
import { findMyLedCrews } from "@/repositories/crews";
import { findReceivedEnquiries, findReceivedEnquiriesForCrews, findSentEnquiries } from "@/repositories/enquiries";
import { findMyMemberships } from "@/repositories/businesses";
import { findMyArtistPlan } from "@/repositories/plans";
import { kindOf } from "@/types/profile";

const stampNowIso = (): string => new Date().toISOString();

/** ⚠⚠ THE ENQUIRIES DESK, FOR ONE PROFILE (moved out of `/enquiries` on
 *  2 Oct 2026, the user: *"enquiries tab on home and studio taking to user/
 *  artist enquiries. but should be seprate for both"*).
 *
 *  Measured before anything moved: the two LISTS were already separate — the
 *  person's desk read "Your profile" with their own sent enquiry, the studio's
 *  read "11ft down" with its own won one. What made them look like one desk was
 *  the ADDRESS: `/enquiries?as={studio}` lives outside the studio, so the top
 *  bar, the switcher's photo and the navbar all went back to being the PERSON's
 *  the moment the studio's tile was pressed. So a studio's desk is
 *  `/business/{id}/enquiries` and a crew's `/crews/{id}/manage/enquiries` — under
 *  the entity, where the chrome already knows it is in that studio or crew —
 *  and this component is the one body all three addresses draw. `/enquiries`
 *  keeps the person's desk and redirects an `?as=` to the entity's own address
 *  (Rule 14: the old link still lands).
 *
 *  ⚠ The reads are exactly the old page's — see the history it carried there. */
export async function EnquiriesDesk({ as }: { as: string | null }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const [memberships, plan, ledCrews, actingAs] = await Promise.all([
    findMyMemberships(supabase),
    findMyArtistPlan(supabase),
    findMyLedCrews(supabase).catch(() => []),
    resolveActingAs(supabase, as),
  ]);

  /* ⚠ an `as` that does not resolve to something this account runs is NOT
     quietly widened to the person's desk at an entity's address: it goes home */
  if (as && !actingAs) {
    redirect("/");
  }

  /* ONE PROFILE PER DESK (2 Oct 2026): unscoped is the PERSON's own — Received
     is their artist page's alone; scoped is that studio's or crew's, with no
     Sent side, because an enquiry is sent BY A PERSON (`guard_person_only`) */
  const scopedBusiness = actingAs && actingAs.kind !== "crew" ? actingAs.id : null;
  const scopedCrew = actingAs && actingAs.kind === "crew" ? actingAs.id : null;
  const scoped = Boolean(actingAs);
  const businessIds = scopedCrew
    ? []
    : scopedBusiness
      ? memberships.map((m) => m.business.id).filter((id) => id === scopedBusiness)
      : memberships.filter((m) => m.memberRole === "owner" && m.business.type === "artist_page").map((m) => m.business.id);
  const crewIds = scopedCrew ? ledCrews.map((c) => c.id).filter((id) => id === scopedCrew) : [];

  const [enquiriesToBusinesses, enquiriesToCrews, enquiriesOut] = await Promise.all([
    businessIds.length ? findReceivedEnquiries(supabase, businessIds) : Promise.resolve([]),
    crewIds.length ? findReceivedEnquiriesForCrews(supabase, crewIds) : Promise.resolve([]),
    scoped ? Promise.resolve([]) : findSentEnquiries(supabase, user.id),
  ]);

  const enquiriesIn = [...enquiriesToBusinesses, ...enquiriesToCrews].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const accent = DOS_TINT[kindOf(Boolean(plan?.active))];

  /* the settings are the OWNER's, and only a business has any; unscoped they
     are your own artist page's and nothing else's (27 Sep 2026) */
  const settingsFor = memberships
    .filter((m) => m.memberRole === "owner")
    .filter((m) => (scopedBusiness ? m.business.id === scopedBusiness : m.business.type === "artist_page"))
    .filter(() => !scopedCrew)
    .map((m) => m.business);

  return (
    <InboxScreen
      desk="enquiries"
      accent={accent}
      requestsIn={[]}
      requestsOut={[]}
      enquiriesIn={enquiriesIn}
      enquiriesOut={enquiriesOut}
      nowIso={stampNowIso()}
      deskSub={actingAs ? actingAs.name : "Your profile"}
      receivedOnly={scoped}
      settings={<EnquirySettings businesses={settingsFor} />}
    />
  );
}
