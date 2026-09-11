import { redirect } from "next/navigation";
import { MyProfilePage } from "@/features/profiles/components/MyProfilePage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyFollowedPeople, findMyFollowing, findMyPersonFollowers } from "@/repositories/follows";
import { findMyNotificationPrefs } from "@/repositories/notifications";
import { findPublicPerson } from "@/repositories/publicPerson";
import { findMyArtistPlan } from "@/repositories/plans";
import { findMyPlace } from "@/repositories/stats";
import { findMyTenants } from "@/repositories/tenants";
import { amIPlatformAdmin } from "@/repositories/admin";
import { findMyGst } from "@/repositories/gst";

/** The Profile tab — prototype S_profiletab's own render, lifted in
 *  `MyProfilePage`, with the Settings sheet behind the chrome's gear
 *  (`?settings=1`, prototype 19263). Everything on it is a row this app keeps:
 *  the profile with its fields, the person's followers and the people and
 *  businesses they follow, their place on the board their role belongs to, what
 *  reaches them, and the same crews / teaches-at / runs groups the person page
 *  draws. */
export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const person = await findPublicPerson(supabase, user.id);
  if (!person) {
    redirect("/onboarding");
  }
  const role = person.profile.role;
  const [followers, followingPeople, followingTenants, tenants, prefs, plan, isAdmin, gst] = await Promise.all([
    findMyPersonFollowers(supabase),
    findMyFollowedPeople(supabase),
    findMyFollowing(supabase),
    findMyTenants(supabase),
    findMyNotificationPrefs(supabase),
    findMyArtistPlan(supabase),
    amIPlatformAdmin(supabase),
    /* the Settings sheet's GST row says verified or not (11 Sep 2026); only an
       organization has the row, so only an organization is asked about it */
    role === "org" ? findMyGst(supabase, person.profile.id) : Promise.resolve({ gstin: null, verifiedAt: null }),
  ]);
  /* where you stand — an ORGANIZATION has no people board (the prototype hides the
     rank on a studio, 10719); a person stands on the artists' board while the plan is live */
  const place = role === "org" ? null : await findMyPlace(supabase, plan?.active ? "artist" : "dancer");
  /* Schedule goes to the public schedule of the business this person runs —
     a trainer's own (prototype `hasSchedule` = mode === "trainer", 10868); with
     none, the button is not drawn rather than pointing nowhere */
  /* R15 (9 Sep 2026): an organization's event-hosting row is a tenant but not
     one of its BUSINESSES — it is unlisted for ever, has no rooms and no public
     page. It is filtered out here so "Your studios" counts studios and the
     Schedule button never points at a page that does not exist. */
  const businesses = tenants.filter((t) => t.type !== "org");
  const biz = businesses.find((t) => t.type === "trainer_business") ?? businesses[0];
  const scheduleHref = biz ? `/${biz.type === "studio" ? "studio" : "artist"}/${biz.id}/schedule` : null;

  return (
    <MyProfilePage
      person={person}
      followers={followers}
      followingPeople={followingPeople}
      followingTenants={followingTenants}
      place={place ? { place: place.place, population: place.population } : null}
      scheduleHref={scheduleHref}
      prefs={prefs}
      business={biz ?? null}
      tenants={businesses}
      plan={plan}
      isAdmin={isAdmin}
      gstVerified={Boolean(gst.verifiedAt)}
    />
  );
}
