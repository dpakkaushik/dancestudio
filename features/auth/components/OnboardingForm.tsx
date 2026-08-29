"use client";

import { useActionState, useState } from "react";
import { completeProfileAction, type AuthActionState } from "@/features/auth/server-actions/auth";
import { AuthShell } from "@/features/auth/components/AuthShell";
import { BTN_STYLE, DOS_DISPLAY, DOS_TINT, INK, LINE, PINK, SUB } from "@/lib/design/tokens";
import type { ProfileRole } from "@/types/profile";

const initialState: AuthActionState = { error: null };

const ROLES: Array<{ key: ProfileRole; label: string; caption: string }> = [
  { key: "dancer", label: "Dancer", caption: "Learn, book classes, join crews" },
  { key: "trainer", label: "Artist / Trainer", caption: "Teach, run workshops, get booked" },
  { key: "studio", label: "Studio", caption: "Run your studio — batches, fees, rooms" },
];

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--card)",
  color: INK,
  border: `1.5px solid ${LINE}`,
  borderRadius: 14,
  padding: "13px 16px",
  fontSize: 15,
  outline: "none",
};

/** Profile-basics screen — layout lifted from the prototype's onboarding (DanceOSApp.jsx:3769+),
 *  with the role choice surfaced here (the prototype derives role from the subscription). */
export function OnboardingForm() {
  const [fn, setFn] = useState("");
  const [ln, setLn] = useState("");
  const [city, setCity] = useState("");
  const [role, setRole] = useState<ProfileRole>("dancer");
  const [state, formAction, isPending] = useActionState(completeProfileAction, initialState);
  const ready = fn.trim().length > 0;
  /* the button says what is missing (3778, 3820): the reason, not a grey nothing */
  const missing = !fn.trim() ? "Enter your first name" : "";
  const handle = (fn + ln).toLowerCase().replace(/[^a-z]/g, "") || "you";

  return (
    <AuthShell toast={state.error} progress={[1, 1]}>
      <div style={{ fontSize: 24, fontWeight: 800, margin: "14px 0 4px", fontFamily: DOS_DISPLAY, letterSpacing: -0.5 }}>
        Set up your profile
      </div>
      <div style={{ fontSize: 13, color: SUB, marginBottom: 18 }}>
        A photo and your basics — this is how the community sees you. Your photo, your styles and your links are one tap away on your profile.
      </div>
      <form action={formAction}>
        <input type="hidden" name="fullName" value={`${fn.trim()} ${ln.trim()}`.trim()} />
        <input type="hidden" name="role" value={role} />
        <div style={{ fontSize: 12, color: SUB, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>YOUR NAME</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            value={fn}
            onChange={(e) => setFn(e.target.value.replace(/(^|\s)\S/g, (c) => c.toUpperCase()))}
            placeholder="First name"
            autoFocus
            style={{ ...inputStyle, flex: 1 }}
          />
          <input
            value={ln}
            onChange={(e) => setLn(e.target.value.replace(/(^|\s)\S/g, (c) => c.toUpperCase()))}
            placeholder="Last name"
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
        {fn.trim() ? (
          <div style={{ fontSize: 12, color: SUB, margin: "-6px 0 14px" }}>
            Your handle: <b style={{ color: PINK }}>@{handle}</b> · editable later
          </div>
        ) : null}
        <div style={{ fontSize: 12, color: SUB, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>
          I AM HERE AS A…
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {ROLES.map((r) => {
            const on = role === r.key;
            const accent = DOS_TINT[r.key];
            return (
              <div
                key={r.key}
                role="button"
                tabIndex={0}
                onClick={() => setRole(r.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setRole(r.key);
                  }
                }}
                style={{
                  padding: "13px 16px",
                  borderRadius: 14,
                  cursor: "pointer",
                  background: on ? `${accent}14` : "var(--card)",
                  border: `2px solid ${on ? accent : LINE}`,
                  transition: "all .15s",
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 800, color: on ? accent : INK }}>
                  {r.label}
                  {on && " ✓"}
                </div>
                <div style={{ fontSize: 12, color: SUB, marginTop: 2 }}>{r.caption}</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: SUB, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>
          CITY (OPTIONAL)
        </div>
        <input
          name="city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="e.g. Pune"
          style={{ ...inputStyle, marginBottom: 16 }}
        />
        <button
          type="submit"
          disabled={!ready || isPending}
          aria-disabled={!ready}
          style={{
            ...BTN_STYLE,
            background: ready ? PINK : LINE,
            color: ready ? "#fff" : SUB,
            marginTop: 4,
            transition: "all .2s",
          }}
        >
          {isPending ? "Saving…" : ready ? "Continue" : missing}
        </button>
      </form>
    </AuthShell>
  );
}
