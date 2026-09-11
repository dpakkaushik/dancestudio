"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { SubscribeButton } from "@/features/payments/components/SubscribeButton";
import { cancelSubscriptionAction } from "@/features/payments/server-actions/subscriptions";
import { dateWords } from "@/features/settings/components/settings-kit";
import { dosKey } from "@/features/classes/components/ShareSheet";
import { LocationPicker } from "@/features/geo/components/LocationPicker";
import { createTenantAction, type TenantActionState } from "@/features/tenants/server-actions/tenants";
import { DOS_CITIES, type DosCity } from "@/lib/constants/cities";
import { DOS_DISPLAY, DOS_TINT, DOS_UI, INK, LILAC, MUTED, SUB } from "@/lib/design/tokens";

const isDosCity = (v: string): v is DosCity => (DOS_CITIES as readonly string[]).includes(v);
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { publicProfilePath } from "@/lib/routes/publicProfile";
import { priceWords, type PlanCatalogRow } from "@/repositories/plans";
import type { StudioSubscriptionState } from "@/repositories/subscriptions";
import type { MyMembership } from "@/repositories/tenants";
import type { ProfileRole } from "@/types/profile";
import { DOS_TOOLS, SHEET_ANIMATION, dosToolPaint } from "./biz-kit";

/* Icons lifted from the prototype (DanceOSApp.jsx:3136-3142). */
const STROKE = { fill: "none", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const StudioI = ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...STROKE} aria-hidden="true">
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9.5 21v-4h5v4M9 8h2M13 8h2M9 12h2M13 12h2" />
  </svg>
);

const ArtistI = ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...STROKE} aria-hidden="true">
    <circle cx="12" cy="9.6" r="2.9" />
    <path d="M5.5 20.5c.8-3.2 3.3-4.9 6.5-4.9s5.7 1.7 6.5 4.9" />
    <path d="M7.8 6.4h8.4" />
    <path d="M9.4 6.4c0-1.9 1.1-3 2.6-3s2.6 1.1 2.6 3" />
  </svg>
);

const CARD = "var(--card)";
const EL = "var(--el)";
const ACCENT = DOS_TOOLS.studios.c;
const initialState: TenantActionState = { error: null };

interface RoomDraft {
  name: string;
  capacity: number;
}
/* the sheet opens with one room already in it (2639) — a studio is a place with
   at least one floor; the Rooms desk names the next ones "Room N" the same way */
const seedRooms = (): RoomDraft[] => [{ name: "Room 1", capacity: 20 }];

const inp: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: EL,
  border: `1px solid ${EL}`,
  borderRadius: 12,
  padding: "11px 12px",
  color: INK,
  fontSize: 14,
  fontWeight: 600,
  outline: "none",
};

/** the section head (2622): 9.5px, 900, tracked, muted */
const Head = ({ children }: { children: string }) => (
  <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: "var(--muted)", margin: "2px 0 8px" }}>
    {children}
  </div>
);

const pill: React.CSSProperties = { display: "inline-block", padding: "9px 16px", borderRadius: 999, fontWeight: 900, fontSize: 11.5, cursor: "pointer", textDecoration: "none", border: "none", fontFamily: "inherit" };

/** Studios hub — lifted from the prototype's S_bizhub/Hub (DanceOSApp.jsx:2585-2691),
 *  re-cut on 8 Sep 2026 for the two kinds of account.
 *
 *  TWO LISTS, BECAUSE THERE ARE TWO RELATIONSHIPS (2595-2603): "A crew you lead
 *  and a crew you dance in are not the same object with a flag on it... Now the
 *  ones you run come first, because that is what you came here to do, and the
 *  ones you belong to sit below under their own heading, opening the public page
 *  instead. Where a row goes decides what pressing it does; nothing else has to."
 *
 *  WHO OPENS WHAT (the user's decision). An ORGANIZATION opens studios — as many
 *  as it runs, in one city or several — but only once it is VERIFIED and
 *  SUBSCRIBED (R14, 9 Sep 2026): a studio is no longer created and left private
 *  to wait, it cannot be created at all until both are true, and the one it does
 *  create is public straight away. A PERSON with the Artist plan opens ONE
 *  artist page. A person without the plan opens nothing, and is told what
 *  unlocks what instead of being shown a button that would be refused. The
 *  Studio / Independent-trainer toggle the sheet used to carry is gone: the kind
 *  follows from who is asking, here and in the database.
 *
 *  WHERE THE VERIFICATION CARD WENT (R13, 9 Sep 2026): to Home. An organization
 *  waiting on a stranger's decision, and its way of writing to that stranger,
 *  should not be two taps inside a screen called Studios. This hub keeps only
 *  the consequence — whether it may add a studio yet, and why not. */
export function BusinessHub({
  memberships,
  /** live rooms per owned tenant id — the "· N rooms" half of the sub-line (2655) */
  roomCounts,
  role,
  isArtist,
  whyNoStudio,
  eventsHostId = null,
  studioSubscriptions = {},
  studioPrice = null,
}: {
  memberships: MyMembership[];
  roomCounts: Record<string, number>;
  role: ProfileRole;
  /** the plan is live — a person may open their artist page */
  isArtist: boolean;
  /** THE GATE, as the database words it: null when a studio may be created, else
   *  the one sentence still standing in the way. Asked of `why_no_studio()` so
   *  this screen cannot drift from what `create_tenant_with_owner` enforces. */
  whyNoStudio: string | null;
  /** R15: the organization's own events host — ONE desk, not one per studio */
  eventsHostId?: string | null;
  /** 10 Sep 2026: each studio's own subscription, and the sentence between it and Discover */
  studioSubscriptions?: Record<string, StudioSubscriptionState>;
  /** what one studio costs, from the price list; null when none is on offer */
  studioPrice?: PlanCatalogRow | null;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  };
  const stopRenewing = (subscriptionId: string, name: string) =>
    start(async () => {
      const out = await cancelSubscriptionAction({ subscriptionId });
      if (out.error) return fire(out.error);
      setStopping(null);
      fire(out.until ? `${name} stays on Discover until ${dateWords(out.until)}, then stops` : "Cancelled");
      router.refresh();
    });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [rooms, setRooms] = useState<RoomDraft[]>(seedRooms);
  /* the pin from the sheet's map, if the owner placed one (11 Sep 2026) */
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  // the action revalidates in place (no navigation), so the sheet closes itself
  // once a creation lands — prototype behavior after "Create studio"
  const [state, formAction, isPending] = useActionState(
    async (prev: TenantActionState, formData: FormData) => {
      const result = await createTenantAction(prev, formData);
      if (result.created) {
        setSheetOpen(false);
        setName("");
        setArea("");
        setCity("");
        setRooms(seedRooms());
        setPicked(null);
        if (result.note) setToast(result.note);
      }
      return result;
    },
    initialState
  );

  /* system back closes the sheet that is open, exactly as tapping the scrim does */
  useCloseOnBack(() => setSheetOpen(false), sheetOpen);

  const isOrg = role === "org";
  const mine = memberships.filter((m) => m.memberRole === "owner").map((m) => m.tenant);
  const theirs = memberships.filter((m) => m.memberRole !== "owner").map((m) => m.tenant);
  const myStudios = mine.filter((t) => t.type === "studio");
  const myArtistPage = mine.find((t) => t.type === "trainer_business") ?? null;

  /* what the sheet opens is decided by who is here, not by a toggle */
  const isStudio = isOrg;
  const roomsOk = rooms.length > 0 && rooms.every((r) => r.name.trim().length > 0 && r.capacity > 0);
  const ok = name.trim().length > 0 && (!isStudio || (area.trim().length > 0 && city.length > 0 && roomsOk));
  /* R14: an organization may open the sheet only when the gate is open. A button
     that would be refused is not offered; the reason is printed in its place. */
  const gateShut = isOrg ? whyNoStudio : null;
  const canOpen = isOrg ? gateShut === null : isArtist && !myArtistPage;

  const rowStyle = (own: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 11,
    background: CARD,
    border: `1px solid ${EL}`,
    borderLeft: `4px solid ${own ? ACCENT : EL}`,
    borderRadius: 16,
    padding: "12px 13px",
    marginBottom: 9,
    color: INK,
    textDecoration: "none",
    cursor: "pointer",
  });

  const row = (t: MyMembership["tenant"], own: boolean) => {
    const loc = [t.area, t.city].filter(Boolean).join(", ");
    const n = roomCounts[t.id] ?? 0;
    const sub = own
      ? [loc, t.type === "studio" ? `${n} room${n === 1 ? "" : "s"}` : "Your artist page"].filter(Boolean).join(" · ")
      : [t.type === "studio" ? "Studio" : "Artist", loc].filter(Boolean).join(" · ");
    return (
      <Link
        key={t.id}
        href={own ? `/business/${t.id}/classes` : publicProfilePath(t)}
        aria-label={`${t.name} — ${own ? "open the studio" : "open the profile"}`}
        style={rowStyle(own)}
      >
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            flexShrink: 0,
            background: own ? `${ACCENT}1c` : EL,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {t.type === "studio" ? (
            <StudioI size={17} color={own ? ACCENT : "var(--sub)"} />
          ) : (
            <ArtistI size={17} color={own ? ACCENT : "var(--sub)"} />
          )}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t.name}
          </div>
          <div
            style={{
              fontSize: 10,
              color: SUB,
              marginTop: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sub}
          </div>
        </div>
        {/* the word on the right is the promise the tap keeps */}
        <span style={{ fontSize: 10.5, fontWeight: 800, color: own ? ACCENT : "var(--sub)", flexShrink: 0 }}>
          {own ? "Manage ›" : "Profile ›"}
        </span>
      </Link>
    );
  };

  /* ── EACH STUDIO'S OWN SUBSCRIPTION (10 Sep 2026): under its row, where it
        stands and the one thing to do about it. Public = a live subscription
        under a verified organization; the sentence is the database's. ── */
  const studioStrip = (t: MyMembership["tenant"]) => {
    const st = studioSubscriptions[t.id];
    if (!st) return null;
    const s = st.subscription;
    const live = Boolean(s?.hasAccess);
    const isPublic = st.whyNotPublic === null;
    const until = s?.currentPeriodEnd ? dateWords(s.currentPeriodEnd) : null;
    const standing = !s || !live
      ? null
      : s.status === "past_due"
        ? { word: "PAYMENT PROBLEM", tone: "#EF4444", line: `The renewal did not go through — Cashfree is retrying; you keep Discover for three days past ${until}.` }
        : s.cancelAtPeriodEnd || s.status === "canceled"
          ? { word: "ENDING", tone: "#F59E0B", line: `Stays on until ${until}, then stops. Nothing more will be charged.` }
          : s.granted
            ? { word: "GRANTED", tone: "#22C55E", line: `DanceOS set this up until ${until}. It does not renew on its own.` }
            : { word: "RENEWS", tone: "#22C55E", line: `Renews ${s.nextChargeOn ? dateWords(s.nextChargeOn) : until ?? ""} at ${priceWords(s.priceInr, s.period)} — you are told a day before each charge.` };
    return (
      <div data-testid="studio-subscription" style={{ margin: "-4px 0 10px", padding: "9px 12px 10px", background: CARD, border: `1px solid ${EL}`, borderTop: "none", borderRadius: "0 0 14px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.5, padding: "2px 6px", borderRadius: 5, background: isPublic ? "#DCFCE7" : "#FEF3C7", color: isPublic ? "#15803D" : "#92400E" }}>
            {isPublic ? "PUBLIC" : "NOT PUBLIC"}
          </span>
          {standing ? (
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.5, padding: "2px 6px", borderRadius: 5, background: `${standing.tone}22`, color: standing.tone }}>{standing.word}</span>
          ) : null}
        </div>
        <div style={{ fontSize: 10.5, color: SUB, marginTop: 5, lineHeight: 1.5 }}>
          {standing ? standing.line : st.whyNotPublic ?? "On Discover."}
        </div>

        {/* ── ASK FOR THE PIN, WHERE IT MATTERS (11 Sep 2026) ──────────────────
            A studio that has never opened the location picker still sits on its
            CITY'S CENTROID — the same point as every other studio in that city —
            so Discover cannot honestly say how far away it is, and its cards
            print no distance at all. Nobody goes looking for a map, so the ask
            comes to them, and it comes HERE: this strip is already the line
            about being findable, and being findable at a real address is the
            rest of that same sentence. It disappears the moment the pin is
            placed, and it is never shown as an error — nothing is broken, one
            thing is simply not said yet. */}
        {t.type === "studio" && !t.locationSetAt ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, padding: "8px 10px", borderRadius: 11, background: LILAC, border: `1px dashed ${EL}` }}>
            <span aria-hidden="true" style={{ flexShrink: 0, lineHeight: 0, color: "#F59E0B" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
                <circle cx="12" cy="10" r="2.4" />
              </svg>
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: SUB, lineHeight: 1.45 }}>
              Not on the map yet — {t.city ? `Discover measures from the middle of ${t.city}` : "Discover cannot say how far away it is"}.
            </span>
            <Link href={publicProfilePath(t)} aria-label={`Put ${t.name} on the map`} style={{ ...pill, flexShrink: 0, padding: "6px 11px", background: LILAC, border: `1px solid ${EL}`, color: INK, display: "inline-flex", alignItems: "center" }}>
              Put it on the map
            </Link>
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap", alignItems: "center" }}>
          {!live && studioPrice ? (
            <SubscribeButton
              planKey={studioPrice.key}
              tenantId={t.id}
              label={`Subscribe · ${priceWords(studioPrice.priceInr, studioPrice.period)}`}
              onDone={fire}
              style={{ background: ACCENT }}
            />
          ) : null}
          {s && live && s.renews ? (
            stopping === s.id ? (
              <>
                <span style={{ fontSize: 10.5, color: SUB }}>Stop renewing? It stays on until {until}.</span>
                <button type="button" disabled={pending} onClick={() => stopRenewing(s.id, t.name)} style={{ ...pill, padding: "7px 12px", background: "#EF4444", color: "#fff" }}>
                  {pending ? "…" : "Yes, stop"}
                </button>
                <button type="button" onClick={() => setStopping(null)} style={{ ...pill, padding: "7px 12px", background: LILAC, border: `1px solid ${EL}`, color: INK }}>Keep</button>
              </>
            ) : (
              <button type="button" onClick={() => setStopping(s.id)} style={{ background: "none", border: "none", padding: 0, fontFamily: "inherit", fontSize: 10.5, fontWeight: 800, color: SUB, textDecoration: "underline", cursor: "pointer" }} aria-label={`Stop ${t.name} renewing`}>
                Stop renewing
              </button>
            )
          ) : null}
        </div>
      </div>
    );
  };

  const setRoom = (i: number, patch: Partial<RoomDraft>) =>
    setRooms((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div
      style={{
        background: LILAC,
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        paddingBottom: "var(--dos-foot, 40px)",
      }}
    >
      <div style={{ padding: "14px 16px 0" }}>
        {/* the same paint, and the same word, as the tile you pressed to get here */}
        <div
          style={{
            borderRadius: 22,
            padding: "15px 17px 14px",
            marginBottom: 12,
            position: "relative",
            overflow: "hidden",
            color: "#fff",
            background: dosToolPaint(isOrg ? ACCENT : DOS_TINT.artist),
          }}
        >
          <div
            style={{
              position: "absolute",
              right: -28,
              top: -32,
              width: 130,
              height: 130,
              borderRadius: 65,
              background: "rgba(255,255,255,.13)",
            }}
          />
          <div
            style={{
              fontSize: 21,
              fontWeight: 800,
              letterSpacing: -0.5,
              position: "relative",
              fontFamily: DOS_DISPLAY,
              lineHeight: 1.18,
            }}
          >
            {isOrg ? DOS_TOOLS.studios.name : "Your business"}
          </div>
        </div>

        {isOrg ? (
          <>
            <Head>YOUR STUDIOS</Head>
            {myStudios.length ? (
              myStudios.map((t) => (
                <div key={t.id}>
                  {row(t, true)}
                  {studioStrip(t)}
                </div>
              ))
            ) : (
              <div style={{ fontSize: 11.5, color: SUB, padding: "0 2px 10px" }}>
                {gateShut
                  ? "No studios yet. One studio = one location; add another for each branch."
                  : "No studios yet — add the first one below. One studio = one location; add another for each branch."}
              </div>
            )}
            {/* R14: the gate. Not a greyed control with no explanation — the
                database's own sentence, and the door to the person who can move
                it. The dashed button is only drawn when pressing it would work. */}
            {gateShut ? (
              <div
                role="status"
                aria-label={`Cannot add a studio: ${gateShut}`}
                style={{ borderRadius: 16, border: `1.5px dashed var(--el)`, padding: "13px 14px", background: CARD }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 900, color: INK }}>＋ Add studio</div>
                <div style={{ fontSize: 11, color: SUB, marginTop: 4, lineHeight: 1.5 }}>{gateShut}</div>
                <Link href="/" style={{ display: "inline-block", fontSize: 11, fontWeight: 800, color: ACCENT, marginTop: 7, textDecoration: "none" }}>
                  Where you stand with DanceOS ›
                </Link>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                aria-label="Add studio"
                onKeyDown={dosKey}
                onClick={() => setSheetOpen(true)}
                style={{
                  textAlign: "center",
                  padding: "13px",
                  borderRadius: 16,
                  border: `1.5px dashed ${ACCENT}`,
                  color: ACCENT,
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                ＋ Add studio
              </div>
            )}

            {/* R15 (9 Sep 2026): AN EVENT IS THE ORGANIZATION'S. It was a desk per
                studio, which read as though a battle happened in one of your
                rooms; an event has always carried its own venue, city and map
                link, so the studio on it was never the place. ONE desk, and the
                public event page names the organization as its host. */}
            <div style={{ marginTop: 20 }}>
              <Head>EVENTS</Head>
              {eventsHostId ? (
                <Link href={`/business/${eventsHostId}/events`} style={{ ...rowStyle(true), borderLeftColor: "#F59E0B" }} aria-label="Your events">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Your events</div>
                    <div style={{ fontSize: 10, color: SUB, marginTop: 1 }}>showcases · battles · tournaments — held by your organization, at any venue</div>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: "#F59E0B", flexShrink: 0 }}>Open ›</span>
                </Link>
              ) : (
                <div style={{ fontSize: 11.5, color: SUB, padding: "0 2px 4px" }}>Your events desk is opening — reload in a moment.</div>
              )}
              <div style={{ fontSize: 10.5, color: "var(--muted)", padding: "2px 2px 0", lineHeight: 1.5 }}>
                An event is your organization&apos;s, not a studio&apos;s — it carries its own venue, so it can be
                anywhere. Your organization&apos;s name is what the public sees on it.
              </div>
            </div>
          </>
        ) : (
          <>
            <Head>YOUR ARTIST PAGE</Head>
            {myArtistPage ? (
              row(myArtistPage, true)
            ) : isArtist ? (
              <>
                <div style={{ fontSize: 11.5, color: SUB, padding: "0 2px 10px" }}>One page for your classes, bookings and earnings — it goes on Discover&apos;s Artists tab.</div>
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={dosKey}
                  onClick={() => setSheetOpen(true)}
                  style={{
                    textAlign: "center",
                    padding: "13px",
                    borderRadius: 16,
                    border: `1.5px dashed ${DOS_TINT.artist}`,
                    color: DOS_TINT.artist,
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  ＋ Set up your artist page
                </div>
              </>
            ) : (
              <div style={{ background: CARD, border: `1px solid ${EL}`, borderRadius: 16, padding: "13px 14px" }}>
                <b style={{ fontSize: 13 }}>Artist tools need the Artist plan</b>
                <div style={{ fontSize: 11.5, color: SUB, marginTop: 4, lineHeight: 1.5 }}>
                  Teach, publish classes, get booked and paid — one profile, more tools. Studios are set up by <b style={{ color: INK }}>organizations</b>; if you run one, that is a separate account.
                </div>
                <Link href="/subscription" style={{ ...pill, marginTop: 10, background: "var(--text)", color: "var(--solid)" }}>
                  See the plan ›
                </Link>
              </div>
            )}
          </>
        )}

        {/* and below it, the places that are not yours to run */}
        {theirs.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <Head>STUDIOS YOU HAVE TAUGHT AT</Head>
            {theirs.map((t) => row(t, false))}
          </div>
        )}
      </div>

      {/* "New studio" bottom sheet — lifted from DanceOSApp.jsx:2659-2685 */}
      {sheetOpen && canOpen && (
        <div
          onClick={() => setSheetOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.6)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 600,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={isStudio ? "New studio" : "Your artist page"}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--solid)",
              borderRadius: "24px 24px 0 0",
              padding: "18px 16px 28px",
              width: "100%",
              maxWidth: 430,
              boxSizing: "border-box",
              maxHeight: "88vh",
              overflowY: "auto",
              color: INK,
              animation: SHEET_ANIMATION,
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: EL, margin: "0 auto 12px" }} />
            <b style={{ fontSize: 17, fontFamily: DOS_DISPLAY }}>{isStudio ? "New studio" : "Your artist page"}</b>
            <div style={{ fontSize: 11.5, color: SUB, margin: "3px 0 14px", lineHeight: 1.5 }}>
              {isStudio
                ? "One studio = one location. Opening another branch later? Create it as its own studio — it gets its own profile page and calendar. It stays private until you subscribe it; then it is on Discover."
                : "The page people find you by — your classes, your bookings and your earnings live behind it."}
            </div>

            <form action={formAction}>
              <input type="hidden" name="rooms" value={JSON.stringify(isStudio ? rooms : [])} />

              <div style={{ fontSize: 12, color: SUB, margin: "0 0 4px" }}>
                {isStudio ? "Studio name" : "Page name"}
              </div>
              <input
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isStudio ? "e.g. EEE Dance Studio — Andheri" : "e.g. Rhea Kapoor Dance Co."}
                style={inp}
              />
              <div style={{ fontSize: 12, color: SUB, margin: "12px 0 4px" }}>
                Area{isStudio ? " — the studio’s single address" : " (optional)"}
              </div>
              <input
                name="area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Andheri West"
                style={inp}
              />
              {/* city is a closed list: it is how the app groups studios, so it cannot be typed */}
              <div style={{ fontSize: 12, color: SUB, margin: "12px 0 4px" }}>
                City{isStudio ? "" : " (optional)"}
              </div>
              <select
                name="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                style={{ ...inp, WebkitAppearance: "none", appearance: "none", cursor: "pointer" }}
              >
                <option value="">Pick a city</option>
                {DOS_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* ── WHERE IT IS, ON THE MAP, AT CREATION (11 Sep 2026 — the user:
                  "wherever we are giving an address, city or location there should
                  be a location picker as well… user will check nearest studio
                  using location only"). Until now a studio was born on its city's
                  centroid and the only map was two taps away on Edit, so almost
                  nobody would ever place one. The pin rides in as two hidden
                  fields; the action saves it the moment the studio exists. Typing
                  a search fills Area and City from the map's own answer. ── */}
              {isStudio ? (
                <>
                  <input type="hidden" name="lat" value={picked ? String(picked.lat) : ""} />
                  <input type="hidden" name="lng" value={picked ? String(picked.lng) : ""} />
                  <div style={{ fontSize: 12, color: SUB, margin: "14px 0 6px" }}>Where it is — put the pin on your door</div>
                  <LocationPicker
                    value={{ lat: null, lng: null, area: area || null }}
                    city={isDosCity(city) ? city : null}
                    onChange={(p) => {
                      setPicked({ lat: p.lat, lng: p.lng });
                      if (p.area && !area.trim()) setArea(p.area);
                      if (p.city && !city) setCity(p.city);
                    }}
                  />
                  <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6, lineHeight: 1.45 }}>
                    {picked ? "This is what Discover measures from when somebody looks for studios near them." : "Optional now, and worth doing: without a pin the studio sits at the centre of its city and Discover cannot say how far away it is."}
                  </div>
                </>
              ) : null}

              {/* the rooms, right here (2675-2683): a studio is created WITH its floors */}
              {isStudio && (
                <>
                  <div style={{ fontSize: 12, color: SUB, margin: "14px 0 6px" }}>Rooms — name · capacity</div>
                  {rooms.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <input
                        value={r.name}
                        aria-label={`Room ${i + 1} name`}
                        onChange={(e) => setRoom(i, { name: e.target.value })}
                        placeholder={`Room ${i + 1}`}
                        style={{ ...inp, flex: 2, minWidth: 0 }}
                      />
                      <input
                        type="number"
                        min={1}
                        value={r.capacity}
                        aria-label={`Room ${i + 1} capacity`}
                        onChange={(e) => setRoom(i, { capacity: Math.max(1, Number(e.target.value) || 1) })}
                        style={{ ...inp, flex: 1, minWidth: 0 }}
                      />
                      {rooms.length > 1 && (
                        <span
                          role="button"
                          tabIndex={0}
                          onKeyDown={dosKey}
                          aria-label={`Remove room ${i + 1}`}
                          onClick={() => setRooms((rs) => rs.filter((_, j) => j !== i))}
                          style={{ fontSize: 14, color: SUB, cursor: "pointer", padding: "0 2px" }}
                        >
                          ✕
                        </span>
                      )}
                    </div>
                  ))}
                  <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={dosKey}
                    onClick={() => setRooms((rs) => [...rs, { name: `Room ${rs.length + 1}`, capacity: 20 }])}
                    style={{
                      textAlign: "center",
                      padding: "10px",
                      borderRadius: 12,
                      border: `1.5px dashed ${EL}`,
                      color: SUB,
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    ＋ Add room
                  </div>
                </>
              )}

              {state.error && (
                <div style={{ fontSize: 12, color: "#EF4444", fontWeight: 700, marginTop: 12 }}>{state.error}</div>
              )}
              <button
                type="submit"
                disabled={!ok || isPending}
                style={{
                  marginTop: 14,
                  width: "100%",
                  textAlign: "center",
                  padding: "13px",
                  borderRadius: 999,
                  border: "none",
                  fontFamily: "inherit",
                  background: ok ? "var(--text)" : EL,
                  color: ok ? "var(--solid)" : "var(--muted)",
                  fontWeight: 800,
                  fontSize: 13.5,
                  cursor: ok ? "pointer" : "default",
                }}
              >
                {isPending ? "Creating…" : isStudio ? "Create studio" : "Create my artist page"}
              </button>
            </form>
          </div>
        </div>
      )}
      {toast ? <div role="status" style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#241B33", color: "#fff", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 700, maxWidth: 360, textAlign: "center" }}>{toast}</div> : null}
    </div>
  );
}
