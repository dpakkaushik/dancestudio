import { DOS_DISPLAY, INK, SUB } from "@/lib/design/tokens";
import Link from "next/link";
import type { AdminDashboard as Pulse } from "@/repositories/adminPanel";
import { AdminGlyph, DESK_TINT } from "./admin-glyphs";
import { DESKS, type AdminBadges, type AdminDesk } from "./desks";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";

/** ONE DESK, AS A BLOCK (11 Sep 2026 — the user's ask: "boxes, block type views
 *  and an image/icon for each block"). This IS the panel's nav: the icon in the
 *  desk's own colour, the name, what it is for in a line, and the number
 *  waiting on it. The same object Home draws for a studio's tools, so an admin
 *  who has used the app recognises it. */
function DeskBlock({ desk, waiting }: { desk: AdminDesk; waiting: number }) {
  const tint = DESK_TINT[desk.k];
  return (
    <Link
      href={desk.href}
      aria-label={`${desk.label}${waiting > 0 ? ` — ${waiting} waiting` : ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 9,
        background: CARD,
        border: `1px solid ${EL}`,
        borderRadius: 18,
        padding: "12px 12px 11px",
        textDecoration: "none",
        minWidth: 0,
        boxShadow: waiting > 0 ? `0 4px 16px ${tint}22` : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span style={{ width: 40, height: 40, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", background: `${tint}1c`, border: `1.5px solid ${tint}66`, color: tint, flexShrink: 0 }}>
          <AdminGlyph k={desk.k} size={21} />
        </span>
        {waiting > 0 ? (
          <span style={{ minWidth: 22, height: 22, borderRadius: 11, padding: "0 7px", background: desk.tone ?? tint, color: "#fff", fontSize: 11, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>
            {waiting > 99 ? "99+" : waiting}
          </span>
        ) : null}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 900, color: INK, fontFamily: DOS_DISPLAY, letterSpacing: -0.2, lineHeight: 1.15 }}>{desk.label}</div>
        <div style={{ fontSize: 10.5, color: SUB, marginTop: 3, lineHeight: 1.4 }}>{desk.what}</div>
      </div>
    </Link>
  );
}

/** THE FRONT DOOR, AND NOTHING ELSE (11 Sep 2026 — the user: "the main screen
 *  will only have a designated block for every part of it").
 *
 *  /admin is the panel's map: the one line that says how much work is waiting,
 *  and then every desk as a block. The figures that used to run down the page
 *  under these blocks are a desk of their own now (Dashboard) — they were
 *  reading material sitting on top of the nav, which made the front door a
 *  scroll and pushed half the desks below the fold.
 *
 *  Nothing here is a number an admin has to interpret. A block either wears a
 *  badge, meaning somebody is waiting, or it does not. */
export function AdminDesksScreen({ pulse, badges = {}, nowIso }: { pulse: Pulse; badges?: AdminBadges; nowIso: string }) {
  const w = pulse.waiting;
  const todo = w.verifications + w.threads + w.reports + w.pastDue + w.refunds + w.stuckWebhooks;
  const day = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" }).format(new Date(nowIso));

  /* what each block wears: the nav's own badge where it has one, the pulse
     where the pulse knows better (refunds come from the dashboard RPC) */
  const waitingFor = (d: AdminDesk): number => {
    if (d.badge === "refunds") return Math.max(badges.refunds ?? 0, w.refunds);
    if (d.badge === "verifications") return Math.max(badges.verifications ?? 0, w.verifications);
    if (d.badge === "reports") return Math.max(badges.reports ?? 0, w.reports);
    if (d.badge === "money") return Math.max(badges.money ?? 0, w.pastDue);
    if (d.badge === "support") return badges.support ?? w.threads;
    return 0;
  };

  return (
    <div style={{ padding: "14px 16px var(--dos-foot, 40px)" }}>
      <div style={{ borderRadius: 22, padding: "15px 17px 14px", marginBottom: 14, position: "relative", overflow: "hidden", color: "#fff", background: todo > 0 ? "linear-gradient(135deg,#B45309,#F59E0B)" : "linear-gradient(135deg,#166534,#22C55E)" }}>
        <div style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
          <span style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 14, background: "rgba(0,0,0,.28)", border: "1.5px solid rgba(255,255,255,.35)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
            <AdminGlyph k="overview" size={22} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, opacity: 0.85 }}>DANCEOS · ADMIN</div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, fontFamily: DOS_DISPLAY, lineHeight: 1.18, marginTop: 2 }}>
              {todo > 0 ? `${todo} thing${todo === 1 ? "" : "s"} need you` : "Nothing is waiting"}
            </div>
            <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>{day}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {DESKS.map((d) => (
          <DeskBlock key={d.href} desk={d} waiting={waitingFor(d)} />
        ))}
      </div>

      {/* the one thing that is not a desk, because it is not work somebody does
          — it is something being WRONG, and it should not wait behind a block */}
      {w.stuckWebhooks > 0 ? (
        <div style={{ background: CARD, border: `1px solid ${EL}`, borderLeft: "4px solid #EF4444", borderRadius: 14, padding: "10px 12px", marginTop: 10 }}>
          <b style={{ fontSize: 12 }}>{w.stuckWebhooks} payment webhook{w.stuckWebhooks === 1 ? "" : "s"} never finished</b>
          <div style={{ fontSize: 10.5, color: SUB, marginTop: 2, lineHeight: 1.5 }}>
            A delivery arrived and its work did not complete. Money screens may be behind until it is replayed.
          </div>
        </div>
      ) : null}

      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 18, lineHeight: 1.55, borderTop: `1px solid ${EL}`, paddingTop: 12 }}>
        Every decision you make is recorded in{" "}
        <Link href="/admin/audit" style={{ color: INK, fontWeight: 800 }}>the audit log</Link>. The platform in figures is on{" "}
        <Link href="/admin/dashboard" style={{ color: INK, fontWeight: 800 }}>Dashboard</Link>.
      </div>
    </div>
  );
}
