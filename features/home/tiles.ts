import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";
import type { Tile } from "@/features/home/components/tool-grid";
import type { MemberRole } from "@/repositories/businesses";

/** EVERY PROFILE'S TOOLS, AS DATA (12 Oct 2026).
 *
 *  The user: *"take the tools from the home section under the profile switcher
 *  from top right in one line for each tile … coming from right side now this
 *  entire section"*. The tools left the three homes for the drawer the profile
 *  picture opens, which lives in the CHROME — so the lists are built here, in a
 *  plain module the layout can call for every profile in the switcher, rather
 *  than inside the pages that used to draw them. The rules are the same ones the
 *  pages kept (R18, the 21 Sep owner/seat gates), moved, not rewritten. */

/** WHO A PERSON'S LIST IS FOR — a user, or an artist while the plan is live. */
export type HomeKind = "user" | "artist";

/** A PERSON'S TOOLS (R18, 18 Sep 2026, with the later additions recorded where
 *  `tilesFor` used to live in `home-kit`: Practice 29 Sep, Routines for a user
 *  20 Sep, Team for everybody 11 Oct, Memberships and Earnings for a user 21 Sep,
 *  Subscription last 26 Sep). An artist's Team, Students, Earnings and Assets open
 *  the artist page they OWN, or the hub where it is made. */
export const tilesFor = (kind: HomeKind, pageId: string | null): Tile[] => {
  const person: Tile[] = [
    { name: DOS_TOOLS.classes.name, href: "/my-classes", k: "classesmod", c: DOS_TOOLS.classes.c },
    { name: DOS_TOOLS.calendar.name, href: "/calendar", k: "calendar", c: DOS_TOOLS.calendar.c },
    { name: DOS_TOOLS.crews.name, href: "/crews", k: "crews", c: DOS_TOOLS.crews.c },
    { name: DOS_TOOLS.practice.name, href: "/practice", k: "practice", c: DOS_TOOLS.practice.c },
    { name: DOS_TOOLS.studios.name, href: "/business", k: "studios", c: DOS_TOOLS.studios.c },
    { name: DOS_TOOLS.routines.name, href: "/routines", k: "routines", c: DOS_TOOLS.routines.c },
  ];
  const subscription: Tile = { name: DOS_TOOLS.subscription.name, href: "/subscription", k: "subscription", c: DOS_TOOLS.subscription.c };
  if (kind !== "artist") {
    return [
      ...person,
      { name: DOS_TOOLS.team.name, href: "/team", k: "team", c: DOS_TOOLS.team.c },
      { name: DOS_TOOLS.memberships.name, href: "/memberships", k: "memberships", c: DOS_TOOLS.memberships.c },
      { name: DOS_TOOLS.earn.name, href: "/earnings", k: "earn", c: DOS_TOOLS.earn.c },
      subscription,
    ];
  }
  const desk = (path: string) => (pageId ? `/business/${pageId}/${path}` : "/business");
  return [
    ...person,
    { name: DOS_TOOLS.team.name, href: pageId ? desk("staff") : "/team", k: "team", c: DOS_TOOLS.team.c },
    { name: DOS_TOOLS.students.name, href: desk("students"), k: "students", c: DOS_TOOLS.students.c },
    { name: DOS_TOOLS.earn.name, href: desk("earnings"), k: "earn", c: DOS_TOOLS.earn.c },
    { name: DOS_TOOLS.memberships.name, href: "/memberships", k: "memberships", c: DOS_TOOLS.memberships.c },
    { name: DOS_TOOLS.assets.name, href: desk("assets"), k: "assets", c: DOS_TOOLS.assets.c },
    subscription,
  ];
};

/** A STUDIO'S TOOLS (R18), moved from its home's route: Earnings, Memberships,
 *  Assets and Subscription are the OWNER's; Students is not drawn for a seat that
 *  may not read them (21 Sep 2026). Only an owner or a manager reaches a studio's
 *  switcher row at all (R55), so the seat gates below are the owner/manager split. */
export const studioTilesFor = (businessId: string, memberRole: MemberRole): Tile[] => {
  const desk = (path: string) => `/business/${businessId}/${path}`;
  const isOwner = memberRole === "owner";
  return [
    { name: DOS_TOOLS.classes.name, href: desk("classes"), k: "classesmod", c: DOS_TOOLS.classes.c },
    { name: DOS_TOOLS.calendar.name, href: desk("calendar"), k: "calendar", c: DOS_TOOLS.calendar.c },
    { name: DOS_TOOLS.team.name, href: desk("staff"), k: "team", c: DOS_TOOLS.team.c },
    ...(memberRole === "visiting_faculty" || memberRole === "assistant"
      ? []
      : ([{ name: DOS_TOOLS.students.name, href: desk("students"), k: "students", c: DOS_TOOLS.students.c }] as Tile[])),
    ...(isOwner
      ? ([
          { name: DOS_TOOLS.earn.name, href: desk("earnings"), k: "earn", c: DOS_TOOLS.earn.c },
          { name: DOS_TOOLS.memberships.name, href: desk("memberships"), k: "memberships", c: DOS_TOOLS.memberships.c },
          { name: DOS_TOOLS.assets.name, href: desk("assets"), k: "assets", c: DOS_TOOLS.assets.c },
        ] as Tile[])
      : []),
    { name: DOS_TOOLS.rooms.name, href: desk("rooms"), k: "rooms", c: DOS_TOOLS.rooms.c },
    ...(isOwner ? [{ name: DOS_TOOLS.subscription.name, href: desk("subscription"), k: "subscription", c: DOS_TOOLS.subscription.c } as Tile] : []),
  ];
};

/** A CREW'S TOOLS — the leader's three desks (moved from `CrewHome`). */
export const crewTilesFor = (crewId: string): Tile[] => [
  { name: DOS_TOOLS.team.name, href: `/crews/${crewId}/manage/team`, k: "team", c: DOS_TOOLS.team.c },
  { name: DOS_TOOLS.practice.name, href: `/crews/${crewId}/manage/practice`, k: "practice", c: DOS_TOOLS.practice.c },
  { name: DOS_TOOLS.calendar.name, href: `/crews/${crewId}/manage/calendar`, k: "calendar", c: DOS_TOOLS.calendar.c },
];
