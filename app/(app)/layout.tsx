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
 *  THE EYE LEFT THE BAR (19 Sep 2026, the user: "remove profile tab from navbar
 *  … give an eye to view profile on the home tab below edit on top right").
 *  From 15 Sep it was the bar's fourth slot, computed here; it is Home's own
 *  corner control now (`app/(app)/page.tsx`), so the layout no longer works
 *  out where it goes.
 *
 *  THE SWITCHER (18 Sep 2026, the user: "DanceOS icon on top left should give a
 *  drop down for profile switcher which takes to different profiles managed by
 *  that specific user"). One set of reads lists the homes: the account's own,
 *  every studio it is on the team of (with its seat named), and every crew it
 *  leads. The chrome draws the list; nothing here is a session switch — each
 *  row is a route to a page the account already owns. */
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

  const switcher: SwitcherItem[] = [];
  if (profile) {
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
    <AppChrome unread={unread} adminOnly={adminOnly} switcher={switcher}>
      {children}
    </AppChrome>
  );
}
