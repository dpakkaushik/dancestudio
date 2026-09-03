"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { PosterBlock } from "@/features/classes/components/poster";
import { dosKey } from "@/features/classes/components/ShareSheet";
import {
  checkRoomClashAction,
  createClassAction,
  updateClassAction,
  type ClassActionState,
  type RoomClash,
} from "@/features/classes/server-actions/classes";
import { DosStylePicker } from "@/components/ui/DosStyleKit";
import { DOS_LEVELS, DOS_LEVEL_LABEL, dosStyleColor } from "@/lib/constants/styles";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import type { TeamMember } from "@/repositories/tenants";
import type { ClassClaim } from "@/types/claim";
import type { ClassLevel, DanceClass, PosterChoice } from "@/types/class";
import type { Room } from "@/types/room";

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

const STEPS = ["The session", "Price & publish"];

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

interface AssistantIntent {
  userId: string;
  canAttendance: boolean;
  canRefunds: boolean;
  /** What the studio pays them per session (Step 13). Owner-only: the RPCs
   *  refuse a rate from anybody else, so a trainer's save never sends one. */
  payInr: number;
}

/** Create/edit a class — the prototype's two-step S_classform wizard
 *  (DanceOSApp.jsx:15309-15531). Step 1 is what the class IS and where it runs;
 *  step 2 is who is taking it and what it costs, because those are the two
 *  decisions that gate publishing. The room comes from the studio's own rooms
 *  (15381-15396) and defines the capacity (15507-15509); the people are ASKED
 *  and answer for themselves (15455). Poster uploads stay on the backlog — the
 *  three drawn designs are the prototype's own default. */
export function ClassForm({
  tenantId,
  existing,
  rooms,
  team,
  claims = [],
  isOwner = false,
  studioPlace = "",
}: {
  tenantId: string;
  existing?: DanceClass;
  rooms: Room[];
  team: TeamMember[];
  claims?: ClassClaim[];
  /** the studio's own address, printed above the room list (prototype 15381:
   *  `ownStudio().loc` — a room means nothing until you know which building) */
  studioPlace?: string;
  /** Only the owner sets what a session pays (prototype 18434: payout approval
   *  is owner-only and cannot be granted). A trainer sees the people pickers
   *  without the money. */
  isOwner?: boolean;
}) {
  const isEdit = Boolean(existing);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };
  /* the confirm sheet before a publish (15586-15625) — the button sets which
     status the form will carry, and the sheet's own button submits it */
  const [confirm, setConfirm] = useState<"draft" | "publish" | null>(null);
  /* system back closes the confirm sheet, exactly as its scrim does */
  useCloseOnBack(() => setConfirm(null), Boolean(confirm));
  /* ROOM ALREADY BUSY (F3, prototype 15628-15632 / dosClash 4023): asked of the
     database BEFORE the sheet opens, so the answer is read in the sheet rather
     than as a refusal after Publish. Held here because the sheet is drawn from
     this state, not fetched by it. */
  const [clash, setClash] = useState<RoomClash>(null);
  const [asking, setAsking] = useState(false);
  /* WHAT THIS FORM IS ABOUT TO SUBMIT, IN THE DOM RATHER THAN IN STATE. React
     batches state updates inside a click handler, so setting a status and calling
     requestSubmit() in the same tick submits the value from the PREVIOUS render —
     which sent a clashing class as `published` and had the database refuse it.
     Written straight to the input, so what is read is what was just decided. */
  const statusRef = useRef<HTMLInputElement>(null);
  const setSubmitStatus = (v: "draft" | "published") => {
    if (statusRef.current) statusRef.current.value = v;
  };
  const [style, setStyle] = useState<string>(existing?.style ?? "");
  const [level, setLevel] = useState<ClassLevel>(existing?.level ?? "all");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [date, setDate] = useState(existing?.session ? toDateInput(existing.session.startsAt) : "");
  const [startTime, setStartTime] = useState(
    existing?.session ? toTimeInput(existing.session.startsAt) : "19:00"
  );
  const [endTime, setEndTime] = useState(
    existing?.session ? toTimeInput(existing.session.endsAt) : "20:00"
  );
  const [roomId, setRoomId] = useState<string | null>(existing?.roomId ?? null);
  const [poster, setPoster] = useState<PosterChoice | null>(existing?.poster ?? null);
  const [priceInr, setPriceInr] = useState(existing?.priceInr ?? 300);
  const [capacityInput, setCapacityInput] = useState(existing?.capacity ?? 16);

  const artistClaim = claims.find((c) => c.kind === "artist");
  const [artistUserId, setArtistUserId] = useState<string | null>(artistClaim?.userId ?? null);
  const [artistPayInr, setArtistPayInr] = useState(artistClaim?.payPerSessionInr ?? 0);
  const [assistants, setAssistants] = useState<AssistantIntent[]>(
    claims
      .filter((c) => c.kind === "assistant")
      .map((c) => ({
        userId: c.userId,
        canAttendance: c.canAttendance,
        canRefunds: c.canRefunds,
        payInr: c.payPerSessionInr,
      }))
  );

  const [state, formAction, isPending] = useActionState(
    isEdit ? updateClassAction : createClassAction,
    initialState
  );

  const room = rooms.find((r) => r.id === roomId) ?? null;
  /* a room defines what the class can hold (prototype 15507-15509) */
  const capacity = room ? room.capacity : capacityInput;
  const basicsOk = title.trim().length > 0 && style.length > 0 && date.length > 0 && endTime > startTime;
  const ok = basicsOk;
  /* the first missing answer, in the words the button will wear (15573-15578) */
  const stepOneErr = !style ? "Pick a dance style" : !level ? "Pick a level" : !date ? "Pick a date" : rooms.length > 0 && !roomId ? "Pick a room" : !title.trim() ? "Name the class" : endTime <= startTime ? "End after the start" : null;
  /* BEFORE THIS CAN GO ON DISCOVER (15551-15563, dosClassBlockers): every reason it
     cannot go live, named by the field that answers it. Save draft is never blocked
     by these. */
  const blockers: string[] = [];
  if (!style) blockers.push("Pick a dance style");
  if (!level) blockers.push("Pick a level");
  if (!date) blockers.push("Give it a date and a time");
  if (rooms.length > 0 && !roomId) blockers.push("Say where it happens — a room");
  if (!(capacity > 0)) blockers.push("Say how many people can book — a class with no places cannot be booked");
  if (Number.isNaN(Number(priceInr))) blockers.push("Set a price — put 0 if it is free");
  if (!title.trim()) blockers.push("Name the class");
  const canPublish = blockers.length === 0 && ok;

  const claimOf = (userId: string) => claims.find((c) => c.userId === userId);
  const assistantOf = (userId: string) => assistants.find((a) => a.userId === userId);

  const toggleAssistant = (userId: string) => {
    setAssistants((list) =>
      list.some((a) => a.userId === userId)
        ? list.filter((a) => a.userId !== userId)
        : [...list, { userId, canAttendance: false, canRefunds: false, payInr: 0 }]
    );
  };
  const toggleJob = (userId: string, job: "canAttendance" | "canRefunds") => {
    setAssistants((list) =>
      list.map((a) => (a.userId === userId ? { ...a, [job]: !a[job] } : a))
    );
  };
  const setAssistantPay = (userId: string, payInr: number) => {
    setAssistants((list) => list.map((a) => (a.userId === userId ? { ...a, payInr } : a)));
  };

  /* the rate only travels when an OWNER is saving — the RPCs reject it from
     anybody else, so sending it from a trainer's form would be an error rather
     than a permission check */
  const peoplePayload = JSON.stringify({
    artistUserId,
    ...(isOwner ? { artistPayInr } : {}),
    assistants: assistants
      .filter((a) => a.userId !== artistUserId)
      .map((a) => (isOwner ? a : { userId: a.userId, canAttendance: a.canAttendance, canRefunds: a.canRefunds })),
  });

  return (
    <div
      style={{
        background: LILAC,
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        minHeight: "100vh",
        padding: "14px 16px 150px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 2px" }}>
        <button type="button" aria-label={step > 0 ? "Back a step" : "Back"} onClick={() => (step > 0 ? setStep(step - 1) : router.back())} style={{ fontSize: 20, cursor: "pointer", lineHeight: 1, background: "none", border: "none", color: INK, padding: 0, fontFamily: "inherit" }}>
          ←
        </button>
        <div style={{ fontSize: 21, fontWeight: 800, fontFamily: DOS_DISPLAY, letterSpacing: -0.5, flex: 1 }}>{isEdit ? "Edit class" : "Add class"}</div>
      </div>
      <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.5 }}>
        {isEdit
          ? "Your saved details stay put — step through and change only what you need"
          : `Step ${step + 1} of ${STEPS.length} — ${STEPS[step]}`}
      </div>
      {/* progress (prototype 15547-15550) */}
      <div style={{ display: "flex", gap: 5, margin: "12px 0 4px" }}>
        {STEPS.map((s, i) => (
          <div
            key={s}
            style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? INK : EL, transition: "all .2s" }}
          />
        ))}
      </div>

      <form action={formAction} ref={formRef}>
        {!isEdit ? <input type="hidden" name="status" ref={statusRef} defaultValue="published" /> : null}
        {/* every field lives in state and submits as a hidden input, so stepping
            between the two halves never drops what you already answered */}
        <input type="hidden" name="tenantId" value={tenantId} />
        {isEdit && existing && <input type="hidden" name="classId" value={existing.id} />}
        <input type="hidden" name="style" value={style} />
        <input type="hidden" name="level" value={level} />
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="startTime" value={startTime} />
        <input type="hidden" name="endTime" value={endTime} />
        <input type="hidden" name="roomId" value={roomId ?? ""} />
        <input type="hidden" name="room" value={room?.name ?? ""} />
        <input type="hidden" name="poster" value={poster ?? ""} />
        <input type="hidden" name="priceInr" value={priceInr} />
        <input type="hidden" name="capacity" value={capacity} />
        <input type="hidden" name="people" value={peoplePayload} />

        {step === 0 ? (
          <>
            <div style={labelStyle}>1 · CLASS DATE &amp; TIME</div>
            <div style={{ fontSize: 12, color: SUB, marginBottom: 4 }}>Date</div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Class date"
              style={{ ...inputStyle, colorScheme: "dark" }}
            />
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
              <select
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                aria-label="Ends"
                style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}
              >
                {TIMES.filter((t) => t > startTime).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              </div>
            </div>

            <div style={labelStyle}>2 · DANCE STYLE</div>
            {/* the prototype's searchable picker (15336-15360): the picked style's coin on a
                closed row, a search box and the registry under it — not a wall of 66 chips */}
            <DosStylePicker value={style} onChange={setStyle} />

            <div style={labelStyle}>3 · LEVEL</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {DOS_LEVELS.map(([code, word]) => (
                <span
                  key={code}
                  role="button"
                  tabIndex={0}
                  aria-pressed={level === code}
                  onClick={() => setLevel(code)}
                  onKeyDown={dosKey}
                  style={{ ...chipStyle(level === code), display: "inline-flex", alignItems: "center", gap: 7 }}
                >
                  <LevelGlyph code={code} /> {word}
                </span>
              ))}
            </div>

            <div style={labelStyle}>4 · CLASS NAME</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Hip-Hop · Beginner"
              aria-label="Class name"
              style={inputStyle}
            />

            {/* ── ONE PLACE TO SAY WHERE (prototype 15376-15396): a room belongs
                to a studio, so they are one question — and every room here is
                already yours ── */}
            <div style={labelStyle}>5 · WHERE</div>
            {/* the studio's address over its rooms (prototype 15381) */}
            {studioPlace ? (
              <div style={{ fontSize: 11.5, fontWeight: 700, color: SUB, margin: "-4px 0 8px" }}>{studioPlace}</div>
            ) : null}
            {rooms.length === 0 ? (
              <div
                style={{
                  background: CARD,
                  borderRadius: 14,
                  padding: "12px 14px",
                  fontSize: 12,
                  color: SUB,
                  lineHeight: 1.5,
                }}
              >
                No rooms yet. Add one in <b>Rooms</b> on the studio desk and it will be pickable
                here — a room also decides what the class can hold.
              </div>
            ) : (
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
                      onClick={() => setRoomId(on ? null : r.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 11,
                        background: on ? EL : CARD,
                        border: `1.5px solid ${on ? INK : EL}`,
                        borderRadius: 14,
                        padding: "11px 13px",
                        marginBottom: 8,
                        cursor: "pointer",
                      }}
                    >
                      <span
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          flexShrink: 0,
                          background: on ? "#3B82F633" : EL,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
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
            )}
          </>
        ) : (
          <>
            {/* ── WHO IS TAKING IT, IN THE FORM THAT ASKS (prototype 15445-15479) ── */}
            <div style={labelStyle}>6 · WHO IS TAKING IT</div>
            <div style={{ fontSize: 12, color: SUB, marginBottom: 7 }}>
              They are asked to confirm. Their name goes on the public class once they do.
            </div>
            {team.map((m) => {
              const on = artistUserId === m.userId;
              const claim = claimOf(m.userId);
              return (
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={dosKey}
                  key={m.userId}
                  aria-label={`${m.name} takes this class`}
                  aria-pressed={on}
                  onClick={() => setArtistUserId(on ? null : m.userId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 13,
                    marginBottom: 6,
                    cursor: "pointer",
                    background: on ? EL : CARD,
                    border: `1.5px solid ${on ? INK : EL}`,
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 8,
                      flexShrink: 0,
                      boxSizing: "border-box",
                      border: `2px solid ${on ? INK : EL}`,
                      background: on ? INK : "transparent",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: on ? 900 : 700 }}>{m.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>
                      {m.role}
                      {m.city ? ` · ${m.city}` : ""}
                    </div>
                  </div>
                  {on && claim?.kind === "artist" && (
                    <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: claimTint(claim.status) }}>
                      {claimWord(claim.status)}
                    </span>
                  )}
                </div>
              );
            })}

            {/* ── WHAT A SESSION PAYS (Step 13) ─────────────────────────────
                The studio owner's number, not a platform rate and not a fixed
                one. It rides the ask, so the person confirming sees what they
                are agreeing to, and every session of this class that runs adds
                it to what they are owed. */}
            {isOwner && artistUserId && (
              <>
                <div style={labelStyle}>WHAT A SESSION PAYS THEM</div>
                <input
                  type="number"
                  min={0}
                  max={200000}
                  step={50}
                  value={artistPayInr}
                  aria-label="What a session pays the artist"
                  onChange={(e) => setArtistPayInr(Math.max(0, Number(e.target.value) || 0))}
                  style={inputStyle}
                />
                <div style={{ fontSize: 11.5, color: SUB, marginTop: 6 }}>
                  ₹ per session. Leave it at 0 if this one is on the house. You settle it yourself and record it on
                  the earnings desk — DanceOS does not move the money.
                </div>
              </>
            )}

            <div style={labelStyle}>
              7 · CLASS ASSISTANTS <span style={{ color: "var(--muted)", fontWeight: 600 }}>· optional</span>
            </div>
            <div style={{ fontSize: 12, color: SUB, marginBottom: 7 }}>
              An assistant can hold jobs: checking people in, and settling refunds.
            </div>
            {team.filter((m) => m.userId !== artistUserId).length === 0 && (
              <div style={{ fontSize: 11.5, color: SUB, padding: "2px 2px 8px" }}>
                Nobody else on your team yet — staff invites arrive with the CRM slice.
              </div>
            )}
            {team
              .filter((m) => m.userId !== artistUserId)
              .map((m) => {
                const intent = assistantOf(m.userId);
                const on = Boolean(intent);
                const claim = claimOf(m.userId);
                return (
                  <div
                    key={m.userId}
                    style={{
                      padding: "9px 12px",
                      borderRadius: 13,
                      marginBottom: 6,
                      background: on ? EL : CARD,
                      border: `1.5px solid ${on ? INK : EL}`,
                    }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={dosKey}
                      aria-label={`${m.name} assists on this class`}
                      aria-pressed={on}
                      onClick={() => toggleAssistant(m.userId)}
                      style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                    >
                      <span
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 5,
                          flexShrink: 0,
                          boxSizing: "border-box",
                          border: `2px solid ${on ? INK : EL}`,
                          background: on ? INK : "transparent",
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: on ? 900 : 700 }}>{m.name}</div>
                        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>
                          {m.role}
                          {m.city ? ` · ${m.city}` : ""}
                        </div>
                      </div>
                      {on && claim?.kind === "assistant" && (
                        <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: claimTint(claim.status) }}>
                          {claimWord(claim.status)}
                        </span>
                      )}
                    </div>
                    {on && intent && (
                      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                        {(
                          [
                            ["canAttendance", "Attendance"],
                            ["canRefunds", "Refunds"],
                          ] as Array<["canAttendance" | "canRefunds", string]>
                        ).map(([job, word]) => {
                          const has = intent[job];
                          return (
                            <span
                              role="button"
                              tabIndex={0}
                              onKeyDown={dosKey}
                              key={job}
                              aria-pressed={has}
                              aria-label={`${m.name} holds ${word}`}
                              onClick={() => toggleJob(m.userId, job)}
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                padding: "5px 11px",
                                borderRadius: 999,
                                cursor: "pointer",
                                background: has ? INK : CARD,
                                color: has ? LILAC : SUB,
                                border: `1px solid ${has ? INK : EL}`,
                              }}
                            >
                              {word}
                              {has ? " ✓" : ""}
                            </span>
                          );
                        })}
                        {isOwner && (
                          <label
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, marginLeft: "auto" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: SUB }}>₹/session</span>
                            <input
                              type="number"
                              min={0}
                              max={200000}
                              step={50}
                              value={intent.payInr}
                              aria-label={`What a session pays ${m.name}`}
                              onChange={(e) => setAssistantPay(m.userId, Math.max(0, Number(e.target.value) || 0))}
                              style={{
                                width: 78,
                                boxSizing: "border-box",
                                background: CARD,
                                border: `1px solid ${EL}`,
                                borderRadius: 999,
                                padding: "5px 9px",
                                color: INK,
                                fontSize: 11.5,
                                outline: "none",
                                fontFamily: "inherit",
                              }}
                            />
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

            {/* CAPACITY — the room decides it when there is one (15505-15515) */}
            <div style={labelStyle}>8 · CAPACITY</div>
            {room ? (
              <div style={{ background: CARD, borderRadius: 14, padding: "12px 14px" }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {room.capacity} students{" "}
                  <span style={{ color: SUB, fontWeight: 500 }}>· defined by {room.name}</span>
                </div>
              </div>
            ) : (
              <input
                type="number"
                min={1}
                value={capacityInput}
                onChange={(e) => setCapacityInput(Math.max(1, Number(e.target.value) || 1))}
                aria-label="Capacity"
                style={inputStyle}
              />
            )}

            <div style={labelStyle}>9 · PRICE</div>
            <div style={{ fontSize: 12, color: SUB, marginBottom: 4 }}>
              ₹ / session <span style={{ color: "var(--muted)" }}>· 0 = free</span>
            </div>
            <input
              type="number"
              min={0}
              value={priceInr}
              onChange={(e) => setPriceInr(Math.max(0, Number(e.target.value) || 0))}
              aria-label="Price per session"
              style={inputStyle}
            />
            {priceInr === 0 && (
              <div style={{ fontSize: 12, color: "#22C55E", fontWeight: 700, marginTop: 6 }}>
                This session is free.
              </div>
            )}

            {/* POSTER — drawn, not uploaded, so it can never disagree with the
                class it belongs to (prototype 6478-6481). Uploads: backlog. */}
            <div style={labelStyle}>
              10 · POSTER <span style={{ fontWeight: 500, letterSpacing: 0 }}>· optional</span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
              {POSTER_DESIGNS.map(([design, word]) => {
                const on = poster === design;
                return (
                  <span
                    role="button"
                    tabIndex={0}
                    onKeyDown={dosKey}
                    key={design}
                    aria-label={`${word} poster`}
                    aria-pressed={on}
                    onClick={() => setPoster(on ? null : design)}
                    style={{ textAlign: "center", cursor: "pointer", lineHeight: 0 }}
                  >
                    <span
                      style={{
                        display: "block",
                        borderRadius: 10,
                        padding: 3,
                        border: `2px solid ${on ? INK : "transparent"}`,
                      }}
                    >
                      <PosterBlock
                        item={{ title: title || style || "Class", style, styleColor: dosStyleColor(style) }}
                        design={design}
                        size={56}
                      />
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 10.5,
                        fontWeight: 800,
                        color: on ? INK : SUB,
                        marginTop: 5,
                        lineHeight: 1.2,
                      }}
                    >
                      {word}
                    </span>
                  </span>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
              Left unchosen, a class draws its own from its name — so it always says the right thing.
              Tap a chosen design again to go back to that.
            </div>
          </>
        )}

        {state.error && (
          <div style={{ fontSize: 12, color: "#EF4444", fontWeight: 700, marginTop: 14 }}>{state.error}</div>
        )}

        {/* BEFORE THIS CAN GO ON DISCOVER (15551-15563): every reason it cannot go
            live, named by the field that answers it — recomputed as you type */}
        {step === STEPS.length - 1 && !isEdit && blockers.length > 0 ? (
          <div style={{ background: "rgba(248,113,113,.10)", border: "1px solid rgba(248,113,113,.35)", borderRadius: 14, padding: "12px 13px", margin: "16px 0 4px" }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.6, color: "#F87171", marginBottom: 7 }}>BEFORE THIS CAN GO ON DISCOVER</div>
            {blockers.map((bl, i) => (
              <div key={bl} style={{ display: "flex", gap: 8, marginTop: i ? 6 : 0 }}>
                <span aria-hidden="true" style={{ flexShrink: 0, color: "#F87171", fontWeight: 900, fontSize: 12 }}>·</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: SUB, lineHeight: 1.45 }}>{bl}</span>
              </div>
            ))}
          </div>
        ) : null}

        {/* the sticky action bar, gesture-inset aware (15568-15582): the footer is the
            step's own — nothing publishes from the first half */}
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
              style={{
                flex: 1,
                padding: "14px",
                borderRadius: 999,
                border: "none",
                background: stepOneErr ? EL : INK,
                color: stepOneErr ? "var(--muted)" : LILAC,
                fontWeight: 700,
                fontSize: stepOneErr ? 13.5 : 15,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all .18s",
              }}
            >
              {stepOneErr ?? "Continue"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(0)}
                style={{
                  flex: 1,
                  padding: "13px",
                  borderRadius: 999,
                  border: `1.5px solid ${EL}`,
                  background: "transparent",
                  color: INK,
                  fontWeight: 800,
                  fontSize: 13.5,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Back
              </button>
              {isEdit ? (
                <button
                  type="submit"
                  disabled={!ok || isPending}
                  style={{
                    flex: 1.3,
                    padding: "13px",
                    borderRadius: 999,
                    border: "none",
                    background: ok ? INK : EL,
                    color: ok ? LILAC : "#707070",
                    fontWeight: 800,
                    fontSize: 13.5,
                    cursor: ok ? "pointer" : "default",
                    fontFamily: "inherit",
                  }}
                >
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
                    style={{
                      flex: 1,
                      padding: "14px",
                      borderRadius: 999,
                      border: "none",
                      background: CARD,
                      color: ok ? INK : "var(--muted)",
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: ok ? "pointer" : "default",
                      fontFamily: "inherit",
                    }}
                  >
                    Save draft
                  </button>
                  <button
                    type="button"
                    aria-disabled={!canPublish}
                    disabled={isPending}
                    onClick={async () => {
                      if (!canPublish) return fire(blockers[0] ?? "Finish the session first");
                      /* the room is asked before the sheet opens (F3); no room, no question */
                      setAsking(true);
                      const hit = roomId
                        ? await checkRoomClashAction({ tenantId, roomId, date, startTime, endTime, excludeClassId: existing?.id ?? null })
                        : null;
                      setAsking(false);
                      setClash(hit);
                      setSubmitStatus("published");
                      setConfirm("publish");
                    }}
                    style={{
                      flex: 1.4,
                      padding: "14px",
                      borderRadius: 999,
                      border: "none",
                      background: canPublish ? INK : EL,
                      color: canPublish ? LILAC : "var(--muted)",
                      fontWeight: 700,
                      fontSize: 15,
                      cursor: canPublish ? "pointer" : "default",
                      fontFamily: "inherit",
                    }}
                  >
                    {isPending || asking ? "Working…" : "Publish class"}
                  </button>
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
            <div style={{ fontSize: 12, color: SUB, margin: "3px 0 14px" }}>{confirm === "publish" ? "It'll be added to your calendar and go live on Discover." : "Only you can see drafts — edit anytime from the register's Drafts tab."}</div>
            {/* the calendar-style card (15595-15617) */}
            {(() => {
              const styleColor = dosStyleColor(style);
              const artistName = team.find((t) => t.userId === artistUserId)?.name ?? null;
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
                    <div style={{ fontSize: 12, color: SUB }}>
                      👤 {artistName ?? "Not assigned yet"}
                      {!artistName ? <span style={{ color: "var(--muted)" }}>{" · nobody assigned yet"}</span> : null}
                    </div>
                    <div style={{ fontSize: 12, color: SUB, marginTop: 4 }}>● {room?.name ?? "—"} · cap {capacity}</div>
                    {studioPlace ? <div style={{ fontSize: 12, color: SUB, marginTop: 4 }}>📍 {studioPlace}</div> : null}
                    <div style={{ fontSize: 12, marginTop: 4, fontWeight: 800, color: priceInr === 0 ? "#22C55E" : INK }}>{priceInr === 0 ? "FREE" : `₹${priceInr}/session`}</div>
                    {priceInr > 0 ? <div style={{ fontSize: 11.5, marginTop: 4, color: "#22C55E", fontWeight: 700 }}>↩️ Refund until 48 h before start</div> : null}
                  </div>
                </div>
              );
            })()}
            {/* ROOM ALREADY BUSY (15628-15632). One departure from the prototype, stated:
                its second line offers "confirm again to run both", and this database will
                not run both — Step 11 made "no double-booking" a trigger, because the
                prototype's own Rooms footnote (18425) promises it. So the sheet says what
                CAN happen: pick another slot, or keep the class as a draft, which is not
                in any room yet. */}
            {clash && confirm === "publish" ? (
              <div role="alert" style={{ background: "rgba(245,158,11,.14)", border: "1px solid rgba(245,158,11,.4)", borderRadius: 12, padding: "10px 12px", marginTop: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.7, color: "#F59E0B", marginBottom: 3 }}>ROOM ALREADY BUSY</div>
                <div style={{ fontSize: 11.5, lineHeight: 1.45, color: INK }}>
                  {room?.name ?? "That room"} already has {clash.title} at {clash.at}.
                </div>
                <div style={{ fontSize: 10.5, color: SUB, marginTop: 4 }}>Go back and pick another slot, or save it as a draft — a room is never double-booked.</div>
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="button" onClick={() => setConfirm(null)} style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: 999, background: CARD, border: `1.5px solid ${EL}`, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: INK }}>
                Keep editing
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  /* a clashing publish is not offered: the database would refuse it, so
                     the honest second press keeps the class as a draft instead */
                  if (clash && confirm === "publish") setSubmitStatus("draft");
                  setConfirm(null);
                  formRef.current?.requestSubmit();
                }}
                style={{ flex: 1.4, textAlign: "center", padding: 13, borderRadius: 999, background: INK, color: LILAC, fontWeight: 900, fontSize: 13.5, cursor: "pointer", border: "none", fontFamily: "inherit" }}
              >
                {confirm === "publish" ? (clash ? "Save as draft instead" : "Publish it") : "Save draft"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div role="status" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", color: INK, padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650, boxShadow: "0 6px 24px rgba(0,0,0,.45)" }}>{toast}</div> : null}
    </div>
  );
}
