"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  createClassAction,
  updateClassAction,
  type ClassActionState,
} from "@/features/classes/server-actions/classes";
import { DOS_LEVELS, DOS_STYLE_REG } from "@/lib/constants/styles";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import type { ClassLevel, DanceClass } from "@/types/class";

const CARD = "rgba(255,255,255,.07)";
const EL = "rgba(255,255,255,.13)";
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

/** Create/edit a class — essential fields of the prototype's S_classform wizard.
 *  Rooms pickers, artists and assistants arrive with the ERP slice. */
export function ClassForm({
  tenantId,
  existing,
}: {
  tenantId: string;
  existing?: DanceClass;
}) {
  const isEdit = Boolean(existing);
  const [style, setStyle] = useState<string>(existing?.style ?? "");
  const [level, setLevel] = useState<ClassLevel>(existing?.level ?? "all");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [state, formAction, isPending] = useActionState(
    isEdit ? updateClassAction : createClassAction,
    initialState
  );

  const ok = title.trim().length > 0 && style.length > 0;

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
      <Link href={`/business/${tenantId}/classes`} style={{ fontSize: 20, color: INK, textDecoration: "none" }}>
        ←
      </Link>
      <div style={{ fontSize: 21, fontWeight: 800, fontFamily: DOS_DISPLAY, letterSpacing: -0.5, margin: "10px 0 2px" }}>
        {isEdit ? "Edit class" : "Add class"}
      </div>
      <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.5 }}>
        One session, one room, one style — save it as a draft or publish straight away.
      </div>

      <form action={formAction}>
        <input type="hidden" name="tenantId" value={tenantId} />
        {isEdit && existing && <input type="hidden" name="classId" value={existing.id} />}
        <input type="hidden" name="style" value={style} />
        <input type="hidden" name="level" value={level} />

        <div style={labelStyle}>DANCE STYLE</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxHeight: 168, overflowY: "auto" }}>
          {DOS_STYLE_REG.map(([name, color]) => {
            const on = style === name;
            return (
              <span
                key={name}
                role="button"
                tabIndex={0}
                onClick={() => setStyle(name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setStyle(name);
                  }
                }}
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

        <div style={labelStyle}>LEVEL</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DOS_LEVELS.map(([code, word, emoji]) => (
            <span
              key={code}
              role="button"
              tabIndex={0}
              onClick={() => setLevel(code)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setLevel(code);
                }
              }}
              style={chipStyle(level === code)}
            >
              {emoji} {word}
            </span>
          ))}
        </div>

        <div style={labelStyle}>CLASS NAME</div>
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Hip-Hop · Beginner"
          style={inputStyle}
        />

        <div style={labelStyle}>WHEN</div>
        <input
          type="date"
          name="date"
          defaultValue={existing?.session ? toDateInput(existing.session.startsAt) : ""}
          style={{ ...inputStyle, colorScheme: "dark" }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <select
            name="startTime"
            defaultValue={existing?.session ? toTimeInput(existing.session.startsAt) : "19:00"}
            style={{ ...inputStyle, flex: 1, appearance: "none", cursor: "pointer" }}
          >
            {TIMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            name="endTime"
            defaultValue={existing?.session ? toTimeInput(existing.session.endsAt) : "20:00"}
            style={{ ...inputStyle, flex: 1, appearance: "none", cursor: "pointer" }}
          >
            {TIMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div style={labelStyle}>
          ROOM <span style={{ fontWeight: 500, letterSpacing: 0 }}>· optional</span>
        </div>
        <input
          name="room"
          defaultValue={existing?.room ?? ""}
          placeholder="e.g. Studio A"
          style={inputStyle}
        />

        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>PRICE ₹ / SESSION</div>
            <input
              type="number"
              name="priceInr"
              min={0}
              defaultValue={existing?.priceInr ?? 300}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>CAPACITY</div>
            <input
              type="number"
              name="capacity"
              min={1}
              defaultValue={existing?.capacity ?? 16}
              style={inputStyle}
            />
          </div>
        </div>

        {state.error && (
          <div style={{ fontSize: 12, color: "#EF4444", fontWeight: 700, marginTop: 14 }}>{state.error}</div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          {isEdit ? (
            <button
              type="submit"
              disabled={!ok || isPending}
              style={{
                flex: 1,
                padding: "13px",
                borderRadius: 999,
                border: "none",
                background: ok ? INK : EL,
                color: ok ? LILAC : "#707070",
                fontWeight: 800,
                fontSize: 13.5,
                cursor: ok ? "pointer" : "default",
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
                }}
              >
                {isPending ? "Working…" : "Publish"}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
