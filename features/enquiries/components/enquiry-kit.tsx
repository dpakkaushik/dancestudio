"use client";

import Image from "next/image";
import Link from "next/link";
import { EnqIcon, agoWords, dateWords, moneyShort } from "@/features/inbox/components/inbox-kit";
import { DISC_RADIUS, DOS_DISPLAY } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import {
  ENQ_ROAD,
  ENQ_STAGE_WORD,
  ENQ_TINT,
  enquiryStage,
  enquiryTypeOf,
  enquiryValueInr,
  liveQuoteOf,
  roadStep,
  type Enquiry,
  type EnquiryStatus,
} from "@/types/enquiry";

/** THE ENQUIRY KIT (2 Oct 2026, the user: "Redesign the entire enquiry system
 *  with better status update, quote mechanism, quote history, profile photos of
 *  people, better cards for looking at them").
 *
 *  ⚠ ONE CARD AND ONE ROAD, used by the desk AND the detail page. The card was
 *  declared inline in `InboxScreen` and the detail page drew its stage as a word
 *  in a menu — two answers to "where is this enquiry", one a chip and one a
 *  dropdown. The road is the answer now in both places: a tracker of the six
 *  steps an enquiry actually travels (`ENQ_ROAD`, in the order they happen), the
 *  current one lit, and Lost drawn as the road ENDING rather than as a step on it. */

/** the colour a stage reads in — one map, so the card's chip and the road agree */
export const stageTint = (s: EnquiryStatus): string =>
  s === "won" || s === "confirmed" || s === "advance_paid" ? "#22C55E" : s === "lost" ? "#F87171" : s === "quoted" ? "#F59E0B" : "#3B82F6";

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** a face in the app's squircle, or initials in the tint when there is no picture */
export function EnqFace({ path, name, size = 34, tint }: { path: string | null; name: string; size?: number; tint: string }) {
  const src = photoUrl(path);
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: size * DISC_RADIUS,
        overflow: "hidden",
        flexShrink: 0,
        display: "inline-grid",
        placeItems: "center",
        background: `linear-gradient(135deg, ${tint}, ${tint}88)`,
        color: "#fff",
        fontSize: Math.round(size * 0.36),
        fontWeight: 900,
        border: "2px solid var(--solid)",
      }}
    >
      {src ? <Image src={src} alt="" width={size} height={size} style={{ width: size, height: size, objectFit: "cover" }} /> : initials(name)}
    </span>
  );
}

/** the two people an enquiry is between, overlapped — the asker first, because
 *  every enquiry begins with somebody wanting something */
export function EnqPair({ e, size = 34 }: { e: Enquiry; size?: number }) {
  const tint = ENQ_TINT[e.typeKey] ?? "#8B5CF6";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
      <EnqFace path={e.fromPhotoPath} name={e.fromName} size={size} tint={tint} />
      <span style={{ marginLeft: -size * 0.3 }}>
        <EnqFace path={e.toPhotoPath} name={e.businessName} size={size} tint="#64748B" />
      </span>
    </span>
  );
}

/** THE ROAD — where an enquiry is, out of where it can go. `compact` is the
 *  card's: segments and the current word. The full one names every step. */
export function EnquiryRoad({ stage, compact = false }: { stage: EnquiryStatus; compact?: boolean }) {
  const at = roadStep(stage);
  const lost = stage === "lost";
  const c = stageTint(stage);
  return (
    <div data-testid="enquiry-road" aria-label={`Stage: ${ENQ_STAGE_WORD[stage]}`}>
      <div style={{ display: "flex", gap: 3 }}>
        {ENQ_ROAD.map((s, i) => (
          <span
            key={s}
            style={{ flex: 1, height: compact ? 4 : 6, borderRadius: 999, background: lost ? (i === 0 ? "#F8717155" : "var(--el)") : i <= at ? c : "var(--el)" }}
          />
        ))}
      </div>
      {compact ? null : (
        <div style={{ display: "flex", gap: 3, marginTop: 5 }}>
          {ENQ_ROAD.map((s, i) => (
            <span key={s} style={{ flex: 1, textAlign: "center", fontSize: 8.5, fontWeight: i === at ? 900 : 700, color: !lost && i === at ? c : "var(--muted)", lineHeight: 1.2 }}>
              {ENQ_STAGE_WORD[s]}
            </span>
          ))}
        </div>
      )}
      {lost && !compact ? <div style={{ fontSize: 10.5, fontWeight: 800, color: "#F87171", marginTop: 6 }}>This enquiry is closed as lost.</div> : null}
    </div>
  );
}

/** ONE ENQUIRY ON A DESK. `out` says which end the reader is on, per card — the
 *  Done list mixes both ends, so it cannot be one flag for the whole desk.
 *  ⚠ The accessible name is the one every locator already finds. */
export function EnquiryCard({ e, out, nowIso }: { e: Enquiry; out: boolean; nowIso: string }) {
  const stage = enquiryStage(e);
  const tc = ENQ_TINT[e.typeKey] ?? "#8B5CF6";
  const c = stageTint(stage);
  const label = enquiryTypeOf(e.typeKey)?.label ?? e.typeKey;
  const who = out ? e.businessName : e.fromName;
  const value = enquiryValueInr(e);
  const live = liveQuoteOf(e);
  const fields = e.fields.filter(([k]) => k !== "Enquiry");
  const headline = fields[0]?.[1] ?? label;
  const when = e.dates.length ? `${dateWords(e.dates[0])}${e.dates.length > 1 ? ` +${e.dates.length - 1}` : ""}` : null;
  const quotes = e.quotes.length;
  return (
    <Link
      href={`/inbox/enquiries/${e.id}`}
      aria-label={`${label} enquiry ${out ? "to" : "from"} ${who}`}
      data-testid="enquiry-card"
      style={{ display: "block", background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 18, marginBottom: 10, color: "var(--text)", textDecoration: "none", overflow: "hidden" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", background: `${tc}14`, borderBottom: `1.5px solid ${tc}33` }}>
        <EnqIcon k={e.typeKey} size={14} color={tc} sw={2} />
        <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: tc, textTransform: "uppercase" }}>{label}</span>
        <span style={{ marginLeft: "auto", fontSize: 9.5, color: "var(--muted)" }}>{agoWords(e.createdAt, nowIso)}</span>
      </div>
      <div style={{ padding: "11px 13px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <EnqPair e={e} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: -0.4, lineHeight: 1.15, fontFamily: DOS_DISPLAY, overflowWrap: "anywhere" }}>{headline}</div>
            <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {out ? "to " : "from "}
              <b style={{ color: "var(--text)" }}>{who}</b>
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: value ? c : "var(--muted)" }}>{value ? moneyShort(value) : "—"}</div>
            <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 1 }}>{quotes ? (quotes > 1 ? `quote #${live?.n ?? quotes}` : "quoted") : "no quote yet"}</div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <EnquiryRoad stage={stage} compact />
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 10.5, fontWeight: 900, color: c, textTransform: "uppercase", letterSpacing: 0.5 }}>{ENQ_STAGE_WORD[stage]}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>
              {[when, e.whereText].filter(Boolean).join(" · ")}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
