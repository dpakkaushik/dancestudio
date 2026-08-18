import type { ReactNode } from "react";
import { DOS_UI, INK, LILAC, PINK, SUB } from "@/lib/design/tokens";

/** Page wrapper lifted from the prototype's `shell()` (DanceOSApp.jsx:3683-3698). */
export function AuthShell({
  children,
  toast,
}: {
  children: ReactNode;
  toast?: string | null;
}) {
  return (
    <div
      style={{
        background: LILAC,
        minHeight: "100vh",
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        padding: "24px 22px 40px",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      <style>{`
        @keyframes dosBeat{0%,100%{transform:scale(1);color:${SUB}}12%{transform:scale(1.35);color:${PINK}}30%{transform:scale(1);color:${SUB}}}
        @keyframes dosRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes dosDash{0%,100%{opacity:.55}50%{opacity:1}}
        @media (prefers-reduced-motion:reduce){*{animation:none !important}}
      `}</style>
      {children}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 28,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(255,255,255,.13)",
            color: "#FAFAFA",
            border: "1.5px solid #EC4899",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            padding: "11px 18px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 700,
            zIndex: 40,
            maxWidth: 380,
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
