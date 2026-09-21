"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { QRBlock } from "@/components/ui/QRBlock";
import { deleteLeadAction } from "@/features/leads/server-actions/leads";
import { DeskAddButton } from "@/features/settings/components/settings-kit";
import { DOS_TOOLS } from "@/features/tenants/components/biz-kit";
import { DeskHero } from "@/features/tenants/components/biz-kit";
import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { photoUrl } from "@/lib/media/photo";
import type { Student } from "@/repositories/students";

/** THE STUDENTS DESK — a list, not a pipeline (21 Sep 2026).
 *
 *  The user: *"Students section dont need to track a lead should just simply be
 *  able to send invite to a new user from here through mobile no. or email.
 *  rest all students are added automatically when they attend a class or take a
 *  membership."*
 *
 *  So what is GONE: the five stages (New · Quoted · Trial · Won · Lost), the
 *  open/enrolled funnel, the stage chips, the trial-class picker and the
 *  per-lead sheet that moved a person between stages. A studio does not work a
 *  sales pipeline in this app any more; it looks at who dances here.
 *
 *  ⚠ WHAT IS KEPT, AND WHY: the walk-ins its own desk typed in. They are real
 *  people the studio knows, `leads` rows with no account behind them, and
 *  dropping them from the screen would have deleted a studio's own list from its
 *  own view. Removing one is still possible; nothing else about a row is
 *  editable, because there is nothing left to edit.
 *
 *  ⚠ AND THE INVITE IS A HAND-OFF, NOT A SEND, and that is deliberate rather
 *  than unfinished. There is no SMS provider wired at all (the phone channel was
 *  deleted on 7 Sep — no Twilio, no DLT) and Resend is still in test mode, so a
 *  server-sent email reaches nobody but the account owner. A "Send invite"
 *  button here would be a door that does not open — the exact thing this
 *  codebase keeps refusing to ship. Instead the number or the address opens the
 *  studio's OWN WhatsApp, SMS app or mail client with the invite written, which
 *  works today, from a phone, with nothing signed up for. Copy link and the QR
 *  are the same invite for somebody standing at the desk. */

const CARD = "var(--card)";
const EL = "var(--el)";

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
  textTransform: "none",
};

/** the digits a wa.me link needs — no plus, no spaces, and an Indian number
 *  typed without its country code gets one, because that is what people type */
const waDigits = (raw: string): string => {
  const d = raw.replace(/\D/g, "");
  if (!d) return "";
  return d.length === 10 ? `91${d}` : d;
};

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

function Face({ name, photoPath, size = 38 }: { name: string; photoPath: string | null; size?: number }) {
  const url = photoPath ? photoUrl(photoPath) : null;
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "·";
  return (
    <span style={{ width: size, height: size, borderRadius: size * 0.3, flexShrink: 0, overflow: "hidden", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#84CC16,#4D7C0F)", color: "#fff", fontSize: size * 0.36, fontWeight: 900 }}>
      {url ? <Image src={url} alt="" width={size} height={size} style={{ objectFit: "cover", width: size, height: size }} unoptimized /> : initials}
    </span>
  );
}

export function StudentsDesk({
  tenantId,
  tenantName,
  students,
  /** where an invited person lands — the studio's own public page */
  inviteUrl,
}: {
  tenantId: string;
  tenantName: string;
  students: Student[];
  inviteUrl: string;
}) {
  const [q, setQ] = useState("");
  const [invite, setInvite] = useState(false);
  const [busyLead, setBusyLead] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  const term = q.trim().toLowerCase();
  const list = term ? students.filter((s) => s.name.toLowerCase().includes(term) || (s.mobile ?? "").includes(term)) : students;

  const remove = async (leadId: string, name: string) => {
    setBusyLead(leadId);
    const out = await deleteLeadAction({ tenantId, leadId });
    setBusyLead(null);
    fire(out.error ?? `${name} removed from your list`);
  };

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "14px 16px 40px", boxSizing: "border-box" }}>
      <DeskHero tool="students" as="h1" margin="0 0 12px" />

      <DeskAddButton label="Invite a student" onClick={() => setInvite(true)} />

      <div style={{ display: "flex", alignItems: "center", gap: 8, background: CARD, border: `1.5px solid ${EL}`, borderRadius: 12, padding: "9px 11px", margin: "11px 0 10px" }}>
        <span aria-hidden="true" style={{ color: "var(--muted)", fontSize: 13 }}>⌕</span>
        <input aria-label="Search students" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or number…" style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: INK, fontSize: 12.5, fontFamily: "inherit", textTransform: "none" }} />
      </div>

      {/* WHAT THIS LIST IS — said once, because it is the whole change (21 Sep) */}
      <div style={{ fontSize: 11, color: SUB, lineHeight: 1.5, padding: "0 2px 10px" }}>
        Everybody who has been <b>checked in</b> here or holds one of your memberships, plus anybody you added yourself. It counts attendance, not bookings — a seat nobody marked is not a session danced.
      </div>

      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: "var(--muted)", margin: "0 2px 8px" }}>
        STUDENTS · {students.length}
      </div>

      {list.map((s) => {
        const key = s.userId ?? s.leadId ?? s.name;
        const meta = [
          s.attended > 0 ? `${s.attended} in` : null,
          s.booked > 0 ? `${s.booked} booked` : null,
          s.passName ? `🎟 ${s.passName}` : null,
          s.sources.length === 1 && s.sources[0] === "added" ? "added by you" : null,
        ].filter(Boolean);
        return (
          <div key={key} style={{ background: CARD, border: `1.5px solid ${EL}`, borderRadius: 14, padding: "11px 12px", marginBottom: 8, display: "flex", alignItems: "center", gap: 11 }}>
            {/* the face and the name are a door to the person, where there IS a
                person — a walk-in has no profile to open, and does not pretend */}
            {s.userId ? (
              <Link href={`/person/${s.userId}`} aria-label={`Open ${s.name}`} style={{ display: "flex", alignItems: "center", gap: 11, flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}>
                <Face name={s.name} photoPath={s.photoPath} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                  <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 2 }}>{meta.join(" · ") || "No sessions yet"}</span>
                </span>
              </Link>
            ) : (
              <span style={{ display: "flex", alignItems: "center", gap: 11, flex: 1, minWidth: 0 }}>
                <Face name={s.name} photoPath={null} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                  <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 2 }}>{s.mobile ? `${s.mobile} · not on DanceOS` : "Not on DanceOS"}</span>
                </span>
              </span>
            )}
            {/* only a row the desk itself typed can be removed — the rest are
                consequences of attendance and passes, and un-attending is not a
                thing a button can do */}
            {s.leadId && !s.userId ? (
              <button type="button" disabled={busyLead === s.leadId} aria-label={`Remove ${s.name}`} onClick={() => void remove(s.leadId as string, s.name)} style={{ flexShrink: 0, background: "none", border: "none", color: SUB, fontSize: 15, cursor: "pointer", padding: 4, fontFamily: "inherit" }}>
                ✕
              </button>
            ) : null}
          </div>
        );
      })}

      {students.length === 0 ? (
        <div style={{ background: CARD, border: `1.5px dashed ${EL}`, borderRadius: 14, padding: "18px 14px", textAlign: "center", fontSize: 12, color: SUB, lineHeight: 1.6 }}>
          Nobody yet. A student appears here the moment they are checked in to one of your classes or take one of your memberships — invite somebody to get started.
        </div>
      ) : list.length === 0 ? (
        <div style={{ background: CARD, border: `1.5px dashed ${EL}`, borderRadius: 14, padding: "16px 14px", textAlign: "center", fontSize: 12, color: SUB }}>
          Nobody matches that.
        </div>
      ) : null}

      {invite ? <InviteSheet tenantName={tenantName} inviteUrl={inviteUrl} onClose={() => setInvite(false)} onToast={fire} /> : null}

      {toast ? (
        <div role="status" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", color: INK, padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650, boxShadow: "0 6px 24px rgba(0,0,0,.45)" }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}

/** INVITE A STUDENT — the number or the address opens the studio's own WhatsApp,
 *  SMS app or mail client with the invite already written. Nothing is sent by
 *  DanceOS, and nothing pretends to be: see the file header for why that is the
 *  honest build today rather than a smaller one. */
function InviteSheet({
  tenantName,
  inviteUrl,
  onClose,
  onToast,
}: {
  tenantName: string;
  inviteUrl: string;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  useCloseOnBack(onClose);
  const [by, setBy] = useState<"mobile" | "email">("mobile");
  const [to, setTo] = useState("");

  const message = `Join me on DanceOS — ${tenantName} is on it. Classes, bookings and your membership in one place: ${inviteUrl}`;
  const digits = waDigits(to);
  const ready = by === "mobile" ? digits.length >= 10 : looksLikeEmail(to);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      onToast("🔗 Link copied");
    } catch {
      onToast("Could not copy — long-press the link instead");
    }
  };

  const pill: React.CSSProperties = { flex: 1, textAlign: "center", padding: "12px", borderRadius: 999, fontWeight: 900, fontSize: 12.5, fontFamily: "inherit", textDecoration: "none", cursor: "pointer", border: "none" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 620 }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Invite a student"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--solid)", color: INK, borderRadius: "24px 24px 0 0", padding: "18px 16px 28px", width: "100%", maxWidth: 430, boxSizing: "border-box", animation: "dosSheetUp .28s cubic-bezier(.22,.9,.34,1)" }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: EL, margin: "0 auto 14px" }} />
        <b style={{ fontSize: 17 }}>Invite a student</b>
        <div style={{ fontSize: 12, color: SUB, margin: "3px 0 14px", lineHeight: 1.5 }}>
          Send them the link from your own WhatsApp, messages or mail. They join DanceOS, and appear here by themselves the first time they dance with you.
        </div>

        <div role="group" aria-label="Invite by" style={{ display: "flex", gap: 2, background: EL, borderRadius: 12, padding: 3, marginBottom: 10 }}>
          {([["mobile", "Mobile no."], ["email", "Email"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setBy(k); setTo(""); }} aria-pressed={by === k} style={{ flex: 1, padding: "8px 2px", borderRadius: 9, fontSize: 11.5, fontWeight: 800, border: "none", cursor: "pointer", fontFamily: "inherit", background: by === k ? "var(--solid)" : "transparent", color: by === k ? INK : SUB }}>
              {l}
            </button>
          ))}
        </div>

        <input
          aria-label={by === "mobile" ? "Mobile number" : "Email address"}
          inputMode={by === "mobile" ? "tel" : "email"}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={by === "mobile" ? "+91 98765 43210" : "them@example.com"}
          style={inputStyle}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {by === "mobile" ? (
            <>
              <a
                aria-disabled={!ready}
                href={ready ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : undefined}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => { if (!ready) { e.preventDefault(); onToast("Type a mobile number first"); } }}
                style={{ ...pill, background: ready ? "#25D366" : EL, color: ready ? "#062A14" : "var(--muted)" }}
              >
                WhatsApp
              </a>
              <a
                aria-disabled={!ready}
                href={ready ? `sms:${to.replace(/\s/g, "")}?&body=${encodeURIComponent(message)}` : undefined}
                onClick={(e) => { if (!ready) { e.preventDefault(); onToast("Type a mobile number first"); } }}
                style={{ ...pill, background: ready ? INK : EL, color: ready ? LILAC : "var(--muted)" }}
              >
                SMS
              </a>
            </>
          ) : (
            <a
              aria-disabled={!ready}
              href={ready ? `mailto:${to.trim()}?subject=${encodeURIComponent(`Join me on DanceOS — ${tenantName}`)}&body=${encodeURIComponent(message)}` : undefined}
              onClick={(e) => { if (!ready) { e.preventDefault(); onToast("Type an email address first"); } }}
              style={{ ...pill, background: ready ? INK : EL, color: ready ? LILAC : "var(--muted)" }}
            >
              Open mail
            </a>
          )}
        </div>

        {/* the same invite for somebody standing in front of you */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, padding: "12px", background: CARD, border: `1.5px solid ${EL}`, borderRadius: 14 }}>
          {/* ⚠ 132, not 72: the line beside it says "they scan it", and since
              21 Sep this is a REAL code — an invite URL is a version-5 code at
              37 modules, so 72px gave it 1.6 pixels a module and no phone would
              have read it. A control that says what it does has to be able to
              do it. */}
          <QRBlock code={inviteUrl} size={132} label="Invite link" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: "var(--muted)" }}>OR IN PERSON</div>
            <div style={{ fontSize: 11, color: SUB, margin: "3px 0 8px", lineHeight: 1.45 }}>They scan it, or you send the link.</div>
            <button type="button" onClick={() => void copy()} style={{ padding: "8px 14px", borderRadius: 999, background: CARD, border: `1.5px solid ${EL}`, color: INK, fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>
              Copy link
            </button>
          </div>
        </div>

        <button type="button" onClick={onClose} style={{ width: "100%", marginTop: 14, padding: 13, borderRadius: 999, background: CARD, border: `1.5px solid ${EL}`, color: INK, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          Done
        </button>
      </div>
    </div>
  );
}

/* the tool's own paint, so the desk and the tile that opens it agree */
export const STUDENTS_TINT = DOS_TOOLS.students.c;
