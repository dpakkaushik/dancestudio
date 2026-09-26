import { redirect } from "next/navigation";
import { ClassForm } from "@/features/classes/components/ClassForm";
import { ClassesManager } from "@/features/classes/components/ClassesManager";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findClassArtists } from "@/repositories/claims";
import { findClassPublishState, findClassesByTenant, findWhyNoClass } from "@/repositories/classes";
import { countEnrolledBySession } from "@/repositories/enrollments";
import { findRoomsByTenant } from "@/repositories/rooms";
import { findMyMembershipRole, findMyTenants } from "@/repositories/tenants";

/* the clock lives outside the component (react-hooks/purity) — the register's
   LIVE filter is arithmetic over the moment the page was served */
const stampNowIso = (): string => new Date().toISOString();

/** A STUDIO's classes register. Since 18 Sep 2026 every row wears the request
 *  it waits on — the teacher asked and their answer — and Publish is offered
 *  only once the database would accept it. An ARTIST's register is not a page
 *  of its own any more: it is the Manage segment of Your classes (the user:
 *  "Manage class should not take to a separate page for artist"), so an artist
 *  page's address lands there (Rule 14). */
export default async function TenantClassesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { tenantId } = await params;
  const opening = (await searchParams).new === "1";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // membership check: RLS only returns businesses the user belongs to
  const businesses = await findMyTenants(supabase);
  const tenant = businesses.find((t) => t.id === tenantId);
  if (!tenant) {
    redirect("/business");
  }
  /* an organization's hosting row (R15) runs events, never classes (17 Sep 2026) */
  if (tenant.type === "org") {
    redirect(`/business/${tenantId}/events`);
  }
  if (tenant.type === "artist_page") {
    redirect("/my-classes?show=manage");
  }

  /* ⚠ creating a class is the OWNER's since 18 Sep 2026 — `whyNoClass` asks
     whether this BUSINESS may carry one, never whether YOU may make one, so the
     seat has to be read separately or every member gets a refused button */
  const myRole = await findMyMembershipRole(supabase, tenantId);
  const classes = await findClassesByTenant(supabase, tenantId);
  const sessionIds = classes.map((c) => c.session?.id).filter(Boolean) as string[];
  const [counts, state, artists, whyNoClass] = await Promise.all([
    countEnrolledBySession(supabase, sessionIds),
    findClassPublishState(supabase, tenantId).catch(() => new Map()),
    /* the teacher each row's card wears in its centre (18 Sep 2026) — a draft
       whose ask is unanswered has none, and falls back to the style square */
    findClassArtists(supabase, classes.map((c) => c.id)),
    /* the database's sentence, if a new class would be refused here (18 Sep 2026) */
    findWhyNoClass(supabase, tenantId),
  ]);
  /* ⚠ ADD CLASS OPENS OVER THIS REGISTER (22 Sep 2026, the user: "all forms and
     add buttons … should open form like how setting page or edit profile page
     open from the same screen", then "from inside their respective sections").
     The ROOMS the form offers are read only when the form is asked for — `?new=1`
     — so the register costs exactly what it did before on every other visit, and
     the owner-only rule is re-checked here because a query param is a thing
     anybody can type. `/business/{id}/classes/new` still renders it full-page. */
  const rooms = opening && myRole === "owner" && !whyNoClass ? await findRoomsByTenant(supabase, tenantId).catch(() => []) : [];
  return (
    <>
      <ClassesManager
        tenantId={tenantId}
        classes={classes}
        filledBySession={Object.fromEntries(counts)}
        artists={Object.fromEntries(artists)}
        publishState={Object.fromEntries(state)}
        whyNoClass={whyNoClass}
        canCreate={myRole === "owner"}
        nowIso={stampNowIso()}
      />
      {opening && myRole === "owner" && !whyNoClass ? (
        <ClassForm
          tenantId={tenantId}
          tenantType={tenant.type}
          rooms={rooms}
          isOwner
          /* the owner may take their own class (26 Sep 2026) — this branch is owner-only */
          meId={user.id}
          studioPlace={[tenant.area, tenant.city].filter(Boolean).join(", ")}
          sheet
        />
      ) : null}
    </>
  );
}
