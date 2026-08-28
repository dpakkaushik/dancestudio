import { redirect } from "next/navigation";
import { MyProfilePage } from "@/features/profiles/components/MyProfilePage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyFollowedPeople, findMyFollowing, findMyPersonFollowers } from "@/repositories/follows";
import { findMyNotificationPrefs } from "@/repositories/notifications";
import { findPublicPerson } from "@/repositories/publicPerson";
import { findMyPlace } from "@/repositories/stats";
import { findMyTenants } from "@/repositories/tenants";

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
  const [followers, followingPeople, followingTenants, place, tenants, prefs] = await Promise.all([
    findMyPersonFollowers(supabase),
    findMyFollowedPeople(supabase),
    findMyFollowing(supabase),
    /* where you stand — a studio OWNER has no people board (the prototype hides the rank on a studio, 10719) */
    role === "studio" ? Promise.resolve(null) : findMyPlace(supabase, role === "trainer" ? "artist" : "dancer"),
    findMyTenants(supabase),
    findMyNotificationPrefs(supabase),
  ]);
  /* Schedule goes to the public schedule of the business this person runs —
     a trainer's own (prototype `hasSchedule` = mode === "trainer", 10868); with
     none, the button is not drawn rather than pointing nowhere */
  const biz = tenants.find((t) => t.type === "trainer_business") ?? tenants[0];
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
      businessId={biz?.id ?? null}
    />
  );
}
