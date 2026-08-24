"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
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
  tenantName,
  classes,
  filledBySession = {},
}: {
  tenantId: string;
  tenantName: string;
  classes: DanceClass[];
  /** Enrolled count per session id — real numbers from Step 4. */
  filledBySession?: Record<string, number>;
}) {
  const [tab, setTab] = useState<ClassStatus>("published");
  const [ask, setAsk] = useState<{ kind: "publish" | "draft" | "published"; c: DanceClass } | null>(null);
  const [publishState, publishFormAction] = useActionState(publishClassAction, initialState);
  const [deleteState, deleteFormAction] = useActionState(deleteClassAction, initialState);

  const list = classes.filter((c) => c.status === tab);
  const countOf = (k: ClassStatus) => classes.filter((c) => c.status === k).length;
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
      <div style={{ padding: "14px 16px 0" }}>
        <div style={{ margin: "10px 0 2px", fontSize: 10, fontWeight: 900, letterSpacing: 1.2, color: SUB }}>
          {tenantName.toUpperCase()}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            margin: "0 0 12px",
          }}
        >
          <div style={{ flex: 1, fontSize: 21, fontWeight: 800, fontFamily: DOS_DISPLAY, letterSpacing: -0.5 }}>
            Classes
          </div>
          {/* the rest of the studio desk's tools arrive with Steps 12-14; rooms
              is here because a class is held in one */}
          <Link
            href={`/business/${tenantId}/rooms`}
            style={{
              flexShrink: 0,
              fontSize: 11.5,
              fontWeight: 800,
              color: INK,
              textDecoration: "none",
              border: `1px solid ${EL}`,
              borderRadius: 999,
              padding: "6px 12px",
            }}
          >
            Rooms ›
          </Link>
        </div>

        <Link
          href={`/business/${tenantId}/classes/new`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: INK,
            color: LILAC,
            borderRadius: 14,
            padding: "13px",
            fontWeight: 800,
            fontSize: 13.5,
            textDecoration: "none",
            marginBottom: 12,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create class
        </Link>

        {/* the three lifecycles, pinned (prototype 14995-15006) */}
        <div style={{ position: "sticky", top: 0, zIndex: 120, background: LILAC, margin: "0 -16px", padding: "6px 16px 8px" }}>
          <div style={{ display: "flex", gap: 2, background: EL, borderRadius: 12, padding: 3 }}>
            {TABS.map((k) => {
              const on = tab === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
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
              Create a class — save it as a draft or publish straight away.
            </div>
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          {list.map((c) => (
            <ClassTile
              key={c.id}
              danceClass={c}
              filled={c.session ? filledBySession[c.session.id] ?? 0 : 0}
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
                  <Link
                    href={`/business/${tenantId}/classes/${c.id}/roster`}
                    style={{ ...pill(false), textDecoration: "none" }}
                  >
                    Roster
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
      {ask?.kind === "published" && (
        <ConfirmSheet
          title="Delete this published class?"
          body={`${ask.c.title} comes off the listing immediately. Bookings arrive in a later step, so nobody has to be refunded yet.`}
          keepLabel="Keep it"
          goLabel="Delete class"
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
    </div>
  );
}
