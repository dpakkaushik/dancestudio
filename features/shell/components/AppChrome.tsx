"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { Portal } from "@/components/ui/Portal";
import { signOutAction } from "@/features/auth/server-actions/auth";
import { DOS_UI, INK } from "@/lib/design/tokens";

/** App shell lifted from the prototype's root (DanceOSApp.jsx:19171-19397): the
 *  fixed top bar (wordmark on a tab, back chip + title on a drill page, round
 *  theme/settings chips) and the floating pill bar. The prototype keeps
 *  screens in a stack; here each tab and drill is a real route, so "which tab is
 *  lit" and "is the bar drawn at all" read off the pathname instead of the stack.
 *
 *  THREE IN THE BAR (19 Sep 2026, the user: "remove profile tab from navbar" —
 *  their name for the eye that had the fourth slot since 15 Sep). Stats left
 *  the bar on 15 Sep 2026 for a tile, then for the chip beside the QR; Profile
 *  left it for an EYE the same day — "the profile view, what a user will see
 *  when he clicks over a studio or artist" — and the eye has now left the bar
 *  too, for the corner of Home's hero, under the pencil. The bar is Home ·
 *  Discover · Inbox. /profile and /stats are still routes (a route is a
 *  promise, Rule 14): the gear opens the first, the chip the second, and both
 *  read as drill pages, with the back chip and a title. Recorded in CLAUDE.md's
 *  deviations table.
 *
 *  THE MARK IS THE PROFILE SWITCHER (18 Sep 2026, the user: "DanceOS icon on top
 *  left should give a drop down for profile switcher which takes to different
 *  profiles managed by that specific user"). One person runs several things —
 *  their own profile, the studios they are on the team of, the crews they lead —
 *  and each has a home of its own. The layout lists them (`switcher`); pressing
 *  the mark opens the list, the one you are on is marked, and each row is a
 *  door. Nothing is switched in a session sense: every row is a route.
 *
 *  A STUDIO'S HOME AND A CREW'S HOME ARE HOMES (18 Sep 2026, the user: "both
 *  crew and studios should get a home and inbox tab below on their home pages
 *  as both have enquiries to deal with"). On `/business/{id}` and
 *  `/crews/{id}/manage` — and on their inboxes — the bar is the ENTITY's: Home ·
 *  Inbox, and the top-left is the mark with the switcher rather than a back
 *  chip, because you are somewhere, not inside something. */

/* ── the DanceOS mark — lifted from prototype DosMark (DanceOSApp.jsx:1614-1628) ── */
function DosMark({ size = 28 }: { size?: number }) {
  const gid = `dm${useId()}`;
  const s = size;
  return (
    <span
      style={{
        display: "inline-flex",
        flexShrink: 0,
        lineHeight: 0,
        width: s,
        height: s,
        borderRadius: s * 0.3,
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(145deg,#1B1030,#0C0714)",
        boxShadow: "0 0 0 1px rgba(236,72,153,.28), 0 4px 14px rgba(124,58,237,.30)",
      }}
    >
      <svg width={s * 0.72} height={s * 0.72} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="#EC4899" />
            <stop offset=".55" stopColor="#A855F7" />
            <stop offset="1" stopColor="#5AC8FA" />
          </linearGradient>
        </defs>
        <path d="M24.8 7.2A12.4 12.4 0 1 0 27.5 20" stroke={`url(#${gid})`} strokeWidth="3.6" strokeLinecap="round" />
        <path d="M9.6 22.6a8 8 0 1 1 11.2-1.4" stroke={`url(#${gid})`} strokeWidth="3.2" strokeLinecap="round" opacity=".62" />
        <circle cx="26.4" cy="6.2" r="3.5" fill="#EC4899" />
      </svg>
    </span>
  );
}

/* ── tab set — labels, tints and icons lifted from the shell (19313-19396).
   Calendar left the bar in the prototype's final design; the five that remain
   each carry their section's own accent. ── */
const ICON_STROKE = { fill: "none", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const TAB_ICONS: Record<string, (c: string) => ReactNode> = {
  Home: (c) => (
    <svg width="20" height="20" viewBox="0 0 24 24" stroke={c} {...ICON_STROKE}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
    </svg>
  ),
  Discover: (c) => (
    <svg width="20" height="20" viewBox="0 0 24 24" stroke={c} {...ICON_STROKE}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15 9-2 4.2L9 15l2-4.2z" />
    </svg>
  ),
  Stats: (c) => (
    <svg width="20" height="20" viewBox="0 0 24 24" stroke={c} {...ICON_STROKE}>
      <path d="M4 19.5h16" />
      <path d="M5 16.5V12M9.5 16.5V8.5M14 16.5v-6" />
      <path d="m18.5 16.5-.01-9" />
      <path d="m16.4 6.6 2.1-2.1 2.1 2.1" />
    </svg>
  ),
  Inbox: (c) => (
    <svg width="20" height="20" viewBox="0 0 24 24" stroke={c} {...ICON_STROKE}>
      <path d="M3.5 13.5h4l1.4 2.6h6.2l1.4-2.6h4" />
      <path d="M3.5 13.5 6.2 5.2h11.6l2.7 8.3V18a1.8 1.8 0 0 1-1.8 1.8H5.3A1.8 1.8 0 0 1 3.5 18z" />
    </svg>
  ),
};

const TAB_TINT: Record<string, string> = {
  Home: "#5AC8FA",
  Discover: "#22C55E",
  Inbox: "#8B5CF6",
};

/* the three that are places of their own — the eye to the account's public page
   sits on Home's hero since 19 Sep 2026, not here */
const TAB_SET: Array<{ label: string; href: string }> = [
  { label: "Home", href: "/" },
  { label: "Discover", href: "/discover" },
  { label: "Inbox", href: "/inbox" },
];

/** ONE ROW OF THE PROFILE SWITCHER — a home this account can go to. Built by the
 *  layout, drawn here. */
export interface SwitcherItem {
  key: string;
  href: string;
  label: string;
  /** what this is to you — "Your profile", "Owner", "Faculty", "Crew you lead" */
  sub: string;
  kind: "me" | "studio" | "crew";
}

const SWITCH_TINT: Record<SwitcherItem["kind"], string> = { me: "#5AC8FA", studio: "#3B82F6", crew: "#DC2626" };

/* AN ENTITY'S HOME (18 Sep 2026): a studio's own home and a crew's, with their
   inboxes — the pages that wear the entity's Home · Inbox bar instead of the
   main bar. Matched on a uuid so the static /business/stats, /earnings and /team
   are not mistaken for a studio. */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const STUDIO_HOME_RE = new RegExp(`^/business/(${UUID})(/inbox)?$`, "i");
const CREW_HOME_RE = new RegExp(`^/crews/(${UUID})/(manage|inbox)$`, "i");
interface Entity {
  kind: "studio" | "crew";
  home: string;
  inbox: string;
}
const entityOf = (pathname: string): Entity | null => {
  const s = pathname.match(STUDIO_HOME_RE);
  if (s) return { kind: "studio", home: `/business/${s[1]}`, inbox: `/business/${s[1]}/inbox` };
  const c = pathname.match(CREW_HOME_RE);
  if (c) return { kind: "crew", home: `/crews/${c[1]}/manage`, inbox: `/crews/${c[1]}/inbox` };
  return null;
};

/* drill-page titles — the top bar names where you are (prototype 19241) */
const DRILL_TITLES: Array<[RegExp, string]> = [
  /* the two that were tabs until 15 Sep 2026 */
  [/^\/profile$/, "Profile"],
  [/^\/stats$/, "Stats"],
  [/^\/classes$/, "Classes"],
  [/^\/c\/[^/]+$/, "Class"],
  /* the Home grid's own words (18 Sep 2026): Classes and Events are two tiles now */
  [/^\/my-classes$/, "Your classes"],
  [/^\/my-events$/, "Your events"],
  [/^\/routines$/, "Routines"],
  [/^\/memberships$/, "Memberships"],
  [/^\/assets$/, "Assets"],
  /* the Studios tile's word (18 Sep 2026) — it read "Your business" while a
     person's hub still offered to open one */
  [/^\/business$/, "Studios"],
  /* the organization's combined figures (17 Sep 2026) — static segments, so they
     must be matched before the studio id below swallows them */
  [/^\/business\/stats$/, "Studios · combined"],
  [/^\/business\/earnings$/, "Earnings · combined"],
  [/^\/business\/team$/, "Team"],
  [/^\/business\/[^/]+$/, "Studio"],
  [/^\/business\/[^/]+\/inbox$/, "Inbox"],
  [/^\/business\/[^/]+\/classes$/, "Classes"],
  [/^\/business\/[^/]+\/classes\/new$/, "Add class"],
  [/^\/business\/[^/]+\/classes\/[^/]+\/edit$/, "Edit class"],
  [/^\/business\/[^/]+\/classes\/[^/]+\/roster$/, "Attendance"],
  [/^\/business\/[^/]+\/calendar$/, "Calendar"],
  [/^\/business\/[^/]+\/media$/, "Media"],
  [/^\/business\/[^/]+\/events$/, "Events"],
  [/^\/business\/[^/]+\/events\/new$/, "Add event"],
  [/^\/business\/[^/]+\/events\/[^/]+\/edit$/, "Edit event"],
  [/^\/business\/[^/]+\/events\/[^/]+$/, "Manage event"],
  [/^\/business\/[^/]+\/staff$/, "Team"],
  [/^\/business\/[^/]+\/memberships$/, "Memberships"],
  [/^\/business\/[^/]+\/assets$/, "Assets"],
  [/^\/e\/[^/]+$/, "Event"],
  [/^\/calendar$/, "Calendar"],
  /* somebody else's record and rank (push 2, 19 Sep 2026) — four profiles, one page shape */
  [/^\/(person|studio|org|crew)\/[^/]+\/stats$/, "Stats"],
  [/^\/studio\/[^/]+$/, "Studio"],
  [/^\/artist\/[^/]+$/, "Artist"],
  /* an organization's own public page (18 Sep 2026) */
  [/^\/org\/[^/]+$/, "Organization"],
  [/^\/(studio|artist)\/[^/]+\/schedule$/, "Schedule"],
  [/^\/inbox\/enquiries\/[^/]+$/, "Enquiry"],
  [/^\/crews$/, "Crews"],
  [/^\/crews\/new$/, "Create crew"],
  [/^\/crews\/[^/]+\/manage$/, "Crew"],
  /* the crew's two desks (18 Sep 2026) — the crew home is an entity page above */
  [/^\/crews\/[^/]+\/manage\/team$/, "Team"],
  [/^\/crews\/[^/]+\/manage\/events$/, "Events"],
  [/^\/crews\/[^/]+\/inbox$/, "Inbox"],
  [/^\/crew\/[^/]+$/, "Crew"],
  [/^\/notifications$/, "Notifications"],
  [/^\/admin$/, "Admin"],
  [/^\/admin\/verifications$/, "Verification queue"],
  [/^\/admin\/support$/, "Support"],
  [/^\/admin\/support\/[^/]+$/, "Conversation"],
  [/^\/admin\/accounts$/, "Accounts"],
  [/^\/admin\/businesses$/, "Businesses"],
  [/^\/admin\/reports$/, "Reports"],
  /* the bar says what the NAV says, not what the URL says (11 Sep 2026): the
     money desk lives at /admin/payments — the word the panel was asked for —
     and without these four the bar fell back to the path segment, so the desk
     the nav calls "Money" opened with "Payments" written over it */
  [/^\/admin\/dashboard$/, "Dashboard"],
  [/^\/admin\/payments$/, "Money"],
  [/^\/admin\/subscriptions$/, "Subscriptions"],
  [/^\/admin\/plans$/, "Plans"],
  [/^\/admin\/communication$/, "Communication"],
  [/^\/admin\/audit$/, "Audit log"],
  [/^\/support$/, "DanceOS support"],
  [/^\/support\/[^/]+$/, "Conversation"],
  [/^\/person\/[^/]+$/, "Student record"],
  [/^\/managed$/, "What you manage"],
  [/^\/join\/[^/]+$/, "Join the team"],
];

const titleFor = (pathname: string): string => {
  for (const [re, title] of DRILL_TITLES) {
    if (re.test(pathname)) return title;
  }
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  return last.replace(/-/g, " ").replace(/^./, (ch) => ch.toUpperCase());
};

/* the <html> class as an external store (theme boot script + toggle both write it) */
const subscribeToHtmlClass = (onChange: () => void): (() => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
};
const readTheme = (): "dark" | "light" =>
  document.documentElement.className === "light" ? "light" : "dark";
const readServerTheme = (): "dark" | "light" => "dark";

const chipStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 17,
  flexShrink: 0,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
  background: "var(--chip-bg)",
  border: "1px solid var(--chip-line)",
};

const initialsOf = (name: string) => name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

export function AppChrome({
  children,
  unread = 0,
  adminOnly = false,
  switcher = [],
}: {
  children: ReactNode;
  /** what the bell says — counted server-side for this render */
  unread?: number;
  /** a platform admin with no profile (9 Sep 2026): no tab bar, no bell, no gear — a Sign out instead; the queue is its whole app */
  adminOnly?: boolean;
  /** the homes this account can go to — its own, its studios, the crews it leads (18 Sep 2026) */
  switcher?: SwitcherItem[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = TAB_SET.find((t) => t.href === pathname)?.label ?? null;
  const isTab = activeTab !== null;
  /* a studio's or a crew's own pages wear the entity's bar and the mark */
  const entity = entityOf(pathname);
  const showMark = isTab || entity !== null;
  const showBar = (isTab || entity !== null) && !adminOnly;
  const bar = entity
    ? [
        { label: "Home", href: entity.home },
        { label: "Inbox", href: entity.inbox },
      ]
    : TAB_SET;
  const lit = entity ? (pathname === entity.home ? "Home" : "Inbox") : activeTab;
  /* THE SWITCHER'S OPEN STATE IS KEYED ON THE PAGE IT WAS OPENED ON: a navigation
     changes the pathname, so the menu closes by itself without an effect writing
     state (this repo's setState-in-effect rule) */
  const [openFor, setOpenFor] = useState<string | null>(null);
  const menuOpen = openFor === pathname;
  /* a crew's home is /crews/{id}/manage, its inbox /crews/{id}/inbox — both are
     "here" for that crew, so the match is on the crew's root */
  const isHere = (item: SwitcherItem) => {
    if (item.href === "/") return pathname === "/";
    const root = item.kind === "crew" ? item.href.replace(/\/manage$/, "") : item.href;
    return pathname === root || pathname.startsWith(`${root}/`);
  };
  /* ⚠ THE "MANAGING {STUDIO}" STRIP IS GONE (18 Sep 2026, the user: "remove the
     blue bar which shows exit studio from all pages"). It was asked about once
     before, on 16 Sep, and kept on the DESKS with the argument that a tool hero
     names the tool and nothing names the studio — the user has now answered that
     argument, so `WorkspaceStrip` and its server action are deleted rather than
     hidden. The back chip in the bar above is the way out of a desk; from a
     notification deep link, Home and Discover are one tap away in the tab bar. */

  /* theme lives on <html> (set pre-paint by the root layout's boot script) and is
     persisted under the prototype's key — the <html> class IS the store, so the
     toggle icon reads it through useSyncExternalStore instead of mirrored state */
  const theme = useSyncExternalStore(subscribeToHtmlClass, readTheme, readServerTheme);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.className = next;
    try {
      window.localStorage.setItem("__DOSTHEME", next);
    } catch {
      /* private mode — the toggle still works for this page load */
    }
  };

  const goBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <div
      style={
        {
          position: "relative",
          background: "var(--bg)",
          minHeight: "100vh",
          /* how much room a page leaves at the bottom (19173-19180): the tab bar floats
             over the end of a tab page, so the shell publishes the clearance and a
             screen reads it as padding-bottom: var(--dos-foot) */
          "--dos-foot": showBar ? "calc(80px + var(--dos-safe-bottom))" : "calc(16px + var(--dos-safe-bottom))",
        } as React.CSSProperties
      }
    >
      <a href="#dos-main" className="dos-skip">
        Skip to content
      </a>

      {/* ── the top bar: mark + wordmark on a tab; back chip + page title on a drill (19227-19266) ── */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 430,
          zIndex: 400,
          height: "var(--dos-top)",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "var(--dos-safe-top) 12px 0 14px",
          background: "var(--hdr-bg)",
          backdropFilter: "blur(18px) saturate(1.4)",
          WebkitBackdropFilter: "blur(18px) saturate(1.4)",
          borderBottom: "1px solid var(--hdr-line)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: showMark ? 9 : 4, minWidth: 0, flex: 1 }}>
          {showMark ? (
            <>
              {/* THE MARK OPENS THE PROFILE SWITCHER (18 Sep 2026) — a real button, so
                  the list of homes is one press away wherever the mark is drawn */}
              {switcher.length > 0 && !adminOnly ? (
                <button
                  type="button"
                  aria-label="Switch profile"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setOpenFor(menuOpen ? null : pathname)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}
                >
                  <DosMark size={30} />
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: menuOpen ? "rotate(180deg)" : "none", transition: "transform .16s" }}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              ) : (
                <DosMark size={30} />
              )}
              <span style={{ fontSize: 19, fontWeight: 900, letterSpacing: -0.3, color: INK, fontFamily: DOS_UI }}>
                Dance<span style={{ color: "#EC4899" }}>OS</span>
              </span>
            </>
          ) : (
            <>
              <span
                role="button"
                tabIndex={0}
                aria-label="Go back"
                onClick={goBack}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    goBack();
                  }
                }}
                style={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  marginLeft: -4,
                  borderRadius: 16,
                  background: "var(--card)",
                }}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 5.5 8 12l6.5 6.5" />
                </svg>
              </span>
              <span
                style={{
                  fontSize: 17,
                  fontWeight: 900,
                  letterSpacing: -0.3,
                  minWidth: 0,
                  color: INK,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontFamily: DOS_UI,
                }}
              >
                {titleFor(pathname)}
              </span>
            </>
          )}
        </span>
        <span style={{ display: "flex", gap: 7, flexShrink: 0 }}>
          {/* the bell, with what is unread on it (prototype 19252-19257) — a real
              route, so the badge is whatever the server counted for this render.
              Not for an admin-only account: notifications belong to profiles. */}
          {adminOnly ? null : (
          <Link href="/notifications" aria-label={unread > 0 ? `Notifications — ${unread} unread` : "Notifications"} style={{ ...chipStyle, textDecoration: "none" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5" />
              <path d="M10.5 19a2 2 0 0 0 3 0" />
            </svg>
            {unread > 0 ? (
              <span data-testid="bell-badge" style={{ position: "absolute", top: -2, right: -2, minWidth: 14, height: 14, borderRadius: 7, padding: "0 3.5px", background: "#EC4899", color: "#fff", fontSize: 8.5, fontWeight: 900, lineHeight: "14px", textAlign: "center", fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', border: `2px solid ${theme === "dark" ? "#0A0A0A" : "#FFFFFF"}`, boxSizing: "border-box" }}>
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </Link>
          )}
          <span
            role="button"
            tabIndex={0}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            onClick={toggleTheme}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleTheme();
              }
            }}
            style={chipStyle}
          >
            {theme === "dark" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FAFAFA" strokeWidth="1.9" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8" />
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" />
              </svg>
            )}
          </span>
          {/* the gear opens the Settings sheet on the Profile tab (prototype 19263);
              an admin-only account has no Profile tab, so its one control is the way out */}
          {adminOnly ? (
            <form action={signOutAction} style={{ display: "contents" }}>
              <button type="submit" aria-label="Sign out" style={{ ...chipStyle, width: "auto", padding: "0 13px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", color: INK, border: "none" }}>
                Sign out
              </button>
            </form>
          ) : (
          <Link href="/profile?settings=1" aria-label="Settings" style={{ ...chipStyle, textDecoration: "none" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" />
            </svg>
          </Link>
          )}
        </span>
      </div>

      {/* ── THE PROFILE SWITCHER, dropped from the mark (18 Sep 2026). Portalled: the
          top bar is a transformed element, so a fixed backdrop drawn inside it would
          cover the bar and nothing else. The one you are on is marked; every row is
          a door, and a navigation closes the menu by changing the pathname. ── */}
      {menuOpen && switcher.length > 0 ? (
        <Portal>
          <div onClick={() => setOpenFor(null)} style={{ position: "fixed", inset: 0, zIndex: 700, background: "rgba(0,0,0,.28)" }} />
          <div
            role="menu"
            aria-label="Your profiles"
            style={{ position: "fixed", top: "calc(var(--dos-top) + 6px)", left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, boxSizing: "border-box", padding: "0 12px", zIndex: 710, pointerEvents: "none", fontFamily: DOS_UI }}
          >
            <div style={{ pointerEvents: "auto", width: 300, maxWidth: "100%", background: "var(--solid)", color: "var(--text)", border: "1px solid var(--el)", borderRadius: 18, boxShadow: "0 18px 48px rgba(0,0,0,.45)", padding: 6, animation: "dosSheetUp .18s ease" }}>
              <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, color: "var(--muted)", padding: "8px 10px 6px" }}>SWITCH PROFILE</div>
              {switcher.map((item) => {
                const here = isHere(item);
                const tint = SWITCH_TINT[item.kind];
                return (
                  <Link
                    key={item.key}
                    role="menuitem"
                    href={item.href}
                    aria-current={here ? "page" : undefined}
                    aria-label={`${item.label} — ${item.sub}${here ? " — you are here" : ""}`}
                    onClick={() => setOpenFor(null)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 13, textDecoration: "none", color: "var(--text)", background: here ? "var(--el)" : "transparent" }}
                  >
                    <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${tint},${tint}88)`, color: "#fff", fontSize: 12, fontWeight: 900 }}>
                      {initialsOf(item.label)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
                      <span style={{ display: "block", fontSize: 10, fontWeight: 800, color: tint, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>{item.sub}</span>
                    </span>
                    {here ? <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 900, letterSpacing: 0.6, padding: "3px 7px", borderRadius: 999, background: "var(--text)", color: "var(--solid)" }}>HERE</span> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        </Portal>
      ) : null}

      {/* everything else flows below the bar; tabs also leave room for the pill bar */}
      <div
        id="dos-main"
        role="main"
        style={{
          paddingTop: "var(--dos-top)",
          paddingBottom: showBar ? "calc(80px + var(--dos-safe-bottom))" : "calc(16px + var(--dos-safe-bottom))",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>

      {/* ── the floating pill bar — a tab draws the main one, an entity's home its own
          (19308-19397). The selected tab expands into a filled capsule carrying its
          icon AND name; the others are their icon alone, each keeping its aria-label
          so a screen reader names all of them. ── */}
      {showBar && (
        <nav
          aria-label={entity ? (entity.kind === "studio" ? "Studio" : "Crew") : "Main"}
          style={{
            position: "fixed",
            bottom: "calc(12px + var(--dos-safe-bottom))",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 300,
            background: "var(--nav-bg)",
            backdropFilter: "blur(22px) saturate(1.6)",
            WebkitBackdropFilter: "blur(22px) saturate(1.6)",
            display: "flex",
            padding: "8px 10px",
            borderRadius: 999,
            gap: 4,
            border: "1px solid var(--nav-line)",
            boxShadow: "var(--nav-shadow)",
          }}
        >
          {bar.map(({ label, href }) => {
            const on = lit === label;
            const tint = TAB_TINT[label];
            const c = on ? "#FFFFFF" : "var(--tab-rest)";
            return (
              <Link
                key={label}
                href={href}
                aria-label={label}
                aria-current={on ? "page" : undefined}
                style={{
                  height: 44,
                  cursor: "pointer",
                  borderRadius: 999,
                  padding: on ? "0 15px 0 13px" : "0 13px",
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: on ? 7 : 0,
                  background: on ? `linear-gradient(135deg,${tint},${tint}cc)` : "transparent",
                  boxShadow: on ? `0 4px 14px ${tint}66` : "none",
                  transition: "background .22s ease, padding .22s ease, gap .22s ease, box-shadow .22s ease",
                  WebkitTapHighlightColor: "transparent",
                  textDecoration: "none",
                }}
              >
                {TAB_ICONS[label](c)}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: c,
                    letterSpacing: 0.1,
                    lineHeight: 1,
                    maxWidth: on ? 90 : 0,
                    opacity: on ? 1 : 0,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    transition: "max-width .22s ease, opacity .18s ease",
                    fontFamily: DOS_UI,
                  }}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
