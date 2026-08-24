import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";

/** Inbox tab — placeholder wearing the prototype's own not-built treatment
 *  (DanceOSApp.jsx:19164-19169). The real screen (requests & enquiries)
 *  arrives with the messaging slice. */
export default function InboxPage() {
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
      <div style={{ fontSize: 34, marginBottom: 10 }}>📥</div>
      <div style={{ fontSize: 16, fontWeight: 900 }}>Nothing here yet</div>
      <div style={{ fontSize: 12, color: SUB, marginTop: 5, lineHeight: 1.5 }}>
        Requests and enquiries arrive with the messaging slice.
      </div>
    </div>
  );
}
