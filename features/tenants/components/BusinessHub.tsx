"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import { SubscribeButton } from "@/features/payments/components/SubscribeButton";
import { StudioVerificationStrip } from "@/features/tenants/components/StudioVerificationStrip";
import type { StudioVerificationState } from "@/repositories/studioVerification";
import { VerifiedTick } from "@/features/settings/components/settings-kit";
import { photoUrl } from "@/lib/media/photo";
import { dosKey } from "@/features/classes/components/ShareSheet";
import { CityPicker } from "@/features/geo/components/CityPicker";
import { LocationPicker } from "@/features/geo/components/LocationPicker";
import { createTenantAction, type TenantActionState } from "@/features/tenants/server-actions/tenants";
import { centreOf } from "@/repositories/cities";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, MUTED, SUB } from "@/lib/design/tokens";

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
 *  create is public straight away. ⚠ A PERSON OPENS NOTHING HERE ANY MORE
 *  (18 Sep 2026, the user: "there is no need for a separate artist page to be
 *  created — managed from the artist profile only; you just subscribe from a
 *  user to artist to get the additional tools"). The "Set up your artist page"
 *  control is gone: the page behind an artist's tools is PROVISIONED the first
 *  time Home renders with a live plan (`ensureArtistPage`), and a person's hub is
 *  the STUDIOS tile's two lists — where they have taught, where they have learnt.
 *  This screen is headed the tile's word, in the tile's colour, for everyone.
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
  studioSubscriptions = {},
  studioPrice = null,
  cityCentres = [],
  studioVerification = {},
  userId = null,
  attended = [],
}: {
  memberships: MyMembership[];
  /** THE STUDIOS YOU HAVE TAKEN CLASSES AT (18 Sep 2026, the user's Home grid:
   *  a person's Studios tile lists them) — every business behind one of your
   *  bookings, once each. A person's list; an organization books nothing. */
  attended?: MyMembership["tenant"][];
  roomCounts: Record<string, number>;
  role: ProfileRole;
  /** the plan is live — decides which empty-state sentence a person reads (the
   *  page itself is provisioned on Home since 18 Sep 2026, not opened here) */
  isArtist: boolean;
  /** THE GATE, as the database words it: null when a studio may be created, else
   *  the one sentence still standing in the way. Asked of `why_no_studio()` so
   *  this screen cannot drift from what `create_business_with_owner` enforces. */
  whyNoStudio: string | null;
  /** 10 Sep 2026: each studio's own subscription, and the sentence between it and Discover */
  studioSubscriptions?: Record<string, StudioSubscriptionState>;
  /** what one studio costs, from the price list; null when none is on offer */
  studioPrice?: PlanCatalogRow | null;
  /** THE CITY REGISTRY (11 Sep 2026) — the cities that already have a business
   *  in them, with their centres. The New-studio sheet uses it for ONE thing:
   *  where the map opens once a city is known and no pin is placed yet. It is
   *  not offered as a list to pick from — the city comes off the address. */
  cityCentres?: Array<{ city: string; lat: number; lng: number }>;
  /** WHERE EACH STUDIO STANDS WITH DANCEOS (11 Sep 2026): its badge, its photos,
   *  whether an admin is looking. The strip under each studio is drawn from it,
   *  and Subscribe is offered only once the badge is on. */
  studioVerification?: Record<string, StudioVerificationState>;
  /** the owner's own id — a studio's proof photos go into their folder */
  userId?: string | null;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  };
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [rooms, setRooms] = useState<RoomDraft[]>(seedRooms);
  /* the pin from the sheet's map, if the owner placed one (11 Sep 2026) */
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  /* THE ADDRESS FILLS THE FORM (11 Sep 2026). Area and City are written by the
     pin — a search, "Use my location", or a drag — and rewritten each time it
     moves, UNTIL the person types in Area themselves: what somebody wrote by
     hand is theirs, and the map does not overwrite it. `citySource` is how the
     City field knows to say "from the address". */
  const [areaEdited, setAreaEdited] = useState(false);
  const [citySource, setCitySource] = useState<"address" | null>(null);
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
  /* where a person has LEARNT: every studio behind one of their bookings, less
     the ones they teach at or own — a studio is listed once, under one heading */
  const learnt = attended.filter((t) => !theirs.some((x) => x.id === t.id) && !mine.some((x) => x.id === t.id));

  /* what the sheet opens is decided by who is here, not by a toggle — and since
     18 Sep 2026 only an organization opens anything here */
  const isStudio = isOrg;
  const roomsOk = rooms.length > 0 && rooms.every((r) => r.name.trim().length > 0 && r.capacity > 0);
  const ok = name.trim().length > 0 && (!isStudio || (area.trim().length > 0 && city.length > 0 && roomsOk));
  /* R14: an organization may open the sheet only when the gate is open. A button
     that would be refused is not offered; the reason is printed in its place. */
  const gateShut = isOrg ? whyNoStudio : null;
  const canOpen = isOrg ? gateShut === null : false;

  const cardStyle = (own: boolean): React.CSSProperties => ({
    position: "relative",
    background: CARD,
    border: `1px solid ${EL}`,
    borderLeft: `4px solid ${own ? ACCENT : EL}`,
    borderRadius: 16,
    padding: "12px 13px",
    marginBottom: 9,
    color: INK,
  });

  /** THE FACE BEFORE THE NAME (15 Sep 2026, the user: "show the profile pic
   *  before the studio name"). Its own picture when it has one — the same
   *  `businesses.profile_photo_path` the disc on its home wears — and its kind's mark on
   *  the accent when it does not. */
  const face = (t: MyMembership["tenant"], own: boolean) => {
    const src = photoUrl(t.photoPath);
    return (
      <span
        aria-hidden="true"
        style={{
          width: 42,
          height: 42,
          borderRadius: 13,
          flexShrink: 0,
          overflow: "hidden",
          position: "relative",
          background: own ? `${ACCENT}1c` : EL,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {src ? (
          <Image src={src} alt="" fill sizes="42px" style={{ objectFit: "cover" }} />
        ) : t.type === "studio" ? (
          <StudioI size={19} color={own ? ACCENT : "var(--sub)"} />
        ) : (
          <ArtistI size={19} color={own ? ACCENT : "var(--sub)"} />
        )}
      </span>
    );
  };

  /** WHO IT IS — the face, the name with its badge, the line under it. Sits
   *  BELOW the stretched link (z-index 0) so a tap anywhere on it opens the
   *  studio; the work below sits above the link so its controls still work. */
  const identity = (t: MyMembership["tenant"], own: boolean, right?: React.ReactNode) => {
    const loc = [t.area, t.city].filter(Boolean).join(", ");
    const n = roomCounts[t.id] ?? 0;
    const sub = own
      ? [loc, t.type === "studio" ? `${n} room${n === 1 ? "" : "s"}` : "Your artist page"].filter(Boolean).join(" · ")
      : [t.type === "studio" ? "Studio" : "Artist", loc].filter(Boolean).join(" · ");
    return (
      <div style={{ position: "relative", zIndex: 0, display: "flex", alignItems: "center", gap: 11 }}>
        {face(t, own)}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
            {/* THE BADGE IS THE WHOLE VERIFIED STATE (15 Sep 2026, the user:
                "no need [for the VERIFIED STUDIO line], just show badge for
                verified along the studio name") */}
            {t.verifiedAt ? <VerifiedTick size={14} /> : null}
          </div>
          <div style={{ fontSize: 10, color: SUB, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
        </div>
        {right}
      </div>
    );
  };

  /* the stretched link: the whole card is the control (15 Sep 2026, the user:
     "no need of manage, clicking over studio card will open the manage screen") */
  const openLink = (href: string, label: string) => (
    <Link href={href} aria-label={label} style={{ position: "absolute", inset: 0, zIndex: 1, borderRadius: 16 }} />
  );

  /** ONE CARD PER STUDIO (15 Sep 2026). It was three stacked blocks — the row,
   *  the verification strip, the subscription strip — and the user asked for
   *  one: the badge beside the name, LIVE instead of PUBLIC + RENEWS, and the
   *  card itself as the door to the manage screen. What is left inside is only
   *  the WORK: the verification form while DanceOS has not checked it, or
   *  Subscribe once it has. A live studio's card is the identity line alone.
   *
   *  The renewal date and Stop renewing moved to the studio's own home
   *  (`StudioSubscriptionStrip`) — this hub was the only door to cancelling,
   *  and a collapsed card must not take a control away with it. */
  const studioCard = (t: MyMembership["tenant"]) => {
    const st = studioSubscriptions[t.id];
    const v = studioVerification[t.id];
    const live = st ? st.whyNotPublic === null : false;
    const canSubscribe = Boolean(st && !st.subscription?.hasAccess && studioPrice && t.verifiedAt);
    /* the form is the work only while there is no badge yet */
    const showForm = Boolean(v && !t.verifiedAt && userId);
    return (
      <div key={t.id} data-testid="studio-card" style={cardStyle(true)}>
        {openLink(`/business/${t.id}`, `${t.name} — open the studio`)}
        {identity(t, true, live ? (
          <span data-testid="studio-live" style={{ flexShrink: 0, fontSize: 9, fontWeight: 900, letterSpacing: 0.6, padding: "3px 8px", borderRadius: 999, background: "#DCFCE722", color: "#22C55E", border: "1px solid #22C55E55" }}>
            LIVE
          </span>
        ) : null)}

        {/* ── the work, when there is any. Above the stretched link, so a press
              lands on the control and not on the card. ── */}
        {showForm || canSubscribe ? (
          <div style={{ position: "relative", zIndex: 2, marginTop: 10 }}>
            {showForm ? <StudioVerificationStrip tenant={t} orgId={userId as string} state={v} onDone={fire} /> : null}
            {canSubscribe && studioPrice ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <SubscribeButton
                  planKey={studioPrice.key}
                  tenantId={t.id}
                  label={`Subscribe · ${priceWords(studioPrice.priceInr, studioPrice.period)}`}
                  onDone={fire}
                  style={{ background: ACCENT }}
                />
                <span style={{ fontSize: 10.5, color: SUB, lineHeight: 1.45 }}>Verified — subscribe to put it on Discover.</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ── ASK FOR THE PIN (11 Sep 2026): a studio that has never opened the
              location picker sits on its CITY'S CENTROID, the same point as
              every other studio there, so Discover cannot say how far away it
              is. Never an error — one thing is simply not said yet. ── */}
        {!t.locationSetAt ? (
          <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 8, marginTop: 10, padding: "8px 10px", borderRadius: 11, background: LILAC, border: `1px dashed ${EL}` }}>
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
      </div>
    );
  };

  /* a studio somebody teaches or learns at: the same card without the studio's
     paperwork, opening its public page */
  const plainCard = (t: MyMembership["tenant"]) => (
    <div key={t.id} style={cardStyle(false)}>
      {openLink(publicProfilePath(t), `${t.name} — open the profile`)}
      {identity(t, false)}
    </div>
  );

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
            background: dosToolPaint(ACCENT),
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
            {DOS_TOOLS.studios.name}
          </div>
        </div>

        {isOrg ? (
          <>
            <Head>YOUR STUDIOS</Head>
            {myStudios.length ? (
              myStudios.map((t) => studioCard(t))
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

            {/* ⚠ NO EVENTS BLOCK HERE ANY MORE (15 Sep 2026). The user, looking
                at this screen: "is there any sense of events inside studio?
                Event is at org level, there is already an event tab on the org
                home page." Right on both counts. This block was at the correct
                LEVEL — the hub is the organization's — but it duplicated Home's
                Events tile, and it sat under a page titled STUDIOS, which is
                exactly what made it read as "events inside a studio". The
                paragraph under it existed only to undo that misreading, and a
                component that needs a disclaimer explaining what it is not is
                usually a component in the wrong place. ONE door now, on Home,
                where the user went looking for it on 11 Sep. */}
          </>
        ) : null}

        {/* ── A PERSON'S TWO LISTS (18 Sep 2026, the user: "Studios in user should
            show where they have learnt from, and for artist studios where they have
            taught and learned"). TAUGHT AT is every studio whose team you are on —
            a trainer's seat, or the Visiting Faculty seat accepting a class gives
            you; LEARNT AT is every studio behind one of your bookings. A studio is
            never listed twice, and there is no "Your artist page" block: an
            artist's tools live on Home, and the page behind them is provisioned,
            not set up here. ── */}
        {theirs.length > 0 && (
          <div style={{ marginTop: isOrg ? 20 : 0 }}>
            <Head>STUDIOS YOU HAVE TAUGHT AT</Head>
            {theirs.map((t) => plainCard(t))}
          </div>
        )}
        {!isOrg && learnt.length > 0 && (
          <div style={{ marginTop: theirs.length > 0 ? 20 : 0 }}>
            <Head>STUDIOS YOU HAVE LEARNT AT</Head>
            {learnt.map((t) => plainCard(t))}
          </div>
        )}
        {!isOrg && learnt.length === 0 && theirs.length === 0 ? (
          <div style={{ fontSize: 11.5, color: SUB, padding: "0 2px" }}>
            {isArtist
              ? "The studios you teach at and learn at will be listed here — teach a class at one, or book one."
              : "The studios you learn at will be listed here once you have booked a class."}
          </div>
        ) : null}
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
              {/* ── WHERE IT IS, RIGHT AFTER THE NAME (11 Sep 2026 — the user:
                  "after filling the studio name the user gets the option to use
                  my location; location and address are picked, city is picked
                  from the Google address; when the user fills 'where it is' it
                  auto-suggests the address from the Google API"). So the address
                  comes BEFORE Area and City, and writes both: search it (Google
                  suggests as you type), press Use my location, or drag the map.
                  The pin rides in as two hidden fields and the action saves it
                  the moment the studio exists — Discover measures from it. ── */}
              {isStudio ? (
                <>
                  <input type="hidden" name="lat" value={picked ? String(picked.lat) : ""} />
                  <input type="hidden" name="lng" value={picked ? String(picked.lng) : ""} />
                  <div style={{ fontSize: 12, color: SUB, margin: "14px 0 6px" }}>Where it is</div>
                  <LocationPicker
                    value={{ lat: null, lng: null, area: area || null }}
                    centre={centreOf(cityCentres, city)}
                    onChange={(p) => {
                      setPicked({ lat: p.lat, lng: p.lng });
                      if (p.area && !areaEdited) setArea(p.area);
                      /* the map is the authority on which city a point is in */
                      if (p.city) {
                        setCity(p.city);
                        setCitySource("address");
                      }
                    }}
                  />
                  <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6, lineHeight: 1.45 }}>
                    {picked ? "This is what Discover measures from when somebody looks for studios near them." : "Without a pin the studio sits at the centre of its city and Discover cannot say how far away it is."}
                  </div>
                </>
              ) : null}

              <div style={{ fontSize: 12, color: SUB, margin: "14px 0 4px" }}>
                Area{isStudio ? " — filled from the address; edit it if it reads wrong" : " (optional)"}
              </div>
              <input
                name="area"
                value={area}
                onChange={(e) => {
                  setArea(e.target.value);
                  setAreaEdited(true);
                }}
                placeholder="e.g. Andheri West"
                style={inp}
              />
              {/* ── THE CITY COMES OFF THE ADDRESS (11 Sep 2026). This was a
                  `<select>` over DOS_CITIES, then the registry's cities as chips
                  — which the user rightly read as "a hardcoded list". Now the
                  pin above names the city and this field shows it; only a
                  studio with no pin, or a wrong answer, needs the search. ── */}
              <input type="hidden" name="city" value={city} />
              <div style={{ margin: "12px 0 0" }}>
                <CityPicker
                  value={city || null}
                  source={citySource}
                  label={isStudio ? "City" : "City (optional)"}
                  onChange={(next) => {
                    setCity(next ?? "");
                    setCitySource(null);
                  }}
                />
              </div>

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
