import Image from "next/image";
import Link from "next/link";
import { DOS_LEVEL_LABEL } from "@/lib/constants/styles";
import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { money as rupees } from "@/features/payouts/components/earnings-kit";
import { photoUrl } from "@/lib/media/photo";
import type { MembershipClassUse, MembershipHolder, MembershipWithUsage } from "@/repositories/memberships";
import { ProgressBar } from "./MembershipsScreen";

/** ONE MEMBERSHIP AND ITS USAGE (19 Sep 2026, the user: "make sure able to track
 *  memberships usage for class and student wise with progress bar for
 *  completion").
 *
 *  Both ways, on one page, from the same rows: CLASS-WISE — which classes it has
 *  actually been spent on and by how many people — and STUDENT-WISE — everybody
 *  holding one, each with the bar that says how far through they are. The
 *  figures at the top are the seller's: how many went of how many were offered,
 *  what came in, and how much of what was sold has been danced. */

const card = { background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 16, padding: "13px 14px", marginBottom: 10 } as const;
const unitWord = (unit: "classes" | "hours", n: number) => (unit === "hours" ? `${n} ${n === 1 ? "hour" : "hours"}` : `${n} ${n === 1 ? "class" : "classes"}`);

export function MembershipUsagePage({ membership, holders, classes }: { membership: MembershipWithUsage; holders: MembershipHolder[]; classes: MembershipClassUse[] }) {
  const m = membership;
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "14px 16px 40px", boxSizing: "border-box" }}>
      <div style={{ borderRadius: 22, padding: 18, background: "linear-gradient(135deg,#B45309,#7C3AED)", color: "#fff", marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>{m.name}</h1>
        <div style={{ fontSize: 11.5, opacity: 0.9, marginTop: 3 }}>
          {unitWord(m.unit, m.units)} · {m.priceInr === 0 ? "Free" : rupees(m.priceInr)}
          {m.status === "draft" ? " · draft" : ""}
        </div>
      </div>

      <div style={{ ...card, display: "flex", gap: 8 }}>
        {([[`${m.sold}/${m.totalCount}`, "Sold", "usage-sold"], [String(m.active), "Active", "usage-active"], [rupees(m.revenueInr), "Taken", "usage-taken"]] as const).map(([v, l, tid]) => (
          <div key={l} style={{ flex: 1, textAlign: "center", background: "var(--el)", borderRadius: 12, padding: "10px 3px" }}>
            <div data-testid={tid} style={{ fontSize: 15, fontWeight: 900 }}>
              {v}
            </div>
            <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: SUB, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>

      {m.unitsSold > 0 ? (
        <div style={card}>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", marginBottom: 2 }}>HOW MUCH OF WHAT WAS SOLD HAS BEEN DANCED</div>
          <ProgressBar used={m.unitsUsed} total={m.unitsSold} tint="#8B5CF6" testId="usage-progress" />
        </div>
      ) : null}

      {/* CLASS-WISE */}
      <div style={card}>
        <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", marginBottom: 8 }}>SPENT ON · {classes.length}</div>
        {classes.length === 0 ? (
          <div style={{ fontSize: 11.5, color: SUB, padding: "6px 0", lineHeight: 1.5 }}>Nobody has spent one on a class yet. A class takes a membership only while its own toggle is on — the class form, and the Policy on its page.</div>
        ) : (
          classes.map((c) => (
            <Link key={c.classId} href={`/c/${c.shareSlug}`} aria-label={`Open ${c.style} · ${DOS_LEVEL_LABEL[c.level] ?? c.level}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1.5px solid var(--el)", fontSize: 11.5, textDecoration: "none", color: INK }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.style} · {DOS_LEVEL_LABEL[c.level] ?? c.level}
                </span>
                <span style={{ display: "block", color: SUB, fontSize: 10.5, marginTop: 1 }}>{c.businessName}</span>
              </span>
              <span style={{ flexShrink: 0, textAlign: "right", color: SUB }}>
                {c.uses} {c.uses === 1 ? "seat" : "seats"}
                <span style={{ display: "block", fontSize: 10.5 }}>
                  {c.people} {c.people === 1 ? "person" : "people"}
                </span>
              </span>
            </Link>
          ))
        )}
      </div>

      {/* STUDENT-WISE */}
      <div style={card}>
        <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", marginBottom: 8 }}>WHO HOLDS ONE · {holders.length}</div>
        {holders.length === 0 ? (
          <div style={{ fontSize: 11.5, color: SUB, padding: "6px 0" }}>Nobody has taken one yet. It is on your public page while it is live.</div>
        ) : (
          holders.map((h) => {
            const face = photoUrl(h.avatarPath);
            return (
              <div key={h.passId} style={{ padding: "9px 0", borderBottom: "1.5px solid var(--el)" }} data-testid="membership-holder">
                <Link href={`/person/${h.userId}`} aria-label={`Open ${h.name}'s profile`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: INK }}>
                  <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, overflow: "hidden", background: "linear-gradient(135deg,#B45309,#7C3AED)", color: "#fff", fontSize: 10.5, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {face ? <Image src={face} alt="" width={30} height={30} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : h.name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                  <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 900, color: h.status === "active" ? "#22C55E" : SUB }}>{h.status === "used_up" ? "USED UP" : h.status.toUpperCase()}</span>
                </Link>
                <ProgressBar used={h.unitsUsed} total={h.unitsTotal} testId="holder-progress" />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
