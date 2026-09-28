import type { ReactNode } from "react";
import { AppChrome, type ChromeSettings, type SwitcherItem } from "@/features/shell/components/AppChrome";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { amIPlatformAdmin } from "@/repositories/admin";
import { findMyLedCrews } from "@/repositories/crews";
import { findMyUnreadCount } from "@/repositories/notifications";
import { findMyArtistPlan } from "@/repositories/plans";
import { findProfileById } from "@/repositories/profiles";
import { findMyMemberships, runsTheBusiness } from "@/repositories/tenants";

/** Every signed-in surface lives in this group and wears the app chrome (top bar +
 *  tab bar). Auth screens (/login, /onboarding, /auth) stay outside it.
 *
 *  The bell's badge is counted here, once per render of the group, so every route
 *  under it carries the same number without asking for it (Step 24). A failed
 *  count is zero, never an error page — the bell is decoration on somebody's
 *  actual work.
 *
 *  THE SWITCHER (18 Sep 2026, the user: "DanceOS icon on top left should give a
 *  drop down for profile switcher which takes to different profiles managed by
 *  that specific user"). One set of reads lists the homes: the account's own,
 *  every studio it is on the team of, every ORGANIZATION it is on the team of
 *  (26 Sep 2026, the user: "organization can also be added in the profile
 *  switcher"), and every crew it leads. The chrome draws the list; nothing here
 *  is a session switch — each row is a route to a page the account already
 *  owns. EVERY ROW'S SUB-LINE IS ITS KIND (19 Sep 2026): the account's own row
 *  reads User or Artist (a live plan); a studio row Studio; an organization row
 *  Organization; a crew row Crew. ⚠ "Organization" is no longer something the
 *  ACCOUNT can be — that login is retired — it is a business the account owns.
 *
 *  ONE ROUND TRIP (19 Sep 2026, "make app snappier"): the profile, the bell, the
 *  memberships, the crews, the plan and the admin check all need only the user
 *  id, so they are read together. ⚠ `findMyGst` LEFT THIS BATCH on 26 Sep 2026
 *  with the login it read for: a GST number is a business row's now, and the
 *  organization's Settings reads it off the same `Tenant` every other tile uses. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [profile, unread, memberships, ledCrews, plan, isAdmin] = await Promise.all([
    user ? findProfileById(supabase, user.id) : Promise.resolve(null),
    user ? findMyUnreadCount(supabase).catch(() => 0) : Promise.resolve(0),
    user ? findMyMemberships(supabase).catch(() => []) : Promise.resolve([]),
    user ? findMyLedCrews(supabase).catch(() => []) : Promise.resolve([]),
    user ? findMyArtistPlan(supabase).catch(() => null) : Promise.resolve(null),
    /* ⚠ ASKED ON EVERY PAGE (21 Sep 2026): Settings carries the Admin panel tile
       and Settings is in the chrome, so the answer is needed wherever the gear
       is. It rides this batch, so it costs no extra round trip. */
    user ? amIPlatformAdmin(supabase).catch(() => false) : Promise.resolve(false),
  ]);
  /* a platform admin with no profile is ADMIN ONLY (9 Sep 2026): the chrome draws
     no tab bar and no bell for it — every tab needs a profile, and the queue is
     its whole app. */
  const adminOnly = Boolean(user) && !profile && isAdmin;

  /** ⚠⚠ ONLY AN OWNER OR A MANAGER MAY ACT AS A BUSINESS (28 Sep 2026, the user:
   *  "only these 2 get the right to get studio or organization in the profile
   *  switcher. that profile switcher and rights should never be given for
   *  faculty, visiting faculty, assistant, event team or other team members").
   *
   *  This list was every business the account held ANY seat on — so a visiting
   *  teacher who accepted a single class could switch INTO the studio and land on
   *  its home, with its Team desk, its Students desk, its Rooms editor and its
   *  Media one tap away. The switcher is what grants that identity, so this is
   *  where the rule belongs. Measured before it was changed: 22 owner seats and
   *  11 non-owner seats held by 7 people, every one of them on a studio.
   *
   *  ⚠ WHAT FACULTY KEEP, because it is not nothing: their own classes at
   *  `/my-classes` (with the Manage register since 28 Sep), the class page's
   *  Attendance tab and its register, and their earnings. What they lose is the
   *  BUSINESS — its home and the desks under it. `MEMBER_POWER_NOTE` was rewritten
   *  in the same breath, so the app no longer promises a trainer "sees its
   *  students" when it no longer gives them a door to it. */
  const runsA = memberships.filter((m) => runsTheBusiness(m.memberRole));

  const switcher: SwitcherItem[] = [];
  if (profile) {
    switcher.push({ key: "me", href: "/", label: profile.fullName, sub: plan?.active ? "Artist" : "User", kind: "me" });
    for (const m of runsA) {
      if (m.tenant.type === "studio") {
        switcher.push({ key: m.tenant.id, href: `/business/${m.tenant.id}`, label: m.tenant.name, sub: "Studio", kind: "studio" });
      } else if (m.tenant.type === "org") {
        /* an organization is run from here too (26 Sep 2026) — its home, like a studio's */
        switcher.push({ key: m.tenant.id, href: `/business/${m.tenant.id}`, label: m.tenant.name, sub: "Organization", kind: "org" });
      }
    }
    for (const c of ledCrews) {
      switcher.push({ key: c.id, href: `/crews/${c.id}/manage`, label: c.name, sub: "Crew", kind: "crew" });
    }
  }

  /* ⚠⚠ WHAT THE GEAR OPENS, FOR THE PROFILE YOU ARE IN (21 Sep 2026, the user:
     "settings are seprate for each profile type according to which profile you
     are in"). The chrome renders the sheet and picks the subject from the
     pathname; `businesses` carries every studio AND organization this account
     is on the team of, so the sheet can be THAT one's while you are inside it.
     ⚠ `ownBusiness` is the artist page this account OWNS — never a business it
     is merely on the team of, and never an arbitrary pick among the ones it
     owns. */
  const settings: ChromeSettings | null = profile
    ? {
        profile,
        role: profile.role,
        plan,
        isAdmin,
        ownBusiness: memberships.find((m) => m.memberRole === "owner" && m.tenant.type === "artist_page")?.tenant ?? null,
        /* ⚠ THE SAME RULE AS THE SWITCHER, and it has to be: the Settings sheet's
           subject is `hereItem`, which is what the switcher marks HERE (C53). A
           business the switcher no longer names could never be the subject, so a
           wider list here would only be a list nothing can reach — and the THIS
           STUDIO block it feeds carries Verification, the Subscription and the
           money desks, which are the last things a visiting teacher should meet. */
        businesses: runsA.filter((m) => m.tenant.type === "studio" || m.tenant.type === "org").map((m) => m.tenant),
      }
    : null;

  return (
    <AppChrome unread={adminOnly ? 0 : unread} adminOnly={adminOnly} switcher={switcher} settings={settings}>
      {children}
    </AppChrome>
  );
}
