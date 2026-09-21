import type { ReactNode } from "react";
import { AppChrome, type ChromeSettings, type SwitcherItem } from "@/features/shell/components/AppChrome";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { amIPlatformAdmin } from "@/repositories/admin";
import { findMyLedCrews } from "@/repositories/crews";
import { findMyGst } from "@/repositories/gst";
import { findMyUnreadCount } from "@/repositories/notifications";
import { findMyArtistPlan } from "@/repositories/plans";
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
 *  THE EYE LEFT THE BAR (19 Sep 2026, the user: "remove profile tab from navbar
 *  … give an eye to view profile on the home tab below edit on top right").
 *  From 15 Sep it was the bar's fourth slot, computed here; it is Home's own
 *  corner control now (`app/(app)/page.tsx`), so the layout no longer works
 *  out where it goes.
 *
 *  THE SWITCHER (18 Sep 2026, the user: "DanceOS icon on top left should give a
 *  drop down for profile switcher which takes to different profiles managed by
 *  that specific user"). One set of reads lists the homes: the account's own,
 *  every studio it is on the team of, and every crew it leads. The chrome draws
 *  the list; nothing here is a session switch — each row is a route to a page
 *  the account already owns. EVERY ROW'S SUB-LINE IS ITS KIND (19 Sep 2026, the
 *  user: "right profile user type in profile switcher should only be
 *  Organization, Studio, Crew, Artist, User") — the account's own row reads
 *  User, Artist (a live plan) or Organization; a studio row reads Studio; a
 *  crew row reads Crew. Not the seat, not "your profile".
 *
 *  ONE ROUND TRIP (19 Sep 2026, "make app snappier"): the profile, the bell, the
 *  memberships, the crews and the plan all need only the user id, so they are
 *  read together; the admin check runs only when there is no profile. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [profile, unread, memberships, ledCrews, plan, isAdmin] = await Promise.all([
    user ? findProfileById(supabase, user.id) : Promise.resolve(null),
    user ? findMyUnreadCount(supabase).catch(() => 0) : Promise.resolve(0),
    user ? findMyMemberships(supabase).catch(() => []) : Promise.resolve([]),
    /* an organization leads no crew (guard_person_only) — an empty answer costs nothing */
    user ? findMyLedCrews(supabase).catch(() => []) : Promise.resolve([]),
    user ? findMyArtistPlan(supabase).catch(() => null) : Promise.resolve(null),
    /* ⚠ ASKED ON EVERY PAGE NOW (21 Sep 2026), where it used to be asked only
       when there was no profile. Settings carries the Admin panel tile and
       Settings is in the chrome, so the answer is needed wherever the gear is —
       which is everywhere. It rides this batch, so it costs no extra round
       trip, and `is_platform_admin()` is a definer test on one indexed row. */
    user ? amIPlatformAdmin(supabase).catch(() => false) : Promise.resolve(false),
  ]);
  /* a platform admin with no profile is ADMIN ONLY (9 Sep 2026): the chrome draws
     no tab bar and no bell for it — every tab needs a profile, and the queue is
     its whole app. */
  const adminOnly = Boolean(user) && !profile && isAdmin;
  /* the GST tile's badge, and ONLY an organization has one to read (11 Sep 2026)
     — a person pays nothing for this line */
  const gst = profile?.role === "org" ? await findMyGst(supabase, profile.id).catch(() => ({ gstin: null, verifiedAt: null })) : null;

  const switcher: SwitcherItem[] = [];
  if (profile) {
    const mine = profile.role === "org" ? "Organization" : plan?.active ? "Artist" : "User";
    switcher.push({ key: "me", href: "/", label: profile.fullName, sub: mine, kind: "me" });
    for (const m of memberships) {
      if (m.tenant.type !== "studio") continue;
      switcher.push({ key: m.tenant.id, href: `/business/${m.tenant.id}`, label: m.tenant.name, sub: "Studio", kind: "studio" });
    }
    for (const c of ledCrews) {
      switcher.push({ key: c.id, href: `/crews/${c.id}/manage`, label: c.name, sub: "Crew", kind: "crew" });
    }
  }

  /* ⚠⚠ WHAT THE GEAR OPENS, FOR THE PROFILE YOU ARE IN (21 Sep 2026, the user:
     "settings are seprate for each profile type according to which profile you
     are in"). The sheet used to be rendered by `MyProfilePage` alone, so it was
     structurally incapable of being about anything but that person; the chrome
     renders it now and picks the subject from the pathname.
     ⚠ `ownBusiness` is the artist page this account OWNS — not `businesses[0]`
     (the first business it is on the TEAM of, which pointed Settings' money at
     somebody else's studio and was fixed this morning), and not `owned[0]`
     either: an organization owns its studios AND its hosting row, so that was
     an arbitrary pick between two different answers. An organization's own
     money IS the account's — `/invoices` lists what IT paid — and each studio's
     money is in that studio's own Settings, which is the whole of ask 2. */
  const settings: ChromeSettings | null = profile
    ? {
        profile,
        role: profile.role,
        plan,
        isAdmin,
        gstVerified: Boolean(gst?.verifiedAt),
        ownBusiness: memberships.find((m) => m.memberRole === "owner" && m.tenant.type === "artist_page")?.tenant ?? null,
        studios: memberships.filter((m) => m.tenant.type === "studio").map((m) => m.tenant),
      }
    : null;

  return (
    <AppChrome unread={adminOnly ? 0 : unread} adminOnly={adminOnly} switcher={switcher} settings={settings}>
      {children}
    </AppChrome>
  );
}
