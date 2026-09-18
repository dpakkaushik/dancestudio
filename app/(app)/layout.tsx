import type { ReactNode } from "react";
import { AppChrome, type SwitcherItem } from "@/features/shell/components/AppChrome";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { amIPlatformAdmin } from "@/repositories/admin";
import { findMyLedCrews } from "@/repositories/crews";
import { findMyUnreadCount } from "@/repositories/notifications";
import { findProfileById } from "@/repositories/profiles";
import { findMyMemberships } from "@/repositories/tenants";
import { MEMBER_ROLE_WORD } from "@/types/staff";

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
 *  person page.
 *
 *  THE SWITCHER (18 Sep 2026, the user: "DanceOS icon on top left should give a
 *  drop down for profile switcher which takes to different profiles managed by
 *  that specific user"). The same reads that place the eye also list the homes:
 *  the account's own, every studio it is on the team of (with its seat named),
 *  and every crew it leads. The chrome draws the list; nothing here is a
 *  session switch — each row is a route to a page the account already owns. */
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
  const [unread, memberships, ledCrews] = await Promise.all([
    adminOnly ? Promise.resolve(0) : findMyUnreadCount(supabase),
    profile ? findMyMemberships(supabase).catch(() => []) : Promise.resolve([]),
    /* an organization leads no crew (guard_person_only), so it is not asked */
    profile && profile.role !== "org" ? findMyLedCrews(supabase).catch(() => []) : Promise.resolve([]),
  ]);

  let publicViewHref: string | null = null;
  const switcher: SwitcherItem[] = [];
  if (profile) {
    const owned = memberships.filter((m) => m.memberRole === "owner").map((m) => m.tenant);
    if (profile.role === "org") {
      const studio = owned.find((t) => t.type === "studio");
      /* no studio yet: the hub is where one is made, and the honest place to land */
      publicViewHref = studio ? `/studio/${studio.id}` : "/business";
    } else {
      const artistPage = owned.find((t) => t.type === "artist_page");
      publicViewHref = artistPage ? `/artist/${artistPage.id}` : `/person/${profile.id}`;
    }
    switcher.push({ key: "me", href: "/", label: profile.fullName, sub: profile.role === "org" ? "Organization" : "Your profile", kind: "me" });
    for (const m of memberships) {
      if (m.tenant.type !== "studio") continue;
      switcher.push({ key: m.tenant.id, href: `/business/${m.tenant.id}`, label: m.tenant.name, sub: MEMBER_ROLE_WORD[m.memberRole], kind: "studio" });
    }
    for (const c of ledCrews) {
      switcher.push({ key: c.id, href: `/crews/${c.id}/manage`, label: c.name, sub: "Crew you lead", kind: "crew" });
    }
  }

  return (
    <AppChrome unread={unread} adminOnly={adminOnly} publicViewHref={publicViewHref} switcher={switcher}>
      {children}
    </AppChrome>
  );
}
