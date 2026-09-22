import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EntityStatsPage, type Standing } from "@/features/stats/components/EntityStatsPage";
import { OwnStatsScreen, type StatsQuery } from "@/features/stats/components/OwnStatsScreen";
import { ROLE_RING } from "@/features/profiles/components/profile-kit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyArtistPlan } from "@/repositories/plans";
import { findProfileById } from "@/repositories/profiles";
import { findPublicPerson } from "@/repositories/publicPerson";
import { findEntityChartRow } from "@/repositories/stats";
import { KIND_WORD, kindOf } from "@/types/profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Stats — DanceOS" };

/** /person/{id}/stats — this person's record and where they stand (push 2,
 *  19 Sep 2026). The same door the person page has: a signed-in reader gets
 *  anybody's; a stranger gets a public ARTIST's and is sent to sign in for a
 *  plain user's (`findPublicPerson` and `entity_chart_row` draw the same line).
 *  An organization's standing is its studios' — its own address.
 *
 *  ⚠⚠ AND WHEN THE SUBJECT IS YOU, THIS IS YOUR OWN RECORD (22 Sep 2026) — the
 *  C40 merge, one page further on. `/stats` and `/person/{me}/stats` were two
 *  addresses for one person's stats drawing two DIFFERENT screens, so typing
 *  your own id handed you the version built for a stranger to read: no History
 *  library, no boards, no "the numbers" opening into the lists behind them.
 *  `/stats` is a redirect here now, carrying its whole query.
 *
 *  ⚠ THE OWNER BRANCH SITS ABOVE `findPublicPerson`, AND THAT ORDERING IS
 *  LOAD-BEARING — the same line `/org/{id}` has carried since C40. That read
 *  answers for a PUBLIC artist and for a signed-in reader of any profile; below
 *  it, anything that ever narrows it would meet a plain user at `notFound()` on
 *  their OWN stats, which is the worst place to meet a visibility rule. */
export default async function PersonStatsPage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<StatsQuery> }) {
  const { userId } = await params;
  if (!UUID_RE.test(userId)) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && user.id === userId) {
    const [profile, plan] = await Promise.all([findProfileById(supabase, userId), findMyArtistPlan(supabase)]);
    if (!profile) {
      redirect("/onboarding");
    }
    /* an organization dances nothing and teaches nothing, so its standing is its
       studios' — one address per subject, and that subject's is /org/{id}/stats */
    if (profile.role === "org") {
      redirect(`/org/${userId}/stats`);
    }
    return <OwnStatsScreen userId={userId} name={profile.fullName} isArtist={Boolean(plan?.active)} query={await searchParams} basePath={`/person/${userId}/stats`} />;
  }

  const person = await findPublicPerson(supabase, userId);
  if (!person) {
    if (!user) {
      redirect(`/login?next=${encodeURIComponent(`/person/${userId}/stats`)}`);
    }
    notFound();
  }
  if (person.profile.role === "org") {
    redirect(`/org/${userId}/stats`);
  }
  const kind = kindOf(person.profile.role, person.isArtist);
  const segment = kind === "artist" ? "artist" : "dancer";
  const city = person.profile.city;
  const [everywhere, inCity] = await Promise.all([
    findEntityChartRow(supabase, { segment, id: userId }),
    city ? findEntityChartRow(supabase, { segment, id: userId, city }) : Promise.resolve(null),
  ]);
  const standings: Standing[] = [{ scope: "Everywhere", row: everywhere }, ...(city ? [{ scope: `In ${city}`, row: inCity }] : [])];
  return <EntityStatsPage name={person.profile.fullName} eyebrow={KIND_WORD[kind]} segment={segment} accent={ROLE_RING[kind][1]} backHref={`/person/${userId}`} standings={standings} stats={person.stats} />;
}
