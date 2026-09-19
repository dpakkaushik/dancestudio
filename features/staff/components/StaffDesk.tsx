"use client";

import Image from "next/image";
import { KIND_WORD, kindOf } from "@/types/profile";

import { useState, useSyncExternalStore } from "react";
import { QRBlock } from "@/components/ui/QRBlock";
import { dosKey } from "@/features/classes/components/ShareSheet";
import { PeoplePicker } from "@/features/people/components/PeoplePicker";
import { money as rupees } from "@/features/payouts/components/earnings-kit";
import {
  invitePersonAction,
  inviteToTenantAction,
  payTeamMemberAction,
  removeMemberAction,
  reorderMembersAction,
  revokeInviteAction,
  setMemberRoleAction,
} from "@/features/staff/server-actions/staff";
import { DOS_TOOLS, dosToolPaint } from "@/features/tenants/components/biz-kit";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, PINK, SUB } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { photoUrl } from "@/lib/media/photo";
import type { MemberRole, TeamMember } from "@/repositories/tenants";
import type { PayoutMethod, PayoutRecord, PayoutStatus } from "@/types/payout";
import type { TenantType } from "@/types/tenant";
import {
  MEMBER_GRANTS,
  MEMBER_LEVEL,
  MEMBER_POWERS,
  MEMBER_POWER_NOTE,
  MEMBER_ROLE_WORD,
  rolesFor,
  type InvitableRole,
  type TenantInvite,
} from "@/types/staff";

/** Staff & permissions — lifted from the prototype's settings segment
 *  (DanceOSApp.jsx:18427-18435): one card per person with the level badge on the
 *  right and "role · what they may do" underneath, the footnote that says what
 *  cannot be granted, and the dashed "＋ Invite staff or team member" button.
 *
 *  The prototype's invite offers "QR / mobile / search", and since 19 Sep 2026
 *  so does this — the user: "Team should only be able to add team member by
 *  typing name, number, email or scan … similar suggestion as we get for other
 *  person dropdowns with photo and name". So SEARCH is the app's one
 *  `PeoplePicker` (a name, a mobile number, or a scanned profile link, with a
 *  picture on every row), and the email form is the second way in — for
 *  somebody who is not on DanceOS yet, which the picker cannot find by
 *  definition. The QR is kept exactly: it is what you hold up in the room.
 *
 *  THREE MORE THINGS THE SAME DAY, all the user's:
 *   · LABELS COME FROM THE PROFILE YOU ARE IN (`rolesFor`) — a studio hands out
 *     Faculty, Visiting faculty and Staff; an artist page hands out Faculty and
 *     Assistant. Beside them, a PERMISSIONS section that says what each one
 *     actually carries, one line per power, ticked or not.
 *   · THE ORDER IS THE OWNER'S (`reorder_business_members`) — ▲▼ on every row,
 *     the crew desk's own control.
 *   · PAY THEM, WITH A METHOD, AND SEE WHAT HAS BEEN PAID. The payment lands in
 *     `payouts`, which IS the Earnings desk's MONEY OUT — so it is an expense
 *     the moment it is written, not a second ledger.
 *
 *  The waiting rows wear the prototype's own "⏳ Invited" treatment (18578). */

const CARD = "var(--card)";
const EL = "var(--el)";
const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const card: React.CSSProperties = { background: CARD, borderRadius: 16, padding: 14, marginBottom: 10 };

/* the page's own origin, read the sanctioned way (no impure render access) —
   the same pattern ShareSheet uses for the booking link */
const subscribeNever = () => () => {};
const readOrigin = () => window.location.origin;
const readServerOrigin = () => "";

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: CARD,
  border: `1.5px solid ${EL}`,
  borderRadius: 12,
  padding: "11px 12px",
  fontSize: 13,
  color: INK,
  outline: "none",
  fontFamily: "inherit",
};

const sheetWrap: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.6)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  zIndex: 610,
};

const sheet: React.CSSProperties = {
  background: "var(--solid)",
  color: "var(--text)",
  borderRadius: "24px 24px 0 0",
  padding: "18px 16px 28px",
  width: "100%",
  maxWidth: 430,
  boxSizing: "border-box",
  maxHeight: "88vh",
  overflowY: "auto",
  fontFamily: DOS_UI,
};

/* DosTeamRow's marks (18560-18565): the label wears its own colour, the person's kind rides beside it */
const LEVEL_TINT: Record<string, string> = { Admin: "#F59E0B", Staff: "#F97316" };
const gradOf = (name: string): [string, string] => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const pal: Array<[string, string]> = [["#2E86DE", "#7C3AED"], ["#8E44AD", "#EC4899"], ["#0D9488", "#2E86DE"], ["#F39C12", "#E84393"], ["#22C55E", "#0D9488"]];
  return pal[h % pal.length];
};
const initialsOf = (name: string) => name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

/** THE PERMISSIONS SECTION (19 Sep 2026) — what a label actually carries, one
 *  line per power. Every one of these is a rule the database keeps. */
function Powers({ role }: { role: InvitableRole | "owner" }) {
  return (
    <>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.1, color: "var(--muted)", margin: "12px 0 7px" }}>PERMISSIONS</div>
      <div style={{ background: CARD, border: `1px solid ${EL}`, borderRadius: 14, padding: "8px 12px" }}>
        {MEMBER_POWERS[role].map(([what, on]) => (
          <div key={what} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 12 }}>
            <span aria-hidden="true" style={{ width: 16, flexShrink: 0, textAlign: "center", color: on ? "#22C55E" : "var(--muted)", fontWeight: 900 }}>{on ? "✓" : "—"}</span>
            <span style={{ flex: 1, minWidth: 0, color: on ? INK : SUB }}>{what}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 7, lineHeight: 1.5 }}>{MEMBER_POWER_NOTE[role]}</div>
    </>
  );
}

const PAY_METHODS: ReadonlyArray<readonly [PayoutMethod, string]> = [
  ["upi", "UPI"],
  ["bank_transfer", "Bank transfer"],
  ["cash", "Cash"],
  ["other", "Other"],
];
const PAY_STATES: ReadonlyArray<readonly [PayoutStatus, string]> = [
  ["done", "Paid"],
  ["in_transit", "In transit"],
  ["on_hold", "On hold"],
];

export function StaffDesk({
  tenantId,
  tenantName,
  tenantType,
  team,
  invites,
  payments = [],
  isOwner,
  meUserId,
}: {
  tenantId: string;
  tenantName: string;
  /** which labels this profile has to give (19 Sep 2026) */
  tenantType: TenantType;
  team: TeamMember[];
  invites: TenantInvite[];
  /** everything this business has paid its people — the history, filtered per row */
  payments?: PayoutRecord[];
  isOwner: boolean;
  meUserId: string;
}) {
  /** the invite link is this deployment's own /join/{code} */
  const origin = useSyncExternalStore(subscribeNever, readOrigin, readServerOrigin);
  const [addOpen, setAddOpen] = useState(false);
  const [openMember, setOpenMember] = useState<TeamMember | null>(null);
  const [shareInvite, setShareInvite] = useState<TenantInvite | null>(null);
  /* the add sheet's two ways in: pick somebody on DanceOS, or ask an address */
  const [addBy, setAddBy] = useState<"person" | "email">("person");
  const [form, setForm] = useState<{ name: string; email: string; role: InvitableRole }>({
    name: "",
    email: "",
    role: "trainer",
  });
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState<{ amount: string; method: PayoutMethod; status: PayoutStatus; note: string }>({ amount: "", method: "upi", status: "done", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /* system back closes the sheet that is open, exactly as tapping the scrim does */
  useCloseOnBack(() => setAddOpen(false), addOpen);
  useCloseOnBack(() => setShareInvite(null), Boolean(shareInvite));
  useCloseOnBack(() => setOpenMember(null), Boolean(openMember));
  useCloseOnBack(() => setPayOpen(false), payOpen);

  /** the labels this profile has to give, and the seats already on the team */
  const roles = rolesFor(tenantType);
  const onTeam = team.map((m) => m.userId);
  const paidTo = (userId: string) => payments.filter((p) => p.userId === userId);

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  const run = async (op: () => Promise<{ error: string | null }>, doneMsg: string | null) => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const out = await op();
    setBusy(false);
    if (out.error) {
      setError(out.error);
      return false;
    }
    if (doneMsg) fire(doneMsg);
    return true;
  };

  const joinLink = (code: string) => `${origin}/join/${code}`;
  const canInvite = form.name.trim().length > 0 && form.email.trim().includes("@");

  return (
    <div
      style={{
        background: LILAC,
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        minHeight: "100vh",
        padding: "8px 16px 40px",
        boxSizing: "border-box",
      }}
    >
      {/* BizShell's hero (2964-2976): the tile's paint, the tool's name, nothing else */}
      {/* ⚠ reads the tool's own colour (18 Sep 2026) — it hardcoded #F97316, so
          when the palette deepened Team the tile and its page disagreed */}
      <div aria-label={`${tenantName} — Team`} style={{ borderRadius: 22, padding: "15px 17px 14px", marginBottom: 12, position: "relative", overflow: "hidden", color: "#fff", background: dosToolPaint(DOS_TOOLS.team.c) }}>
        <div aria-hidden="true" style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, position: "relative", fontFamily: DOS_DISPLAY, lineHeight: 1.18 }}>Team</div>
      </div>

      {/* ── the people who are already here (18428-18433) ── */}
      {team.map((m) => {
        const level = MEMBER_LEVEL[m.role];
        const mine = m.userId === meUserId;
        return (
          <div
            role={isOwner && m.role !== "owner" ? "button" : undefined}
            tabIndex={isOwner && m.role !== "owner" ? 0 : undefined}
            onKeyDown={isOwner && m.role !== "owner" ? dosKey : undefined}
            key={m.userId}
            aria-label={isOwner && m.role !== "owner" ? `Manage ${m.name}` : undefined}
            onClick={isOwner && m.role !== "owner" ? () => setOpenMember(m) : undefined}
            style={{ ...card, borderLeft: `4px solid ${LEVEL_TINT[level] ?? SUB}`, padding: "10px 12px", cursor: isOwner && m.role !== "owner" ? "pointer" : "default" }}
          >
            {/* DosTeamRow (18541-18592): the face with the label's ring, the name, the label in its colour, the kind */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {(() => {
                const g = gradOf(m.name);
                const face = photoUrl(m.avatarPath);
                const tint = LEVEL_TINT[level] ?? SUB;
                return (
                  <span style={{ width: 34, height: 34, borderRadius: 17, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11.5, fontWeight: 900, background: `linear-gradient(135deg,${g[0]},${g[1]})`, border: `1.5px solid ${tint}55`, boxSizing: "border-box" }}>
                    {face ? <Image src={face} alt="" width={34} height={34} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : initialsOf(m.name)}
                  </span>
                );
              })()}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.name}
                  {mine && <span style={{ fontSize: 10.5, color: SUB, fontWeight: 700 }}> · you</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase", color: LEVEL_TINT[level] ?? SUB }}>{level} · {MEMBER_ROLE_WORD[m.role]}</span>
                  <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--muted)" }}>· {m.profileRole ? KIND_WORD[kindOf(m.profileRole, m.isArtist)] : "User"}</span>
                  {m.city ? <span style={{ fontSize: 10, color: SUB }}>· {m.city}</span> : null}
                </div>
                <div style={{ fontSize: 10.5, color: SUB, marginTop: 3 }}>{MEMBER_GRANTS[m.role]}</div>
              </div>
              {/* ── THE ORDER (19 Sep 2026) — the crew desk's own ▲▼, and the
                  owner's alone. It sits OUTSIDE the row's click target, so
                  arranging never opens the sheet by accident. ── */}
              {isOwner && team.length > 1 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                  {([-1, 1] as const).map((dir) => {
                    const at = team.findIndex((x) => x.userId === m.userId);
                    const to = at + dir;
                    const off = to < 0 || to >= team.length;
                    return (
                      <button
                        key={dir}
                        type="button"
                        disabled={off || busy}
                        aria-label={dir === -1 ? `Move ${m.name} up` : `Move ${m.name} down`}
                        onClick={() => {
                          if (off) return;
                          const next = team.map((x) => x.userId);
                          [next[at], next[to]] = [next[to], next[at]];
                          void run(() => reorderMembersAction({ tenantId, userIds: next }), null);
                        }}
                        style={{ fontSize: 10, lineHeight: 1, padding: 0, background: "none", border: "none", cursor: off ? "default" : "pointer", color: off ? EL : SUB, fontFamily: "inherit" }}
                      >
                        {dir === -1 ? "▲" : "▼"}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}

      {/* ── the people who have been asked and have not answered (18578) ── */}
      {invites.map((inv) => (
        <div key={inv.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <b style={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {inv.name}
            </b>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: SUB,
                background: EL,
                padding: "3px 9px",
                borderRadius: 999,
                flexShrink: 0,
              }}
            >
              {MEMBER_LEVEL[inv.memberRole]}
            </span>
          </div>
          <div style={{ fontSize: 12, color: SUB, marginTop: 3 }}>
            {MEMBER_ROLE_WORD[inv.memberRole]} · {inv.email ?? "asked on DanceOS"}
          </div>
          <div style={{ fontSize: 9.5, fontWeight: 800, marginTop: 3, color: inv.status === "declined" ? "#F87171" : "#F59E0B" }}>
            {inv.status === "declined" ? "✕ They said no to being on your team" : "⏳ Waiting on them to confirm"}
          </div>
          {isOwner && (
            <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
              <span
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                aria-label={`Show the invite for ${inv.name}`}
                onClick={() => setShareInvite(inv)}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "9px",
                  borderRadius: 999,
                  background: "var(--text)",
                  color: "var(--solid)",
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Show QR &amp; link
              </span>
              <span
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                aria-label={`Withdraw the invite for ${inv.name}`}
                onClick={() =>
                  run(() => revokeInviteAction({ tenantId, inviteId: inv.id }), `${inv.name} — invite withdrawn`)
                }
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "9px",
                  borderRadius: 999,
                  background: EL,
                  color: "#F87171",
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Withdraw
              </span>
            </div>
          )}
        </div>
      ))}

      {/* the footnote, verbatim (18434) */}
      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.55 }}>
        Payout approval is owner-only and can&rsquo;t be granted (§10.9) · attachments are consent-based: invite
        → accept.
      </div>

      {isOwner ? (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={dosKey}
          aria-label="Invite staff or team member"
          onClick={() => {
            setForm({ name: "", email: "", role: "trainer" });
            setError(null);
            setAddOpen(true);
          }}
          style={{
            textAlign: "center",
            padding: "12px",
            borderRadius: 16,
            border: `1.5px dashed ${PINK}`,
            color: PINK,
            fontWeight: 800,
            fontSize: 13.5,
            cursor: "pointer",
            marginTop: 8,
          }}
        >
          ＋ Invite staff or team member
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>
          Only the owner can invite or remove people.
        </div>
      )}

      {error && <div style={{ fontSize: 11.5, color: "#EF4444", fontWeight: 700, marginTop: 10 }}>{error}</div>}

      {/* ── invite: name, email, what they may do ── */}
      {addOpen && (
        <div onClick={() => setAddOpen(false)} style={sheetWrap}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Invite staff or team member"
            onClick={(e) => e.stopPropagation()}
            style={sheet}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: EL, margin: "0 auto 12px" }} />
            <b style={{ fontSize: 17, fontFamily: DOS_DISPLAY }}>Invite someone</b>
            <div style={{ fontSize: 11.5, color: SUB, margin: "3px 0 14px", lineHeight: 1.5 }}>
              They accept before anything is theirs to run — nobody is added to a business without saying yes.
            </div>

            {/* THE LABEL IS CHOSEN FIRST, because it is what they are being
                asked to be — and the picker below asks them in one press */}
            <div style={{ fontSize: 12, color: SUB, margin: "0 0 4px" }}>What they may do</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {roles.map(([k, word]) => {
                const on = form.role === k;
                return (
                  <span
                    role="button"
                    tabIndex={0}
                    onKeyDown={dosKey}
                    key={k}
                    aria-pressed={on}
                    onClick={() => setForm({ ...form, role: k })}
                    style={{
                      fontSize: 11.5,
                      fontWeight: 800,
                      padding: "7px 12px",
                      borderRadius: 999,
                      cursor: "pointer",
                      background: on ? "var(--text)" : CARD,
                      color: on ? "var(--solid)" : SUB,
                      border: `1px solid ${on ? "var(--text)" : EL}`,
                    }}
                  >
                    {word}
                  </span>
                );
              })}
            </div>
            {/* what that label carries, said where it is chosen */}
            <Powers role={form.role} />

            {/* ── THE TWO WAYS IN (19 Sep 2026) ── */}
            <div style={{ display: "flex", gap: 2, background: EL, borderRadius: 12, padding: 3, margin: "14px 0 10px" }}>
              {([["person", "On DanceOS"], ["email", "By email"]] as const).map(([k, word]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={addBy === k}
                  onClick={() => setAddBy(k)}
                  style={{ flex: 1, padding: "8px 2px", borderRadius: 9, fontSize: 11.5, fontWeight: 800, border: "none", cursor: "pointer", fontFamily: "inherit", background: addBy === k ? "var(--solid)" : "transparent", color: addBy === k ? INK : SUB }}
                >
                  {word}
                </button>
              ))}
            </div>

            {addBy === "person" ? (
              /* the app's one people search — a name, a mobile number, or a
                 scanned profile link, every row with its picture (R27) */
              <PeoplePicker
                title="Search DanceOS, then ask them"
                placeholder="Name or mobile number"
                ariaLabel="Search for somebody to add"
                actionWord="Ask"
                actionColor={PINK}
                exclude={[meUserId, ...onTeam]}
                pickLabel={(p) => `Ask ${p.fullName}`}
                onPick={async (p) => {
                  const done = await run(
                    () => invitePersonAction({ tenantId, userId: p.id, role: form.role }),
                    `📨 ${p.fullName} asked — they accept to join`
                  );
                  if (done) setAddOpen(false);
                }}
              />
            ) : (
              <>
                {/* the address is for somebody who is NOT on DanceOS yet — which
                    is exactly what the picker above cannot find */}
                <div style={{ fontSize: 10.5, color: "var(--muted)", marginBottom: 8, lineHeight: 1.5 }}>
                  For somebody who has no DanceOS account yet. They sign in with this address to accept.
                </div>
                <div style={{ fontSize: 12, color: SUB, margin: "0 0 4px" }}>Name</div>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Vikram Bhatt"
                  aria-label="Their name"
                  style={inputStyle}
                />
                <div style={{ fontSize: 12, color: SUB, margin: "12px 0 4px" }}>Email they sign in with</div>
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="name@example.com"
                  inputMode="email"
                  autoCapitalize="none"
                  aria-label="Their email"
                  style={inputStyle}
                />
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={dosKey}
                  aria-label="Send invite"
                  onClick={async () => {
                    if (!canInvite) return;
                    const done = await run(
                      () =>
                        inviteToTenantAction({
                          tenantId,
                          name: form.name,
                          email: form.email,
                          role: form.role,
                        }),
                      `📨 ${form.name.trim()} invited — they accept to join`
                    );
                    if (done) setAddOpen(false);
                  }}
                  style={{
                    marginTop: 14,
                    textAlign: "center",
                    padding: "13px",
                    borderRadius: 999,
                    background: canInvite ? "var(--text)" : EL,
                    color: canInvite ? "var(--solid)" : "var(--muted)",
                    fontWeight: 800,
                    fontSize: 13.5,
                    cursor: canInvite ? "pointer" : "default",
                  }}
                >
                  {busy ? "Sending…" : "Send invite"}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── the QR the prototype promised: hold it up, or send the link ── */}
      {shareInvite && (
        <div onClick={() => setShareInvite(null)} style={sheetWrap}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Invite for ${shareInvite.name}`}
            onClick={(e) => e.stopPropagation()}
            style={sheet}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: EL, margin: "0 auto 12px" }} />
            <b style={{ fontSize: 17, fontFamily: DOS_DISPLAY }}>{shareInvite.name}</b>
            <div style={{ fontSize: 11.5, color: SUB, margin: "3px 0 14px" }}>
              Invited as {MEMBER_ROLE_WORD[shareInvite.memberRole].toLowerCase()} · {shareInvite.email}
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <QRBlock code={joinLink(shareInvite.code)} size={168} label="Invite code" />
            </div>
            <div
              style={{
                background: CARD,
                border: `1px solid ${EL}`,
                borderRadius: 12,
                padding: "10px 12px",
                fontSize: 11,
                fontFamily: DOS_MONO,
                color: SUB,
                wordBreak: "break-all",
                marginBottom: 10,
              }}
            >
              {joinLink(shareInvite.code)}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.55, marginBottom: 14 }}>
              Show the square or send the link. Either way they sign in as{" "}
              <b style={{ color: SUB }}>{shareInvite.email}</b> to accept — a link that reaches the wrong person
              cannot join your business.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                aria-label="Copy invite link"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(joinLink(shareInvite.code));
                    fire("Link copied");
                  } catch {
                    fire("Copy failed — long-press the link");
                  }
                }}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "12px",
                  borderRadius: 999,
                  background: CARD,
                  border: `1px solid ${EL}`,
                  fontWeight: 800,
                  fontSize: 12.5,
                  cursor: "pointer",
                  color: "var(--text)",
                }}
              >
                Copy link
              </span>
              <span
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                onClick={() => setShareInvite(null)}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "12px",
                  borderRadius: 999,
                  background: "var(--text)",
                  color: "var(--solid)",
                  fontWeight: 900,
                  fontSize: 12.5,
                  cursor: "pointer",
                }}
              >
                Done
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── one teammate: change what they may do, or take them off ── */}
      {openMember && (
        <div onClick={() => setOpenMember(null)} style={sheetWrap}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={openMember.name}
            onClick={(e) => e.stopPropagation()}
            style={sheet}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: EL, margin: "0 auto 12px" }} />
            <b style={{ fontSize: 17, fontFamily: DOS_DISPLAY }}>{openMember.name}</b>
            <div style={{ fontSize: 11.5, color: SUB, margin: "3px 0 14px" }}>
              {MEMBER_ROLE_WORD[openMember.role]}
              {openMember.city ? ` · ${openMember.city}` : ""}
            </div>

            <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.1, color: "var(--muted)", marginBottom: 7 }}>
              WHAT THEY MAY DO
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {roles.map(([k, word]) => {
                const on = openMember.role === k;
                return (
                  <span
                    role="button"
                    tabIndex={0}
                    onKeyDown={dosKey}
                    key={k}
                    aria-pressed={on}
                    aria-label={`Make ${openMember.name} ${word}`}
                    onClick={async () => {
                      if (on) return;
                      const done = await run(
                        () => setMemberRoleAction({ tenantId, userId: openMember.userId, role: k }),
                        `${openMember.name} → ${word}`
                      );
                      if (done) setOpenMember({ ...openMember, role: k as MemberRole });
                    }}
                    style={{
                      fontSize: 11.5,
                      fontWeight: 800,
                      padding: "7px 12px",
                      borderRadius: 999,
                      cursor: "pointer",
                      background: on ? "var(--text)" : CARD,
                      color: on ? "var(--solid)" : SUB,
                      border: `1px solid ${on ? "var(--text)" : EL}`,
                    }}
                  >
                    {word}
                  </span>
                );
              })}
            </div>
            {openMember.role === "owner" ? null : <Powers role={openMember.role as InvitableRole} />}

            {/* ── PAY THEM (19 Sep 2026) ─────────────────────────────────────
                A payment the studio has already made, recorded — Step 13's own
                limit, and the same ledger the Earnings desk reads as MONEY OUT.
                Nothing moves through code. ── */}
            {isOwner ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 7, margin: "14px 0 7px" }}>
                  <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.1, color: "var(--muted)" }}>PAYMENTS</span>
                  <span style={{ fontSize: 10.5, color: SUB }}>
                    {(() => {
                      const rows = paidTo(openMember.userId);
                      const total = rows.filter((r) => r.status === "done").reduce((n, r) => n + r.amountInr, 0);
                      return rows.length === 0 ? "nothing yet" : `${rupees(total)} paid · ${rows.length} ${rows.length === 1 ? "payment" : "payments"}`;
                    })()}
                  </span>
                </div>
                {paidTo(openMember.userId).slice(0, 6).map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${EL}` }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12, fontWeight: 800 }}>{rupees(p.amountInr)}</span>
                      <span style={{ display: "block", fontSize: 10, color: SUB, marginTop: 1 }}>
                        {p.paidOn} · {p.method.replace("_", " ")}
                        {p.sessionCount > 0 ? ` · ${p.sessionCount} ${p.sessionCount === 1 ? "session" : "sessions"}` : ""}
                        {p.note ? ` · ${p.note}` : ""}
                      </span>
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 900, padding: "3px 8px", borderRadius: 999, background: p.status === "done" ? "rgba(34,197,94,.16)" : EL, color: p.status === "done" ? "#22C55E" : SUB }}>
                      {p.status === "done" ? "PAID" : p.status === "in_transit" ? "IN TRANSIT" : "ON HOLD"}
                    </span>
                  </div>
                ))}
                <button
                  type="button"
                  aria-label={`Pay ${openMember.name}`}
                  onClick={() => { setPay({ amount: "", method: "upi", status: "done", note: "" }); setPayOpen(true); }}
                  style={{ width: "100%", marginTop: 10, textAlign: "center", padding: "11px", borderRadius: 999, border: `1.5px dashed ${PINK}`, background: "none", color: PINK, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}
                >
                  ＋ Record a payment
                </button>
              </>
            ) : null}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <span
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                aria-label={`Remove ${openMember.name} from the team`}
                onClick={async () => {
                  const done = await run(
                    () => removeMemberAction({ tenantId, userId: openMember.userId }),
                    `${openMember.name} taken off the team`
                  );
                  if (done) setOpenMember(null);
                }}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "12px",
                  borderRadius: 999,
                  background: CARD,
                  border: `1px solid ${EL}`,
                  fontWeight: 800,
                  fontSize: 12.5,
                  cursor: "pointer",
                  color: "#F87171",
                }}
              >
                Remove
              </span>
              <span
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                onClick={() => setOpenMember(null)}
                style={{
                  flex: 1.3,
                  textAlign: "center",
                  padding: "12px",
                  borderRadius: 999,
                  background: "var(--text)",
                  color: "var(--solid)",
                  fontWeight: 900,
                  fontSize: 12.5,
                  cursor: "pointer",
                }}
              >
                Done
              </span>
            </div>
            <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>
              Taking somebody off also ends any class they were holding attendance or refunds on.
            </div>
          </div>
        </div>
      )}

      {/* ── RECORD A PAYMENT — with the method, which is the user's own ask
          ("payment for team members should also give option for payment
          methods"). The four are the ones the ledger already knows. ── */}
      {payOpen && openMember && (
        <div onClick={() => setPayOpen(false)} style={{ ...sheetWrap, zIndex: 620 }}>
          <div role="dialog" aria-modal="true" aria-label={`Pay ${openMember.name}`} onClick={(e) => e.stopPropagation()} style={sheet}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: EL, margin: "0 auto 12px" }} />
            <b style={{ fontSize: 17, fontFamily: DOS_DISPLAY }}>Pay {openMember.name}</b>
            <div style={{ fontSize: 11.5, color: SUB, margin: "3px 0 14px", lineHeight: 1.5 }}>
              DanceOS records what you have paid — it does not move the money. This lands in your Earnings as an expense.
            </div>

            <div style={{ fontSize: 12, color: SUB, margin: "0 0 4px" }}>Amount</div>
            <input
              value={pay.amount}
              onChange={(e) => setPay({ ...pay, amount: e.target.value.replace(/[^0-9]/g, "") })}
              placeholder="e.g. 9000"
              inputMode="numeric"
              aria-label="Amount in rupees"
              style={inputStyle}
            />

            <div style={{ fontSize: 12, color: SUB, margin: "12px 0 4px" }}>How you paid</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PAY_METHODS.map(([k, word]) => {
                const on = pay.method === k;
                return (
                  <button key={k} type="button" aria-pressed={on} aria-label={word} onClick={() => setPay({ ...pay, method: k })} style={{ fontSize: 11.5, fontWeight: 800, padding: "7px 12px", borderRadius: 999, cursor: "pointer", background: on ? "var(--text)" : CARD, color: on ? "var(--solid)" : SUB, border: `1px solid ${on ? "var(--text)" : EL}`, fontFamily: "inherit" }}>
                    {word}
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 12, color: SUB, margin: "12px 0 4px" }}>Where it stands</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PAY_STATES.map(([k, word]) => {
                const on = pay.status === k;
                return (
                  <button key={k} type="button" aria-pressed={on} aria-label={word} onClick={() => setPay({ ...pay, status: k })} style={{ fontSize: 11.5, fontWeight: 800, padding: "7px 12px", borderRadius: 999, cursor: "pointer", background: on ? "var(--text)" : CARD, color: on ? "var(--solid)" : SUB, border: `1px solid ${on ? "var(--text)" : EL}`, fontFamily: "inherit" }}>
                    {word}
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 12, color: SUB, margin: "12px 0 4px" }}>Note (optional)</div>
            <input
              value={pay.note}
              onChange={(e) => setPay({ ...pay, note: e.target.value })}
              placeholder="e.g. September"
              aria-label="Note"
              maxLength={200}
              style={inputStyle}
            />

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => setPayOpen(false)} style={{ flex: 1, textAlign: "center", padding: "12px", borderRadius: 999, background: CARD, border: `1px solid ${EL}`, fontWeight: 800, fontSize: 12.5, cursor: "pointer", color: INK, fontFamily: "inherit" }}>
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || Number(pay.amount) < 1}
                aria-label="Record this payment"
                onClick={async () => {
                  const done = await run(
                    () =>
                      payTeamMemberAction({
                        tenantId,
                        userId: openMember.userId,
                        amountInr: Number(pay.amount),
                        method: pay.method,
                        status: pay.status,
                        note: pay.note.trim() || null,
                      }),
                    `${rupees(Number(pay.amount))} recorded for ${openMember.name}`
                  );
                  if (done) { setPayOpen(false); setOpenMember(null); }
                }}
                style={{ flex: 1.4, textAlign: "center", padding: "12px", borderRadius: 999, background: Number(pay.amount) >= 1 ? "var(--text)" : EL, color: Number(pay.amount) >= 1 ? "var(--solid)" : "var(--muted)", fontWeight: 900, fontSize: 12.5, cursor: Number(pay.amount) >= 1 ? "pointer" : "default", border: "none", fontFamily: "inherit" }}
              >
                {busy ? "Recording…" : "Record payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status" aria-live="polite" style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", boxShadow: "0 6px 24px rgba(0,0,0,.45)", color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650 }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
