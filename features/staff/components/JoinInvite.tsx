"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dosKey } from "@/features/classes/components/ShareSheet";
import { acceptInviteAction, declineInviteAction } from "@/features/staff/server-actions/staff";
import { DOS_DISPLAY, DOS_UI, GOLD, INK, LILAC, SUB } from "@/lib/design/tokens";
import { MEMBER_GRANTS, MEMBER_ROLE_WORD, type InvitePreview } from "@/types/staff";

/** The accept screen. Same card the class page uses when somebody is asked onto
 *  a class (prototype 15455) — because it is the same act: a business asks, and
 *  the person themselves answers. Nobody is added to a business by somebody else
 *  ticking a box.
 *
 *  A link that reached the wrong person is a dead end on purpose: the invite
 *  belongs to an email address, and the screen says which one without printing
 *  it in full. */
export function JoinInvite({ code, preview }: { code: string; preview: InvitePreview | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shell = (children: React.ReactNode) => (
    <div
      style={{
        background: LILAC,
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        minHeight: "100vh",
        padding: "18px 16px 40px",
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );

  const notice = (headline: string, body: string) =>
    shell(
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--el)",
          borderRadius: 16,
          padding: "18px 16px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 900, fontFamily: DOS_DISPLAY }}>{headline}</div>
        <div style={{ fontSize: 11.5, color: SUB, marginTop: 5, lineHeight: 1.55 }}>{body}</div>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={dosKey}
          onClick={() => router.push("/")}
          style={{
            marginTop: 14,
            padding: "11px",
            borderRadius: 999,
            background: "var(--text)",
            color: "var(--solid)",
            fontWeight: 800,
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          Go home
        </div>
      </div>
    );

  if (!preview) {
    return notice("That link isn’t an invite", "It may have been withdrawn, or the address was mistyped.");
  }
  if (preview.status === "accepted") {
    return notice("Already answered", `You are on ${preview.tenantName}. This invite has been used.`);
  }
  if (preview.status === "declined" || preview.status === "revoked") {
    return notice(
      preview.status === "revoked" ? "This invite was withdrawn" : "This invite was declined",
      `${preview.tenantName} will need to ask again if that was a mistake.`
    );
  }
  if (!preview.isForMe) {
    return notice(
      "This invite is for somebody else",
      `${preview.tenantName} sent it to ${preview.emailHint}. Sign in with that address to accept it — holding the link isn’t enough.`
    );
  }

  const answer = async (yes: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = yes ? await acceptInviteAction({ code }) : await declineInviteAction({ code });
    setBusy(false);
    if (out.error) {
      setError(out.error);
      return;
    }
    router.push(yes ? `/business/${preview.tenantId}/classes` : "/");
  };

  const roleWord = MEMBER_ROLE_WORD[preview.memberRole].toLowerCase();

  return shell(
    <>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, color: SUB, marginBottom: 2 }}>
        AN INVITATION
      </div>
      <div
        style={{
          fontSize: 21,
          fontWeight: 800,
          fontFamily: DOS_DISPLAY,
          letterSpacing: -0.5,
          marginBottom: 14,
        }}
      >
        Join {preview.tenantName}
      </div>

      <div
        style={{
          background: "var(--card)",
          border: `1px solid ${GOLD}66`,
          borderLeft: `3px solid ${GOLD}`,
          borderRadius: 16,
          padding: "13px 14px",
        }}
      >
        <div style={{ fontSize: 12.5, fontWeight: 900 }}>
          {preview.tenantName} wants you on the team as {roleWord === "staff" ? "staff" : `a ${roleWord}`}
        </div>
        <div style={{ fontSize: 10.5, color: SUB, marginTop: 3, lineHeight: 1.5 }}>
          You would have {MEMBER_GRANTS[preview.memberRole]}. Nothing is yours to run until you say yes, and
          you can be taken off the team at any time.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <span
            role="button"
            tabIndex={0}
            onKeyDown={dosKey}
            aria-label="Decline this invitation"
            onClick={() => void answer(false)}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "11px",
              borderRadius: 999,
              background: "var(--solid)",
              border: "1px solid var(--el)",
              fontWeight: 800,
              fontSize: 12,
              cursor: "pointer",
              color: "#F87171",
            }}
          >
            No thanks
          </span>
          <span
            role="button"
            tabIndex={0}
            onKeyDown={dosKey}
            aria-label="Join the team"
            onClick={() => void answer(true)}
            style={{
              flex: 1.3,
              textAlign: "center",
              padding: "11px",
              borderRadius: 999,
              background: "var(--text)",
              color: "var(--solid)",
              fontWeight: 900,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {busy ? "…" : "Yes, I’m in"}
          </span>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 11.5, color: "#EF4444", fontWeight: 700, marginTop: 12 }}>{error}</div>
      )}

      <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 12, lineHeight: 1.55 }}>
        Sent to {preview.emailHint} · asked for by the studio&rsquo;s owner.
      </div>
    </>
  );
}
