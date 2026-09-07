import { AuthShell } from "@/features/auth/components/AuthShell";
import { LINE, SUB } from "@/lib/design/tokens";

/** Shown the INSTANT a tap navigates between the auth screens, while the server
 *  renders the real one. Before this file existed there was no loading boundary
 *  anywhere, so "Sign in" gave no visual answer for the whole server round trip
 *  (Vercel cold start + the session check) and people tapped it again and again.
 *  The wait indicator is the prototype's own 5-6-7-8 count-in (dosBeat lives in
 *  AuthShell's style block), so waiting looks like the app, not like a spinner. */
export default function AuthLoading() {
  return (
    <AuthShell>
      <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
        <div style={{ display: "flex", gap: 14, fontSize: 15, fontWeight: 800, letterSpacing: 1 }}>
          {["5", "6", "7", "8"].map((n, i) => (
            <span key={n} style={{ animation: `dosBeat 1.2s ease ${i * 0.15}s infinite` }}>
              {n}
              {i < 3 && <span style={{ color: LINE, marginLeft: 14 }}>·</span>}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: SUB, fontWeight: 700, letterSpacing: 0.4 }}>One moment…</div>
      </div>
    </AuthShell>
  );
}
