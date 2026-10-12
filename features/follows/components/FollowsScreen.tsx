"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { setCrewFollowAction, setFollowAction, setPersonFollowAction } from "@/features/follows/server-actions/follows";
import type { FollowEntry, FollowEntryKind, FollowPageData } from "@/features/follows/server/loadFollowPage";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, LINE, MUTED, SKY, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";

/** ⚠⚠ THE FOLLOW LIST, INSTAGRAM'S, WITH FILTERS (12 Oct 2026, the user:
 *  "follower following list whenever opened from anywhere should open a seprate
 *  page do it excatly how insta does it but give filters").
 *
 *  Instagram's anatomy: whose list it is at the top, two equal tabs —
 *  "N followers" and "N following" — underlined under the one you are on, a
 *  Search field, then a row per account: a round picture, the name in bold, a
 *  grey line under it, and Follow / Following on the right. What it adds is the
 *  user's own ask: the FILTERS — All · Users · Artists · Studios · Crews, each
 *  with its count and every chip always drawn (11 Oct's rule) — and a sort.
 *
 *  Both lists arrive in one server pass, so the tabs switch in the browser and
 *  the address follows with a replace (back leaves the page, as Instagram's
 *  does). The button calls the three existing doors; the database decides. */

type Tab = "followers" | "following";
const SHOWS = [
  { key: "all", word: "All" },
  { key: "user", word: "Users" },
  { key: "artist", word: "Artists" },
  { key: "studio", word: "Studios" },
  { key: "crew", word: "Crews" },
] as const;
type Show = (typeof SHOWS)[number]["key"];
type Sort = "default" | "az" | "za";
const SORT_WORD: Record<Sort, string> = { default: "Default", az: "A–Z", za: "Z–A" };
const NEXT_SORT: Record<Sort, Sort> = { default: "az", az: "za", za: "default" };

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function FollowsScreen({ data, initialTab, initialShow }: { data: FollowPageData; initialTab: Tab; initialShow: string }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [show, setShow] = useState<Show>((SHOWS.some((s) => s.key === initialShow) ? initialShow : "all") as Show);
  const [sort, setSort] = useState<Sort>("default");
  const [q, setQ] = useState("");
  /* the viewer's follow state, moved by the button — keyed on what it follows */
  const [state, setState] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ key: string; words: string } | null>(null);

  const rows = tab === "followers" ? data.followers : data.following;
  const error = tab === "followers" ? data.followersError : data.followingError;

  const counts = useMemo(() => {
    const c: Record<Show, number> = { all: rows.length, user: 0, artist: 0, studio: 0, crew: 0 };
    for (const r of rows) c[r.kind as FollowEntryKind] += 1;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out = rows.filter((r) => (show === "all" || r.kind === show) && (!term || r.name.toLowerCase().includes(term) || r.sub.toLowerCase().includes(term)));
    if (sort === "az") out.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "za") out.sort((a, b) => b.name.localeCompare(a.name));
    return out;
  }, [rows, show, sort, q]);

  /* the address is the state, with a replace — a tab is a setting of the page */
  const remember = (nextTab: Tab, nextShow: Show) => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("tab", nextTab);
      if (nextShow === "all") u.searchParams.delete("show");
      else u.searchParams.set("show", nextShow);
      window.history.replaceState(window.history.state, "", u.toString());
    } catch {
      /* the list still switches */
    }
  };
  const pickTab = (t: Tab) => {
    setTab(t);
    remember(t, show);
  };
  const pickShow = (s: Show) => {
    setShow(s);
    remember(tab, s);
  };

  const keyOf = (r: FollowEntry) => (r.target ? `${r.target.type}:${r.target.id}` : r.key);
  const isFollowing = (r: FollowEntry) => state[keyOf(r)] ?? r.following;

  const toggle = async (r: FollowEntry) => {
    if (!r.target || busy) return;
    const k = keyOf(r);
    const on = !isFollowing(r);
    setBusy(k);
    setErr(null);
    setState((s) => ({ ...s, [k]: on }));
    const out =
      r.target.type === "person"
        ? await setPersonFollowAction({ userId: r.target.id, on })
        : r.target.type === "business"
          ? await setFollowAction({ businessId: r.target.id, on })
          : await setCrewFollowAction({ crewId: r.target.id, on });
    setBusy(null);
    if (out.error || !out.state) {
      setState((s) => ({ ...s, [k]: !on }));
      setErr({ key: r.key, words: out.error ?? "Could not update that follow" });
      return;
    }
    setState((s) => ({ ...s, [k]: out.state!.following }));
  };

  const face = photoUrl(data.subject.photoPath);
  const tabWord = (t: Tab) => {
    const n = t === "followers" ? data.followers.length : data.following.length;
    return `${n.toLocaleString("en-IN")} ${t === "followers" ? (n === 1 ? "follower" : "followers") : data.followingIsTeam ? "team" : "following"}`;
  };

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "6px 16px 40px", boxSizing: "border-box" }}>
      {/* WHOSE LIST — the page's own heading, as Instagram puts the handle on top */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0 12px" }}>
        <span style={{ width: 34, height: 34, borderRadius: 17, overflow: "hidden", flexShrink: 0, background: "linear-gradient(135deg,#5AC8FA,#6D28D9)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 12 }}>
          {face ? <Image src={face} alt="" width={34} height={34} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : initialsOf(data.subject.name)}
        </span>
        <h1 style={{ margin: 0, fontFamily: DOS_DISPLAY, fontSize: 19, fontWeight: 900, letterSpacing: -0.3, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.subject.name}</h1>
      </div>

      {/* THE TWO TABS — equal halves, the one you are on underlined */}
      <div role="tablist" aria-label="Followers and following" style={{ display: "flex", borderBottom: `1px solid ${LINE}` }}>
        {(["followers", "following"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            data-testid={`follows-tab-${t}`}
            onClick={() => pickTab(t)}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              borderBottom: `2px solid ${tab === t ? "var(--text)" : "transparent"}`,
              marginBottom: -1,
              padding: "11px 4px",
              fontFamily: "inherit",
              fontSize: 13.5,
              fontWeight: tab === t ? 800 : 600,
              color: tab === t ? INK : MUTED,
              cursor: "pointer",
            }}
          >
            {tabWord(t)}
          </button>
        ))}
      </div>

      {/* SEARCH */}
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, padding: "0 12px", height: 38, borderRadius: 12, background: "var(--el)" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ color: MUTED, flexShrink: 0 }} aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" strokeLinecap="round" />
        </svg>
        <input
          aria-label="Search"
          placeholder="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 0, background: "none", border: "none", outline: "none", color: INK, fontFamily: "inherit", fontSize: 14, textTransform: "none" }}
        />
        {q ? (
          <button type="button" aria-label="Clear search" onClick={() => setQ("")} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 15, padding: 0 }}>
            ✕
          </button>
        ) : null}
      </label>

      {/* THE FILTERS — the user's own addition to Instagram's page; every chip
          drawn, a 0 included, and the sort beside them */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, flexWrap: "wrap" }} role="group" aria-label="Show">
        {SHOWS.map((s) => {
          const on = show === s.key;
          const n = counts[s.key];
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              data-testid={`follows-show-${s.key}`}
              onClick={() => pickShow(s.key)}
              style={{
                padding: "6px 11px",
                borderRadius: 999,
                border: `1.5px solid ${on ? "var(--text)" : LINE}`,
                background: on ? "var(--text)" : "transparent",
                color: on ? "var(--solid)" : n === 0 ? MUTED : INK,
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {s.word} · {n}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", marginTop: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 800 }}>{tab === "followers" ? "All followers" : data.followingIsTeam ? "The team" : "All following"}</span>
        <button
          type="button"
          data-testid="follows-sort"
          onClick={() => setSort((s) => NEXT_SORT[s])}
          aria-label={`Sort by ${SORT_WORD[sort]}`}
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: INK, fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: 0 }}
        >
          <span style={{ color: MUTED }}>Sort by</span> {SORT_WORD[sort]}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* THE ROWS */}
      <div data-testid="follows-list" style={{ marginTop: 6 }}>
        {error ? <div style={{ fontSize: 13, color: "#F87171", padding: "14px 2px" }}>{error}</div> : null}
        {!error && shown.length === 0 ? (
          <div style={{ fontSize: 13, color: SUB, padding: "22px 2px", textAlign: "center" }}>
            {rows.length === 0
              ? tab === "followers"
                ? data.subject.isMe
                  ? "Nobody follows you yet."
                  : "Nobody follows this yet."
                : data.followingIsTeam
                  ? "Nobody on the team yet."
                  : data.subject.isMe
                    ? "You follow nobody yet."
                    : "Not following anybody yet."
              : "Nobody matches that."}
          </div>
        ) : null}
        {shown.map((r) => {
          const pic = photoUrl(r.photoPath);
          const on = isFollowing(r);
          const k = keyOf(r);
          return (
            <div key={r.key} data-testid="follows-row" style={{ padding: "8px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Link href={r.href} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, color: INK, textDecoration: "none" }}>
                  <span
                    style={{
                      width: 52,
                      height: 52,
                      /* ⚠ a CIRCLE for every kind (12 Oct 2026, the user: "follower
                         following page profile pics should be circle only") */
                      borderRadius: 999,
                      overflow: "hidden",
                      flexShrink: 0,
                      background: "linear-gradient(135deg,#5AC8FA,#6D28D9)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: 16,
                    }}
                  >
                    {pic ? <Image src={pic} alt="" width={52} height={52} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : initialsOf(r.name)}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    {r.sub ? <span style={{ display: "block", fontSize: 13, color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sub}</span> : null}
                  </span>
                </Link>
                {r.target ? (
                  <button
                    type="button"
                    data-testid="follows-button"
                    aria-pressed={on}
                    aria-label={`${on ? "Following" : "Follow"} ${r.name}`}
                    disabled={busy === k}
                    onClick={() => void toggle(r)}
                    style={{
                      flexShrink: 0,
                      minWidth: 92,
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "none",
                      background: on ? "var(--el)" : SKY,
                      color: on ? INK : "#0A0A0A",
                      fontFamily: "inherit",
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: busy === k ? "default" : "pointer",
                      opacity: busy === k ? 0.6 : 1,
                    }}
                  >
                    {on ? "Following" : "Follow"}
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: MUTED, fontWeight: 700, flexShrink: 0 }}>You</span>
                )}
              </div>
              {err?.key === r.key ? <div role="alert" style={{ fontSize: 11.5, color: "#F87171", marginTop: 4, paddingLeft: 64 }}>{err.words}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
