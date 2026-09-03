"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { dosKey } from "@/features/classes/components/ShareSheet";
import { createTenantAction, type TenantActionState } from "@/features/tenants/server-actions/tenants";
import { DOS_CITIES } from "@/lib/constants/cities";
import { DOS_DISPLAY, DOS_TINT, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { publicProfilePath } from "@/lib/routes/publicProfile";
import type { MyMembership } from "@/repositories/tenants";
import type { TenantType } from "@/types/tenant";
import { DOS_TOOLS, SHEET_ANIMATION, dosToolPaint } from "./biz-kit";

/* Icons lifted from the prototype (DanceOSApp.jsx:3136-3142). */
const STROKE = { fill: "none", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const StudioI = ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...STROKE} aria-hidden="true">
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9.5 21v-4h5v4M9 8h2M13 8h2M9 12h2M13 12h2" />
  </svg>
);

const ArtistI = ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...STROKE} aria-hidden="true">
    <circle cx="12" cy="9.6" r="2.9" />
    <path d="M5.5 20.5c.8-3.2 3.3-4.9 6.5-4.9s5.7 1.7 6.5 4.9" />
    <path d="M7.8 6.4h8.4" />
    <path d="M9.4 6.4c0-1.9 1.1-3 2.6-3s2.6 1.1 2.6 3" />
  </svg>
);

const CARD = "var(--card)";
const EL = "var(--el)";
const ACCENT = DOS_TOOLS.studios.c;
const initialState: TenantActionState = { error: null };

interface RoomDraft {
  name: string;
  capacity: number;
}
/* the sheet opens with one room already in it (2639) — a studio is a place with
   at least one floor; the Rooms desk names the next ones "Room N" the same way */
const seedRooms = (): RoomDraft[] => [{ name: "Room 1", capacity: 20 }];

const inp: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: EL,
  border: `1px solid ${EL}`,
  borderRadius: 12,
  padding: "11px 12px",
  color: INK,
  fontSize: 14,
  fontWeight: 600,
  outline: "none",
};

/** the section head (2622): 9.5px, 900, tracked, muted */
const Head = ({ children }: { children: string }) => (
  <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: "var(--muted)", margin: "2px 0 8px" }}>
    {children}
  </div>
);

/** Studios hub — lifted from the prototype's S_bizhub/Hub (DanceOSApp.jsx:2585-2691).
 *
 *  TWO LISTS, BECAUSE THERE ARE TWO RELATIONSHIPS (2595-2603): "A crew you lead
 *  and a crew you dance in are not the same object with a flag on it... Now the
 *  ones you run come first, because that is what you came here to do, and the
 *  ones you belong to sit below under their own heading, opening the public page
 *  instead. Where a row goes decides what pressing it does; nothing else has to."
 *
 *  Documented departures: the sheet keeps a Studio / Independent-trainer toggle
 *  (the app has two business kinds where the prototype's hub has one), and the
 *  add button names both. */
export function BusinessHub({
  memberships,
  /** live rooms per owned tenant id — the "· N rooms" half of the sub-line (2655) */
  roomCounts,
}: {
  memberships: MyMembership[];
  roomCounts: Record<string, number>;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [type, setType] = useState<TenantType>("studio");
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [rooms, setRooms] = useState<RoomDraft[]>(seedRooms);
  // the action revalidates in place (no navigation), so the sheet closes itself
  // once a creation lands — prototype behavior after "Create studio"
  const [state, formAction, isPending] = useActionState(
    async (prev: TenantActionState, formData: FormData) => {
      const result = await createTenantAction(prev, formData);
      if (result.created) {
        setSheetOpen(false);
        setName("");
        setArea("");
        setCity("");
        setRooms(seedRooms());
      }
      return result;
    },
    initialState
  );

  /* system back closes the sheet that is open, exactly as tapping the scrim does */
  useCloseOnBack(() => setSheetOpen(false), sheetOpen);

  const mine = memberships.filter((m) => m.memberRole === "owner").map((m) => m.tenant);
  const theirs = memberships.filter((m) => m.memberRole !== "owner").map((m) => m.tenant);

  const isStudio = type === "studio";
  const roomsOk = rooms.length > 0 && rooms.every((r) => r.name.trim().length > 0 && r.capacity > 0);
  const ok = name.trim().length > 0 && (!isStudio || (area.trim().length > 0 && city.length > 0 && roomsOk));

  const rowStyle = (own: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 11,
    background: CARD,
    border: `1px solid ${EL}`,
    borderLeft: `4px solid ${own ? ACCENT : EL}`,
    borderRadius: 16,
    padding: "12px 13px",
    marginBottom: 9,
    color: INK,
    textDecoration: "none",
    cursor: "pointer",
  });

  const row = (t: MyMembership["tenant"], own: boolean) => {
    const loc = [t.area, t.city].filter(Boolean).join(", ");
    const n = roomCounts[t.id] ?? 0;
    const sub = own
      ? [loc, t.type === "studio" ? `${n} room${n === 1 ? "" : "s"}` : "Independent trainer"].filter(Boolean).join(" · ")
      : [t.type === "studio" ? "Studio" : "Independent trainer", loc].filter(Boolean).join(" · ");
    return (
      <Link
        key={t.id}
        href={own ? `/business/${t.id}/classes` : publicProfilePath(t)}
        aria-label={`${t.name} — ${own ? "open the studio" : "open the profile"}`}
        style={rowStyle(own)}
      >
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            flexShrink: 0,
            background: own ? `${ACCENT}1c` : EL,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {t.type === "studio" ? (
            <StudioI size={17} color={own ? ACCENT : "var(--sub)"} />
          ) : (
            <ArtistI size={17} color={own ? ACCENT : "var(--sub)"} />
          )}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t.name}
          </div>
          <div
            style={{
              fontSize: 10,
              color: SUB,
              marginTop: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sub}
          </div>
        </div>
        {/* the word on the right is the promise the tap keeps */}
        <span style={{ fontSize: 10.5, fontWeight: 800, color: own ? ACCENT : "var(--sub)", flexShrink: 0 }}>
          {own ? "Manage ›" : "Profile ›"}
        </span>
      </Link>
    );
  };

  const setRoom = (i: number, patch: Partial<RoomDraft>) =>
    setRooms((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div
      style={{
        background: LILAC,
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        paddingBottom: "var(--dos-foot, 40px)",
      }}
    >
      <div style={{ padding: "14px 16px 0" }}>
        {/* the same paint, and the same word, as the tile you pressed to get here */}
        <div
          style={{
            borderRadius: 22,
            padding: "15px 17px 14px",
            marginBottom: 12,
            position: "relative",
            overflow: "hidden",
            color: "#fff",
            background: dosToolPaint(ACCENT),
          }}
        >
          <div
            style={{
              position: "absolute",
              right: -28,
              top: -32,
              width: 130,
              height: 130,
              borderRadius: 65,
              background: "rgba(255,255,255,.13)",
            }}
          />
          <div
            style={{
              fontSize: 21,
              fontWeight: 800,
              letterSpacing: -0.5,
              position: "relative",
              fontFamily: DOS_DISPLAY,
              lineHeight: 1.18,
            }}
          >
            {DOS_TOOLS.studios.name}
          </div>
        </div>

        <Head>STUDIOS YOU OWN</Head>
        {mine.length ? (
          mine.map((t) => row(t, true))
        ) : (
          <div style={{ fontSize: 11.5, color: SUB, padding: "0 2px 10px" }}>You do not run a studio yet.</div>
        )}
        <div
          role="button"
          tabIndex={0}
          onKeyDown={dosKey}
          onClick={() => setSheetOpen(true)}
          style={{
            textAlign: "center",
            padding: "13px",
            borderRadius: 16,
            border: `1.5px dashed ${ACCENT}`,
            color: ACCENT,
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          ＋ Add studio or business
        </div>

        {/* and below it, the places that are not yours to run */}
        {theirs.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <Head>STUDIOS YOU HAVE TAUGHT AT</Head>
            {theirs.map((t) => row(t, false))}
          </div>
        )}
      </div>

      {/* "New studio" bottom sheet — lifted from DanceOSApp.jsx:2659-2685 */}
      {sheetOpen && (
        <div
          onClick={() => setSheetOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.6)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 600,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={isStudio ? "New studio" : "New business"}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--solid)",
              borderRadius: "24px 24px 0 0",
              padding: "18px 16px 28px",
              width: "100%",
              maxWidth: 430,
              boxSizing: "border-box",
              maxHeight: "88vh",
              overflowY: "auto",
              color: INK,
              animation: SHEET_ANIMATION,
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: EL, margin: "0 auto 12px" }} />
            <b style={{ fontSize: 17, fontFamily: DOS_DISPLAY }}>{isStudio ? "New studio" : "New business"}</b>
            <div style={{ fontSize: 11.5, color: SUB, margin: "3px 0 14px", lineHeight: 1.5 }}>
              One studio = one location. Opening another branch later? Create it as its own studio — it gets
              its own profile page and calendar.
            </div>

            <form action={formAction}>
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="rooms" value={JSON.stringify(isStudio ? rooms : [])} />
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {(
                  [
                    { key: "studio", label: "Studio", accent: DOS_TINT.studio },
                    { key: "trainer_business", label: "Independent trainer", accent: DOS_TINT.trainer },
                  ] as const
                ).map((o) => {
                  const on = type === o.key;
                  return (
                    <div
                      key={o.key}
                      role="button"
                      tabIndex={0}
                      aria-pressed={on}
                      onClick={() => setType(o.key)}
                      onKeyDown={dosKey}
                      style={{
                        flex: 1,
                        textAlign: "center",
                        padding: "11px",
                        borderRadius: 999,
                        cursor: "pointer",
                        fontSize: 12.5,
                        fontWeight: 800,
                        background: on ? `${o.accent}14` : EL,
                        color: on ? o.accent : SUB,
                        border: `2px solid ${on ? o.accent : "transparent"}`,
                        transition: "all .15s",
                      }}
                    >
                      {o.label}
                      {on && " ✓"}
                    </div>
                  );
                })}
              </div>

              <div style={{ fontSize: 12, color: SUB, margin: "0 0 4px" }}>
                {isStudio ? "Studio name" : "Business name"}
              </div>
              <input
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isStudio ? "e.g. EEE Dance Studio — Andheri" : "e.g. Rhea Kapoor Dance Co."}
                style={inp}
              />
              <div style={{ fontSize: 12, color: SUB, margin: "12px 0 4px" }}>
                Area{isStudio ? " — the studio’s single address" : " (optional)"}
              </div>
              <input
                name="area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Andheri West"
                style={inp}
              />
              {/* city is a closed list: it is how the app groups studios, so it cannot be typed */}
              <div style={{ fontSize: 12, color: SUB, margin: "12px 0 4px" }}>
                City{isStudio ? "" : " (optional)"}
              </div>
              <select
                name="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                style={{ ...inp, WebkitAppearance: "none", appearance: "none", cursor: "pointer" }}
              >
                <option value="">Pick a city</option>
                {DOS_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* the rooms, right here (2675-2683): a studio is created WITH its floors */}
              {isStudio && (
                <>
                  <div style={{ fontSize: 12, color: SUB, margin: "14px 0 6px" }}>Rooms — name · capacity</div>
                  {rooms.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <input
                        value={r.name}
                        aria-label={`Room ${i + 1} name`}
                        onChange={(e) => setRoom(i, { name: e.target.value })}
                        placeholder={`Room ${i + 1}`}
                        style={{ ...inp, flex: 2, minWidth: 0 }}
                      />
                      <input
                        type="number"
                        min={1}
                        value={r.capacity}
                        aria-label={`Room ${i + 1} capacity`}
                        onChange={(e) => setRoom(i, { capacity: Math.max(1, Number(e.target.value) || 1) })}
                        style={{ ...inp, flex: 1, minWidth: 0 }}
                      />
                      {rooms.length > 1 && (
                        <span
                          role="button"
                          tabIndex={0}
                          onKeyDown={dosKey}
                          aria-label={`Remove room ${i + 1}`}
                          onClick={() => setRooms((rs) => rs.filter((_, j) => j !== i))}
                          style={{ fontSize: 14, color: SUB, cursor: "pointer", padding: "0 2px" }}
                        >
                          ✕
                        </span>
                      )}
                    </div>
                  ))}
                  <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={dosKey}
                    onClick={() => setRooms((rs) => [...rs, { name: `Room ${rs.length + 1}`, capacity: 20 }])}
                    style={{
                      textAlign: "center",
                      padding: "10px",
                      borderRadius: 12,
                      border: `1.5px dashed ${EL}`,
                      color: SUB,
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    ＋ Add room
                  </div>
                </>
              )}

              {state.error && (
                <div style={{ fontSize: 12, color: "#EF4444", fontWeight: 700, marginTop: 12 }}>{state.error}</div>
              )}
              <button
                type="submit"
                disabled={!ok || isPending}
                style={{
                  marginTop: 14,
                  width: "100%",
                  textAlign: "center",
                  padding: "13px",
                  borderRadius: 999,
                  border: "none",
                  fontFamily: "inherit",
                  background: ok ? "var(--text)" : EL,
                  color: ok ? "var(--solid)" : "var(--muted)",
                  fontWeight: 800,
                  fontSize: 13.5,
                  cursor: ok ? "pointer" : "default",
                }}
              >
                {isPending ? "Creating…" : isStudio ? "Create studio" : "Create business"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
