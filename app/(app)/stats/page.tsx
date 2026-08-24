import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";

/** Stats tab — placeholder wearing the prototype's own not-built treatment
 *  (DanceOSApp.jsx:19164-19169). The real screen (your dance record, rankings)
 *  arrives with the community/analytics slices. */
export default function StatsPage() {
  return (
    <div
      style={{
        background: LILAC,
        maxWidth: 430,
        margin: "0 auto",
        color: INK,
        padding: "80px 24px",
        textAlign: "center",
        fontFamily: DOS_UI,
        minHeight: "60vh",
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: 34, marginBottom: 10 }}>📊</div>
      <div style={{ fontSize: 16, fontWeight: 900 }}>Nothing here yet</div>
      <div style={{ fontSize: 12, color: SUB, marginTop: 5, lineHeight: 1.5 }}>
        Your dance record and rankings arrive with a later step.
      </div>
    </div>
  );
}
