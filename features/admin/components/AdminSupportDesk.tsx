import Image from "next/image";
import Link from "next/link";
import { INK, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { SupportThread } from "@/repositories/support";
import { agoWords } from "@/types/notification";
import { AdminGlyph, DESK_TINT } from "./admin-glyphs";
import { CountLine, DeskHero, DeskTabs, EmptyLine, PAGE_SIZE, Pager, SearchBar, StatStrip } from "./desk-kit";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";
const initialsOf = (name: string) => name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

function Face({ name, path, size = 40 }: { name: string; path: string | null; size?: number }) {
  const src = photoUrl(path);
  return (
    <span style={{ width: size, height: size, borderRadius: 13, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#64748B,#0EA5E9)", color: "#fff", fontWeight: 800, fontSize: size / 2.8 }}>
      {src ? <Image src={src} alt="" width={size} height={size} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : initialsOf(name)}
    </span>
  );
}

export type SupportTab = "waiting" | "open" | "closed" | "all";

export const SUPPORT_TABS: ReadonlyArray<SupportTab> = ["waiting", "open", "closed", "all"];

/** the tab a thread belongs on — one place, so the counts and the list agree */
export const onSupportTab = (t: SupportThread, tab: SupportTab): boolean =>
  tab === "all" ? true : tab === "waiting" ? t.unread > 0 && t.status === "open" : t.status === tab;

/** the search: the account's name, the subject, or the last thing said */
export const matchesSupport = (t: SupportThread, q: string): boolean => {
  const term = q.trim().toLowerCase();
  if (!term) return true;
  return [t.accountName, t.subject, t.lastBody ?? ""].some((s) => s.toLowerCase().includes(term));
};

/** THE ADMIN'S SUPPORT DESK (11 Sep 2026) — every conversation on the platform
 *  as a desk rather than a list: the figures, four tabs, a search, one page.
 *
 *  WAITING comes first and means one exact thing: an open thread where the
 *  last word is theirs and no admin has read it. That is the queue. "Open" is
 *  everything not closed, "Closed" is history, and the search matches the
 *  account, the subject, or the last thing said — because "the one about
 *  Instagram" is how people remember a conversation.
 *
 *  An admin cannot open a thread from here (there is nobody named yet);
 *  Accounts has the Write button beside each person. Answering is on the
 *  thread's own page. */
export function AdminSupportDesk({
  threads,
  page,
  total,
  tab,
  q,
  counts,
  nowIso,
}: {
  /** ONE PAGE of the threads on this tab */
  threads: SupportThread[];
  page: number;
  total: number;
  tab: SupportTab;
  q: string;
  counts: Record<SupportTab, number>;
  nowIso: string;
}) {
  const base = "/admin/support";
  return (
    <div style={{ padding: "6px 16px var(--dos-foot, 40px)" }}>
      <DeskHero
        eyebrow="COMMUNICATION"
        title="Support"
        sub={counts.waiting === 0 ? "nothing waiting on you" : `${counts.waiting} waiting on you · ${counts.all} in all`}
        tint={counts.waiting > 0 ? "#F59E0B" : DESK_TINT.support}
        icon={<AdminGlyph k="support" size={22} />}
      />
      <StatStrip
        cols={4}
        figs={[
          { n: counts.waiting, label: "waiting on you", href: `${base}?tab=waiting`, tone: counts.waiting > 0 ? "#F59E0B" : undefined },
          { n: counts.open, label: "open", href: `${base}?tab=open` },
          { n: counts.closed, label: "closed", href: `${base}?tab=closed` },
          { n: counts.all, label: "conversations", href: `${base}?tab=all` },
        ]}
      />
      <DeskTabs
        base={base}
        current={tab}
        keep={{ q: q || null }}
        tabs={[
          { key: "waiting", label: "Waiting", count: counts.waiting, tone: "#F59E0B" },
          { key: "open", label: "Open", count: counts.open },
          { key: "closed", label: "Closed", count: counts.closed },
          { key: "all", label: "All", count: counts.all },
        ]}
      />
      <SearchBar action={base} q={q} keep={{ tab }} placeholder="Search by account, subject or last message…" />
      <CountLine shown={threads.length} total={total} what={tab === "waiting" ? "waiting" : tab === "all" ? "conversations" : tab} q={q} />

      {threads.length === 0 ? (
        <EmptyLine>
          {q
            ? "No conversation matches that."
            : tab === "waiting"
              ? "Nobody is waiting on a reply."
              : "Nobody has written in, and you have started nothing. An organization waiting on verification can write from its Home."}
        </EmptyLine>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {threads.map((t) => (
            <Link
              key={t.id}
              href={`${base}/${t.id}`}
              aria-label={`Open ${t.subject}${t.unread > 0 ? ` — ${t.unread} unread` : ""}`}
              style={{ display: "flex", alignItems: "center", gap: 11, background: CARD, border: `1px solid ${EL}`, borderLeft: `4px solid ${t.unread > 0 ? "#F59E0B" : t.status === "closed" ? EL : "#22C55E"}`, borderRadius: 16, padding: "11px 12px", textDecoration: "none", color: INK }}
            >
              <Face name={t.accountName} path={t.accountAvatarPath} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <b style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.subject}</b>
                  {t.unread > 0 ? (
                    <span style={{ flexShrink: 0, minWidth: 17, height: 17, borderRadius: 9, padding: "0 5px", background: "#EC4899", color: "#fff", fontSize: 10, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{t.unread}</span>
                  ) : null}
                </span>
                <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 1 }}>
                  {t.accountName} · {t.accountRole === "org" ? "organization" : "user"}
                  {t.kind === "verification" ? " · verification" : ""}
                </span>
                <span style={{ display: "block", fontSize: 11, color: SUB, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.lastFromAdmin === null ? "" : `${t.lastFromAdmin ? "DanceOS" : t.accountName.split(" ")[0]}: `}
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

      <Pager base={base} page={page} total={total} size={PAGE_SIZE} keep={{ tab, q: q || null }} />
    </div>
  );
}
