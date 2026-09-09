"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { openSupportThreadAction } from "@/features/support/server-actions/support";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { SupportThread } from "@/repositories/support";
import { agoWords } from "@/types/notification";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";
const initialsOf = (name: string) => name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

const Head = ({ children }: { children: string }) => (
  <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED, margin: "2px 0 8px" }}>{children}</div>
);

function Face({ name, path, size = 40 }: { name: string; path: string | null; size?: number }) {
  const src = photoUrl(path);
  return (
    <span style={{ width: size, height: size, borderRadius: 13, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#64748B,#0EA5E9)", color: "#fff", fontWeight: 800, fontSize: size / 2.8 }}>
      {src ? <Image src={src} alt="" width={size} height={size} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : initialsOf(name)}
    </span>
  );
}

/** EVERY CONVERSATION, both sides (10 Sep 2026). The admin's list at
 *  /admin/support carries every thread and names the account; an account's own
 *  list at /support carries only theirs and says DanceOS. Open threads sort
 *  first, then by the newest reply, and `unread` is already the caller's own
 *  side — the same row honestly shows an organization 1 and an admin 0. */
export function SupportThreads({
  threads,
  isAdmin,
  nowIso,
  canOpen = true,
}: {
  threads: SupportThread[];
  isAdmin: boolean;
  nowIso: string;
  /** an account with no profile (an admin) has no side to write from */
  canOpen?: boolean;
}) {
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const open = () =>
    start(async () => {
      const out = await openSupportThreadAction({ subject: subject.trim(), body: body.trim() });
      if (out.error) return fire(out.error);
      setComposing(false);
      setSubject("");
      setBody("");
      if (out.threadId) router.push(`/support/${out.threadId}`);
      else router.refresh();
    });

  const waiting = threads.filter((t) => t.unread > 0).length;
  const root = isAdmin ? "/admin/support" : "/support";

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: "var(--dos-foot, 40px)" }}>
      <div style={{ padding: "14px 16px 0" }}>
        <div style={{ borderRadius: 22, padding: "15px 17px 14px", marginBottom: 14, position: "relative", overflow: "hidden", color: "#fff", background: "linear-gradient(135deg,#64748B,#0EA5E9)" }}>
          <div style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, position: "relative", fontFamily: DOS_DISPLAY, lineHeight: 1.18 }}>
            {isAdmin ? "Support" : "DanceOS support"}
          </div>
          <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2, position: "relative" }}>
            {threads.length === 0
              ? isAdmin ? "nothing waiting on you" : "no conversations yet"
              : waiting > 0
                ? `${waiting} waiting on ${isAdmin ? "you" : "your reply"} · ${threads.length} in all`
                : `${threads.length} conversation${threads.length === 1 ? "" : "s"}`}
          </div>
        </div>

        {!isAdmin && canOpen ? (
          composing ? (
            <div style={{ background: CARD, border: `1px solid ${EL}`, borderRadius: 16, padding: "12px 13px", marginBottom: 14 }}>
              <b style={{ fontSize: 13.5 }}>Write to DanceOS</b>
              <div style={{ fontSize: 11, color: SUB, margin: "3px 0 9px" }}>An admin reads this and replies here.</div>
              <input
                aria-label="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={140}
                placeholder="What is it about?"
                style={{ width: "100%", boxSizing: "border-box", background: LILAC, border: `1px solid ${EL}`, borderRadius: 12, padding: "10px 12px", fontSize: 13, color: INK, fontFamily: "inherit", marginBottom: 8 }}
              />
              <textarea
                aria-label="Message"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={4000}
                rows={4}
                placeholder="Tell us what you need."
                style={{ width: "100%", boxSizing: "border-box", background: LILAC, border: `1px solid ${EL}`, borderRadius: 12, padding: "10px 12px", fontSize: 13, color: INK, fontFamily: "inherit", resize: "vertical", lineHeight: 1.55 }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
                <button type="button" disabled={pending || !subject.trim() || !body.trim()} onClick={open} style={{ flex: 1, height: 40, borderRadius: 12, border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 900, fontSize: 12.5, background: subject.trim() && body.trim() ? "var(--text)" : EL, color: subject.trim() && body.trim() ? "var(--solid)" : SUB }}>
                  {pending ? "Sending…" : "Send"}
                </button>
                <button type="button" onClick={() => setComposing(false)} style={{ height: 40, padding: "0 14px", borderRadius: 12, background: LILAC, border: `1px solid ${EL}`, color: SUB, cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 12 }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setComposing(true)} style={{ width: "100%", height: 44, borderRadius: 14, background: "var(--text)", color: "var(--solid)", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 900, fontSize: 12.5, marginBottom: 14 }}>
              ＋ Write to DanceOS
            </button>
          )
        ) : null}

        <Head>{isAdmin ? "EVERY CONVERSATION" : "YOUR CONVERSATIONS"}</Head>
        {threads.length === 0 ? (
          <div style={{ fontSize: 11.5, color: SUB, padding: "0 2px 12px", lineHeight: 1.55 }}>
            {isAdmin
              ? "Nobody has written in, and you have started nothing. An organization waiting on verification can write from its hub."
              : "Nothing yet. If you are waiting on verification or something looks wrong, write to DanceOS and an admin will read it."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {threads.map((t) => (
              <Link
                key={t.id}
                href={`${root}/${t.id}`}
                aria-label={`Open ${t.subject}${t.unread > 0 ? ` — ${t.unread} unread` : ""}`}
                style={{ display: "flex", alignItems: "center", gap: 11, background: CARD, border: `1px solid ${EL}`, borderLeft: `4px solid ${t.unread > 0 ? "#F59E0B" : t.status === "closed" ? EL : "#22C55E"}`, borderRadius: 16, padding: "11px 12px", textDecoration: "none", color: INK }}
              >
                {isAdmin ? <Face name={t.accountName} path={t.accountAvatarPath} /> : null}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <b style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.subject}</b>
                    {t.unread > 0 ? (
                      <span style={{ flexShrink: 0, minWidth: 17, height: 17, borderRadius: 9, padding: "0 5px", background: "#EC4899", color: "#fff", fontSize: 10, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{t.unread}</span>
                    ) : null}
                  </span>
                  {isAdmin ? (
                    <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 1 }}>
                      {t.accountName} · {t.accountRole === "org" ? "organization" : "user"}
                      {t.kind === "verification" ? " · verification" : ""}
                    </span>
                  ) : null}
                  <span style={{ display: "block", fontSize: 11, color: SUB, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.lastFromAdmin === null ? "" : `${t.lastFromAdmin ? "DanceOS" : isAdmin ? t.accountName.split(" ")[0] : "You"}: `}
                    {t.lastBody ?? "—"}
                  </span>
                  <span style={{ display: "block", fontSize: 10, color: MUTED, marginTop: 3 }}>
                    {agoWords(t.lastMessageAt, nowIso)} · {t.messages} message{t.messages === 1 ? "" : "s"}
                    {t.status === "closed" ? " · closed" : ""}
                  </span>
                </span>
                <span aria-hidden="true" style={{ flexShrink: 0, color: EL, fontSize: 15, fontWeight: 600 }}>›</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {toast ? (
        <div role="status" style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "calc(28px + var(--dos-safe-bottom, 0px))", zIndex: 500, background: "var(--text)", color: "var(--solid)", borderRadius: 999, padding: "10px 18px", fontSize: 12, fontWeight: 800, width: "min(360px, calc(100vw - 44px))", textAlign: "center", boxSizing: "border-box" }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
