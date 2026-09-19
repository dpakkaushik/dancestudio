"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { PosterBlock } from "@/features/classes/components/poster";
import { dosKey } from "@/features/classes/components/ShareSheet";
import {
  createClassAction,
  searchVenuesAction,
  updateClassAction,
  venueRoomsAction,
  type ClassActionState,
} from "@/features/classes/server-actions/classes";
import { LocationPicker } from "@/features/geo/components/LocationPicker";
import { PeoplePicker } from "@/features/people/components/PeoplePicker";
import { DosStylePicker } from "@/components/ui/DosStyleKit";
import { DOS_LEVELS, DOS_LEVEL_LABEL, dosClassLabel, dosStyleColor } from "@/lib/constants/styles";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { centreOf } from "@/repositories/cities";
import type { ClassClaim } from "@/types/claim";
import type { ClassLevel, DanceClass, PosterChoice } from "@/types/class";
import type { Room } from "@/types/room";
import type { TenantType } from "@/types/tenant";

const CARD = "var(--card)";
const EL = "var(--el)";
const initialState: ClassActionState = { error: null };

/* form kit lifted from the prototype's S_classform (DanceOSApp.jsx:15169-15196) */
const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1.1,
  color: "var(--muted)",
  margin: "18px 0 8px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: CARD,
  border: "none",
  borderRadius: 12,
  padding: "12px 14px",
  color: INK,
  fontSize: 14,
  outline: "none",
  fontFamily: "inherit",
};

const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: "9px 13px",
  borderRadius: 999,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
  border: `1.5px solid ${active ? INK : "transparent"}`,
  background: active ? EL : CARD,
  color: INK,
  transition: "all .15s",
});

/** Half-hour steps, 06:00–23:00 — the day a studio actually runs. */
const TIMES: string[] = Array.from({ length: 35 }, (_, i) => {
  const mins = 6 * 60 + i * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
});

const istDatePart = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", ...opts }).format(new Date(iso));

const toDateInput = (iso: string) => istDatePart(iso, { year: "numeric", month: "2-digit", day: "2-digit" });
const toTimeInput = (iso: string) =>
  istDatePart(iso, { hour: "2-digit", minute: "2-digit", hour12: false }).replace("24", "00");

const POSTER_DESIGNS: Array<[PosterChoice, string]> = [
  ["bold", "Bold"],
  ["split", "Split"],
  ["quiet", "Quiet"],
];

const STEPS = ["The session", "Price & save"];

/* the level's glyph (15367-15377): one to three ascending bars, a dot for All levels */
const LEVEL_BARS: Record<string, number> = { all: 4, beginner: 1, intermediate: 2, professional: 3 };
function LevelGlyph({ code }: { code: string }) {
  const bars = LEVEL_BARS[code] ?? 1;
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      {[0, 1, 2].slice(0, Math.min(bars, 3)).map((b) => (
        <path key={b} d={`M${6 + b * 6} ${19 - b * 5}v${5 + b * 5}`} />
      ))}
      {bars === 4 ? <circle cx="12" cy="6" r="1.6" fill="currentColor" stroke="none" /> : null}
    </svg>
  );
}

/* the claim badge the prototype prints beside a named person (15473-15475) */
const claimWord = (status: string) =>
  status === "confirmed" ? "✓ Confirmed" : status === "rejected" ? "✕ Said no" : "⏳ Asked";
const claimTint = (status: string) =>
  status === "confirmed" ? "#22C55E" : status === "rejected" ? "#F87171" : "#F59E0B";

/** the rooms of a studio, as a radio list (15381-15396) */
function RoomList({ rooms, roomId, onPick, emptyWords }: { rooms: Room[]; roomId: string | null; onPick: (id: string | null) => void; emptyWords: string }) {
  if (rooms.length === 0) {
    return <div style={{ background: CARD, borderRadius: 14, padding: "12px 14px", fontSize: 12, color: SUB, lineHeight: 1.5 }}>{emptyWords}</div>;
  }
  return (
    <div>
      {rooms.map((r) => {
        const on = roomId === r.id;
        return (
          <div
            role="button"
            tabIndex={0}
            onKeyDown={dosKey}
            key={r.id}
            aria-label={`Hold it in ${r.name}`}
            aria-pressed={on}
            onClick={() => onPick(on ? null : r.id)}
            style={{ display: "flex", alignItems: "center", gap: 11, background: on ? EL : CARD, border: `1.5px solid ${on ? INK : EL}`, borderRadius: 14, padding: "11px 13px", marginBottom: 8, cursor: "pointer" }}
          >
            <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: on ? "#3B82F633" : EL, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={on ? "#3B82F6" : SUB} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3.5h9a1.5 1.5 0 0 1 1.5 1.5v15H6z" />
                <path d="M4.5 20.5h15" />
              </svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Holds {r.capacity}
                {r.amenities.length ? ` · ${r.amenities.join(" ")}` : ""}
              </div>
            </div>
            {on && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}

type Venue = { id: string; name: string; sub: string };
type WhereKind = "studio" | "place";

/** Create/edit a class — the prototype's two-step S_classform wizard
 *  (DanceOSApp.jsx:15309-15531). Step 1 is what the class IS and where it runs;
 *  step 2 is who takes it and what it costs.
 *
 *  RE-CUT ON 18 SEP 2026, AT THE USER'S INSTRUCTION, FOR TWO KINDS OF OWNER:
 *   · A STUDIO's form: WHERE is one of its own rooms; WHO IS TAKING IT is anyone
 *     on DanceOS, found through the app's one people search and ASKED; there is
 *     no assistants block — assistants are added from the class page, by the
 *     owner or the teacher; and the form only ever SAVES A DRAFT. Publish lives
 *     on the register, and the database refuses it until the teacher has said yes.
 *   · An ARTIST's form: the artist is the teacher, so nobody is asked; WHERE is
 *     either a STUDIO with one of its rooms — a request the studio must accept
 *     before the class can be published — or a PLACE of their own, a map pin
 *     with their own capacity, which may publish straight from the form.
 *  The rule behind both is the database's (`classes_publish_needs_a_yes`), so
 *  this form cannot drift from it. */
export function ClassForm({
  tenantId,
  tenantType,
  existing,
  rooms,
  claims = [],
  isOwner = false,
  studioPlace = "",
  cityCentres = [],
  city = null,
  venueName = null,
}: {
  tenantId: string;
  /** a studio's form or an artist page's — decides WHERE and WHO (18 Sep 2026) */
  tenantType: TenantType;
  existing?: DanceClass;
  /** the NAME of the studio an artist's class asked for a room — the row holds
   *  only the id, and a reopened form should say who was asked (18 Sep 2026) */
  venueName?: string | null;
  /** the business's OWN rooms — a studio's; an artist page has none */
  rooms: Room[];
  claims?: ClassClaim[];
  /** the studio's own address, printed above the room list (prototype 15381:
   *  `ownStudio().loc` — a room means nothing until you know which building) */
  studioPlace?: string;
  /** Only the owner sets what a session pays (prototype 18434: payout approval
   *  is owner-only and cannot be granted). */
  isOwner?: boolean;
  /** where an artist's map opens when they pick a place of their own */
  cityCentres?: Array<{ city: string; lat: number; lng: number }>;
  city?: string | null;
}) {
  const isEdit = Boolean(existing);
  const isArtist = tenantType === "artist_page";
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };
  /* the confirm sheet before a save (15586-15625) — the button sets which
     status the form will carry, and the sheet's own button submits it */
  const [confirm, setConfirm] = useState<"draft" | "publish" | null>(null);
  /* `spend: false` — this sheet's button closes it AND submits in one tick, and
     spending the history entry then would race the server action's redirect
     (the hook's header tells the story); the orphaned entry is skipped on the
     next back press instead (19 Sep 2026) */
  useCloseOnBack(() => setConfirm(null), Boolean(confirm), { spend: false });
  /* WHAT THIS FORM IS ABOUT TO SUBMIT, IN THE DOM RATHER THAN IN STATE. React
     batches state updates inside a click handler, so setting a status and calling
     requestSubmit() in the same tick submits the value from the PREVIOUS render.
     Written straight to the input, so what is read is what was just decided. */
  const statusRef = useRef<HTMLInputElement>(null);
  const setSubmitStatus = (v: "draft" | "published") => {
    if (statusRef.current) statusRef.current.value = v;
  };

  const [style, setStyle] = useState<string>(existing?.style ?? "");
  const [level, setLevel] = useState<ClassLevel>(existing?.level ?? "all");
  const [date, setDate] = useState(existing?.session ? toDateInput(existing.session.startsAt) : "");
  const [startTime, setStartTime] = useState(existing?.session ? toTimeInput(existing.session.startsAt) : "19:00");
  const [endTime, setEndTime] = useState(existing?.session ? toTimeInput(existing.session.endsAt) : "20:00");
  const [roomId, setRoomId] = useState<string | null>(existing?.roomId ?? null);
  const [poster, setPoster] = useState<PosterChoice | null>(existing?.poster ?? null);
  const [priceInr, setPriceInr] = useState(existing?.priceInr ?? 300);
  const [capacityInput, setCapacityInput] = useState(existing?.capacity ?? 16);

  /* ── WHERE, for an artist (18 Sep 2026) ── */
  const [whereKind, setWhereKind] = useState<WhereKind>(existing?.venueBusinessId ? "studio" : "place");
  const [venue, setVenue] = useState<Venue | null>(existing?.venueBusinessId ? { id: existing.venueBusinessId, name: venueName ?? "the studio you asked", sub: "" } : null);
  const [venueRooms, setVenueRooms] = useState<Room[]>([]);
  const [venueQ, setVenueQ] = useState("");
  const [venueHits, setVenueHits] = useState<Venue[]>([]);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(existing?.lat != null && existing?.lng != null ? { lat: existing.lat, lng: existing.lng } : null);
  const [mapsUrl, setMapsUrl] = useState<string>(existing?.mapsUrl ?? "");
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);

  const pickVenue = async (v: Venue) => {
    setVenue(v);
    setRoomId(null);
    setVenueHits([]);
    setVenueQ("");
    setVenueRooms((await venueRoomsAction(v.id)).map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, amenities: r.amenities }) as Room));
  };
  const searchVenue = async (q: string) => {
    setVenueQ(q);
    setVenueHits(q.trim().length >= 2 ? await searchVenuesAction(q) : []);
  };

  /* ── WHO IS TAKING IT, for a studio (18 Sep 2026): anyone on DanceOS, asked ── */
  const artistClaim = claims.find((c) => c.kind === "artist");
  const [teacher, setTeacher] = useState<{ id: string; name: string } | null>(artistClaim ? { id: artistClaim.userId, name: artistClaim.personName } : null);
  const [artistPayInr, setArtistPayInr] = useState(artistClaim?.payPerSessionInr ?? 0);

  const [state, formAction, isPending] = useActionState(isEdit ? updateClassAction : createClassAction, initialState);

  /* the room the class is in: the studio's own, or the venue's */
  const roomList = isArtist ? venueRooms : rooms;
  const room = roomList.find((r) => r.id === roomId) ?? null;
  /* a room defines what the class can hold (prototype 15507-15509); a place of one's own is the artist's number */
  const capacity = room ? room.capacity : capacityInput;
  const atStudio = isArtist && whereKind === "studio";
  const atPlace = isArtist && whereKind === "place";

  const basicsOk = style.length > 0 && date.length > 0 && endTime > startTime;
  /* the first missing answer, in the words the button will wear (15573-15578) */
  const stepOneErr = !style
    ? "Pick a dance style"
    : !level
      ? "Pick a level"
      : !date
        ? "Pick a date"
        : endTime <= startTime
          ? "End after the start"
          : !isArtist && rooms.length > 0 && !roomId
            ? "Pick a room"
            : atStudio && !venue
              ? "Pick a studio"
              : atStudio && venue && !roomId
                ? "Pick one of its rooms"
                : atPlace && !geo
                  ? "Put it on the map"
                  : null;
  const ok = basicsOk && !stepOneErr;

  /* WHAT STANDS BETWEEN THIS AND PUBLISH — said here for an ARTIST'S PLACE, the
     one case that may publish from the form (15551-15563). A studio's class and
     an artist's class at a studio always leave here as drafts: their yes comes
     from somebody else, later, and the register is where Publish lives. */
  const blockers: string[] = [];
  if (atPlace) {
    if (!geo) blockers.push("Put it on the map — a place of your own");
    if (!(capacity > 0)) blockers.push("Say how many people can book");
    if (Number.isNaN(Number(priceInr))) blockers.push("Set a price — put 0 if it is free");
  }
  const canPublishHere = atPlace && ok && blockers.length === 0;

  /* the rate only travels when an OWNER is saving — the RPCs reject it from anybody else */
  const peoplePayload = isArtist ? "" : JSON.stringify({ artistUserId: teacher?.id ?? null, ...(isOwner ? { artistPayInr } : {}) });

  const whereWords = atStudio && venue ? `${room?.name ?? "a room"} at ${venue.name}` : atPlace ? (placeLabel ?? (geo ? "a place on the map" : "—")) : room?.name ?? "—";

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "14px 16px 150px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 2px" }}>
        <button type="button" aria-label={step > 0 ? "Back a step" : "Back"} onClick={() => (step > 0 ? setStep(step - 1) : router.back())} style={{ fontSize: 20, cursor: "pointer", lineHeight: 1, background: "none", border: "none", color: INK, padding: 0, fontFamily: "inherit" }}>
          ←
        </button>
        <div style={{ fontSize: 21, fontWeight: 800, fontFamily: DOS_DISPLAY, letterSpacing: -0.5, flex: 1 }}>{isEdit ? "Edit class" : "Add class"}</div>
      </div>
      <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.5 }}>
        {isEdit ? "Your saved details stay put — step through and change only what you need" : `Step ${step + 1} of ${STEPS.length} — ${STEPS[step]}`}
      </div>
      {/* progress (prototype 15547-15550) */}
      <div style={{ display: "flex", gap: 5, margin: "12px 0 4px" }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? INK : EL, transition: "all .2s" }} />
        ))}
      </div>

      <form action={formAction} ref={formRef}>
        {!isEdit ? <input type="hidden" name="status" ref={statusRef} defaultValue="draft" /> : null}
        {/* every field lives in state and submits as a hidden input, so stepping
            between the two halves never drops what you already answered */}
        <input type="hidden" name="tenantId" value={tenantId} />
        {/* where a save lands — an artist's register is Your classes' Manage segment, in one hop (19 Sep 2026) */}
        <input type="hidden" name="after" value={isArtist ? "/my-classes?show=manage" : `/business/${tenantId}/classes`} />
        {isEdit && existing && <input type="hidden" name="classId" value={existing.id} />}
        <input type="hidden" name="style" value={style} />
        <input type="hidden" name="level" value={level} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="startTime" value={startTime} />
        <input type="hidden" name="endTime" value={endTime} />
        <input type="hidden" name="roomId" value={roomId ?? ""} />
        <input type="hidden" name="room" value={room?.name ?? ""} />
        <input type="hidden" name="poster" value={poster ?? ""} />
        <input type="hidden" name="priceInr" value={priceInr} />
        <input type="hidden" name="capacity" value={capacity} />
        <input type="hidden" name="people" value={peoplePayload} />
        {/* WHERE, for an artist: the venue, or the pin (18 Sep 2026) */}
        <input type="hidden" name="venueBusinessId" value={atStudio && venue ? venue.id : ""} />
        <input type="hidden" name="lat" value={atPlace && geo ? String(geo.lat) : ""} />
        <input type="hidden" name="lng" value={atPlace && geo ? String(geo.lng) : ""} />
        <input type="hidden" name="mapsUrl" value={atPlace ? mapsUrl : ""} />

        {step === 0 ? (
          <>
            <div style={labelStyle}>1 · CLASS DATE &amp; TIME</div>
            <div style={{ fontSize: 12, color: SUB, marginBottom: 4 }}>Date</div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Class date" style={{ ...inputStyle, colorScheme: "dark" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: SUB, marginBottom: 4 }}>Starts</div>
                <select
                  value={startTime}
                  onChange={(e) => {
                    const v = e.target.value;
                    setStartTime(v);
                    if (endTime <= v) {
                      const next = TIMES.find((t) => t > v);
                      if (next) setEndTime(next);
                    }
                  }}
                  aria-label="Starts"
                  style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}
                >
                  {TIMES.slice(0, -1).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: SUB, marginBottom: 4 }}>Ends</div>
                <select value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label="Ends" style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}>
                  {TIMES.filter((t) => t > startTime).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={labelStyle}>2 · DANCE STYLE</div>
            {/* the prototype's searchable picker (15336-15360) */}
            <DosStylePicker value={style} onChange={setStyle} />

            <div style={labelStyle}>3 · LEVEL</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {DOS_LEVELS.map(([code, word]) => (
                <span key={code} role="button" tabIndex={0} aria-pressed={level === code} onClick={() => setLevel(code)} onKeyDown={dosKey} style={{ ...chipStyle(level === code), display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <LevelGlyph code={code} /> {word}
                </span>
              ))}
            </div>

            <div style={labelStyle}>4 · WHERE</div>
            {!isArtist ? (
              <>
                {/* ── ONE PLACE TO SAY WHERE (prototype 15376-15396): a room belongs
                    to a studio, so they are one question — and every room here is
                    already yours ── */}
                {studioPlace ? <div style={{ fontSize: 11.5, fontWeight: 700, color: SUB, margin: "-4px 0 8px" }}>{studioPlace}</div> : null}
                <RoomList rooms={rooms} roomId={roomId} onPick={setRoomId} emptyWords="No rooms yet. Add one in Rooms on the studio's home and it will be pickable here — a room also decides what the class can hold." />
              </>
            ) : (
              <>
                {/* ── AN ARTIST'S TWO ANSWERS (18 Sep 2026): a studio's room, asked
                    for; or a place of their own, pinned ── */}
                <div role="group" aria-label="Where the class happens" style={{ display: "flex", gap: 2, background: EL, borderRadius: 12, padding: 3, marginBottom: 10 }}>
                  {(
                    [
                      ["studio", "At a studio"],
                      ["place", "A place of my own"],
                    ] as Array<[WhereKind, string]>
                  ).map(([k, word]) => {
                    const on = whereKind === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          setWhereKind(k);
                          setRoomId(null);
                        }}
                        style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 9, cursor: "pointer", fontSize: 11.5, fontWeight: 800, border: "none", background: on ? LILAC : "transparent", color: on ? INK : SUB, boxShadow: on ? "0 1px 4px rgba(0,0,0,.3)" : "none", fontFamily: "inherit" }}
                      >
                        {word}
                      </button>
                    );
                  })}
                </div>
                {whereKind === "studio" ? (
                  <>
                    <div style={{ fontSize: 12, color: SUB, marginBottom: 7, lineHeight: 1.5 }}>
                      The studio is asked for its room. The class is saved as a draft and you can publish once they accept.
                    </div>
                    {venue ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, background: EL, border: `1.5px solid ${INK}`, borderRadius: 14, padding: "11px 13px", marginBottom: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 800 }}>{venue.name}</div>
                          {venue.sub ? <div style={{ fontSize: 11, color: SUB }}>{venue.sub}</div> : null}
                        </div>
                        <button
                          type="button"
                          aria-label="Pick a different studio"
                          onClick={() => {
                            setVenue(null);
                            setVenueRooms([]);
                            setRoomId(null);
                          }}
                          style={{ fontSize: 11, fontWeight: 800, color: SUB, background: "transparent", border: `1px solid ${EL}`, borderRadius: 999, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit" }}
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <div>
                        <input value={venueQ} onChange={(e) => void searchVenue(e.target.value)} placeholder="Search studios on DanceOS…" aria-label="Search studios" style={inputStyle} />
                        {venueHits.map((h) => (
                          <div key={h.id} role="button" tabIndex={0} onKeyDown={dosKey} aria-label={`Ask ${h.name} for a room`} onClick={() => void pickVenue(h)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 13, marginTop: 6, cursor: "pointer", background: CARD, border: `1.5px solid ${EL}` }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 800 }}>{h.name}</div>
                              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>{h.sub}</div>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 800, color: "#3B82F6" }}>Pick ›</span>
                          </div>
                        ))}
                        {venueQ.trim().length >= 2 && venueHits.length === 0 ? <div style={{ fontSize: 11.5, color: SUB, padding: "8px 2px" }}>No studio on DanceOS by that name.</div> : null}
                      </div>
                    )}
                    {venue ? <RoomList rooms={venueRooms} roomId={roomId} onPick={setRoomId} emptyWords="This studio has not listed its rooms yet — ask them to add one, or pick another studio." /> : null}
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: SUB, marginBottom: 7, lineHeight: 1.5 }}>Search the address or drag the map — the pin is what students get directions to.</div>
                    <LocationPicker
                      value={{ lat: geo?.lat ?? null, lng: geo?.lng ?? null, area: placeLabel }}
                      centre={centreOf(cityCentres, city ?? null)}
                      onChange={(p) => {
                        setGeo({ lat: p.lat, lng: p.lng });
                        setMapsUrl(`https://maps.google.com/?q=${p.lat},${p.lng}`);
                        if (p.label) setPlaceLabel(p.label.split(",").slice(0, 3).join(",").trim());
                      }}
                    />
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {!isArtist ? (
              <>
                {/* ── WHO IS TAKING IT (15445-15479), from ANYONE ON DANCEOS (18 Sep 2026):
                    the app's one people search; the person is ASKED and answers in
                    their Inbox; the class stays a draft until they say yes ── */}
                <div style={labelStyle}>5 · WHO IS TAKING IT</div>
                <div style={{ fontSize: 12, color: SUB, marginBottom: 7, lineHeight: 1.5 }}>
                  Any user or artist on DanceOS. They are asked to confirm — the class stays a draft until they do, and their name goes on it once they have.
                </div>
                {teacher ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 13, marginBottom: 6, background: EL, border: `1.5px solid ${INK}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 900 }}>{teacher.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>takes this class</div>
                    </div>
                    {artistClaim && artistClaim.userId === teacher.id ? (
                      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: claimTint(artistClaim.status) }}>{claimWord(artistClaim.status)}</span>
                    ) : (
                      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: "#F59E0B" }}>Will be asked</span>
                    )}
                    <button type="button" aria-label="Pick somebody else to take this class" onClick={() => setTeacher(null)} style={{ fontSize: 11, fontWeight: 800, color: SUB, background: "transparent", border: `1px solid ${EL}`, borderRadius: 999, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                      Change
                    </button>
                  </div>
                ) : (
                  <PeoplePicker title="SEARCH DANCEOS, THEN ASK THEM" ariaLabel="Search DanceOS for who takes this class" actionWord="Ask ›" actionColor="#0D9488" onPick={(p) => setTeacher({ id: p.id, name: p.fullName })} pickLabel={(p) => `${p.fullName} takes this class`} />
                )}

                {/* ── WHAT A SESSION PAYS (Step 13): the studio owner's number, riding the ask ── */}
                {isOwner && teacher && (
                  <>
                    <div style={labelStyle}>WHAT A SESSION PAYS THEM</div>
                    <input type="number" min={0} max={200000} step={50} value={artistPayInr} aria-label="What a session pays the artist" onChange={(e) => setArtistPayInr(Math.max(0, Number(e.target.value) || 0))} style={inputStyle} />
                    <div style={{ fontSize: 11.5, color: SUB, marginTop: 6 }}>₹ per session. Leave it at 0 if this one is on the house. You settle it yourself and record it on the earnings desk — DanceOS does not move the money.</div>
                  </>
                )}
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 14, lineHeight: 1.5 }}>Assistants are added from the class page once it exists — by you, or by whoever takes it.</div>
              </>
            ) : (
              <div style={{ background: CARD, borderRadius: 14, padding: "12px 14px", marginTop: 18, fontSize: 12, color: SUB, lineHeight: 1.5 }}>
                <b style={{ color: INK }}>You take this class.</b> Assistants are added from the class page once it exists.
              </div>
            )}

            {/* CAPACITY — the room decides it when there is one (15505-15515); a place of your own is your number */}
            <div style={labelStyle}>{isArtist ? "5" : "6"} · CAPACITY</div>
            {room ? (
              <div style={{ background: CARD, borderRadius: 14, padding: "12px 14px" }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {room.capacity} students <span style={{ color: SUB, fontWeight: 500 }}>· defined by {room.name}</span>
                </div>
              </div>
            ) : (
              <input type="number" min={1} value={capacityInput} onChange={(e) => setCapacityInput(Math.max(1, Number(e.target.value) || 1))} aria-label="Capacity" style={inputStyle} />
            )}

            <div style={labelStyle}>{isArtist ? "6" : "7"} · PRICE</div>
            <div style={{ fontSize: 12, color: SUB, marginBottom: 4 }}>
              ₹ / session <span style={{ color: "var(--muted)" }}>· 0 = free</span>
            </div>
            <input type="number" min={0} value={priceInr} onChange={(e) => setPriceInr(Math.max(0, Number(e.target.value) || 0))} aria-label="Price per session" style={inputStyle} />
            {priceInr === 0 && <div style={{ fontSize: 12, color: "#22C55E", fontWeight: 700, marginTop: 6 }}>This session is free.</div>}

            {/* POSTER — drawn, not uploaded, so it can never disagree with the class it belongs to (6478-6481) */}
            <div style={labelStyle}>
              {isArtist ? "7" : "8"} · POSTER <span style={{ fontWeight: 500, letterSpacing: 0 }}>· optional</span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
              {POSTER_DESIGNS.map(([design, word]) => {
                const on = poster === design;
                return (
                  <span role="button" tabIndex={0} onKeyDown={dosKey} key={design} aria-label={`${word} poster`} aria-pressed={on} onClick={() => setPoster(on ? null : design)} style={{ textAlign: "center", cursor: "pointer", lineHeight: 0 }}>
                    <span style={{ display: "block", borderRadius: 10, padding: 3, border: `2px solid ${on ? INK : "transparent"}` }}>
                      <PosterBlock item={{ title: style ? dosClassLabel(style, level) : "Class", style, styleColor: dosStyleColor(style) }} design={design} size={56} />
                    </span>
                    <span style={{ display: "block", fontSize: 10.5, fontWeight: 800, color: on ? INK : SUB, marginTop: 5, lineHeight: 1.2 }}>{word}</span>
                  </span>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>Left unchosen, a class draws its own from its name — so it always says the right thing. Tap a chosen design again to go back to that.</div>
          </>
        )}

        {state.error && <div style={{ fontSize: 12, color: "#EF4444", fontWeight: 700, marginTop: 14 }}>{state.error}</div>}

        {/* WHAT HAPPENS ON SAVE (18 Sep 2026): said plainly, because the form no
            longer publishes a studio's class — the register does, once the yes is in */}
        {step === STEPS.length - 1 && !isEdit ? (
          <div style={{ background: CARD, border: `1px solid ${EL}`, borderRadius: 14, padding: "12px 13px", margin: "16px 0 4px", fontSize: 11.5, color: SUB, lineHeight: 1.5 }}>
            {atPlace
              ? blockers.length
                ? blockers.map((b) => <div key={b}>· {b}</div>)
                : "Your place, your capacity — this one can go straight on Discover."
              : atStudio
                ? `Saved as a draft. ${venue?.name ?? "The studio"} is asked for the room; publish from Your classes once they accept.`
                : `Saved as a draft. ${teacher ? `${teacher.name} is asked` : "Nobody is asked yet — pick who takes it"}; publish from the register once they have said yes.`}
          </div>
        ) : null}

        {/* the sticky action bar, gesture-inset aware (15568-15582) */}
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, zIndex: 310, boxSizing: "border-box", background: "var(--solid)", borderTop: `1px solid ${EL}`, padding: "12px 16px calc(14px + env(safe-area-inset-bottom))", display: "flex", gap: 10 }}>
          {step === 0 ? (
            /* the button NAMES the missing answer rather than greying out (15573-15578) */
            <button
              type="button"
              aria-disabled={Boolean(stepOneErr)}
              onClick={() => {
                if (stepOneErr) return fire(stepOneErr);
                setStep(1);
              }}
              style={{ flex: 1, padding: "14px", borderRadius: 999, border: "none", background: stepOneErr ? EL : INK, color: stepOneErr ? "var(--muted)" : LILAC, fontWeight: 700, fontSize: stepOneErr ? 13.5 : 15, cursor: "pointer", fontFamily: "inherit", transition: "all .18s" }}
            >
              {stepOneErr ?? "Continue"}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setStep(0)} style={{ flex: 1, padding: "13px", borderRadius: 999, border: `1.5px solid ${EL}`, background: "transparent", color: INK, fontWeight: 800, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" }}>
                Back
              </button>
              {isEdit ? (
                <button type="submit" disabled={!ok || isPending} style={{ flex: 1.3, padding: "13px", borderRadius: 999, border: "none", background: ok ? INK : EL, color: ok ? LILAC : "#707070", fontWeight: 800, fontSize: 13.5, cursor: ok ? "pointer" : "default", fontFamily: "inherit" }}>
                  {isPending ? "Saving…" : "Save changes"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={!ok || isPending}
                    onClick={() => {
                      setSubmitStatus("draft");
                      setConfirm("draft");
                    }}
                    style={{ flex: canPublishHere ? 1 : 1.6, padding: "14px", borderRadius: 999, border: "none", background: canPublishHere ? CARD : INK, color: !ok ? "var(--muted)" : canPublishHere ? INK : LILAC, fontWeight: 700, fontSize: 14, cursor: ok ? "pointer" : "default", fontFamily: "inherit" }}
                  >
                    {isPending ? "Saving…" : atStudio ? "Save & ask the studio" : !isArtist ? (teacher ? "Save & ask them" : "Save draft") : "Save draft"}
                  </button>
                  {canPublishHere ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        setSubmitStatus("published");
                        setConfirm("publish");
                      }}
                      style={{ flex: 1.4, padding: "14px", borderRadius: 999, border: "none", background: INK, color: LILAC, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      {isPending ? "Working…" : "Publish class"}
                    </button>
                  ) : null}
                </>
              )}
            </>
          )}
        </div>
      </form>

      {confirm && !isEdit ? (
        <div onClick={() => setConfirm(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 600 }}>
          <div role="dialog" aria-modal="true" aria-label={confirm === "publish" ? "Publish this class?" : "Save as draft?"} onClick={(e) => e.stopPropagation()} style={{ background: "var(--solid)", borderRadius: "24px 24px 0 0", padding: "18px 16px 30px", width: "100%", maxWidth: 430, boxSizing: "border-box", color: INK, animation: "dosSheetUp .28s cubic-bezier(.22,.9,.34,1)" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: EL, margin: "0 auto 14px" }} />
            <b style={{ fontSize: 17 }}>{confirm === "publish" ? "Publish this class?" : "Save as draft?"}</b>
            <div style={{ fontSize: 12, color: SUB, margin: "3px 0 14px" }}>
              {confirm === "publish"
                ? "It'll be added to your calendar and go live on Discover."
                : atStudio
                  ? `${venue?.name ?? "The studio"} will be asked for ${room?.name ?? "the room"}. Only you can see the draft until they accept and you publish.`
                  : teacher
                    ? `${teacher.name} will be asked to take it. Only you can see the draft until they say yes and you publish.`
                    : "Only you can see drafts — edit anytime from the register's Drafts tab."}
            </div>
            {/* the calendar-style card (15595-15617) */}
            {(() => {
              const styleColor = dosStyleColor(style);
              return (
                <div style={{ borderRadius: 14, overflow: "hidden", background: CARD, border: `1px solid ${EL}` }}>
                  <div style={{ background: `${styleColor}40`, padding: "9px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11.5, fontWeight: 800 }}>🕒 {startTime}–{endTime} · {date}</span>
                  </div>
                  <div style={{ background: `${styleColor}22`, padding: "9px 10px", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 9, background: CARD, border: `1px solid ${styleColor}55`, borderRadius: 999, padding: "4px 14px 4px 5px" }}>
                      <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: 6, background: styleColor, display: "inline-block" }} />
                      <span style={{ fontSize: 15, fontWeight: 800, color: styleColor }}>{style}</span>
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: SUB }}>{DOS_LEVEL_LABEL[level] ?? level}</span>
                  </div>
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ fontSize: 12, color: SUB }}>👤 {isArtist ? "You" : teacher?.name ?? "Nobody asked yet"}</div>
                    <div style={{ fontSize: 12, color: SUB, marginTop: 4 }}>● {whereWords} · cap {capacity}</div>
                    {!isArtist && studioPlace ? <div style={{ fontSize: 12, color: SUB, marginTop: 4 }}>📍 {studioPlace}</div> : null}
                    <div style={{ fontSize: 12, marginTop: 4, fontWeight: 800, color: priceInr === 0 ? "#22C55E" : INK }}>{priceInr === 0 ? "FREE" : `₹${priceInr}/session`}</div>
                    {priceInr > 0 ? <div style={{ fontSize: 11.5, marginTop: 4, color: "#22C55E", fontWeight: 700 }}>↩️ Refund until 48 h before start</div> : null}
                  </div>
                </div>
              );
            })()}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="button" onClick={() => setConfirm(null)} style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: 999, background: CARD, border: `1.5px solid ${EL}`, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: INK }}>
                Keep editing
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setConfirm(null);
                  formRef.current?.requestSubmit();
                }}
                style={{ flex: 1.4, textAlign: "center", padding: 13, borderRadius: 999, background: INK, color: LILAC, fontWeight: 900, fontSize: 13.5, cursor: "pointer", border: "none", fontFamily: "inherit" }}
              >
                {confirm === "publish" ? "Publish it" : atStudio ? "Save & ask" : teacher && !isArtist ? "Save & ask" : "Save draft"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div role="status" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", color: INK, padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650, boxShadow: "0 6px 24px rgba(0,0,0,.45)" }}>{toast}</div> : null}
    </div>
  );
}
