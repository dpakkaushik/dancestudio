"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { postSupportMessageAction, setSupportThreadStatusAction } from "@/features/support/server-actions/support";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import type { SupportMessage, SupportThread } from "@/repositories/support";
import { agoWords } from "@/types/notification";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";

/** ONE CONVERSATION, both sides (10 Sep 2026). The same component serves the
 *  account at /support/[id] and the admin at /admin/support/[id]: what differs
 *  is only which side of the thread is "mine" and whether the Close control is
 *  drawn. The transcript reads DanceOS on one side and the account on the
 *  other from `fromAdmin`, which the database stamped when each message was
 *  written — so an admin who is later removed does not turn their old replies
 *  into somebody else's.
 *
 *  A verification thread carries a line back to the decision it is about, so
 *  "why was I rejected" is answered in the place the rejection was said. */
export function SupportConversation({
  thread,
  messages,
  isAdmin,
  nowIso,
}: {
  thread: SupportThread;
  messages: SupportMessage[];
  /** the viewer is a platform admin: their messages are the DanceOS side */
  isAdmin: boolean;
  nowIso: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const foot = useRef<HTMLDivElement | null>(null);

  /* a transcript is read from the bottom — the newest line is the point */
  useEffect(() => {
    foot.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    start(async () => {
      const out = await postSupportMessageAction({ threadId: thread.id, body });
      if (out.error) return fire(out.error);
      setDraft("");
      router.refresh();
    });
  };

  const setStatus = (status: "open" | "closed") =>
    start(async () => {
      const out = await setSupportThreadStatusAction({ threadId: thread.id, status });
      if (out.error) return fire(out.error);
      fire(status === "closed" ? "Conversation closed" : "Reopened");
      router.refresh();
    });

  const closed = thread.status === "closed";
  const back = isAdmin ? "/admin/support" : "/support";

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: "var(--dos-foot, 40px)" }}>
      <div style={{ padding: "14px 16px 0" }}>
        {/* who this is with, and what it is about */}
        <div style={{ borderRadius: 22, padding: "15px 17px 14px", marginBottom: 12, position: "relative", overflow: "hidden", color: "#fff", background: "linear-gradient(135deg,#64748B,#0EA5E9)" }}>
          <div style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, opacity: 0.85, position: "relative" }}>
            {isAdmin ? thread.accountName.toUpperCase() : "DANCEOS SUPPORT"}
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.4, position: "relative", fontFamily: DOS_DISPLAY, lineHeight: 1.2, marginTop: 2 }}>{thread.subject}</div>
          <div style={{ fontSize: 11, opacity: 0.9, marginTop: 3, position: "relative" }}>
            {closed ? "closed" : "open"} · started {agoWords(thread.createdAt, nowIso)}
            {thread.kind === "verification" ? " · about your verification" : ""}
          </div>
        </div>

        {thread.kind === "verification" && thread.requestId ? (
          <Link href={isAdmin ? "/admin/verifications" : "/business"} style={{ display: "block", background: CARD, border: `1px solid ${EL}`, borderLeft: "4px solid #F59E0B", borderRadius: 14, padding: "10px 12px", marginBottom: 12, textDecoration: "none", color: INK }}>
            <div style={{ fontSize: 11.5, fontWeight: 800 }}>This is about a verification decision</div>
            <div style={{ fontSize: 10.5, color: SUB, marginTop: 2 }}>{isAdmin ? "Open the verification queue ›" : "See where your organization stands ›"}</div>
          </Link>
        ) : null}

        {/* ── the transcript ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {messages.map((m) => {
            const mine = m.fromAdmin === isAdmin;
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "84%", borderRadius: 16, padding: "9px 12px", background: mine ? "var(--text)" : CARD, color: mine ? "var(--solid)" : INK, border: mine ? "none" : `1px solid ${EL}` }}>
                  <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, opacity: 0.7, marginBottom: 3 }}>
                    {m.fromAdmin ? "DANCEOS" : isAdmin ? thread.accountName.toUpperCase() : "YOU"}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
                  <div style={{ fontSize: 9.5, opacity: 0.6, marginTop: 4 }}>{agoWords(m.createdAt, nowIso)}</div>
                </div>
              </div>
            );
          })}
          <div ref={foot} />
        </div>

        {/* ── the reply box ── */}
        {closed && !isAdmin ? (
          <div style={{ background: CARD, border: `1px solid ${EL}`, borderRadius: 14, padding: "11px 13px", marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: SUB, lineHeight: 1.55 }}>
              DanceOS closed this conversation. Write again below and it reopens.
            </div>
          </div>
        ) : null}
        <label htmlFor="support-reply" style={{ display: "block", fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED, margin: "2px 0 6px" }}>
          YOUR REPLY
        </label>
        <textarea
          id="support-reply"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={4000}
          rows={4}
          placeholder={isAdmin ? `Reply to ${thread.accountName}…` : "Write to DanceOS…"}
          style={{ width: "100%", boxSizing: "border-box", background: CARD, border: `1px solid ${EL}`, borderRadius: 14, padding: "11px 12px", fontSize: 13, color: INK, fontFamily: "inherit", resize: "vertical", lineHeight: 1.55 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={pending || !draft.trim()}
            onClick={send}
            style={{ flex: 1, minWidth: 130, height: 42, borderRadius: 12, border: "none", cursor: draft.trim() ? "pointer" : "default", fontFamily: "inherit", fontWeight: 900, fontSize: 12.5, background: draft.trim() ? "var(--text)" : EL, color: draft.trim() ? "var(--solid)" : SUB }}
          >
            {pending ? "Sending…" : "Send"}
          </button>
          {isAdmin ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => setStatus(closed ? "open" : "closed")}
              style={{ height: 42, padding: "0 14px", borderRadius: 12, background: CARD, border: `1px solid ${EL}`, color: INK, cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 12 }}
            >
              {closed ? "Reopen" : "Close"}
            </button>
          ) : null}
          <Link href={back} style={{ height: 42, padding: "0 14px", borderRadius: 12, background: CARD, border: `1px solid ${EL}`, color: INK, textDecoration: "none", display: "inline-flex", alignItems: "center", fontWeight: 800, fontSize: 12 }}>
            All conversations
          </Link>
        </div>
        <div style={{ fontSize: 10, color: MUTED, marginTop: 6 }}>{draft.length} / 4000</div>
      </div>

      {toast ? (
        <div role="status" style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "calc(28px + var(--dos-safe-bottom, 0px))", zIndex: 500, background: "var(--text)", color: "var(--solid)", borderRadius: 999, padding: "10px 18px", fontSize: 12, fontWeight: 800, width: "min(360px, calc(100vw - 44px))", textAlign: "center", boxSizing: "border-box" }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
