import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/features/auth/components/AuthShell";
import { DOS_DISPLAY, INK, LINE, PINK, SUB } from "@/lib/design/tokens";

/** The email twin of the OTP screen: the link does the verifying, this screen
 *  just says where it went. Same S_auth shell as every login screen. */
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  if (!email || !email.includes("@")) {
    redirect("/login/phone");
  }

  return (
    <AuthShell toast={null}>
      <Link href="/login/phone" style={{ fontSize: 20, cursor: "pointer", color: INK, textDecoration: "none" }}>
        ←
      </Link>
      <div style={{ fontSize: 26, fontWeight: 800, margin: "14px 0 4px", fontFamily: DOS_DISPLAY, letterSpacing: -0.5 }}>
        Check your inbox
      </div>
      <div style={{ fontSize: 13.5, color: SUB, marginBottom: 20, lineHeight: 1.6 }}>
        We emailed a sign-in link to <b style={{ color: INK }}>{email}</b>. Tap it on this device and
        you&apos;re in — no password, no code.
      </div>
      <div
        style={{
          background: "rgba(255,255,255,.06)",
          border: `1px dashed ${LINE}`,
          borderRadius: 14,
          padding: "12px 14px",
          fontSize: 11.5,
          color: SUB,
          lineHeight: 1.7,
        }}
      >
        Nothing arriving? Check spam, or wait a minute — the free mailer sends only a
        couple of emails per hour while we&apos;re in development.
      </div>
      <div style={{ fontSize: 12.5, textAlign: "center", marginTop: 18 }}>
        <Link href="/login/phone" style={{ color: PINK, fontWeight: 800, textDecoration: "none" }}>
          Use a different email or number
        </Link>
      </div>
    </AuthShell>
  );
}
