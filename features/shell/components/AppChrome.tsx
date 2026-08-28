"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId, useSyncExternalStore, type ReactNode } from "react";
import { DOS_UI, INK } from "@/lib/design/tokens";

/** App shell lifted from the prototype's root (DanceOSApp.jsx:19171-19397): the
 *  fixed top bar (wordmark on a tab, back chip + title on a drill page, round
 *  theme/settings chips) and the floating five-tab pill bar. The prototype keeps
 *  screens in a stack; here each tab and drill is a real route, so "which tab is
 *  lit" and "is the bar drawn at all" read off the pathname instead of the stack. */

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
  Profile: (c) => (
    <svg width="20" height="20" viewBox="0 0 24 24" stroke={c} {...ICON_STROKE}>
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M5 20c.8-3.6 3.7-5.4 7-5.4s6.2 1.8 7 5.4" />
    </svg>
  ),
};

const TAB_TINT: Record<string, string> = {
  Home: "#5AC8FA",
  Discover: "#22C55E",
  Stats: "#F59E0B",
  Inbox: "#8B5CF6",
  Profile: "#EC4899",
};

const TAB_SET: Array<{ label: string; href: string }> = [
  { label: "Home", href: "/" },
  { label: "Discover", href: "/discover" },
  { label: "Stats", href: "/stats" },
  { label: "Inbox", href: "/inbox" },
  { label: "Profile", href: "/profile" },
];

/* drill-page titles — the top bar names where you are (prototype 19241) */
const DRILL_TITLES: Array<[RegExp, string]> = [
  [/^\/classes$/, "Classes"],
  [/^\/c\/[^/]+$/, "Class"],
  [/^\/my-classes$/, "My classes"],
  [/^\/business$/, "Your business"],
  [/^\/business\/[^/]+\/classes$/, "Classes"],
  [/^\/business\/[^/]+\/classes\/new$/, "Add class"],
  [/^\/business\/[^/]+\/classes\/[^/]+\/edit$/, "Edit class"],
  [/^\/business\/[^/]+\/classes\/[^/]+\/roster$/, "Roster"],
  [/^\/business\/[^/]+\/calendar$/, "Calendar"],
  [/^\/calendar$/, "Calendar"],
  [/^\/studio\/[^/]+$/, "Studio"],
  [/^\/artist\/[^/]+$/, "Artist"],
  [/^\/(studio|artist)\/[^/]+\/schedule$/, "Schedule"],
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

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = TAB_SET.find((t) => t.href === pathname)?.label ?? null;
  const isTab = activeTab !== null;

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
    <div style={{ position: "relative", background: "var(--bg)", minHeight: "100vh" }}>
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
        <span style={{ display: "flex", alignItems: "center", gap: isTab ? 9 : 4, minWidth: 0, flex: 1 }}>
          {isTab ? (
            <>
              <DosMark size={30} />
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
          <Link href="/profile" aria-label="Settings" style={{ ...chipStyle, textDecoration: "none" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" />
            </svg>
          </Link>
        </span>
      </div>

      {/* everything else flows below the bar; tabs also leave room for the pill bar */}
      <div
        id="dos-main"
        role="main"
        style={{
          paddingTop: "var(--dos-top)",
          paddingBottom: isTab ? "calc(80px + var(--dos-safe-bottom))" : "calc(16px + var(--dos-safe-bottom))",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>

      {/* ── the floating pill bar — only a tab draws it (19308-19397). The selected tab
          expands into a filled capsule carrying its icon AND name; the others are their
          icon alone, each keeping its aria-label so a screen reader names all five. ── */}
      {isTab && (
        <nav
          aria-label="Main"
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
          {TAB_SET.map(({ label, href }) => {
            const on = activeTab === label;
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
