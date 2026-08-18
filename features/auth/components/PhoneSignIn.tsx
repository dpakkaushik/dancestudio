"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { requestOtpAction, type AuthActionState } from "@/features/auth/server-actions/auth";
import { AuthShell } from "@/features/auth/components/AuthShell";
import { BTN_STYLE, DOS_DISPLAY, INK, LINE, PINK, SUB } from "@/lib/design/tokens";

const initialState: AuthActionState = { error: null };

/** Sign-in screen lifted from the prototype (DanceOSApp.jsx:3726-3747). */
export function PhoneSignIn() {
  const [phone, setPhone] = useState("");
  const [state, formAction, isPending] = useActionState(requestOtpAction, initialState);
  const valid = phone.replace(/\D/g, "").length === 10;

  return (
    <AuthShell toast={state.error}>
      <Link href="/login" style={{ fontSize: 20, cursor: "pointer", color: INK, textDecoration: "none" }}>
        ←
      </Link>
      <div style={{ fontSize: 26, fontWeight: 800, margin: "14px 0 4px", fontFamily: DOS_DISPLAY, letterSpacing: -0.5 }}>
        Sign in or join
      </div>
      <div style={{ fontSize: 13.5, color: SUB, marginBottom: 20 }}>
        Your mobile number is your account — one OTP and you&apos;re in.
      </div>
      <form action={formAction}>
        <div style={{ fontSize: 12, color: SUB, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>
          MOBILE NUMBER
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div
            style={{
              background: "rgba(255,255,255,.07)",
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
            style={{
              flex: 1,
              background: "rgba(255,255,255,.07)",
              color: INK,
              border: `1.5px solid ${LINE}`,
              borderRadius: 14,
              padding: "13px 16px",
              fontSize: 15,
              outline: "none",
              letterSpacing: 1,
            }}
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
            OTP <b>123456</b> · real SMS numbers switch on when an SMS provider is connected
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
      <div style={{ fontSize: 10.5, color: SUB, marginTop: 16, textAlign: "center", lineHeight: 1.6 }}>
        By continuing you agree to the <b>Terms</b> & <b>Privacy Policy</b>.
      </div>
    </AuthShell>
  );
}
