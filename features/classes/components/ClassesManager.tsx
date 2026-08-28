"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  deleteClassAction,
  publishClassAction,
  type ClassActionState,
} from "@/features/classes/server-actions/classes";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import type { ClassStatus, DanceClass } from "@/types/class";

const CARD = "var(--card)";
const EL = "var(--el)";
const TABS: ClassStatus[] = ["published", "draft", "completed"];
const TAB_WORD: Record<ClassStatus, string> = {
  published: "Published",
  draft: "Draft",
  completed: "Completed",
};
const initialState: ClassActionState = { error: null };

/* the tile that opens this page is painted in the tool's own colour, and the
   page wears the same paint (DOS_TOOLS 2935: Classes #0D9488; dosToolPaint 2944) */
const TOOL_COLOUR = "#0D9488";
const toolPaint = (c: string) => `linear-gradient(135deg,${c} 0%, ${c}cc 55%, ${c}80 100%)`;

/* bizBtn (prototype 2920) — the one primary pill every desk uses */
const bizBtn: React.CSSProperties = {
  textAlign: "center",
  padding: 13,
  borderRadius: 999,
  background: "var(--text)",
  color: "var(--solid)",
  fontWeight: 900,
  fontSize: 13.5,
  cursor: "pointer",
  marginBottom: 10,
  textDecoration: "none",
};

const pill = (danger: boolean): React.CSSProperties => ({
  fontSize: 10.5,
  fontWeight: 800,
  padding: "6px 11px",
  borderRadius: 999,
  cursor: "pointer",
  border: "none",
  background: danger ? "rgba(239,68,68,.14)" : EL,
  color: danger ? "#F87171" : INK,
});

const sheetWrap: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.6)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  zIndex: 640,
};

const schedLine = (c: DanceClass) =>
  c.session
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(c.session.startsAt))
    : "unscheduled";

/** Live is worked out from the schedule and the clock (prototype dosClassLive,
 *  14984-14987): a class is live only inside its own window. Pure arithmetic
 *  over the handed-in clock — the component never reads Date.now() itself. */
const isLiveAt = (c: DanceClass, nowMs: number) =>
  c.status === "published" &&
  c.session !== null &&
  new Date(c.session.startsAt).getTime() <= nowMs &&
  nowMs <= new Date(c.session.endsAt).getTime();

/** LiveBanner (prototype 3949-3969) — the same "happening now" filter Events has. */
function LiveBanner({ n, on, setOn }: { n: number; on: boolean; setOn: (fn: (v: boolean) => boolean) => void }) {
  if (!n) return null;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={on}
      onClick={() => setOn((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOn((v) => !v);
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: on ? "rgba(34,197,94,.16)" : CARD,
        border: `1.5px solid ${on ? "#22C55E" : EL}`,
        borderRadius: 16,
        padding: "12px 13px",
        marginBottom: 10,
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span style={{ position: "relative", width: 12, height: 12, flexShrink: 0 }}>
        <span style={{ position: "absolute", inset: 0, borderRadius: 6, background: "#22C55E" }} />
        <span
          style={{
            position: "absolute",
            inset: -4,
            borderRadius: 10,
            border: "2px solid #22C55E",
            opacity: 0.45,
            animation: "dosPulseH 1.4s ease-out infinite",
          }}
        />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: "#22C55E", fontFamily: DOS_UI }}>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{n}</span> {n === 1 ? "class" : "classes"} live right now
        </div>
        <div style={{ fontSize: 10.5, color: SUB, marginTop: 1 }}>
          {on ? "Showing live only — tap to show all" : "Tap to filter to live classes"}
        </div>
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 900,
          padding: "5px 10px",
          borderRadius: 999,
          flexShrink: 0,
          background: on ? "#22C55E" : EL,
          color: on ? "#fff" : SUB,
        }}
      >
        {on ? "ON" : "OFF"}
      </span>
    </div>
  );
}

/** Confirm sheet — lifted from the prototype's ask/delete sheets (DanceOSApp.jsx:15065-15105). */
function ConfirmSheet({
  title,
  body,
  keepLabel,
  goLabel,
  goDanger,
  onClose,
  form,
}: {
  title: string;
  body: string;
  keepLabel: string;
  goLabel: string;
  goDanger: boolean;
  onClose: () => void;
  form: (goButton: ReactNode) => ReactNode;
}) {
  const goButton = (
    <button
      type="submit"
      style={{
        flex: 1.3,
        textAlign: "center",
        padding: "13px",
        borderRadius: 999,
        border: "none",
        background: goDanger ? "#EF4444" : INK,
        color: goDanger ? "#fff" : LILAC,
        fontWeight: 900,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {goLabel}
    </button>
  );
  return (
    <div onClick={onClose} style={sheetWrap}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: LILAC,
          color: INK,
          borderRadius: "24px 24px 0 0",
          padding: "18px 16px 28px",
          width: "100%",
          maxWidth: 430,
          boxSizing: "border-box",
          textAlign: "center",
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: EL, margin: "0 auto 12px" }} />
        <b style={{ fontSize: 16.5, fontFamily: DOS_DISPLAY }}>{title}</b>
        <div style={{ fontSize: 12, color: SUB, margin: "5px 0 14px", lineHeight: 1.55 }}>{body}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "13px",
              borderRadius: 999,
              background: CARD,
              border: `1px solid ${EL}`,
              color: INK,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {keepLabel}
          </button>
          {form(goButton)}
        </div>
      </div>
    </div>
  );
}

/** Classes register — lifted from the prototype's S_classesmod (DanceOSApp.jsx:14970-15106). */
export function ClassesManager({
  tenantId,
  classes,
  filledBySession = {},
  isOwner = false,
  nowIso,
}: {
  tenantId: string;
  classes: DanceClass[];
  /** Enrolled count per session id — real numbers from Step 4. */
  filledBySession?: Record<string, number>;
  /** Owner-only tools (the earnings desk) are only offered to the owner. */
  isOwner?: boolean;
  /** The server's clock at render — the LIVE filter is arithmetic over it. */
  nowIso: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<ClassStatus>("published");
  const [liveOnly, setLiveOnly] = useState(false);
  const [ask, setAsk] = useState<{ kind: "publish" | "draft" | "published"; c: DanceClass } | null>(null);
  const [publishState, publishFormAction] = useActionState(publishClassAction, initialState);
  const [deleteState, deleteFormAction] = useActionState(deleteClassAction, initialState);

  /* "Delete & manage refunds" (15102-15104): the delete runs, and once it has
     landed the page moves on to where the money is settled. The action state
     is a fresh object after every round-trip, which is what this watches. */
  const goAfterDelete = useRef<string | null>(null);
  const lastDelete = useRef(deleteState);
  useEffect(() => {
    if (deleteState === lastDelete.current) return;
    lastDelete.current = deleteState;
    const to = goAfterDelete.current;
    goAfterDelete.current = null;
    if (to && !deleteState.error) router.push(to);
  }, [deleteState, router]);

  const nowMs = new Date(nowIso).getTime();
  const liveN = classes.filter((c) => isLiveAt(c, nowMs)).length;
  let list = classes.filter((c) => c.status === tab);
  if (liveOnly) list = list.filter((c) => isLiveAt(c, nowMs));
  const countOf = (k: ClassStatus) => classes.filter((c) => c.status === k).length;
  const filledOf = (c: DanceClass) => (c.session ? filledBySession[c.session.id] ?? 0 : 0);
  const actionError = publishState.error || deleteState.error;

  const hiddenRefs = (c: DanceClass) => (
    <>
      <input type="hidden" name="classId" value={c.id} />
      <input type="hidden" name="tenantId" value={tenantId} />
    </>
  );

  return (
    <div
      style={{
        background: LILAC,
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        minHeight: "100vh",
        paddingBottom: 40,
      }}
    >
      {/* the tool's hero (BizShell 2964-2976): the tile's paint, the tile's name,
          and nothing else — "a tool's page says what the tile said" (2960-2962) */}
      <div
        style={{
          margin: "12px 16px 0",
          borderRadius: 22,
          padding: "15px 17px 14px",
          color: "#fff",
          position: "relative",
          overflow: "hidden",
          background: toolPaint(TOOL_COLOUR),
        }}
      >
        <div style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, position: "relative", fontFamily: DOS_DISPLAY, lineHeight: 1.18 }}>
          Classes
        </div>
      </div>

      <div style={{ padding: "12px 16px 0" }}>
        {/* the studio desk's tools, as they arrive — a chip rail, so a fifth
            door does not squeeze the title. The prototype's studio deck opens
            "Classes · Calendar ›" side by side (7140-7148). Earnings is
            owner-only (payout approval cannot be granted, prototype 18434), so
            a trainer is not offered a door that would only shut on them. */}
        <div style={{ display: "flex", gap: 8, margin: "0 0 12px", overflowX: "auto", scrollbarWidth: "none" }}>
          {(
            [
              ["calendar", "Calendar"],
              ["events", "Events"],
              ["students", "Students"],
              ["rooms", "Rooms"],
              ["staff", "Staff"],
              ...(isOwner ? ([["earnings", "Earnings"]] as Array<[string, string]>) : []),
            ] as Array<[string, string]>
          ).map(([slug, word]) => (
            <Link
              key={slug}
              href={`/business/${tenantId}/${slug}`}
              style={{
                flexShrink: 0,
                fontSize: 11.5,
                fontWeight: 800,
                color: INK,
                textDecoration: "none",
                border: `1px solid ${EL}`,
                borderRadius: 999,
                padding: "6px 12px",
                whiteSpace: "nowrap",
              }}
            >
              {word} ›
            </Link>
          ))}
        </div>

        {/* Create class is the bizBtn pill (14989-14990) */}
        <Link
          href={`/business/${tenantId}/classes/new`}
          style={{ ...bizBtn, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create class
        </Link>

        <LiveBanner n={liveN} on={liveOnly} setOn={setLiveOnly} />

        {/* the three lifecycles, pinned under the top bar (prototype 14995-15006) */}
        <div style={{ position: "sticky", top: "var(--dos-top)", zIndex: 120, background: LILAC, margin: "0 -16px", padding: "6px 16px 8px" }}>
          <div style={{ display: "flex", gap: 2, background: EL, borderRadius: 12, padding: 3 }}>
            {TABS.map((k) => {
              const on = tab === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${TAB_WORD[k]}, ${countOf(k)} classes`}
                  onClick={() => setTab(k)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: "center",
                    padding: "8px 4px",
                    borderRadius: 9,
                    cursor: "pointer",
                    fontSize: 11.5,
                    fontWeight: 800,
                    border: "none",
                    transition: "all .15s",
                    background: on ? LILAC : "transparent",
                    color: on ? INK : SUB,
                    boxShadow: on ? "0 1px 4px rgba(0,0,0,.3)" : "none",
                  }}
                >
                  {TAB_WORD[k]} · {countOf(k)}
                </button>
              );
            })}
          </div>
        </div>

        {actionError && (
          <div style={{ fontSize: 12, color: "#EF4444", fontWeight: 700, margin: "8px 0" }}>{actionError}</div>
        )}

        {list.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "22px 16px",
              border: `1.5px dashed ${EL}`,
              borderRadius: 16,
              marginTop: 8,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800 }}>Nothing here yet</div>
            <div style={{ fontSize: 11, color: SUB, marginTop: 4 }}>
              {liveOnly
                ? "Nothing is running right now — tap the live filter to show all."
                : "Create a class — save it as a draft or publish straight away."}
            </div>
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          {list.map((c) => (
            <ClassTile
              key={c.id}
              danceClass={c}
              filled={filledOf(c)}
              href={`/c/${c.shareSlug}`}
              actions={
                c.status === "draft" ? (
                  <>
                    <Link href={`/business/${tenantId}/classes/${c.id}/edit`} style={{ ...pill(false), textDecoration: "none" }}>
                      Edit
                    </Link>
                    <button type="button" onClick={() => setAsk({ kind: "publish", c })} style={pill(false)}>
                      Publish
                    </button>
                    <button type="button" onClick={() => setAsk({ kind: "draft", c })} style={pill(true)}>
                      Delete
                    </button>
                  </>
                ) : c.status === "published" ? (
                  <>
                    {/* the Roster pill stays: it is the app's register page (a documented departure) */}
                    <Link
                      href={`/business/${tenantId}/classes/${c.id}/roster`}
                      style={{ ...pill(false), textDecoration: "none" }}
                    >
                      Roster
                    </Link>
                    <button type="button" onClick={() => setAsk({ kind: "published", c })} style={pill(true)}>
                      Delete
                    </button>
                  </>
                ) : (
                  /* a completed class has one move left (15048-15049): its refunds,
                     which live on the class page's own Refunds segment */
                  <Link href={`/c/${c.shareSlug}`} style={{ ...pill(false), textDecoration: "none" }}>
                    Refunds
                  </Link>
                )
              }
            />
          ))}
        </div>
      </div>

      {ask?.kind === "publish" && (
        <ConfirmSheet
          title="Publish this class?"
          body={`${ask.c.title} · ${schedLine(ask.c)}. It goes on your calendar and anyone can book one of the ${ask.c.capacity} places.`}
          keepLabel="Not yet"
          goLabel="Publish it"
          goDanger={false}
          onClose={() => setAsk(null)}
          form={(go) => (
            <form action={publishFormAction} onSubmit={() => setAsk(null)} style={{ flex: 1.3, display: "flex" }}>
              {hiddenRefs(ask.c)}
              {go}
            </form>
          )}
        />
      )}
      {ask?.kind === "draft" && (
        <ConfirmSheet
          title="Delete this draft?"
          body={`${ask.c.title} has never been published, so nobody has booked it — deleting it takes it off your list for good.`}
          keepLabel="Keep it"
          goLabel="Delete draft"
          goDanger
          onClose={() => setAsk(null)}
          form={(go) => (
            <form action={deleteFormAction} onSubmit={() => setAsk(null)} style={{ flex: 1.3, display: "flex" }}>
              {hiddenRefs(ask.c)}
              {go}
            </form>
          )}
        />
      )}
      {ask?.kind === "published" &&
        (() => {
          const n = filledOf(ask.c);
          /* deleting a published class takes money back off people (15098-15104);
             with nobody booked it is a plain delete */
          return (
            <ConfirmSheet
              title="Delete this published class?"
              body={
                n > 0
                  ? `${ask.c.title} · ${n} enrolled ${n === 1 ? "student" : "students"} must be refunded — you'll settle each refund on the next screen.`
                  : `${ask.c.title} comes off the listing immediately. Nobody has booked it, so there is nothing to refund.`
              }
              keepLabel="Keep it"
              goLabel={n > 0 ? "Delete & manage refunds" : "Delete class"}
              goDanger
              onClose={() => setAsk(null)}
              form={(go) => (
                <form
                  action={deleteFormAction}
                  onSubmit={() => {
                    /* a soft-deleted class no longer resolves at its own link, so the
                       refunds are settled from the money desk */
                    if (n > 0) goAfterDelete.current = `/business/${tenantId}/earnings`;
                    setAsk(null);
                  }}
                  style={{ flex: 1.3, display: "flex" }}
                >
                  {hiddenRefs(ask.c)}
                  {go}
                </form>
              )}
            />
          );
        })()}
    </div>
  );
}
