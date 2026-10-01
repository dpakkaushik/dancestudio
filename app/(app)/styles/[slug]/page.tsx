import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StyleBoards } from "@/features/styles/components/StyleBoards";
import { SegmentedPanels } from "@/features/shell/components/SegmentedNav";
import { dosStyleColor } from "@/lib/constants/styles";
import { styleFromSlug, styleInfo, stylePhoto } from "@/lib/constants/styleInfo";
import { DOS_UI, INK, SUB, TAB_TITLE } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findChart } from "@/repositories/stats";
import type { ChartRow, ChartSegment } from "@/types/stats";

/** A DANCE STYLE'S OWN PAGE (2 Oct 2026, the user: "page opens dance style —
 *  column 1: Photos, info, History, country, and Notable names — max 5 names,
 *  column 2 rankings for that particular dance style").
 *
 *  Lifted from the prototype's `StylePage` (9432-9544): the style's colour as
 *  the room, then TWO PARTS you choose between — "what IS Kathak" and "who is
 *  best at it" have nothing to do with each other, and pouring them down one
 *  scroll meant scrolling past the history every time you wanted the table
 *  (its own words, 9481-9486). Here they are Details and Rankings, the app's own
 *  segmented control, both rendered in one server pass.
 *
 *  ⚠ PUBLIC, like Discover: the record is the same for everybody. The boards are
 *  `dance_chart`, which is signed-in only (Step 25 — a person's activity is not
 *  public data), so a stranger is told where the rankings are rather than
 *  meeting an error. */
export default async function StylePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const style = styleFromSlug(slug);
  if (!style) notFound();
  const info = styleInfo(style);
  const photo = stylePhoto(style);
  const color = dosStyleColor(style);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const SEGS: ChartSegment[] = ["studio", "artist", "crew", "dancer"];
  /* ⚠ A BOARD THAT CANNOT BE READ IS AN EMPTY BOARD, never a 500 — this page is
     mostly an encyclopedia entry and must not fail over a leaderboard */
  const boards = user
    ? Object.fromEntries(
        await Promise.all(
          SEGS.map(async (s) => [s, await findChart(supabase, { segment: s, style, limit: 20 }).catch(() => [] as ChartRow[])] as const)
        )
      ) as Record<ChartSegment, ChartRow[]>
    : null;

  const show = sp.show === "rankings" ? "rankings" : "details";
  const base = `/styles/${slug}`;
  const card: React.CSSProperties = { background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 16, padding: "12px 14px", marginBottom: 10 };
  const head: React.CSSProperties = { fontSize: 10, fontWeight: 900, letterSpacing: 1, color: "var(--muted)", marginBottom: 9 };

  const details = (
    <div>
      {/* PHOTOS — the one picture, with the credit its licence asks for */}
      <div style={card}>
        <div style={head}>PHOTOS</div>
        {photo ? (
          <>
            <div style={{ position: "relative", width: "100%", aspectRatio: "3 / 2", borderRadius: 12, overflow: "hidden", background: color }}>
              <Image src={photo.src} alt={`${style} — ${photo.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, "")}`} fill sizes="(max-width: 430px) 92vw, 400px" style={{ objectFit: "cover" }} />
            </div>
            <div style={{ fontSize: 10.5, color: SUB, marginTop: 7, lineHeight: 1.45 }} data-testid="style-photo-credit">
              Photo: {photo.credit} ·{" "}
              {photo.licenseUrl ? (
                <a href={photo.licenseUrl} target="_blank" rel="noreferrer" style={{ color: SUB }}>{photo.license}</a>
              ) : (
                photo.license
              )}{" "}
              ·{" "}
              <a href={photo.source} target="_blank" rel="noreferrer" style={{ color: SUB }}>Wikimedia Commons</a>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: SUB }}>No photo of {style} yet.</div>
        )}
      </div>

      {/* INFO — the four facts, each on the style's own colour edge (9508-9513) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        {[
          ["FAMILY", info.family],
          ["COUNTRY", info.country],
          ["ORIGIN", info.origin],
          ["ERA", info.era],
        ].map(([k, v]) => (
          <div key={k} style={{ background: "var(--card)", border: "1.5px solid var(--el)", borderTop: `3px solid ${color}`, borderRadius: 14, padding: "10px 11px" }}>
            <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.6, color: "var(--muted)" }}>{k}</div>
            <div style={{ fontSize: 12, fontWeight: 800, marginTop: 3, lineHeight: 1.35 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* HISTORY (9522-9527) */}
      <div style={card}>
        <div style={head}>HISTORY</div>
        {info.history.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: 9, marginBottom: i === info.history.length - 1 ? 0 : 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: color, marginTop: 7, flexShrink: 0 }} />
            <span style={{ fontSize: 13, lineHeight: 1.55 }}>{f}</span>
          </div>
        ))}
      </div>

      {/* NOTABLE NAMES — at most five (9514-9521, "Founders & pioneers") */}
      <div style={card}>
        <div style={head}>NOTABLE NAMES</div>
        {info.notable.length === 0 ? (
          <div style={{ fontSize: 12.5, color: SUB }}>{style} is carried by its dancers rather than by a few famous names.</div>
        ) : (
          info.notable.slice(0, 5).map((n, i, all) => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i === all.length - 1 ? "none" : "1.5px solid var(--el)" }}>
              <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, background: `linear-gradient(135deg, ${color}, #7C3AED)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 900 }}>
                {n.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{n}</span>
            </div>
          ))
        )}
      </div>

      <Link href={`/discover?tab=classes&styles=${encodeURIComponent(style)}`} style={{ display: "block", textAlign: "center", padding: "13px", borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 13.5, textDecoration: "none", marginTop: 4 }}>
        Find {style} classes ›
      </Link>
    </div>
  );

  const rankings = boards ? (
    <StyleBoards style={style} color={color} boards={boards} />
  ) : (
    <div style={{ textAlign: "center", padding: "28px 16px", border: "1.5px dashed var(--el)", borderRadius: 16, fontSize: 12.5, color: SUB }}>
      The {style} rankings are for people on DanceOS.{" "}
      <Link href="/login" style={{ color: INK, fontWeight: 800 }}>
        Sign in ›
      </Link>
    </div>
  );

  return (
    <div style={{ background: "var(--bg)", color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40 }}>
      {/* THE STYLE, AS A ROOM (9481-9496): its colour bleeds off the top */}
      <div style={{ background: `linear-gradient(180deg, ${color} 0%, ${color}66 60%, var(--bg) 100%)`, padding: "18px 16px 16px" }}>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, color: "rgba(255,255,255,.85)" }}>DANCE STYLE</div>
        <h1 data-testid="style-title" style={{ ...TAB_TITLE, color: "#fff", marginTop: 4 }}>{style}</h1>
        <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,.92)", marginTop: 6 }}>{info.origin}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)", marginTop: 2 }}>{info.country}</div>
      </div>
      <div style={{ padding: "12px 16px 0" }}>
        <SegmentedPanels
          key={show}
          label="Style"
          initial={show}
          segments={[
            { key: "details", href: base, label: "Details", aria: "Details" },
            { key: "rankings", href: `${base}?show=rankings`, label: "Rankings", aria: "Rankings" },
          ]}
          panels={[
            { key: "details", node: details },
            { key: "rankings", node: rankings },
          ]}
        />
      </div>
    </div>
  );
}
