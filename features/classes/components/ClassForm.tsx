"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { PosterBlock } from "@/features/classes/components/poster";
import { dosKey } from "@/features/classes/components/ShareSheet";
import {
  createClassAction,
  searchVenuesAction,
  updateClassAction,
  venueRoomsAction,
  type ClassActionState,
} from "@/features/classes/server-actions/classes";
/* ⚠ NO `LocationPicker` HERE ANY MORE (20 Sep 2026, the user: "should just need
   a map link not map location picker") — and with it goes the Maps script on
   this form entirely. */
import { PeoplePicker } from "@/features/people/components/PeoplePicker";
import { DosStylePicker } from "@/components/ui/DosStyleKit";
import { Pick } from "@/components/ui/PickSheet";
import { AmenityIcon, amenityLabel } from "@/components/ui/AmenityIcon";
import { columnTab, columnTrack } from "@/components/ui/ColumnTabs";
import {
  FORM_LABEL,
  FORM_INPUT,
  FormBar,
  FormConfirm,
  FormNote,
  FormPage,
  FormToast,
  formChip,
} from "@/components/ui/FormPage";
import { DOS_LEVELS, DOS_LEVEL_LABEL, dosClassLabel, dosStyleColor } from "@/lib/constants/styles";
import { INK, LILAC, SUB } from "@/lib/design/tokens";
import { refundPolicyWords } from "@/lib/format/refundPolicy";
import type { ClassPerson } from "@/types/classPerson";
import { MAX_SESSION_MINUTES, type ClassLevel, type DanceClass, type PosterChoice } from "@/types/class";
import type { Room } from "@/types/room";
import type { BusinessType } from "@/types/business";

const CARD = "var(--card)";
const EL = "var(--el)";
const initialState: ClassActionState = { error: null };

/* ⚠ THE FORM KIT LIVES IN `components/ui/FormPage` NOW (21 Sep 2026). It was
   lifted from this file's own S_classform (15169-15196) and had been written out
   HERE alone — which is why Create crew, New routine and New membership had all
   drifted away from it. The three were moved onto the kit when the user asked
   for them to match this page; THIS page moved onto it in the same breath,
   because the screen everything is being matched to is the one that must not be
   allowed to drift. The names below are kept so no call site had to change. */
const labelStyle = FORM_LABEL;
const inputStyle = FORM_INPUT;
const chipStyle = formChip;

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

/** ⚠⚠ NO BACKDATING (28 Sep 2026, the user: "should not be able to create a class
 *  in backdate"). Both of these read the clock, which is why they are MODULE-LEVEL
 *  helpers: `Date.now()` may not be called in a component body under this repo's
 *  `react-hooks/purity` rule, and this file has paid for that lesson twice. */
/** today in IST, in the shape `<input type="date">` wants — the floor on the picker */
const istToday = () => istDatePart(new Date(Date.now()).toISOString(), { year: "numeric", month: "2-digit", day: "2-digit" });
/** ⚠ THE START INSTANT, NOT THE DATE: a class at 19:00 today is already gone at
 *  20:00, and a date-only test waves that through. The same minute of slack the
 *  server's own rule carries, so the form and the action cannot disagree by a
 *  second and leave somebody with a button that does nothing. */
const startHasGone = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`).getTime() <= Date.now() - 60_000;
/** the time now in IST as "HH:MM" — what today's Starts list is cut at
 *  (3 Oct 2026, the user: "should not be able to create class for time which has
 *  already passed"): the rule refused a past start at the button, but the list
 *  still OFFERED 08:00 at six in the evening, so the refusal was the first thing
 *  somebody learned. Module-level for the same purity reason as the two above. */
const istNowHm = () => istDatePart(new Date(Date.now()).toISOString(), { hour: "2-digit", minute: "2-digit", hour12: false }).replace(/^24/, "00");
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** an end the Ends list may offer: after the start, and NOT MORE THAN FIVE HOURS
 *  later (3 Oct 2026, the user: "not more than 5 hrs of session") — the server
 *  refuses the same number */
const endFits = (start: string, end: string) => end > start && minutesOf(end) - minutesOf(start) <= MAX_SESSION_MINUTES;

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

/* the classPerson badge the prototype prints beside a named person (15473-15475) */
const classPersonWord = (status: string) =>
  status === "confirmed" ? "✓ Confirmed" : status === "rejected" ? "✕ Said no" : "⏳ Asked";
const classPersonTint = (status: string) =>
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
              {/* the amenities as the app's drawn icons, the words on hover and to a
                  screen reader (4 Oct 2026, "revamp icon for amenities everywhere") */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: SUB, overflow: "hidden", whiteSpace: "nowrap" }}>
                <span>Holds {r.capacity}</span>
                {r.amenities.length ? (
                  <span role="img" aria-label={r.amenities.map(amenityLabel).join(", ")} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span aria-hidden="true">·</span>
                    {r.amenities.map((a) => (
                      <span key={a} title={amenityLabel(a)}>
                        <AmenityIcon value={a} size={13} color={on ? "#3B82F6" : SUB} />
                      </span>
                    ))}
                  </span>
                ) : null}
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

/** a switch row — the memberships switch */
function SwitchRow({ word, on, onFlip }: { word: string; on: boolean; onFlip: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={word}
      onClick={onFlip}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: CARD, border: `1.5px solid ${EL}`, borderRadius: 12, padding: "11px 12px", marginBottom: 8, cursor: "pointer", fontFamily: "inherit", color: INK }}
    >
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800 }}>{word}</span>
      <span style={{ flexShrink: 0, width: 38, height: 22, borderRadius: 999, background: on ? "#22C55E" : EL, position: "relative", transition: "background .15s" }}>
        <span style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: 999, background: "#fff", transition: "left .15s" }} />
      </span>
    </button>
  );
}

type Venue = { id: string; name: string; sub: string };
/** a venue's rooms, as `venueRoomsAction` hands them back, in the form's own shape */
const toRooms = (rs: Array<{ id: string; name: string; capacity: number; amenities: string[] }>) =>
  rs.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, amenities: r.amenities }) as Room);
/** WHERE a class happens (11 Oct 2026): one of the studio's own rooms, a
 *  studio's room asked for (an artist's), or a map link */
type WhereKind = "room" | "studio" | "map";
type WhoKind = "me" | "other";

/** Create/edit a class — the prototype's two-step S_classform wizard
 *  (DanceOSApp.jsx:15309-15531). Step 1 is what the class IS and where it runs;
 *  step 2 is who takes it and what it costs.
 *
 *  ⚠⚠ ONE FORM FOR A STUDIO AND AN ARTIST (11 Oct 2026, the user's answers to
 *  "classes made simpler"). It forked on the business type into two layouts; it
 *  is ONE now, with one WHERE block and one WHO TAKES IT block. The business TYPE
 *  only decides which WHERE answers exist and where each block opens:
 *   · WHERE — a STUDIO picks one of its own rooms or pastes a map link; an
 *     ARTIST page asks a studio on DanceOS for one of its rooms, or pastes a map
 *     link. (A studio is never offered a venue: the RPC refuses one.)
 *   · WHO — "You" (born confirmed, nobody to ask) or "Somebody else", found
 *     through the app's one people search and asked. A studio opens on somebody
 *     else, an artist page on you.
 *  Pay is not on the form any more: an ask with no rate takes the seat's
 *  (`business_members.pay_per_session_inr`), and the owner sets a class's own
 *  rate on the class page. Every save is a DRAFT; publishing is a press of
 *  Publish (no auto-publish, at the user's word). */
/** the chips a business with no styles of its own is offered — the commonest
 *  across the cities DanceOS runs in; `DosStylePicker` drops any name the
 *  registry does not hold, so a renamed style cannot draw a dead chip */
const COMMON_STYLES = ["Bollywood", "Hip-Hop", "Contemporary", "Kathak", "Bharatanatyam", "Salsa"];

export function ClassForm({
  businessId,
  businessType,
  existing,
  rooms,
  classPeople = [],
  studioPlace = "",
  /* ⚠ `cityCentres` and `city` are GONE (20 Sep 2026). They existed for one
     reason — centring the map picker — and the picker left with the user's
     "should just need a map link". */
  venueName = null,
  sheet = false,
  meId = null,
  ownedStudioIds = [],
  suggestedStyles = [],
  refundWindowHours = 12,
}: {
  businessId: string;
  /** the business's own refund window (B7) — the confirm prints its policy line */
  refundWindowHours?: number;
  /** the styles this business already teaches (`businesses.styles`), drawn as
   *  one-tap chips over the style picker (3 Oct 2026). Empty → a short list of
   *  the commonest styles, so the chips are never absent on a first class. */
  suggestedStyles?: string[];
  /** THE PERSON SAVING (26 Sep 2026; both kinds since 11 Oct 2026): "You" under
   *  WHO TAKES IT names this person, and the database seats them CONFIRMED rather
   *  than asked — there is nobody to ask. Null hides the "You" answer. */
  meId?: string | null;
  /** the STUDIOS THIS PERSON OWNS (26 Sep 2026): an artist's class held in one
   *  of them needs no request — the room is theirs — so the form says so */
  ownedStudioIds?: string[];
  /** open over the register that offered it rather than as a page of its own
   *  (22 Sep 2026). The form is unchanged either way — only its shell differs. */
  sheet?: boolean;
  /** a studio's form or an artist page's — decides which WHERE answers exist (11 Oct 2026) */
  businessType: BusinessType;
  existing?: DanceClass;
  /** the NAME of the studio an artist's class asked for a room — the row holds
   *  only the id, and a reopened form should say who was asked (18 Sep 2026) */
  venueName?: string | null;
  /** the business's OWN rooms — a studio's; an artist page has none */
  rooms: Room[];
  classPeople?: ClassPerson[];
  /** the studio's own address, printed above the room list (prototype 15381) */
  studioPlace?: string;
}) {
  const isEdit = Boolean(existing);
  const isArtist = businessType === "artist_page";
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };
  /* the confirm sheet before a save (15586-15625). ⚠ Its history entry is
     `FormConfirm`'s, once (22 Sep 2026), with `spend: false` — this sheet's
     button closes it AND submits in one tick. */
  const [confirm, setConfirm] = useState(false);

  const [style, setStyle] = useState<string>(existing?.style ?? "");
  const [level, setLevel] = useState<ClassLevel>(existing?.level ?? "all");
  const [date, setDate] = useState(existing?.session ? toDateInput(existing.session.startsAt) : "");
  const [startTime, setStartTime] = useState(existing?.session ? toTimeInput(existing.session.startsAt) : "19:00");
  const [endTime, setEndTime] = useState(existing?.session ? toTimeInput(existing.session.endsAt) : "20:00");
  /* ⚠ A SINGLE-ROOM STUDIO SKIPS "PICK A ROOM" (11 Oct 2026): its one room is
     picked already, and the list is still drawn so it can be seen */
  const onlyRoom = !isArtist && rooms.length === 1 ? rooms[0].id : null;
  const [roomId, setRoomId] = useState<string | null>(existing?.roomId ?? onlyRoom);
  const [poster, setPoster] = useState<PosterChoice | null>(existing?.poster ?? null);
  /** ⚠⚠ A NUMBER FIELD YOU CAN ACTUALLY CLEAR (28 Sep 2026, the user: "while
   *  typing 0 becomes stagnant"). THE TEXT IS THE STATE WHILE SOMEBODY IS TYPING
   *  and the number is derived from it; `onBlur` writes back what will ACTUALLY
   *  be saved. The bounds are the SERVER'S own (`classFields` in the action). */
  const numberOf = (text: string, min: number, max: number) => Math.min(max, Math.max(min, Math.trunc(Number(text) || 0)));
  const [priceText, setPriceText] = useState(String(existing?.priceInr ?? 300));
  const priceInr = numberOf(priceText, 0, 1000000);
  const [capacityText, setCapacityText] = useState(String(existing?.capacity ?? 16));
  const capacityInput = numberOf(capacityText, 1, 500);
  /* WHICH MEMBERSHIPS PAY FOR A SEAT HERE (19 Sep 2026) — the database is what
     enforces it when a pass is spent */
  const [allowsStudioMem, setAllowsStudioMem] = useState(existing?.allowsStudioMemberships ?? true);

  /* ── WHERE (11 Oct 2026): the business type decides the answers ── */
  /* an EXISTING class opens on whichever it actually has: a class already at a
     map link is not "in a room", and re-opening its form must not say it is */
  const initialWhere: WhereKind = existing?.venueBusinessId
    ? "studio"
    : existing && !existing.roomId && (existing.mapsUrl || existing.lat != null)
      ? "map"
      : isArtist
        ? "studio"
        : "room";
  const [whereKind, setWhereKind] = useState<WhereKind>(initialWhere);
  const whereOptions: Array<[WhereKind, string]> = isArtist
    ? [
        ["studio", "A studio's room"],
        ["map", "A map link"],
      ]
    : [
        ["room", "Your room"],
        ["map", "A map link"],
      ];
  const [venue, setVenue] = useState<Venue | null>(existing?.venueBusinessId ? { id: existing.venueBusinessId, name: venueName ?? "the studio you asked", sub: "" } : null);
  const [venueRooms, setVenueRooms] = useState<Room[]>([]);
  const [venueQ, setVenueQ] = useState("");
  const [venueHits, setVenueHits] = useState<Venue[]>([]);
  /* ⚠ READ-ONLY SINCE THE PICKER LEFT (20 Sep 2026): nothing SETS a pin any
     more, but a class that already has one keeps it */
  const [geo] = useState<{ lat: number; lng: number } | null>(existing?.lat != null && existing?.lng != null ? { lat: existing.lat, lng: existing.lng } : null);
  const [mapsUrl, setMapsUrl] = useState<string>(existing?.mapsUrl ?? "");
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);

  const pickWhere = (k: WhereKind) => {
    setWhereKind(k);
    setRoomId(k === "room" ? onlyRoom : k === "studio" && venue && venueRooms.length === 1 ? venueRooms[0].id : null);
  };
  const pickVenue = async (v: Venue) => {
    setVenue(v);
    setRoomId(null);
    setVenueHits([]);
    setVenueQ("");
    const rs = toRooms(await venueRoomsAction(v.id));
    setVenueRooms(rs);
    if (rs.length === 1) setRoomId(rs[0].id);
  };
  /* ⚠⚠ AN ARTIST'S CLASS REOPENS WITH ITS STUDIO'S ROOMS (11 Oct 2026, the user:
     "edit class sometimes messes up") — the rooms are read once, for the studio
     the class already has */
  const existingVenueId = existing?.venueBusinessId ?? null;
  useEffect(() => {
    if (!existingVenueId) return;
    let live = true;
    void venueRoomsAction(existingVenueId).then((rs) => {
      if (live) setVenueRooms(toRooms(rs));
    });
    return () => {
      live = false;
    };
  }, [existingVenueId]);
  const searchVenue = async (q: string) => {
    setVenueQ(q);
    setVenueHits(q.trim().length >= 2 ? await searchVenuesAction(q) : []);
  };

  /* ── WHO TAKES IT (11 Oct 2026): you, or anyone on DanceOS, asked ── */
  const artistClassPerson = classPeople.find((c) => c.kind === "artist");
  const existingIsMe = Boolean(artistClassPerson && meId && artistClassPerson.userId === meId);
  const [whoKind, setWhoKind] = useState<WhoKind>(
    !meId ? "other" : artistClassPerson ? (existingIsMe ? "me" : "other") : isArtist ? "me" : "other"
  );
  const [other, setOther] = useState<{ id: string; name: string } | null>(
    artistClassPerson && !existingIsMe ? { id: artistClassPerson.userId, name: artistClassPerson.personName } : null
  );
  const selfTeacher = whoKind === "me" && meId !== null;
  const teacherId = selfTeacher ? meId : other?.id ?? null;

  const [state, formAction, isPending] = useActionState(isEdit ? updateClassAction : createClassAction, initialState);

  /* ⚠ A SHEET LEAVES ITSELF (22 Sep 2026). As a PAGE the action redirects and
     this never runs. As a SHEET it hands back `ok` instead, and ONE `back()` is
     enough for both entries (the confirm's orphan and the desk's `?new=1`). No
     setState here: the confirm is taken down by the render reading `state.ok`. */
  useEffect(() => {
    if (!state.ok) return;
    const t = setTimeout(() => {
      router.back();
      router.refresh();
    }, 600);
    return () => clearTimeout(t);
  }, [state.ok, router]);

  const atRoom = whereKind === "room";
  const atStudio = whereKind === "studio";
  const atPlace = whereKind === "map";
  /* the room the class is in: the studio's own, or the venue's */
  const roomList = atStudio ? venueRooms : atRoom ? rooms : [];
  const room = roomList.find((r) => r.id === roomId) ?? null;
  /* a room defines what the class can hold (prototype 15507-15509); a map link is your number */
  const capacity = room ? room.capacity : capacityInput;
  /* ⚠ YOUR OWN STUDIO (26 Sep 2026): the database accepts the room at birth */
  const ownVenue = atStudio && venue !== null && ownedStudioIds.includes(venue.id);
  /* a link, and a real one — the same http(s) test the database applies */
  const mapsLinkOk = /^https?:\/\/\S+$/i.test(mapsUrl.trim());

  const basicsOk = style.length > 0 && date.length > 0 && endTime > startTime;
  /** ⚠ EDITING AN OLD CLASS IS NOT BACKDATING — the rule bites only when the
   *  start has MOVED from what this class already had */
  const keptItsOwnStart = Boolean(
    existing?.session && date === toDateInput(existing.session.startsAt) && startTime === toTimeInput(existing.session.startsAt)
  );
  const startsInThePast = Boolean(date) && !keptItsOwnStart && startHasGone(date, startTime);
  /* the Starts list for the date picked: TODAY offers only what is still ahead */
  const isToday = date !== "" && date === istToday();
  const nowHm = isToday ? istNowHm() : "";
  const startRows = TIMES.slice(0, -1).filter((t) => !isToday || t > nowHm || (keptItsOwnStart && t === startTime));
  /* an end after the start and within five hours (the old one kept if editing) */
  const endRows = TIMES.filter((t) => endFits(startTime, t) || (existing?.session && t === endTime && t > startTime));
  const tooLong = endTime > startTime && !endFits(startTime, endTime);
  const pickStart = (v: string) => {
    setStartTime(v);
    if (!endFits(v, endTime)) {
      const next = TIMES.find((t) => t > v);
      if (next) setEndTime(next);
    }
  };
  const pickDate = (d: string) => {
    setDate(d);
    if (d === istToday() && startTime <= istNowHm()) {
      const now = istNowHm();
      const next = TIMES.slice(0, -1).find((t) => t > now);
      if (next) pickStart(next);
    }
  };

  const stepOneErr = !style
    ? "Pick a dance style"
    : !level
      ? "Pick a level"
      : !date
        ? "Pick a date"
        : startsInThePast
          ? "That start has already gone — pick a time ahead"
          : endTime <= startTime
            ? "End after the start"
          : tooLong
            ? "A session can be at most 5 hours"
          : atRoom && rooms.length === 0
            ? "Add a room first — or use a map link"
          : atRoom && !roomId
            ? "Pick a room"
            : atStudio && !venue
              ? "Pick a studio"
              : atStudio && venue && !roomId
                ? "Pick one of its rooms"
                : atPlace && !mapsLinkOk
                  ? "Paste the Google Maps link"
                  : null;
  const ok = basicsOk && !stepOneErr;

  /* WHAT STANDS BETWEEN A MAP-LINK CLASS AND DISCOVER (15551-15563) */
  const blockers: string[] = [];
  if (atPlace) {
    if (!mapsLinkOk) blockers.push("Paste the Google Maps link for where it happens");
    if (!(capacity > 0)) blockers.push("Say how many people can book");
    if (Number.isNaN(Number(priceInr))) blockers.push("Set a price — put 0 if it is free");
  }

  /* ⚠ PAY IS OFF THE FORM (11 Oct 2026): the ask takes the seat's own rate */
  const peoplePayload = JSON.stringify({ artistUserId: teacherId });

  const whereWords = atStudio && venue ? `${room?.name ?? "a room"} at ${venue.name}` : atPlace ? (placeLabel ?? (mapsLinkOk ? "the place you linked" : "—")) : room?.name ?? "—";
  const whoWords = selfTeacher ? "You" : other?.name ?? "Nobody asked yet";

  /* ⚠ ONE SENTENCE FOR WHAT A SAVE DOES (11 Oct 2026) — the confirm sheet and
     the last step's note read it, so they cannot disagree */
  /* ⚠ B24 (11 Oct 2026): a person who ALREADY said yes is not "asked" again
     unless the time or the place moved — the action re-asks only then */
  const placeOrTimeMoved =
    !existing ||
    !keptItsOwnStart ||
    (existing.session ? endTime !== toTimeInput(existing.session.endsAt) : true) ||
    (atPlace ? mapsUrl.trim() !== (existing.mapsUrl ?? "") : roomId !== existing.roomId) ||
    (atStudio ? venue?.id !== existing.venueBusinessId : Boolean(existing.venueBusinessId));
  const teacherSaidYes = Boolean(
    !selfTeacher && other && artistClassPerson && artistClassPerson.userId === other.id && artistClassPerson.status === "confirmed"
  );
  const venueSaidYes = Boolean(atStudio && venue && existing?.venueBusinessId === venue.id && existing?.venueStatus === "accepted");
  const askedNames = [
    !selfTeacher && other && !(teacherSaidYes && !placeOrTimeMoved) ? other.name : null,
    atStudio && venue && !ownVenue && !(venueSaidYes && !placeOrTimeMoved) ? venue.name : null,
  ].filter((n): n is string => Boolean(n));
  const noTeacher = !selfTeacher && !other;
  /* no auto-publish (11 Oct 2026, the user: "no auto publish required") —
     every save is a draft, and Publish — on Classes or on the class's own page —
     puts it on Discover */
  const saveSentence = noTeacher
    ? "Saved as a draft — nobody is asked yet. Pick who takes it, then publish it."
    : askedNames.length
      ? `${askedNames.join(" and ")} ${askedNames.length > 1 ? "are" : "is"} asked. Publish it once they say yes.`
      : "Saved as a draft — publish it when you are ready.";

  return (
    <FormPage
      title={isEdit ? "Edit class" : "Add class"}
      steps={STEPS}
      step={step}
      sub={isEdit ? "Changing the time or the place asks everyone again." : undefined}
      sheet={sheet}
      onClose={() => router.back()}
      onBack={() => (step > 0 ? setStep(step - 1) : router.back())}
    >
      <form action={formAction} ref={formRef}>
        {/* every field lives in state and submits as a hidden input, so stepping
            between the two halves never drops what you already answered */}
        <input type="hidden" name="businessId" value={businessId} />
        {/* where a save lands — an artist's register is Your classes, in one hop (19 Sep 2026) */}
        <input type="hidden" name="after" value={isArtist ? "/my-classes" : `/business/${businessId}/classes`} />
        {/* which shell this form is in, so the action hands back instead of redirecting */}
        {sheet ? <input type="hidden" name="sheet" value="1" /> : null}
        {isEdit && existing && <input type="hidden" name="classId" value={existing.id} />}
        <input type="hidden" name="style" value={style} />
        <input type="hidden" name="level" value={level} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="startTime" value={startTime} />
        <input type="hidden" name="endTime" value={endTime} />
        <input type="hidden" name="roomId" value={atPlace ? "" : roomId ?? ""} />
        {/* the room's name, or the one the class already has while its list loads */}
        <input type="hidden" name="room" value={atPlace ? "" : room?.name ?? (existing && roomId === existing.roomId ? (existing.room ?? "") : "")} />
        <input type="hidden" name="poster" value={poster ?? ""} />
        <input type="hidden" name="priceInr" value={priceInr} />
        <input type="hidden" name="capacity" value={capacity} />
        <input type="hidden" name="allowsStudioMemberships" value={allowsStudioMem ? "1" : ""} />
        <input type="hidden" name="people" value={peoplePayload} />
        {/* WHERE: the venue, or the map link (18 Sep 2026) */}
        <input type="hidden" name="venueBusinessId" value={atStudio && venue ? venue.id : ""} />
        <input type="hidden" name="lat" value={atPlace && geo ? String(geo.lat) : ""} />
        <input type="hidden" name="lng" value={atPlace && geo ? String(geo.lng) : ""} />
        <input type="hidden" name="mapsUrl" value={atPlace ? mapsUrl : ""} />

        {step === 0 ? (
          <>
            <div style={labelStyle}>1 · CLASS DATE &amp; TIME</div>
            <div style={{ fontSize: 12, color: SUB, marginBottom: 4 }}>Date</div>
            {/* ⚠ `min` IS THE PICKER'S OWN FLOOR (28 Sep 2026); `startsInThePast`
                is the rule, because a date alone cannot tell you 19:00 today has gone */}
            <input type="date" min={istToday()} value={date} onChange={(e) => pickDate(e.target.value)} aria-label="Class date" style={{ ...inputStyle, colorScheme: "dark" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: SUB, marginBottom: 4 }}>Starts</div>
                <Pick
                  value={startTime}
                  rows={startRows.map((t) => ({ value: t, label: t }))}
                  onPick={pickStart}
                  ariaLabel="Starts"
                  style={{ ...inputStyle, cursor: "pointer" }}
                  searchPlaceholder="Search times…"
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: SUB, marginBottom: 4 }}>Ends</div>
                <Pick
                  value={endTime}
                  rows={endRows.map((t) => ({ value: t, label: t }))}
                  onPick={setEndTime}
                  ariaLabel="Ends"
                  style={{ ...inputStyle, cursor: "pointer" }}
                  searchPlaceholder="Search times…"
                />
              </div>
            </div>

            <div style={labelStyle}>2 · DANCE STYLE</div>
            <DosStylePicker
              value={style}
              onChange={setStyle}
              suggested={suggestedStyles.length ? suggestedStyles : COMMON_STYLES}
            />

            <div style={labelStyle}>3 · LEVEL</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {DOS_LEVELS.map(([code, word]) => (
                <span key={code} role="button" tabIndex={0} aria-pressed={level === code} onClick={() => setLevel(code)} onKeyDown={dosKey} style={{ ...chipStyle(level === code), display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <LevelGlyph code={code} /> {word}
                </span>
              ))}
            </div>

            <div style={labelStyle}>4 · WHERE</div>
            {/* ONE PLACE TO SAY WHERE (11 Oct 2026): the answers are the business
                type's, the switch is the app's one column switch */}
            <div role="group" aria-label="Where the class happens" style={{ ...columnTrack(), marginBottom: 10 }}>
              {whereOptions.map(([k, word]) => {
                const on = whereKind === k;
                return (
                  <button key={k} type="button" aria-pressed={on} onClick={() => pickWhere(k)} style={columnTab(on)}>
                    {word}
                  </button>
                );
              })}
            </div>
            {atRoom ? (
              <>
                {studioPlace ? <div style={{ fontSize: 11.5, fontWeight: 700, color: SUB, margin: "0 0 8px" }}>{studioPlace}</div> : null}
                <RoomList rooms={rooms} roomId={roomId} onPick={setRoomId} emptyWords="No rooms yet. Add one in Rooms on the studio's home and it will be pickable here — a room also decides what the class can hold." />
              </>
            ) : atStudio ? (
              <>
                {venue ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, background: EL, border: `1.5px solid ${INK}`, borderRadius: 14, padding: "11px 13px", marginBottom: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800 }}>{venue.name}</div>
                      {ownVenue ? (
                        <div style={{ fontSize: 10.5, fontWeight: 800, color: "#22C55E" }} data-testid="own-venue">Your studio · no request needed</div>
                      ) : venue.sub ? (
                        <div style={{ fontSize: 11, color: SUB }}>{venue.sub}</div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      aria-label="Pick a different studio"
                      onClick={() => {
                        setVenue(null);
                        setVenueRooms([]);
                        setRoomId(null);
                      }}
                      style={{ fontSize: 11, fontWeight: 800, color: SUB, background: "transparent", border: `1.5px solid ${EL}`, borderRadius: 999, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit" }}
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
                {/* ⚠ A MAP LINK, NOT A MAP (20 Sep 2026) — the place's own Google
                    Maps link is more accurate than a pin dragged around a map */}
                <input
                  value={mapsUrl}
                  onChange={(e) => setMapsUrl(e.target.value)}
                  aria-label="Google Maps link"
                  inputMode="url"
                  placeholder="https://maps.app.goo.gl/… or https://maps.google.com/…"
                  style={inputStyle}
                />
                {mapsUrl.trim() && !/^https?:\/\//i.test(mapsUrl.trim()) ? (
                  <div style={{ fontSize: 11.5, color: "#F87171", fontWeight: 700, marginTop: 6 }}>
                    That is not a web address — open the place in Google Maps, press Share, and paste the link it gives you.
                  </div>
                ) : null}
                <div style={{ marginTop: 10 }}>
                  <div style={labelStyle}>WHAT TO CALL IT</div>
                  <input
                    value={placeLabel ?? ""}
                    onChange={(e) => setPlaceLabel(e.target.value || null)}
                    aria-label="What to call this place"
                    maxLength={80}
                    placeholder="The studio's name, or your space"
                    style={inputStyle}
                  />
                </div>
              </>
            )}
          </>
        ) : (
          <>
            {/* ── WHO TAKES IT (11 Oct 2026): you, born confirmed; or somebody on
                DanceOS, asked. ⚠ The people search leaves you out on purpose, so
                "You" is the one door to naming yourself. ── */}
            <div style={labelStyle}>5 · WHO TAKES IT</div>
            {meId ? (
              <div role="group" aria-label="Who takes this class" style={{ ...columnTrack(), marginBottom: 10 }}>
                <button type="button" aria-pressed={whoKind === "me"} aria-label="I take this class myself" onClick={() => setWhoKind("me")} style={columnTab(whoKind === "me")}>
                  You
                </button>
                <button type="button" aria-pressed={whoKind === "other"} aria-label="Somebody else takes this class" onClick={() => setWhoKind("other")} style={columnTab(whoKind === "other")}>
                  Somebody else
                </button>
              </div>
            ) : null}
            {selfTeacher ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 13, marginBottom: 6, background: EL, border: `1.5px solid ${INK}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 900 }}>You</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>you take this class</div>
                </div>
                <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: "#22C55E" }} data-testid="self-teacher">No confirmation needed</span>
              </div>
            ) : other ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 13, marginBottom: 6, background: EL, border: `1.5px solid ${INK}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 900 }}>{other.name}</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>takes this class</div>
                </div>
                {artistClassPerson && artistClassPerson.userId === other.id ? (
                  <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: classPersonTint(artistClassPerson.status) }}>{classPersonWord(artistClassPerson.status)}</span>
                ) : (
                  <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: "#F59E0B" }}>Will be asked</span>
                )}
                <button type="button" aria-label="Pick somebody else to take this class" onClick={() => setOther(null)} style={{ fontSize: 11, fontWeight: 800, color: SUB, background: "transparent", border: `1.5px solid ${EL}`, borderRadius: 999, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                  Change
                </button>
              </div>
            ) : (
              <PeoplePicker title="SEARCH DANCEOS, THEN ASK THEM" ariaLabel="Search DanceOS for who takes this class" actionWord="Ask ›" actionColor="#0D9488" onPick={(p) => setOther({ id: p.id, name: p.fullName })} pickLabel={(p) => `${p.fullName} takes this class`} />
            )}
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>Assistants are added from the class page once it exists.</div>

            {/* CAPACITY — the room decides it when there is one (15505-15515) */}
            <div style={labelStyle}>6 · CAPACITY</div>
            {room ? (
              <div style={{ background: CARD, borderRadius: 14, padding: "12px 14px" }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {room.capacity} students <span style={{ color: SUB, fontWeight: 500 }}>· defined by {room.name}</span>
                </div>
              </div>
            ) : (
              <input type="number" min={1} max={500} value={capacityText} onChange={(e) => setCapacityText(e.target.value)} onBlur={() => setCapacityText(String(capacityInput))} aria-label="Capacity" style={inputStyle} />
            )}

            <div style={labelStyle}>7 · PRICE</div>
            <div style={{ fontSize: 12, color: SUB, marginBottom: 4 }}>
              ₹ / session <span style={{ color: "var(--muted)" }}>· 0 = free</span>
            </div>
            <input type="number" min={0} max={1000000} value={priceText} onChange={(e) => setPriceText(e.target.value)} onBlur={() => setPriceText(String(priceInr))} aria-label="Price per session" style={inputStyle} />
            {priceInr === 0 && <div style={{ fontSize: 12, color: "#22C55E", fontWeight: 700, marginTop: 6 }}>This session is free.</div>}

            {/* ── MEMBERSHIPS (19 Sep 2026; one switch since 4 Oct 2026) ── */}
            <div style={labelStyle}>8 · MEMBERSHIPS</div>
            <SwitchRow word="Studio memberships" on={allowsStudioMem} onFlip={() => setAllowsStudioMem(!allowsStudioMem)} />

            {/* POSTER — drawn, not uploaded, so it can never disagree with the class it belongs to (6478-6481) */}
            <div style={labelStyle}>
              9 · POSTER <span style={{ fontWeight: 500, letterSpacing: 0 }}>· optional</span>
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
          </>
        )}

        {state.error && <div style={{ fontSize: 12, color: "#EF4444", fontWeight: 700, marginTop: 14 }}>{state.error}</div>}

        {/* WHAT HAPPENS ON SAVE — the same sentence the confirm sheet carries */}
        {step === STEPS.length - 1 ? <FormNote blockers={atPlace && blockers.length ? blockers : undefined}>{saveSentence}</FormNote> : null}

        <FormBar>
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
                  {isPending ? "Saving…" : "Save"}
                </button>
              ) : (
                /* ⚠ "SAVE", EVERYWHERE (11 Oct 2026): one word whatever the save
                   goes on to ask — the sentence under the form says what happens */
                <button
                  type="button"
                  disabled={!ok || isPending}
                  onClick={() => setConfirm(true)}
                  style={{ flex: 1.6, padding: "14px", borderRadius: 999, border: "none", background: INK, color: !ok ? "var(--muted)" : LILAC, fontWeight: 700, fontSize: 14, cursor: ok ? "pointer" : "default", fontFamily: "inherit" }}
                >
                  {isPending ? "Saving…" : "Save"}
                </button>
              )}
            </>
          )}
        </FormBar>
      </form>

      {confirm && !isEdit && !state.ok ? (
        <FormConfirm
          label="Save this class?"
          title="Save this class?"
          sub={saveSentence}
          confirmWord="Save"
          busy={isPending}
          spend={false}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            formRef.current?.requestSubmit();
          }}
        >
          {/* the calendar-style card (15595-15617) */}
          {(() => {
            const styleColor = dosStyleColor(style);
            return (
              <div style={{ borderRadius: 14, overflow: "hidden", background: CARD, border: `1.5px solid ${EL}` }}>
                <div style={{ background: `${styleColor}40`, padding: "9px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800 }}>🕒 {startTime}–{endTime} · {date}</span>
                </div>
                <div style={{ background: `${styleColor}22`, padding: "9px 10px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 9, background: CARD, border: `1.5px solid ${styleColor}55`, borderRadius: 999, padding: "4px 14px 4px 5px" }}>
                    <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: 6, background: styleColor, display: "inline-block" }} />
                    <span style={{ fontSize: 15, fontWeight: 800, color: styleColor }}>{style}</span>
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: SUB }}>{DOS_LEVEL_LABEL[level] ?? level}</span>
                </div>
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, color: SUB }}>👤 {whoWords}</div>
                  <div style={{ fontSize: 12, color: SUB, marginTop: 4 }}>● {whereWords} · cap {capacity}</div>
                  {atRoom && studioPlace ? <div style={{ fontSize: 12, color: SUB, marginTop: 4 }}>📍 {studioPlace}</div> : null}
                  <div style={{ fontSize: 12, marginTop: 4, fontWeight: 800, color: priceInr === 0 ? "#22C55E" : INK }}>{priceInr === 0 ? "FREE" : `₹${priceInr}/session`}</div>
                  {priceInr > 0 ? <div style={{ fontSize: 11.5, marginTop: 4, color: "#22C55E", fontWeight: 700 }}>↩️ {refundPolicyWords(refundWindowHours)}</div> : null}
                </div>
              </div>
            );
          })()}
        </FormConfirm>
      ) : null}

      <FormToast msg={toast} />
    </FormPage>
  );
}
