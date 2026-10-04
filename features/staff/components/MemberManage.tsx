"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Portal } from "@/components/ui/Portal";
import { ToolFace, toolBtn } from "@/components/ui/ToolCard";
import { SheetHandle, sheetBody, sheetWrap } from "@/features/businesses/components/biz-kit";
import { dosKey } from "@/features/classes/components/ShareSheet";
import { Toast } from "@/features/crews/components/crew-kit";
import { removeMemberAction, removeOwnerAction, setMemberPowersAction, setMemberRoleAction } from "@/features/staff/server-actions/staff";
import { DOS_DISPLAY, INK, SUB } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import type { MemberRole, TeamMember } from "@/repositories/businesses";
import type { BusinessType } from "@/types/business";
import { KIND_WORD, kindOf } from "@/types/profile";
import { MEMBER_LABEL, MEMBER_ROLE_WORD, labelsFor } from "@/types/staff";

const CARD = "var(--card)";
const EL = "var(--el)";

/** MANAGE ONE TEAMMATE — a pill on the top right of their Member Detail page
 *  (4 Oct 2026, the user: *"Remove manage button from card and shift inside
 *  history page on top right as a pill"*).
 *
 *  The sheet is the one the Team desk opened from the card's Manage button
 *  (3 Oct 2026): who they are, their ROLE, their PERMISSIONS, and Remove behind
 *  a confirm. It moved here whole. What changes is what happens after a press:
 *  the page under the sheet is a server page, so a role or a permission
 *  re-reads it (`router.refresh`), and a removal goes back to the Team desk —
 *  the person this page is about is no longer on the team.
 *
 *  ⚠ PORTALLED: the pill lives inside the top section's card, and a fixed
 *  sheet drawn inside a positioned card is clipped by it (16 Sep 2026). */
export function MemberManage({
  businessId,
  businessType,
  member,
  meUserId,
  principalOwnerId,
  tint,
}: {
  businessId: string;
  businessType: BusinessType;
  member: TeamMember;
  meUserId: string;
  /** the oldest live owner seat — the only one who may remove another owner */
  principalOwnerId: string | null;
  tint: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  /* the sheet's own copy, so a press reads back at once while the page re-reads */
  const [m, setM] = useState<TeamMember>(member);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useCloseOnBack(() => setOpen(false), open);

  const labels = labelsFor(businessType);
  const L = MEMBER_LABEL[m.role];

  const run = async (op: () => Promise<{ error: string | null }>, doneMsg: string) => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const out = await op();
    setBusy(false);
    if (out.error) {
      setError(out.error);
      return false;
    }
    setToast(doneMsg);
    setTimeout(() => setToast(null), 2400);
    return true;
  };

  const mayRemove = m.role !== "owner" || (principalOwnerId === meUserId && m.userId !== meUserId);

  return (
    <>
      {/* ⚠ "Manage {name}" — the name the card's button answered to, kept so every
          locator that opened the sheet still does */}
      <button
        type="button"
        aria-label={`Manage ${m.name}`}
        data-testid="member-manage"
        onClick={() => {
          setM(member);
          setError(null);
          setOpen(true);
        }}
        style={{ ...toolBtn("tinted", tint), flex: "none", padding: "7px 14px", minHeight: 0, borderRadius: 999, fontSize: 12 }}
      >
        Manage
      </button>

      {open ? (
        <Portal>
          <div onClick={() => setOpen(false)} style={sheetWrap}>
            <div role="dialog" aria-modal="true" aria-label={m.name} onClick={(e) => e.stopPropagation()} style={sheetBody}>
              <SheetHandle />
              <div
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px", margin: "0 0 14px", borderRadius: 16, background: `linear-gradient(135deg, ${tint}24, ${tint}08 62%, transparent)`, border: `1.5px solid ${EL}`, color: INK }}
              >
                {/* the Team colour, like the card that opened this; the role keeps its own on the eyebrow */}
                <ToolFace name={m.name} photoPath={m.avatarPath} tint={tint} size={52} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", color: L.colour }}>
                    {MEMBER_ROLE_WORD[m.role]} · {KIND_WORD[kindOf(m.isArtist)]}
                  </span>
                  <b style={{ display: "block", fontSize: 18, fontFamily: DOS_DISPLAY, letterSpacing: -0.4, lineHeight: 1.2, marginTop: 2, overflowWrap: "anywhere" }}>{m.name}</b>
                  <span style={{ display: "block", fontSize: 11.5, color: SUB, marginTop: 2 }}>{m.city || "On your team"}</span>
                </span>
              </div>

              <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.1, color: "var(--muted)", marginBottom: 7 }}>ROLE</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {labels.map(([k, word]) => {
                  const on = m.role === k;
                  const c = MEMBER_LABEL[k as MemberRole]?.colour ?? SUB;
                  return (
                    <span
                      role="button"
                      tabIndex={0}
                      onKeyDown={dosKey}
                      key={k}
                      aria-pressed={on}
                      aria-label={`Make ${m.name} ${word}`}
                      onClick={async () => {
                        if (on) return;
                        const done = await run(() => setMemberRoleAction({ businessId, userId: m.userId, role: k }), `${m.name} → ${word}`);
                        if (done) {
                          setM({ ...m, role: k as MemberRole });
                          router.refresh();
                        }
                      }}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 800, padding: "7px 12px", borderRadius: 999, cursor: "pointer", background: on ? `${c}26` : CARD, color: on ? INK : SUB, border: `1.5px solid ${on ? c : EL}` }}
                    >
                      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, background: c, flexShrink: 0 }} />
                      {word}
                    </span>
                  );
                })}
              </div>

              {/* an owner holds both by their seat — a switch that cannot be turned off is not a switch */}
              {m.role !== "owner" ? (
                <>
                  <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.1, color: "var(--muted)", margin: "14px 0 7px" }}>PERMISSIONS</div>
                  <div style={{ border: `1.5px solid ${EL}`, borderRadius: 14, padding: "0 12px", background: CARD }}>
                    {(
                      [
                        ["attendance", "Run the register", "Check people in on any class here"],
                        ["refunds", "Settle refunds", "Decide refunds on any class here"],
                      ] as const
                    ).map(([key, title, why], i) => {
                      const on = key === "attendance" ? m.canAttendance : m.canRefunds;
                      return (
                        <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderTop: i === 0 ? "none" : `1.5px solid ${EL}` }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 800 }}>{title}</div>
                            <div style={{ fontSize: 11, color: SUB, marginTop: 1 }}>{why}</div>
                          </div>
                          <span
                            role="switch"
                            tabIndex={0}
                            onKeyDown={dosKey}
                            aria-checked={on}
                            aria-label={`${title} — ${m.name}`}
                            onClick={async () => {
                              const next = {
                                canAttendance: key === "attendance" ? !on : m.canAttendance,
                                canRefunds: key === "refunds" ? !on : m.canRefunds,
                              };
                              const done = await run(() => setMemberPowersAction({ businessId, userId: m.userId, ...next }), `${m.name} · ${title.toLowerCase()} ${!on ? "on" : "off"}`);
                              if (done) {
                                setM({ ...m, ...next });
                                router.refresh();
                              }
                            }}
                            style={{ flexShrink: 0, width: 42, height: 24, borderRadius: 999, cursor: "pointer", background: on ? L.colour : EL, position: "relative", transition: "background .15s" }}
                          >
                            <span aria-hidden="true" style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: 999, background: "var(--solid)", transition: "left .15s" }} />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}

              {error ? <div role="alert" style={{ fontSize: 11.5, color: "#F87171", fontWeight: 700, marginTop: 10 }}>{error}</div> : null}

              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                {mayRemove ? (
                  <button type="button" aria-label={`Remove ${m.name} from the team`} onClick={() => setRemoving(true)} style={toolBtn("danger", L.colour)}>
                    Remove
                  </button>
                ) : null}
                <button type="button" onClick={() => setOpen(false)} style={toolBtn("primary", "#141414", { flex: "1.4 1 0", background: "var(--text)", color: "var(--solid)", borderColor: "var(--text)" })}>
                  Done
                </button>
              </div>
              {removing ? (
                <ConfirmDialog
                  title={`Remove ${m.name} from the team?`}
                  body="Any class they were holding attendance or refunds on ends with it."
                  goWord="Remove"
                  busy={busy}
                  onKeep={() => setRemoving(false)}
                  onGo={async () => {
                    const owner = m.role === "owner";
                    const done = await run(
                      () => (owner ? removeOwnerAction({ businessId, userId: m.userId }) : removeMemberAction({ businessId, userId: m.userId })),
                      `${m.name} taken off the team`,
                    );
                    setRemoving(false);
                    /* the person this page is about is off the team — back to the
                       desk. ⚠ The sheet spends its own history entry first (its
                       close is a `back()` on a microtask) and the replace is a
                       task behind it, or the two race and back lands on a page
                       about somebody no longer here (the 19 Sep rule). */
                    if (done) {
                      setOpen(false);
                      setTimeout(() => router.replace(`/business/${businessId}/staff`), 600);
                    }
                  }}
                />
              ) : null}
            </div>
          </div>
        </Portal>
      ) : null}
      <Toast msg={toast} />
    </>
  );
}
