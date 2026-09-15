import type { ReactNode } from "react";
import { AppChrome } from "@/features/shell/components/AppChrome";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { amIPlatformAdmin } from "@/repositories/admin";
import { findMyUnreadCount } from "@/repositories/notifications";
import { findProfileById } from "@/repositories/profiles";
import { findMyMemberships } from "@/repositories/tenants";

/** Every signed-in surface lives in this group and wears the app chrome (top bar +
 *  tab bar). Auth screens (/login, /onboarding, /auth) stay outside it.
 *
 *  The bell's badge is counted here, once per render of the group, so every route
 *  under it carries the same number without asking for it (Step 24). A failed
 *  count is zero, never an error page — the bell is decoration on somebody's
 *  actual work.
 *
 *  THE EYE (15 Sep 2026, the user: "remove the profile [tab] and make an eye
 *  icon which will show the profile view — what a user will see when he clicks
 *  over a studio or artist"). Where that page IS depends on who is signed in,
 *  so the layout works it out once per render and the chrome only draws it:
 *  an organization's is its first studio's public page (an organization has
 *  none of its own — R9), an artist's is their artist page, a user's is their
 *  person page. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  /* a platform admin with no profile is ADMIN ONLY (9 Sep 2026): the chrome draws
     no tab bar and no bell for it — every tab needs a profile, and the queue is
     its whole app. One profile read per render; the admin check only when the
     row is missing. */
  const profile = user ? await findProfileById(supabase, user.id) : null;
  const adminOnly = Boolean(user) && !profile && (await amIPlatformAdmin(supabase));
  const [unread, memberships] = await Promise.all([
    adminOnly ? Promise.resolve(0) : findMyUnreadCount(supabase),
    profile ? findMyMemberships(supabase).catch(() => []) : Promise.resolve([]),
  ]);

  let publicViewHref: string | null = null;
  if (profile) {
    const owned = memberships.filter((m) => m.memberRole === "owner").map((m) => m.tenant);
    if (profile.role === "org") {
      const studio = owned.find((t) => t.type === "studio");
      /* no studio yet: the hub is where one is made, and the honest place to land */
      publicViewHref = studio ? `/studio/${studio.id}` : "/business";
    } else {
      const artistPage = owned.find((t) => t.type === "trainer_business");
      publicViewHref = artistPage ? `/artist/${artistPage.id}` : `/person/${profile.id}`;
    }
  }

  return (
    <AppChrome unread={unread} adminOnly={adminOnly} publicViewHref={publicViewHref}>
      {children}
    </AppChrome>
  );
}
