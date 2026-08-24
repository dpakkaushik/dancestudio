"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  requestEmailLinkAction,
  requestOtpAction,
  type AuthActionState,
} from "@/features/auth/server-actions/auth";
import { AuthShell } from "@/features/auth/components/AuthShell";
import { BTN_STYLE, DOS_DISPLAY, INK, LINE, PINK, SUB } from "@/lib/design/tokens";

const initialState: AuthActionState = { error: null };

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: "var(--card)",
  color: INK,
  border: `1.5px solid ${LINE}`,
  borderRadius: 14,
  padding: "13px 16px",
  fontSize: 15,
  outline: "none",
  letterSpacing: 1,
};

/** Sign-in screen lifted from the prototype (DanceOSApp.jsx:3726-3747). Email is
 *  the primary channel for now (24 Aug 2026); phone stays for dev test numbers
 *  until WhatsApp OTP is wired. */
export function PhoneSignIn({ initialError = null }: { initialError?: string | null }) {
  const [channel, setChannel] = useState<"phone" | "email">("email");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [phoneState, phoneFormAction, phonePending] = useActionState(requestOtpAction, initialState);
  const [emailState, emailFormAction, emailPending] = useActionState(requestEmailLinkAction, initialState);

  const isPhone = channel === "phone";
  const valid = isPhone ? phone.replace(/\D/g, "").length === 10 : /\S+@\S+\.\S+/.test(email);
  const isPending = phonePending || emailPending;
  const toast = phoneState.error || emailState.error || initialError;

  return (
    <AuthShell toast={toast}>
      <Link href="/login" style={{ fontSize: 20, cursor: "pointer", color: INK, textDecoration: "none" }}>
        ←
      </Link>
      <div style={{ fontSize: 26, fontWeight: 800, margin: "14px 0 4px", fontFamily: DOS_DISPLAY, letterSpacing: -0.5 }}>
        Sign in or join
      </div>
      <div style={{ fontSize: 13.5, color: SUB, marginBottom: 16 }}>
        {isPhone
          ? "Your mobile number is your account — one OTP and you're in."
          : "Your email is your account — we send a sign-in link, no password."}
      </div>

      {/* channel toggle — same pill treatment as the prototype's type toggles */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(
          [
            ["email", "✉️ Email"],
            ["phone", "📱 Mobile"],
          ] as const
        ).map(([key, label]) => {
          const on = channel === key;
          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => setChannel(key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setChannel(key);
                }
              }}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "10px",
                borderRadius: 999,
                cursor: "pointer",
                fontSize: 12.5,
                fontWeight: 800,
                background: on ? `${PINK}14` : "var(--card)",
                color: on ? PINK : SUB,
                border: `2px solid ${on ? PINK : "transparent"}`,
                transition: "all .15s",
              }}
            >
              {label}
              {on && " ✓"}
            </div>
          );
        })}
      </div>

      {isPhone ? (
        <form action={phoneFormAction}>
          <div style={{ fontSize: 12, color: SUB, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>
            MOBILE NUMBER
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div
              style={{
                background: "var(--card)",
                color: INK,
                border: `1.5px solid ${LINE}`,
                borderRadius: 14,
                padding: "13px 14px",
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              🇮🇳 +91
            </div>
            <input
              name="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="10-digit mobile number"
              inputMode="numeric"
              autoFocus
              style={inputStyle}
            />
          </div>
          <div
            style={{
              background: "rgba(255,255,255,.06)",
              border: `1px dashed ${LINE}`,
              borderRadius: 14,
              padding: "10px 13px",
              margin: "12px 0 14px",
            }}
          >
            <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, opacity: 0.65 }}>
              TEST NUMBERS — NO SMS IS SENT YET
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, lineHeight: 1.6 }}>
              📱{" "}
              <b
                role="button"
                tabIndex={0}
                onClick={() => setPhone("9999999999")}
                style={{ cursor: "pointer", textDecoration: "underline" }}
              >
                99999 99999
              </b>
              {"  ·  "}
              <b
                role="button"
                tabIndex={0}
                onClick={() => setPhone("8888888888")}
                style={{ cursor: "pointer", textDecoration: "underline" }}
              >
                88888 88888
              </b>
            </div>
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 3 }}>
              OTP <b>123456</b> · real numbers: use ✉️ Email for now — WhatsApp OTP arrives at launch
            </div>
          </div>
          <button
            type="submit"
            disabled={!valid || isPending}
            style={{
              ...BTN_STYLE,
              background: valid ? PINK : LINE,
              color: valid ? "#fff" : SUB,
              marginTop: 12,
              transition: "all .2s",
            }}
          >
            {isPending ? "Sending…" : "Send OTP"}
          </button>
        </form>
      ) : (
        <form action={emailFormAction}>
          <div style={{ fontSize: 12, color: SUB, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>
            EMAIL ADDRESS
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              style={{ ...inputStyle, letterSpacing: 0.2 }}
            />
          </div>
          <button
            type="submit"
            disabled={!valid || isPending}
            style={{
              ...BTN_STYLE,
              background: valid ? PINK : LINE,
              color: valid ? "#fff" : SUB,
              marginTop: 14,
              transition: "all .2s",
            }}
          >
            {isPending ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>
      )}

      <div style={{ fontSize: 10.5, color: SUB, marginTop: 16, textAlign: "center", lineHeight: 1.6 }}>
        By continuing you agree to the <b>Terms</b> & <b>Privacy Policy</b>.
      </div>
    </AuthShell>
  );
}
