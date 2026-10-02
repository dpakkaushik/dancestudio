"use client";

import { useState } from "react";
import { DOS_STYLE_REG, dosStyleColor } from "@/lib/constants/styles";
import { DOS_DISPLAY } from "@/lib/design/tokens";
import { dosToolPaint } from "@/lib/format/styleInk";

/* ── the coin (prototype DosStyleCoin 3400): a style's colour as a disc with its
   initials on it — the one glyph a style wears when there is no room for a tile ── */
const initialsOf = (label: string): string => {
  const w = String(label || "").replace(/[^A-Za-z0-9 -]/g, " ").trim().split(/[\s-]+/).filter(Boolean);
  return ((w[0] ? w[0][0] : "") + (w[1] ? w[1][0] : "")).toUpperCase() || "•";
};

export function DosStyleCoin({ label, color, size = 30, active = false }: { label: string; color?: string; size?: number; active?: boolean }) {
  const c = color || dosStyleColor(label) || "#5AC8FA";
  return (
    <span
      title={label}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        flexShrink: 0,
        boxSizing: "border-box",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 900,
        fontSize: Math.max(9, Math.round(size * 0.34)),
        letterSpacing: 0.3,
        fontFamily: DOS_DISPLAY,
        lineHeight: 1,
        background: dosToolPaint(c),
        boxShadow: active ? `0 0 0 1.5px ${c}66, 0 2px 8px -2px ${c}` : "0 1px 4px rgba(0,0,0,.35)",
      }}
    >
      {initialsOf(label)}
    </span>
  );
}

/** "ALL" IS NOT A DANCE STYLE (prototype 3542-3547): it is the absence of a
 *  restriction, so it sits above the list rather than in it, marked as a
 *  category, and it is exclusive both ways. */
export const DOS_ALL_STYLES = "All styles";

const pressKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

const StarGlyph = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 3.4 2.2 4.9 5.3.6-3.9 3.6 1 5.3-4.6-2.6-4.6 2.6 1-5.3L4.5 8.9l5.3-.6z" />
  </svg>
);

/** THE ONE STYLE PICKER — prototype DosStylePicker (3548-3612), lifted whole: a
 *  closed row wearing the picked style's coin (or ＋), which opens onto a
 *  searchable list of the app's one style registry; `all` puts "All styles"
 *  above the list; the prototype's `multi` mode is `DosStyleMultiPicker`
 *  below (2 Oct 2026), on the same list, so a single pick is untouched. The
 *  class, crew and event forms all draw this instead of a native select
 *  (parity audit F4 / W2), so a style is picked the same way everywhere.
 *
 *  The closed row carries `aria-label` (default "Dance style") so a test that
 *  reached the old select by its label still lands on the control; every
 *  option is a button named by its style, exactly. */
export function DosStylePicker({
  value,
  onChange,
  all = false,
  placeholder = "Pick a style",
  ariaLabel = "Dance style",
}: {
  value: string;
  onChange: (style: string) => void;
  all?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const isAll = value === DOS_ALL_STYLES;
  const hits = DOS_STYLE_REG.filter(([n]) => n.toLowerCase().includes(q.trim().toLowerCase()));
  const pick = (n: string) => {
    onChange(n);
    setOpen(false);
    setQ("");
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onKeyDown={pressKey(() => setOpen((o) => !o))}
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 9, background: "var(--card)", border: `1.5px solid ${open ? "var(--text)" : "var(--el)"}`, borderRadius: 14, padding: "8px 14px 8px 8px", cursor: "pointer" }}
      >
        {isAll ? (
          <span style={{ width: 30, height: 30, borderRadius: 15, flexShrink: 0, background: "var(--text)", color: "var(--solid)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <StarGlyph />
          </span>
        ) : value ? (
          <DosStyleCoin label={value} size={30} active />
        ) : (
          <span style={{ width: 30, height: 30, borderRadius: 15, background: "var(--el)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--sub)", fontSize: 15 }}>＋</span>
        )}
        <b style={{ flex: 1, minWidth: 0, fontSize: 14, color: value ? "var(--text)" : "var(--sub)", fontWeight: value ? 800 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || placeholder}
        </b>
        <span aria-hidden="true" style={{ color: "var(--sub)", fontSize: 12, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
      </div>

      {open ? (
        <StyleListPanel ariaLabel={ariaLabel} q={q} setQ={setQ} all={all} isAll={isAll} isOn={(n) => value === n} onPick={pick} hits={hits} />
      ) : null}
    </>
  );
}

/** THE LIST BEHIND BOTH PICKERS (2 Oct 2026). Lifted out of `DosStylePicker`
 *  unchanged when the multi picker arrived, so the two cannot drift: the search
 *  row, "All styles" above the list where a form allows it, a row per style in
 *  the registry, and the empty line. What the multi picker adds is passed in —
 *  a row that may not be picked right now (`blocked`, with the reason said once
 *  at the top) and a footer (its Done). */
function StyleListPanel({
  ariaLabel,
  q,
  setQ,
  all,
  isAll,
  isOn,
  onPick,
  hits,
  blocked,
  notice,
  footer,
}: {
  ariaLabel: string;
  q: string;
  setQ: (q: string) => void;
  all: boolean;
  isAll: boolean;
  isOn: (style: string) => boolean;
  onPick: (style: string) => void;
  hits: ReadonlyArray<readonly [string, string]>;
  blocked?: (style: string) => boolean;
  notice?: string | null;
  footer?: React.ReactNode;
}) {
  return (
    <div role="listbox" aria-label={`${ariaLabel} options`} style={{ background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 14, marginTop: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: "1.5px solid var(--el)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sub)" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-3.8-3.8" />
        </svg>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search styles…"
          aria-label="Search styles"
          style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}
        />
        {q ? (
          <button type="button" aria-label="Clear the search" onClick={() => setQ("")} style={{ fontSize: 12, color: "var(--sub)", cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>
            ✕
          </button>
        ) : null}
      </div>
      {notice ? (
        <div role="status" style={{ padding: "8px 12px", fontSize: 11, color: "var(--sub)", borderBottom: "1.5px solid var(--el)", lineHeight: 1.4 }}>
          {notice}
        </div>
      ) : null}
      <div style={{ maxHeight: 250, overflowY: "auto" }}>
        {all && !q.trim() ? (
          <div
            role="button"
            tabIndex={0}
            aria-pressed={isAll}
            aria-label={DOS_ALL_STYLES}
            onKeyDown={pressKey(() => onPick(DOS_ALL_STYLES))}
            onClick={() => onPick(DOS_ALL_STYLES)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer", borderBottom: "1.5px solid var(--el)", background: isAll ? "var(--el)" : "transparent" }}
          >
            <span style={{ width: 28, height: 28, borderRadius: 14, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: isAll ? "var(--text)" : "var(--el)", color: isAll ? "var(--solid)" : "var(--sub)" }}>
              <StarGlyph size={15} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13.5, fontWeight: isAll ? 800 : 700, color: "var(--text)" }}>{DOS_ALL_STYLES}</span>
              <span style={{ display: "block", fontSize: 10, color: "var(--muted)", marginTop: 1 }}>Open to every style — not a style itself</span>
            </span>
            {isAll ? <span style={{ fontSize: 12, color: "var(--sub)" }}>✓</span> : null}
          </div>
        ) : null}
        {hits.map(([n]) => {
          const on = isOn(n);
          const off = !on && Boolean(blocked?.(n));
          return (
            <div
              key={n}
              role="button"
              tabIndex={off ? -1 : 0}
              aria-pressed={on}
              aria-disabled={off || undefined}
              aria-label={n}
              onKeyDown={pressKey(() => (off ? undefined : onPick(n)))}
              onClick={() => (off ? undefined : onPick(n))}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: off ? "default" : "pointer", background: on ? "var(--el)" : "transparent", opacity: off ? 0.4 : 1 }}
            >
              <DosStyleCoin label={n} size={28} active={on} />
              <span style={{ fontSize: 13.5, fontWeight: on ? 800 : 600, color: "var(--text)" }}>{n}</span>
              {on ? <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--sub)" }}>✓</span> : null}
            </div>
          );
        })}
        {hits.length === 0 ? <div style={{ padding: "14px 12px", fontSize: 12.5, color: "var(--muted)", textAlign: "center" }}>No style by that name.</div> : null}
      </div>
      {footer}
    </div>
  );
}

/** THE MULTI PICKER — the prototype's own `multi` mode (3554-3557, its Done at
 *  3609-3612), built at last (2 Oct 2026, the user: *"dance style filter while
 *  creating studio and crew should be multi filter and better way to handle in
 *  the form"*). The New-studio sheet had a row of hand-made chips over a SINGLE
 *  picker it re-opened once per style, and the crew form took one style and no
 *  more; both are this control now.
 *
 *  What it draws: the picked styles as chips in their own colour, each with a ×
 *  named "Remove {style}" — and, because the database keeps the FIRST as the one
 *  a card, a board and the search read (`crews.style`, a studio's lead style),
 *  the first wears a small MAIN tag and every other chip a ★ that moves it to
 *  the front. Under them one dashed control, "Add a dance style", opening the
 *  same searchable list `DosStylePicker` opens; a picked row is ticked and
 *  pressing it again takes it off, which is the prototype's toggle.
 *
 *  ⚠ "ALL STYLES" STAYS EXCLUSIVE BOTH WAYS (3542-3547): picking it clears the
 *  specific styles, and picking a style clears it.
 *  ⚠ THE CAP IS SAID, NOT HIT: at `max` the rows that are not picked go quiet
 *  and the list and the control both say why, rather than a press that does
 *  nothing. */
export function DosStyleMultiPicker({
  value,
  onChange,
  all = false,
  max = 8,
  ariaLabel = "Add a dance style",
}: {
  value: string[];
  onChange: (styles: string[]) => void;
  all?: boolean;
  max?: number;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const isAll = value.length === 1 && value[0] === DOS_ALL_STYLES;
  const real = value.filter((s) => s !== DOS_ALL_STYLES);
  const full = real.length >= max;
  const capWords = `${max} styles is the most — take one off to add another.`;
  const hits = DOS_STYLE_REG.filter(([n]) => n.toLowerCase().includes(q.trim().toLowerCase()));

  const toggle = (n: string) => {
    if (n === DOS_ALL_STYLES) {
      onChange(isAll ? [] : [DOS_ALL_STYLES]);
      return;
    }
    if (real.includes(n)) {
      onChange(real.filter((x) => x !== n));
      return;
    }
    if (full) return;
    onChange([...real, n]);
  };
  const remove = (n: string) => onChange(value.filter((x) => x !== n));
  const makeMain = (n: string) => onChange([n, ...value.filter((x) => x !== n)]);
  const close = () => {
    setOpen(false);
    setQ("");
  };

  return (
    <>
      {value.length ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {value.map((s, i) => {
            const c = s === DOS_ALL_STYLES ? "var(--text)" : dosStyleColor(s);
            return (
              <span
                key={s}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 6px 4px 4px", borderRadius: 999, background: "var(--card)", border: `1.5px solid ${c}`, maxWidth: "100%" }}
              >
                {s === DOS_ALL_STYLES ? (
                  <span style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, background: "var(--text)", color: "var(--solid)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <StarGlyph size={12} />
                  </span>
                ) : (
                  <DosStyleCoin label={s} size={22} active={i === 0} />
                )}
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s}</span>
                {i === 0 && value.length > 1 ? (
                  <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.6, color: "var(--sub)", border: "1px solid var(--el)", borderRadius: 999, padding: "1px 5px" }}>MAIN</span>
                ) : null}
                {i > 0 ? (
                  <button
                    type="button"
                    aria-label={`Make ${s} the main style`}
                    title="Make this the main style"
                    onClick={() => makeMain(s)}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--muted)", display: "inline-flex" }}
                  >
                    <StarGlyph size={12} />
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label={`Remove ${s}`}
                  onClick={() => remove(s)}
                  style={{ background: "none", border: "none", padding: "0 2px", cursor: "pointer", color: "var(--sub)", fontSize: 13, lineHeight: 1, fontFamily: "inherit" }}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      <div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onKeyDown={pressKey(() => (open ? close() : setOpen(true)))}
        onClick={() => (open ? close() : setOpen(true))}
        style={{ display: "flex", alignItems: "center", gap: 9, background: "transparent", border: `1.5px dashed ${open ? "var(--text)" : "var(--el)"}`, borderRadius: 14, padding: "8px 14px 8px 8px", cursor: "pointer" }}
      >
        <span style={{ width: 30, height: 30, borderRadius: 15, flexShrink: 0, background: "var(--el)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--sub)", fontSize: 15 }}>＋</span>
        <b style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: full ? "var(--muted)" : "var(--sub)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {full ? capWords : value.length ? "Add another style" : "Add a dance style"}
        </b>
        <span aria-hidden="true" style={{ color: "var(--sub)", fontSize: 12, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
      </div>
      {value.length > 1 ? <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 5 }}>The first is the main style — ★ moves one to the front.</div> : null}

      {open ? (
        <StyleListPanel
          ariaLabel={ariaLabel}
          q={q}
          setQ={setQ}
          all={all}
          isAll={isAll}
          isOn={(n) => real.includes(n)}
          onPick={toggle}
          hits={hits}
          blocked={() => full}
          notice={full ? capWords : null}
          footer={
            <div
              role="button"
              tabIndex={0}
              aria-label="Done picking styles"
              onKeyDown={pressKey(close)}
              onClick={close}
              style={{ textAlign: "center", padding: "10px", borderTop: "1.5px solid var(--el)", fontSize: 12.5, fontWeight: 800, cursor: "pointer", color: "var(--text)" }}
            >
              Done{real.length ? ` · ${real.length} picked` : ""}
            </div>
          }
        />
      ) : null}
    </>
  );
}
