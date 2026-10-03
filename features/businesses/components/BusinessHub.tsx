"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { SubscribeButton } from "@/features/payments/components/SubscribeButton";
import { StudioVerificationStrip } from "@/features/businesses/components/StudioVerificationStrip";
import type { StudioVerificationState } from "@/repositories/studioVerification";
import { DeskAddButton, VerifiedTick } from "@/features/settings/components/settings-kit";
import { SegmentedPanels } from "@/features/shell/components/SegmentedNav";
import { photoUrl } from "@/lib/media/photo";
import { dosKey } from "@/features/classes/components/ShareSheet";
import { CityPicker } from "@/features/geo/components/CityPicker";
import { LocationPicker } from "@/features/geo/components/LocationPicker";
import { createBusinessAction, type BusinessActionState } from "@/features/businesses/server-actions/businesses";
import { centreOf } from "@/repositories/cities";
import { DosStyleMultiPicker } from "@/components/ui/DosStyleKit";
import { ToolActions, ToolBody, ToolCard, ToolChip, ToolFacts, ToolHead, ToolLive, toolBtn } from "@/components/ui/ToolCard";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, MUTED, SUB } from "@/lib/design/tokens";

import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { publicProfilePath } from "@/lib/routes/publicProfile";
import { priceWords, type PlanCatalogRow } from "@/repositories/plans";
import type { StudioSubscriptionState } from "@/repositories/subscriptions";
import type { MyMembership } from "@/repositories/businesses";
import type { LearnedFrom } from "@/repositories/classBookings";
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
const initialState: BusinessActionState = { error: null };

interface RoomDraft {
  name: string;
  /** ⚠ TEXT, not a number — see `capacityOf`. It becomes a number once, on the way out. */
  capacity: string;
}
/* the sheet opens with one room already in it (2639) — a studio is a place with
   at least one floor; the Rooms desk names the next ones "Room N" the same way */
/** ⚠ THE CAPACITY IS TEXT WHILE IT IS BEING TYPED (28 Sep 2026, the same
 *  "stagnant 0" the class form had). Holding it as a NUMBER made the field
 *  impossible to clear — `Number("") || 1` is 1, so React put the 1 straight back
 *  and the only way to type 30 over it was to leave the 1 in front. The number is
 *  derived once, where it is sent, and the floor is applied there. */
const capacityOf = (text: string) => Math.max(1, Math.min(500, Math.trunc(Number(text) || 0)));
const seedRooms = (): RoomDraft[] => [{ name: "Room 1", capacity: "20" }];

const inp: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: EL,
  border: `1.5px solid ${EL}`,
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
  /** live rooms per owned business id — the "· N rooms" half of the sub-line (2655) */
  roomCounts,
  isArtist,
  whyNoStudio,
  studioSubscriptions = {},
  studioPrice = null,
  cityCentres = [],
  studioVerification = {},
  userId = null,
  attended = [],
  teachersByStudio = {},
  show = "own",
}: {
  /** who taught you at each studio you learned at, keyed by studio id (1 Oct 2026) */
  teachersByStudio?: Record<string, LearnedFrom[]>;
  /** ⚠ WHICH COLUMN IS OPEN (29 Sep 2026) — `?show=team` / `?show=learned`, the
   *  URL as the state, like every other segmented desk in the app. */
  show?: "own" | "team" | "learned";
  memberships: MyMembership[];
  /** THE STUDIOS YOU HAVE TAKEN CLASSES AT (18 Sep 2026, the user's Home grid:
   *  a person's Studios tile lists them) — every business behind one of your
   *  bookings, once each. */
  attended?: MyMembership["business"][];
  roomCounts: Record<string, number>;
  /* ⚠ `role` went on 29 Sep 2026 with organizations: it only ever separated an
     organization's hub from a person's, and `ProfileRole` is `"user"` alone now
     — a prop nobody reads is a lie to the next reader. */
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
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [rooms, setRooms] = useState<RoomDraft[]>(seedRooms);
  /* a studio names at least one dance style at birth (19 Sep 2026) */
  const [styles, setStyles] = useState<string[]>([]);
  /* THE STUDIO'S OWN NUMBER AND ADDRESS, REQUIRED (26 Sep 2026, the user: "all
     profiles created from user or artist require a mobile number, email etc …
     not take directly what the user used for their login") */
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
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
    async (prev: BusinessActionState, formData: FormData) => {
      const result = await createBusinessAction(prev, formData);
      if (result.created) {
        setSheetOpen(false);
        setName("");
        setArea("");
        setCity("");
        setRooms(seedRooms());
        /* the styles too (2 Oct 2026) — the next studio opened from this sheet
           used to start with the last one's styles already picked */
        setStyles([]);
        setPicked(null);
        setPhone("");
        setEmail("");
        if (result.note) setToast(result.note);
        /** ⚠ PAY AT CREATION (27 Sep 2026 — the user's item 8, and their own
         *  answer when asked which of three orders they meant: *"Pay at
         *  creation, verify after"*). The sheet used to close onto this hub and
         *  leave the money as a second errand somebody had to go and find, which
         *  is what they were describing. It goes straight to the new studio's
         *  own Subscription screen instead — the price, what it buys, and the
         *  Pay button, in the same breath as creating it.
         *
         *  ⚠ A PUSH, not a replace: back returns to the hub, where the studio is
         *  now listed. Paying is offered and never forced — a studio created and
         *  not paid for is exactly what it has always been, private until it is.
         *  `20260927100000` is what lets the payment happen before the badge;
         *  `guard_business_visibility` still decides Discover.
         *
         *  ⚠⚠ AND IT WAITS FOR THE CLOSE, WHICH IS NOT A FLOURISH — it is the
         *  19 Sep race, met again and caught by `shoot-tiles` rather than by
         *  reading: closing the sheet SPENDS its history entry with a
         *  `history.back()` (`useCloseOnBack`), that back resolves as a POPSTATE
         *  (asynchronously), and any navigation issued before it lands is
         *  undone by it. The script read `/business` where it expected the
         *  Subscription screen, three checks over — and a `setTimeout(…, 0)`
         *  did NOT fix it, because one macrotask is still inside the popstate's
         *  own window.
         *
         *  ⚠ 700 ms IS THIS CODEBASE'S OWN NUMBER, not a guess: `CrewForm` has
         *  navigated forward out of a sheet on exactly that delay since 22 Sep,
         *  and matching it beats inventing a second mechanism for one screen.
         *  A PUSH rather than the crew's `replace`, and deliberately: the crew
         *  LEAVES for the thing it made, while here the hub is where you came
         *  from and where the new studio is now listed, so back should be it. */
        if (result.businessId) {
          /* `?welcome=studio` (2 Oct 2026, the user: "on creation similar welcome
             message for studio and crew profiles as we get on sign up") — the
             Subscription screen draws the bow over itself and Continue drops it */
          const to = `/business/${result.businessId}/subscription?welcome=studio`;
          setTimeout(() => router.push(to), 700);
        }
      }
      return result;
    },
    initialState
  );

  /* system back closes the sheet that is open, exactly as tapping the scrim does */
  useCloseOnBack(() => setSheetOpen(false), sheetOpen);

  /* ⚠ `isOrg` went with organizations (29 Sep 2026). It had been unreachable
     since R48 retired the login on 26 Sep, and its three branches are gone with
     it — every reader of this hub is a person. */
  const mine = memberships.filter((m) => m.memberRole === "owner").map((m) => m.business);
  const theirs = memberships.filter((m) => m.memberRole !== "owner").map((m) => m.business);
  const myStudios = mine.filter((t) => t.type === "studio");
  /* where a person has LEARNT: every studio behind one of their bookings, less
     the ones they teach at or own — a studio is listed once, under one heading */
  const learnt = attended.filter((t) => !theirs.some((x) => x.id === t.id) && !mine.some((x) => x.id === t.id));

  /* ⚠ THE SHEET OPENS A STUDIO, FOR ANYBODY (26 Sep 2026, the user: "Move Studio
     creation from org and allow user and artist to create studios now from
     studios tab at home in a section"). From 18 to 26 Sep a person opened
     nothing here; the artist page is still provisioned by Home rather than set
     up, so what a person opens is a STUDIO — the same form, the same gate, the
     same badge and mandate afterwards. */
  const isStudio = true;
  const roomsOk = rooms.length > 0 && rooms.every((r) => r.name.trim().length > 0 && r.capacity.trim().length > 0);
  const phoneOk = /^\+?[0-9][0-9 ]{7,17}$/.test(phone.trim());
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const ok = name.trim().length > 0 && phoneOk && emailOk && (!isStudio || (area.trim().length > 0 && city.length > 0 && roomsOk && styles.length > 0));
  /* THE BUTTON NAMES THE MISSING ANSWER (2 Oct 2026), the crew and class forms'
     own rule (prototype 15573-15578): a greyed "Create studio" said nothing about
     which of nine fields it was waiting on — the styles least of all, since they
     sit below the fold. The first unanswered field, in the order the sheet asks. */
  const missing = !name.trim()
    ? "Name the studio first"
    : isStudio && !area.trim()
      ? "Add the studio's area"
      : isStudio && !city
        ? "Pick a city"
        : !phoneOk
          ? "Add the studio's mobile number"
          : !emailOk
            ? "Add the studio's email"
            : isStudio && styles.length === 0
              ? "Pick at least one dance style"
              : isStudio && !roomsOk
                ? "Name every room and its capacity"
                : null;
  /* R14: the sheet opens only when the gate is open. A button that would be
     refused is not offered; the reason is printed in its place. */
  const gateShut = whyNoStudio;
  const canOpen = gateShut === null;

  /* ⚠ THE OLD ROW HELPERS (`cardStyle`, `face`, `identity`, `openLink`) WENT ON
     3 Oct 2026 — every card on this hub is the shared `ToolCard` now, whose head
     is the face at a profile's size, the name with its tick beside it (15 Sep's
     "just show the badge along the studio name"), and whose stretched link is
     still the whole card as the control (15 Sep's "clicking over studio card will
     open the manage screen"). */

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
  const studioCard = (t: MyMembership["business"]) => {
    const st = studioSubscriptions[t.id];
    const v = studioVerification[t.id];
    const live = st ? st.whyNotPublic === null : false;
    const canSubscribe = Boolean(st && !st.subscription?.hasAccess && studioPrice && t.verifiedAt);
    /* the form is the work only while there is no badge yet */
    const showForm = Boolean(v && !t.verifiedAt && userId);
    const n = roomCounts[t.id] ?? 0;
    /* ⚠ A STUDIO CARD (3 Oct 2026) — the studio is the profile, so its picture
       and its name lead at a profile's size; then the three facts that say where
       it stands (its rooms, the badge, Discover); then the work, if any; then the
       doors on a bar of their own. The whole card still opens the studio's home
       under the name the hub has always given it. */
    return (
      <ToolCard key={t.id} testId="studio-card" href={`/business/${t.id}`} hrefLabel={`${t.name} — open the studio`}>
        <ToolHead
          tint={ACCENT}
          name={t.name}
          photoPath={t.photoPath}
          icon={<StudioI size={26} color="#fff" />}
          eyebrow="Studio · yours"
          afterName={t.verifiedAt ? <VerifiedTick size={15} /> : null}
          sub={[t.area, t.city].filter(Boolean).join(", ") || null}
          right={
            live ? (
              <ToolChip testId="studio-live" word="LIVE" fg="#22C55E" bg="#22C55E1c" />
            ) : (
              <ToolChip word="NOT LIVE" fg={SUB} bg="var(--el)" />
            )
          }
        />
        <ToolBody>
          <ToolFacts
            tint={ACCENT}
            items={[
              { label: n === 1 ? "Room" : "Rooms", value: n },
              { label: "Verified", value: t.verifiedAt ? "Yes" : "Not yet", tint: t.verifiedAt ? "#22C55E" : undefined },
              { label: "Discover", value: live ? "On" : "Off", tint: live ? "#22C55E" : undefined },
            ]}
          />

        {/* ── the work, when there is any. Pressable over the stretched link. ── */}
        {showForm || canSubscribe ? (
          <ToolLive style={{ marginTop: 10 }}>
            {showForm ? <StudioVerificationStrip business={t} orgId={userId as string} state={v} onDone={fire} /> : null}
            {canSubscribe && studioPrice ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <SubscribeButton
                  planKey={studioPrice.key}
                  businessId={t.id}
                  label={`Subscribe · ${priceWords(studioPrice.priceInr, studioPrice.period)}`}
                  onDone={fire}
                  style={{ background: ACCENT }}
                />
                <span style={{ fontSize: 10.5, color: SUB, lineHeight: 1.45 }}>Verified — subscribe to put it on Discover.</span>
              </div>
            ) : null}
          </ToolLive>
        ) : null}

        {/* ── ASK FOR THE PIN (11 Sep 2026): a studio that has never opened the
              location picker sits on its CITY'S CENTROID, the same point as
              every other studio there, so Discover cannot say how far away it
              is. Never an error — one thing is simply not said yet. ── */}
        {!t.locationSetAt ? (
          <div style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: 8, marginTop: 10, padding: "8px 10px", borderRadius: 11, background: LILAC, border: `1px dashed ${EL}` }}>
            <span aria-hidden="true" style={{ flexShrink: 0, lineHeight: 0, color: "#F59E0B" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
                <circle cx="12" cy="10" r="2.4" />
              </svg>
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: SUB, lineHeight: 1.45 }}>
              Not on the map yet — {t.city ? `Discover measures from the middle of ${t.city}` : "Discover cannot say how far away it is"}.
            </span>
            <Link href={publicProfilePath(t)} aria-label={`Put ${t.name} on the map`} style={{ ...pill, flexShrink: 0, padding: "6px 11px", background: LILAC, border: `1.5px solid ${EL}`, color: INK, display: "inline-flex", alignItems: "center" }}>
              Put it on the map
            </Link>
          </div>
        ) : null}
        </ToolBody>
        <ToolActions>
          <Link href={`/business/${t.id}`} style={toolBtn("primary", ACCENT)}>
            Manage studio
          </Link>
          <Link href={`/studio/${t.id}`} style={toolBtn("secondary", ACCENT)}>
            Public page
          </Link>
        </ToolActions>
      </ToolCard>
    );
  };

  /** a studio somebody teaches or learns at — the same card without the studio's
   *  paperwork, opening its public page. `how` is what the studio is to them. */
  const otherCard = (t: MyMembership["business"], how: string, teachers: LearnedFrom[] = [], extra?: React.ReactNode) => {
    return (
      <ToolCard key={t.id} href={publicProfilePath(t)} hrefLabel={`${t.name} — open the profile`}>
        <ToolHead
          tint={ACCENT}
          name={t.name}
          photoPath={t.photoPath}
          icon={t.type === "studio" ? <StudioI size={26} color="#fff" /> : <ArtistI size={26} color="#fff" />}
          eyebrow={`${t.type === "studio" ? "Studio" : "Artist"} · ${how}`}
          afterName={t.verifiedAt ? <VerifiedTick size={15} /> : null}
          sub={[t.area, t.city].filter(Boolean).join(", ") || null}
        />
        {teachers.length > 0 || extra ? (
          <ToolBody>
            {teachers.length > 0 ? <ToolFacts tint={ACCENT} items={[{ label: teachers.length === 1 ? "Teacher" : "Teachers", value: teachers.length }, { label: "Classes", value: teachers.reduce((s, a) => s + a.classes, 0) }]} /> : null}
            {extra}
          </ToolBody>
        ) : null}
        <ToolActions>
          <Link href={publicProfilePath(t)} style={toolBtn("tinted", ACCENT)}>
            Open profile
          </Link>
        </ToolActions>
      </ToolCard>
    );
  };

  /* a studio somebody teaches at: the same card without the studio's paperwork */
  const plainCard = (t: MyMembership["business"]) => otherCard(t, "you teach here");

  /* ⚠⚠ A STUDIO YOU LEARNED AT CARRIES WHO TAUGHT YOU THERE (1 Oct 2026, the
     user: *"where you learned in studios should have studio list and collapsible
     teacher list in it to see the record of from who you learned where"*). The
     same card, and under its identity a disclosure — "Learned from N teachers"
     — that opens onto each teacher with how many of your classes they took. It
     sits ABOVE the card's stretched link (z-index 2), like the studio card's own
     work, so pressing it opens the list rather than the studio's page. */
  const learnedCard = (t: MyMembership["business"]) => {
    const teachers = teachersByStudio[t.id] ?? [];
    return otherCard(t, "you learnt here", teachers, teachers.length > 0 ? <ToolLive><LearnedFromList studio={t.name} teachers={teachers} /></ToolLive> : null);
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
        {/* ⚠ SECTIONS (3 Oct 2026, C116): the heading, the price line and the two
            column pills in the TOP squircle (`SegmentedPanels sections`), the shown
            column — Add studio included, it belongs to Yours — in the LOWER one */}
        <SegmentedPanels
          /* the key is the SERVER's answer, so a link carrying `?show=` wins over
             whatever this control last showed (the my-classes note) */
          key={show}
          initial={show}
          label="Show"
          sections
          top={
        <>
        <div
          style={{
            borderRadius: 22,
            padding: "15px 17px 14px",
            marginBottom: 0,
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
          {/* the page's own `<h1>` — the chrome no longer prints a drill page's name (28 Sep 2026) */}
          <h1
            style={{
              margin: 0,
              fontSize: 21,
              fontWeight: 800,
              letterSpacing: -0.5,
              position: "relative",
              fontFamily: DOS_DISPLAY,
              lineHeight: 1.18,
            }}
          >
            {DOS_TOOLS.studios.name}
          </h1>
        </div>
        {/* THE PRICE, ONCE, FROM THE PRICE LIST (26 Sep 2026) — the one fact the
            cards cannot say until there is one; the Organizations hub prints
            its own the same way */}
        <div style={{ fontSize: 11, color: SUB, lineHeight: 1.5, margin: "8px 2px 0" }}>
          {studioPrice ? `A studio is ${priceWords(studioPrice.priceInr, studioPrice.period).replace("/mo", " a month")} once DanceOS has verified it.` : "No studio plan is on offer right now — message DanceOS from Settings › Help & support."}
        </div>
        </>
          }
          /* ⚠⚠ TWO COLUMNS (29 Sep 2026, the user: *"same should be for studios
             with 2 colums — your own studios and the second column with where
             your learned"*). ⚠ TAUGHT AT RIDES IN THE SECOND COLUMN under its own
             head rather than becoming a third: both are "a studio that is not
             yours", and dropping it would lose an artist's teaching history (R22).
             A studio is still listed once. */
          /* ⚠⚠ AND THREE COLUMNS SINCE 3 Oct 2026 (the user: "Studio column name-
             Manage, Team and Student"). Taught-at stopped riding inside the second
             column: a studio whose TEAM you are on and a studio where you are a
             STUDENT are two relationships, and naming them is what the columns are
             for. A studio is still listed once — `learnt` already leaves out the
             studios you own and the ones you are on the team of. */
          segments={[
            { key: "own", href: "/business", label: "Manage", n: myStudios.length, aria: "The studios you own" },
            { key: "team", href: "/business?show=team", label: "Team", n: theirs.length, aria: "The studios whose team you are on" },
            { key: "learned", href: "/business?show=learned", label: "Student", n: learnt.length, aria: "The studios you have learned at" },
          ]}
          panels={[
            {
              key: "own",
              node: (
          <>
            {/* ⚠ ＋ ADD STUDIO IS THE DESK PILL, AT THE TOP (20 Sep 2026, the user:
                "fix add studio button also similarly"). It was a DASHED row at the
                FOOT of the studios list — so on an organization with several
                branches you scrolled past all of them to open another, which is
                exactly what the 20 Sep move fixed for Team, Rooms and Crews and
                then missed here. The same `DeskAddButton` those three use, so a
                desk is a desk whatever it holds.
                ⚠ THE GATE IS NOT A GREYED PILL (R14). When the database would
                refuse a studio, the button is not drawn at all and its SENTENCE
                stands in its place with the door to the person who can move it —
                a control that exists only to be refused says less than the
                refusal itself. */}
            {gateShut ? (
              <div
                role="status"
                aria-label={`Cannot add a studio: ${gateShut}`}
                style={{ borderRadius: 16, border: `1.5px dashed var(--el)`, padding: "13px 14px", background: CARD, marginBottom: 12 }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 900, color: INK }}>＋ Add studio</div>
                <div style={{ fontSize: 11, color: SUB, marginTop: 4, lineHeight: 1.5 }}>{gateShut}</div>
                {/* ⚠ THE DOOR WENT WITH THE SCREEN IT OPENED (21 Sep 2026). This
                    said "Where you stand with DanceOS ›" and pointed at `/` —
                    Home's standing card, which was DELETED on 11 Sep once the
                    tick alone became the verified state. A link to a card that
                    no longer exists lands you on an ordinary Home with nothing
                    to see. Unreachable today, because the gate returns null for
                    every organization — which is exactly why it survived: a
                    branch nobody renders is where a broken promise hides. The
                    sentence above already says what is wrong; Settings carries
                    the conversation with DanceOS. */}
              </div>
            ) : (
              <DeskAddButton label="Add studio" onClick={() => setSheetOpen(true)} />
            )}

            <Head>YOUR STUDIOS</Head>
            {myStudios.length ? (
              myStudios.map((t) => studioCard(t))
            ) : (
              <div style={{ fontSize: 11.5, color: SUB, padding: "0 2px 10px" }}>
                {gateShut
                  ? "No studios yet. One studio = one location; add another for each branch."
                  : "No studios yet — the button above opens one. DanceOS verifies it, then its own subscription puts it on Discover; you run it from the profile switcher."}
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
              ),
            },
            {
              key: "team",
              node: (
                <>
                  {/* every studio whose team you are on — a trainer's seat, or the
                      Visiting Faculty seat accepting a class gives you (R19) */}
                  {theirs.length > 0 ? (
                    <>
                      <Head>STUDIOS YOU HAVE TAUGHT AT</Head>
                      {theirs.map((t) => plainCard(t))}
                    </>
                  ) : (
                    <div style={{ fontSize: 11.5, color: SUB, padding: "4px 2px 0" }}>
                      {isArtist
                        ? "The studios whose team you are on will be listed here — accept a class at one and it appears."
                        : "The studios whose team you are on will be listed here."}
                    </div>
                  )}
                </>
              ),
            },
            {
              key: "learned",
              node: (
                <>
                  {learnt.length > 0 ? (
                    <>
                      <Head>STUDIOS YOU HAVE LEARNT AT</Head>
                      {learnt.map((t) => learnedCard(t))}
                    </>
                  ) : (
                    <div style={{ fontSize: 11.5, color: SUB, padding: "4px 2px 0" }}>The studios you learn at will be listed here once you have booked a class.</div>
                  )}
                </>
              ),
            },
          ]}
        />
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
            aria-label="New studio"
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
            <b style={{ fontSize: 17, fontFamily: DOS_DISPLAY }}>New studio</b>
            {/* ⚠ ONE CLAUSE (27 Sep 2026, "less details in creation forms for
                everything should mostly just be headings"). What is kept is the
                only thing somebody cannot discover by pressing on: that a studio
                is born PRIVATE. The branch advice and the list of what lives
                behind a page were describing the app to somebody already in it. */}
            <div style={{ fontSize: 11.5, color: SUB, margin: "3px 0 14px", lineHeight: 1.5 }}>One studio = one location. It stays private until it is verified and subscribed.</div>

            <form action={formAction}>
              {/* ⚠ THE ONE PLACE THE TEXT BECOMES A NUMBER — the payload the action parses */}
              <input type="hidden" name="rooms" value={JSON.stringify(isStudio ? rooms.map((r) => ({ name: r.name, capacity: capacityOf(r.capacity) })) : [])} />

              <div style={{ fontSize: 12, color: SUB, margin: "0 0 4px" }}>
                Studio name
              </div>
              <input
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. EEE Dance Studio — Andheri"
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
                  {/* only the CONSEQUENCE OF NOT DOING IT is worth a line — a
                      pin that has been placed is visible on the map above it */}
                  {picked ? null : <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6, lineHeight: 1.45 }}>Without a pin, Discover cannot say how far away this studio is.</div>}
                </>
              ) : null}

              <div style={{ fontSize: 12, color: SUB, margin: "14px 0 4px" }}>Area{isStudio ? "" : " (optional)"}</div>
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

              {/* ── THE STUDIO'S OWN CONTACT, REQUIRED (26 Sep 2026): shown on its
                  page as Call and Mail, and never the number or address the person
                  signed in with — both are the studio's to change from its Settings ── */}
              <div style={{ fontSize: 12, color: SUB, margin: "14px 0 4px" }}>Mobile number — the studio&apos;s</div>
              <input name="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" style={inp} />
              {phone.trim() && !phoneOk ? <div style={{ fontSize: 10.5, color: "#F87171", marginTop: 4 }}>A mobile number is 8 to 18 digits.</div> : null}
              <div style={{ fontSize: 12, color: SUB, margin: "14px 0 4px" }}>Email — the studio&apos;s</div>
              <input name="contact_email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hello@example.com" style={inp} />
              {email.trim() && !emailOk ? <div style={{ fontSize: 10.5, color: "#F87171", marginTop: 4 }}>That is not an email address.</div> : null}

              {/* ── THE DANCE STYLES (19 Sep 2026, the user: "some studios dont
                  show dance styles on profile it is mandatory to have one at
                  least"). Asked HERE, at birth, because a studio's styles used
                  to be derived from its published classes — so a studio was
                  guaranteed to show none on the day it was made. ── */}
              {isStudio && (
                <>
                  <input type="hidden" name="styles" value={JSON.stringify(styles)} />
                  <div style={{ fontSize: 12, color: SUB, margin: "14px 0 6px" }}>Dance styles — at least one</div>
                  {/* ⚠ ONE MULTI PICKER (2 Oct 2026, the user: "dance style filter
                      while creating studio and crew should be multi filter and
                      better way to handle in the form"). This was a row of chips
                      hand-made here over a SINGLE picker re-opened once per style;
                      it is `DosStyleMultiPicker` now — the chips, the ×, the first
                      as the main style and the cap all in the one control — and
                      the whole list still rides the hidden `styles` input above.
                      ⚠ The earlier note, kept: */}
                  {/* ⚠⚠ THE APP'S ONE STYLE PICKER, NOT A SECOND LIST OF STYLES
                      (27 Sep 2026, the user: "fix all list drop downs should be
                      within the app only not open a seprate screen").
                      This was a native `<select>` over all 66 style names — a
                      full-screen OS picker on a phone, and, worse, the SECOND
                      control in the app for choosing a style. Parity row W2 made
                      `DosStylePicker` the one picker on the class, crew and event
                      forms on 30 Aug and never came back for this one, so a
                      studio picked its styles one way at birth and another way
                      from its own band (`StylesRowEditor`, which opens this same
                      picker). It searches, which is what 66 rows need. */}
                  <DosStyleMultiPicker value={styles} onChange={setStyles} max={8} />
                </>
              )}

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
                        onChange={(e) => setRoom(i, { capacity: e.target.value })}
                        onBlur={() => setRoom(i, { capacity: String(capacityOf(r.capacity)) })}
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
                    onClick={() => setRooms((rs) => [...rs, { name: `Room ${rs.length + 1}`, capacity: "20" }])}
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
                {isPending ? "Creating…" : (missing ?? "Create studio")}
              </button>
            </form>
          </div>
        </div>
      )}
      {toast ? <div role="status" style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#241B33", color: "#fff", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 700, maxWidth: 360, textAlign: "center" }}>{toast}</div> : null}
    </div>
  );
}

/** WHO TAUGHT YOU AT ONE STUDIO, folded shut until asked (1 Oct 2026). A real
 *  `<button aria-expanded>` with the list it controls, so a screen reader hears
 *  the same disclosure a finger opens; each teacher is a door to their profile. */
function LearnedFromList({ studio, teachers }: { studio: string; teachers: LearnedFrom[] }) {
  const [open, setOpen] = useState(false);
  const id = `learned-${studio.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  const day = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
  return (
    <div style={{ position: "relative", zIndex: 2, marginTop: 10, borderTop: "1.5px solid var(--el)", paddingTop: 8 }} data-testid="learned-from">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${open ? "Hide" : "Show"} who taught you at ${studio}`}
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", background: "none", border: "none", padding: "2px 0", color: SUB, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
      >
        <span style={{ flex: 1 }}>
          Learned from {teachers.length} teacher{teachers.length === 1 ? "" : "s"}
        </span>
        <span aria-hidden="true" style={{ transition: "transform .15s", transform: open ? "rotate(90deg)" : "none" }}>›</span>
      </button>
      {open ? (
        <div id={id} style={{ marginTop: 6 }}>
          {teachers.map((a) => {
            const src = photoUrl(a.avatarPath);
            return (
              <Link
                key={a.userId}
                href={`/person/${a.userId}`}
                aria-label={`${a.name} — ${a.classes} class${a.classes === 1 ? "" : "es"} at ${studio}`}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 0", color: INK, textDecoration: "none" }}
              >
                <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, position: "relative", overflow: "hidden", background: "var(--el)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: SUB }}>
                  {src ? <Image src={src} alt="" fill sizes="30px" style={{ objectFit: "cover" }} /> : a.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                  <span style={{ display: "block", fontSize: 10, color: MUTED, marginTop: 1 }}>
                    {a.classes} class{a.classes === 1 ? "" : "es"} · last {day(a.last)}
                  </span>
                </span>
                <span aria-hidden="true" style={{ color: MUTED, fontSize: 13 }}>›</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
