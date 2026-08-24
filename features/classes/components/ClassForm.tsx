"use client";

import { useActionState, useState } from "react";
import { PosterBlock } from "@/features/classes/components/poster";
import { dosKey } from "@/features/classes/components/ShareSheet";
import {
  createClassAction,
  updateClassAction,
  type ClassActionState,
} from "@/features/classes/server-actions/classes";
import { DOS_LEVELS, DOS_STYLE_REG, dosStyleColor } from "@/lib/constants/styles";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
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
  color: "#707070",
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

const STEPS = ["Basics & the room", "People & price"];

/* the claim badge the prototype prints beside a named person (15473-15475) */
const claimWord = (status: string) =>
  status === "confirmed" ? "✓ Confirmed" : status === "rejected" ? "✕ Said no" : "⏳ Asked";
const claimTint = (status: string) =>
  status === "confirmed" ? "#22C55E" : status === "rejected" ? "#F87171" : "#F59E0B";

interface AssistantIntent {
  userId: string;
  canAttendance: boolean;
  canRefunds: boolean;
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
}: {
  tenantId: string;
  existing?: DanceClass;
  rooms: Room[];
  team: TeamMember[];
  claims?: ClassClaim[];
}) {
  const isEdit = Boolean(existing);
  const [step, setStep] = useState(0);
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
  const [assistants, setAssistants] = useState<AssistantIntent[]>(
    claims
      .filter((c) => c.kind === "assistant")
      .map((c) => ({ userId: c.userId, canAttendance: c.canAttendance, canRefunds: c.canRefunds }))
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

  const claimOf = (userId: string) => claims.find((c) => c.userId === userId);
  const assistantOf = (userId: string) => assistants.find((a) => a.userId === userId);

  const toggleAssistant = (userId: string) => {
    setAssistants((list) =>
      list.some((a) => a.userId === userId)
        ? list.filter((a) => a.userId !== userId)
        : [...list, { userId, canAttendance: false, canRefunds: false }]
    );
  };
  const toggleJob = (userId: string, job: "canAttendance" | "canRefunds") => {
    setAssistants((list) =>
      list.map((a) => (a.userId === userId ? { ...a, [job]: !a[job] } : a))
    );
  };

  const peoplePayload = JSON.stringify({
    artistUserId,
    assistants: assistants.filter((a) => a.userId !== artistUserId),
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
        padding: "14px 16px 40px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: 21, fontWeight: 800, fontFamily: DOS_DISPLAY, letterSpacing: -0.5, margin: "10px 0 2px" }}>
        {isEdit ? "Edit class" : "Add class"}
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

      <form action={formAction}>
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
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Class date"
              style={{ ...inputStyle, colorScheme: "dark" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
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
                style={{ ...inputStyle, flex: 1, appearance: "none", cursor: "pointer" }}
              >
                {TIMES.slice(0, -1).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                aria-label="Ends"
                style={{ ...inputStyle, flex: 1, appearance: "none", cursor: "pointer" }}
              >
                {TIMES.filter((t) => t > startTime).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div style={labelStyle}>2 · DANCE STYLE</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxHeight: 168, overflowY: "auto" }}>
              {DOS_STYLE_REG.map(([name, color]) => {
                const on = style === name;
                return (
                  <span
                    key={name}
                    role="button"
                    tabIndex={0}
                    onClick={() => setStyle(name)}
                    onKeyDown={dosKey}
                    style={{
                      ...chipStyle(on),
                      ...(on ? { borderColor: color, color: "#fff", background: `${color}33` } : {}),
                    }}
                  >
                    {name}
                  </span>
                );
              })}
            </div>

            <div style={labelStyle}>3 · LEVEL</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {DOS_LEVELS.map(([code, word, emoji]) => (
                <span
                  key={code}
                  role="button"
                  tabIndex={0}
                  onClick={() => setLevel(code)}
                  onKeyDown={dosKey}
                  style={chipStyle(level === code)}
                >
                  {emoji} {word}
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

        {/* the footer is the step's own: nothing publishes from the first half */}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          {step === 0 ? (
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={!basicsOk}
              style={{
                flex: 1,
                padding: "13px",
                borderRadius: 999,
                border: "none",
                background: basicsOk ? INK : EL,
                color: basicsOk ? LILAC : "#707070",
                fontWeight: 900,
                fontSize: 13.5,
                cursor: basicsOk ? "pointer" : "default",
                fontFamily: "inherit",
              }}
            >
              Next · people &amp; price
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
                    type="submit"
                    name="status"
                    value="draft"
                    disabled={!ok || isPending}
                    style={{
                      flex: 1,
                      padding: "13px",
                      borderRadius: 999,
                      border: `1.5px solid ${EL}`,
                      background: "transparent",
                      color: ok ? INK : "#707070",
                      fontWeight: 800,
                      fontSize: 13.5,
                      cursor: ok ? "pointer" : "default",
                      fontFamily: "inherit",
                    }}
                  >
                    Save as draft
                  </button>
                  <button
                    type="submit"
                    name="status"
                    value="published"
                    disabled={!ok || isPending}
                    style={{
                      flex: 1.3,
                      padding: "13px",
                      borderRadius: 999,
                      border: "none",
                      background: ok ? INK : EL,
                      color: ok ? LILAC : "#707070",
                      fontWeight: 900,
                      fontSize: 13.5,
                      cursor: ok ? "pointer" : "default",
                      fontFamily: "inherit",
                    }}
                  >
                    {isPending ? "Working…" : "Publish"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </form>
    </div>
  );
}
