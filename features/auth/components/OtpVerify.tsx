"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { verifyOtpAction, type AuthActionState } from "@/features/auth/server-actions/auth";
import { AuthShell } from "@/features/auth/components/AuthShell";
import { DOS_DISPLAY, GREEN, INK, LINE, PINK, SUB } from "@/lib/design/tokens";

const initialState: AuthActionState = { error: null };
const RESEND_SECONDS = 30;

/** OTP screen lifted from the prototype (DanceOSApp.jsx:3749-3767). */
export function OtpVerify({ phone }: { phone: string }) {
  const [otp, setOtp] = useState("");
  const [timer, setTimer] = useState(RESEND_SECONDS);
  const otpRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(verifyOtpAction, initialState);

  useEffect(() => {
    const id = setInterval(() => setTimer((t) => (t > 0 ? t - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (otp.length === 6 && !isPending) {
      const t = setTimeout(() => formRef.current?.requestSubmit(), 350);
      return () => clearTimeout(t);
    }
  }, [otp, isPending]);

  // a failed verify clears the typed code so the user can retry cleanly
  const [handledError, setHandledError] = useState<string | null>(null);
  if (state.error && state.error !== handledError) {
    setHandledError(state.error);
    setOtp("");
  }

  const pretty = `${phone.slice(0, 5)} ${phone.slice(5)}`;

  return (
    <AuthShell toast={state.error}>
      <Link href="/login/phone" style={{ fontSize: 20, cursor: "pointer", color: INK, textDecoration: "none" }}>
        ←
      </Link>
      <div style={{ fontSize: 26, fontWeight: 800, margin: "14px 0 4px", fontFamily: DOS_DISPLAY, letterSpacing: -0.5 }}>
        Enter the code
      </div>
      <div style={{ fontSize: 13.5, color: SUB, marginBottom: 20 }}>
        Sent to +91 {pretty} · auto-reads on Android
      </div>
      <form ref={formRef} action={formAction}>
        <input type="hidden" name="phone" value={phone} />
        <input type="hidden" name="token" value={otp} />
        <div
          role="button"
          tabIndex={0}
          onClick={() => otpRef.current?.focus()}
          style={{ display: "flex", gap: 9, marginBottom: 8, cursor: "text" }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 58,
                background: "rgba(255,255,255,.07)",
                color: INK,
                borderRadius: 14,
                border: `2px solid ${i === otp.length ? PINK : i < otp.length ? GREEN : LINE}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                fontWeight: 800,
                transition: "border .15s",
              }}
            >
              {otp[i] || ""}
            </div>
          ))}
        </div>
        <input
          ref={otpRef}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoFocus
          aria-label="One-time password"
          style={{ position: "absolute", opacity: 0, pointerEvents: "none", height: 0 }}
        />
      </form>
      <div style={{ fontSize: 12.5, color: SUB, textAlign: "center", margin: "6px 0 14px" }}>
        {otp.length === 6 || isPending ? (
          <span style={{ color: GREEN, fontWeight: 800 }}>✓ Verifying…</span>
        ) : timer > 0 ? (
          <>
            Resend in <b>0:{String(timer).padStart(2, "0")}</b>
          </>
        ) : (
          <Link href="/login/phone" style={{ color: PINK, fontWeight: 800, cursor: "pointer", textDecoration: "none" }}>
            Resend OTP
          </Link>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: SUB, textAlign: "center" }}>
        Test numbers use OTP <b>123456</b>.
      </div>
    </AuthShell>
  );
}
