/** CARD OR LIST, CHOSEN PER TOOL (12 Oct 2026, the user: *"for all tools pages
 *  apart from subscription, earnings, calendar, since they all are using cards
 *  give options to switch between card and list view for all. give option to save
 *  their choice of view individually for each tool."*).
 *
 *  ⚠ ONE SWITCH, ONE PLACE, NO PER-PAGE WIRING. The chrome knows the pathname, so
 *  it knows which tool a page is; it draws the switch in the top bar and stamps
 *  `data-dos-view="list"` on `#dos-main`. Every card on those pages is either the
 *  shared `ToolCard` or `ClassTile`, and both carry `data-tc` marks the global
 *  stylesheet reads — so a list is the SAME card with its figures and its second
 *  band folded away, never a second component that could drift from the first.
 *
 *  ⚠ STORED ON THE ACCOUNT, NOT THE DEVICE — `profiles.layout` under
 *  `view:{tool}`, through the same `set_my_layout` door the tool order uses. A key
 *  `view:` matches the CHECK's `^[a-z][a-z0-9_:-]{0,79}$` and `["list"]` its
 *  value shape, so no migration. Cards are the default and FORGET the key. A tool
 *  is the same tool on every profile (a studio's Team and a person's Team share
 *  one choice), which is what "for each tool" says. */

export const VIEW_TOOLS = ["classes", "crews", "practice", "studios", "routines", "team", "memberships", "students", "assets", "rooms"] as const;
export type ViewTool = (typeof VIEW_TOOLS)[number];
export type ViewMode = "card" | "list";

export const viewKey = (tool: ViewTool) => `view:${tool}`;

const BUSINESS_DESK: Record<string, ViewTool> = {
  classes: "classes",
  staff: "team",
  students: "students",
  memberships: "memberships",
  assets: "assets",
  rooms: "rooms",
};

/** which tool a page IS — null for every page that is not a tool's list
 *  (Subscription, Earnings and Calendar are left out by the user's own words) */
export function viewToolOf(pathname: string | null): ViewTool | null {
  if (!pathname) return null;
  switch (pathname) {
    case "/my-classes":
      return "classes";
    case "/crews":
      return "crews";
    case "/practice":
      return "practice";
    case "/business":
      return "studios";
    case "/routines":
      return "routines";
    case "/team":
      return "team";
    case "/memberships":
      return "memberships";
  }
  const biz = /^\/business\/[^/]+\/([a-z]+)$/.exec(pathname);
  if (biz) return BUSINESS_DESK[biz[1]!] ?? null;
  const crew = /^\/crews\/[^/]+\/manage\/(team|practice)$/.exec(pathname);
  if (crew) return crew[1] as ViewTool;
  return null;
}

/** the stored choices out of the whole layout object — only an explicit
 *  `["list"]` is a list; anything else is the default */
export function viewsOf(layout: Record<string, string[]>): Partial<Record<ViewTool, ViewMode>> {
  const out: Partial<Record<ViewTool, ViewMode>> = {};
  for (const t of VIEW_TOOLS) if (layout[viewKey(t)]?.[0] === "list") out[t] = "list";
  return out;
}
