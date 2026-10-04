"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { AmenityChip } from "@/components/ui/AmenityIcon";
import {
  addWalkInAction,
  bookAtTheDoorAction,
  checkInAction,
  removeWalkInAction,
  setDoorPaidAction,
  undoCheckInAction,
} from "@/features/attendance/server-actions/attendance";
import { respondToClassAskAction } from "@/features/classPeople/server-actions/classPeople";
import { setClassPosterAction } from "@/features/classes/server-actions/classes";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import { ClassEarnings } from "@/features/payments/components/ClassEarnings";
import { InvoiceSheet, bookingCodeOf } from "@/features/payments/components/InvoiceSheet";
import { PayFlow } from "@/features/payments/components/PayFlow";
import { RefundQueue } from "@/features/payments/components/RefundQueue";
import { RefundSheet } from "@/features/payments/components/RefundSheet";
import { dosStyleColor, DOS_LEVEL_LABEL } from "@/lib/constants/styles";
import { DOS_DISPLAY, DOS_UI, GOLD, GREEN } from "@/lib/design/tokens";
import { dateParts, durText, timeRangeOf } from "@/lib/format/session";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { photoUrl } from "@/lib/media/photo";
import type { ClassRegister } from "@/repositories/attendance";
import { ClassRoutines } from "@/features/routines/components/ClassRoutines";
import type { Routine } from "@/repositories/routines";
import { bookWithMembershipAction } from "@/features/memberships/server-actions/memberships";
import type { PassForSession } from "@/repositories/memberships";
import type { ClassPerson } from "@/types/classPerson";
import type { PublicClassListing } from "@/types/class";
import type { ClassBookingStatus } from "@/types/classBooking";
import type { ClassMoney, PaidReceipt } from "@/types/payment";
import type { RefundRequest } from "@/types/refund";
import { AddAssistant, AssistantControls } from "./ClassTeamControls";
import { ScanSheet, type ScanOutcome } from "@/features/people/components/ScanSheet";
import { ClassShare } from "./ClassShare";
import { ClassDeleteChip } from "./ClassDeleteChip";
import { DancerIcon, Half, SeatBar, WhenTile } from "./ClassTile";
import { PosterSheet } from "./PosterSheet";
import { DOS_POSTERS, DOS_SLEEVE, DosPosterSleeve, PosterBlock, dosPosterAuto, useDosFold } from "./poster";
import { dosKey } from "./ShareSheet";

/** The class detail page, lifted from prototype S_class (DanceOSApp.jsx:11626-12807).
 *  Step-8 brought the poster sleeve, the card opened into a page, AT THE STUDIO, and
 *  the booking bar; Step 9 adds the money: the two-step pay sheets (12456-12573), the
 *  POLICY section (12399-12402), and the booked card's Invoice | Cancel segments
 *  (BookingActions 6429-6448) backed by real orders/payments/refunds. Still to come:
 *  attendance/waitlist tools + the pass sheet behind the poster (10), rooms/artists/
 *  team/posters/routine (11), owner earnings/refunds tabs (13) — see the backlog. */

/* the studio's metal ring — prototype DOS_RINGS.studio (line 1462) */
const STUDIO_RING = ["#F9E27D", "#B8860B"];

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/* one k/v line inside a section — prototype Row */
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", fontSize: 12.5 }}>
      <span style={{ color: "var(--sub)" }}>{k}</span>
      <b style={{ textAlign: "right", minWidth: 0 }}>{v}</b>
    </div>
  );
}

/* prototype dosStyleInk (1697-1708): walk the style's colour toward the theme's ink
   until it clears 4.2:1 on the page background, so the headline is always readable */
const dosStyleInk = (hex: string, dark: boolean): string => {
  const bg = dark ? [10, 10, 10] : [255, 255, 255];
  const tgt = dark ? [255, 255, 255] : [0, 0, 0];
  const s = String(hex || "").replace("#", "");
  if (s.length < 6) return hex;
  let c = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  if (c.some(isNaN)) return hex;
  const lum = (x: number[]) => {
    const f = (v: number) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(x[0]) + 0.7152 * f(x[1]) + 0.0722 * f(x[2]);
  };
  const cr = (a: number[], b: number[]) => {
    const L1 = lum(a);
    const L2 = lum(b);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  };
  for (let i = 0; i < 26 && cr(c, bg) < 4.2; i++) c = c.map((v, k) => Math.round(v + (tgt[k] - v) * 0.12));
  return "#" + c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
};

/* theme read off <html> the sanctioned way (same store AppChrome reads) */
const subscribeToHtmlClass = (onChange: () => void): (() => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
};
const readIsDark = () => document.documentElement.className !== "light";
const readServerIsDark = () => true;

/* the page's own address, read the sanctioned way (same pattern as ShareSheet).
   ⚠ The ORIGIN, not the host: the share block copies this string, and a
   scheme-less address pasted into a chat is text rather than a link. Read
   through the store rather than off `window` during render — this repo's lint
   forbids the second, and the server snapshot is the empty string. */
const subscribeNever = () => () => {};
const readOrigin = () => window.location.origin;
const readServerOrigin = () => "";

/* one section shape for the whole page — prototype DSecTint (11545-11551),
   ⚠ ON THE CLASS CARD'S ANATOMY SINCE 4 Oct 2026 (the user: "revamp class detail
   page also in new theme like class cards"): a 20px card with its head as a
   band over the style's own wash — the icon in a tinted squircle, the heading
   in the display face — and the body under a hairline, the way every tool
   card's bands stack. The heading's WORDS are unchanged (a locator reads them). */
function Sec({ icon, label, col, children }: { icon: ReactNode; label: string; col: string; children: ReactNode }) {
  return (
    <div
      data-sec={label}
      style={{
        background: "var(--card)",
        border: "1.5px solid var(--el)",
        borderRadius: 20,
        overflow: "hidden",
        marginBottom: 12,
        textAlign: "left",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: `linear-gradient(135deg, ${col}1f, ${col}08)`, borderBottom: `1.5px solid ${col}26` }}>
        <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, background: `${col}24`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {icon}
        </span>
        <span style={{ fontFamily: DOS_DISPLAY, fontSize: 12.5, fontWeight: 900, letterSpacing: 0.5, color: "var(--text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      </div>
      <div style={{ padding: "12px 14px 13px" }}>{children}</div>
    </div>
  );
}


export interface ClassDetailProps {
  danceClass: PublicClassListing;
  /** Enrolled seats on the (first) session. */
  filled: number;
  /** Session window contains now — computed server-side, page renders per request. */
  liveNow: boolean;
  isSignedIn: boolean;
  /** Viewer belongs to the class's business — sees the asks and the share. */
  isMember: boolean;
  /** Viewer is owner/trainer — sees the draft footer's Edit class. */
  canManage: boolean;
  mine: { id: string; status: ClassBookingStatus } | null;
  /** The captured payment behind the viewer's booking — feeds the invoice. */
  receipt: PaidReceipt | null;
  /** Where the clock stands on the session — the strip only SAYS which moment
   *  you are in (prototype 12050-12063); the check-in window is enforced server-side. */
  sessionPhase: "upcoming" | "live" | "ended";
  /** The live register — fetched only for viewers who may run it. */
  register: ClassRegister | null;
  /** Who is on this class. The public sees confirmed classPeople only (RLS). */
  classPeople: ClassPerson[];
  /** An ask waiting for the signed-in viewer's own answer. */
  myClassPerson: ClassPerson | null;
  /** THE STANDING GRANTS ON THE VIEWER'S SEAT (28 Sep 2026, the user: "when
   *  giving attendance and refunds right to assistants it doesnt show up when
   *  viewing the class as an assistant after confirmation").
   *
   *  ⚠ There are TWO grant paths and this page only ever read one. A power can
   *  be given PER CLASS on the class's own team controls (it rides `myClassPerson`),
   *  or STANDING for the whole business on the Team desk (R38, 20 Sep 2026 —
   *  `business_members.can_attendance` / `can_refunds`). `can_run_register_for_class`
   *  and `can_settle_refunds_for_class` have honoured both since that day; this
   *  page asked the classPerson alone, so the standing grant worked everywhere except
   *  on the screen that is supposed to offer it. */
  standingAttendance?: boolean;
  standingRefunds?: boolean;
  /** Refund requests against this class — fetched only for a viewer who may
   *  settle them (owner, or a confirmed classPerson holding the refunds job). */
  refunds?: RefundRequest[];
  /** Whether this viewer may answer those requests. */
  canSettleRefunds?: boolean;
  /** What this class took and what is going back out — fetched for the owner
   *  alone, who is the only person the prototype shows it to (SEGS 11757). */
  classMoney?: ClassMoney | null;
  /** What the room has in it — read off the room the class runs in. */
  roomAmenities: string[];
  /** on a priced class, the learners whose seat is paid — the register row's
   *  meta line (12126); empty for a free class and for anyone not running it */
  paidUserIds?: string[];
  /** the business's OWNER — the jobs an assistant holds are theirs to hand out
   *  (18 Sep 2026), and since 30 Sep 2026 the one member who is NOT offered a
   *  seat on this class, because it is theirs (`runsThisClass`). */
  isOwner?: boolean;
  /** the owner, or the class's confirmed teacher: the two who may add an assistant (18 Sep 2026) */
  canAddAssistant?: boolean;
  /** an artist's class: the ARTIST'S profile, which the place row opens when the
   *  class is at their own place (19 Sep 2026 — never the /artist redirect) */
  ownerHref?: string | null;
  /** THE ROUTINES ON THIS CLASS (19 Sep 2026): what it is taught from — a song
   *  and a video each. Everybody who can read the class reads them; the picker
   *  below offers the viewer's OWN routines, and only its artist or the
   *  business's owner may change what is on it. */
  routines?: Routine[];
  myRoutines?: Routine[];
  canSetRoutines?: boolean;
  /** ⚠ false for an ORGANIZATION account (19 Sep 2026, the user: "studio and
   *  organizations … should not be able to book any class or event"). The
   *  database has refused it since 8 Sep (`guard_person_only`); this is the
   *  screen finally saying so instead of offering a press that gets refused. */
  viewerCanBook?: boolean;
  /** ⚠ the reason, in the acting profile's own words (27 Sep 2026) — the
   *  constant it replaced said "an organization", and an organization is not an
   *  account any more */
  cannotBookWhy?: string | null;
  /** THE PASSES THIS VIEWER CAN SPEND HERE (19 Sep 2026): their own live
   *  memberships that this class admits, with a unit still on them. The database
   *  decides the list (`passes_for_session` reads the class's two switches), so a
   *  pass this class refuses is never offered and never spendable. */
  passes?: PassForSession[];
}

export function ClassDetail({
  danceClass: c,
  filled,
  liveNow,
  isSignedIn,
  isMember,
  canManage,
  mine,
  receipt,
  sessionPhase,
  register,
  classPeople,
  myClassPerson,
  standingAttendance = false,
  standingRefunds = false,
  roomAmenities,
  refunds = [],
  canSettleRefunds = false,
  classMoney = null,
  paidUserIds = [],
  isOwner = false,
  canAddAssistant = false,
  ownerHref = null,
  routines = [],
  myRoutines = [],
  canSetRoutines = false,
  viewerCanBook = true,
  cannotBookWhy = null,
  passes = [],
}: ClassDetailProps) {
  const col = dosStyleColor(c.style);
  const dark = useSyncExternalStore(subscribeToHtmlClass, readIsDark, readServerIsDark);
  const ink = dosStyleInk(col, dark);
  const heroGone = useDosFold(DOS_SLEEVE);
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };
  /* ⚠ NOT `posterOpen`, which is the owner's poster PICKER further down — this
     is the poster being LOOKED at, which is what pressing it does since
     29 Sep 2026 */
  const [posterViewOpen, setPosterViewOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  /* which membership pass is being spent right now — the row says so and every
     row is disabled, because a seat is taken once */
  const [passPending, setPassPending] = useState<string | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  /* Details / Attendance — the strip belongs to the card (prototype 11961-11970) */
  const [ownerSeg, setOwnerSeg] = useState<"details" | "att" | "money" | "ref">("details");
  /* one register op at a time — the row that is busy shows it */
  const [opPending, setOpPending] = useState<string | null>(null);
  /* the register's own scanner (28 Sep 2026) — see `scanCheckIn` */
  const [scanOpen, setScanOpen] = useState(false);
  /** ⚠⚠ WHO THIS SHEET HAS ALREADY CHECKED IN, found by DRIVING it (28 Sep 2026).
   *  `register` is a PROP: it only changes when `router.refresh()` lands, and a
   *  door scanning the same code twice in a second beats that round trip. So the
   *  second scan read `checkedIn: false`, called the RPC again — harmless, the
   *  RPC has been idempotent since Step 10 — and said "✓ checked in" a second
   *  time, which tells the person at the door that something happened when
   *  nothing did. The behaviour was right and the SENTENCE was a race. This set
   *  answers from what this sheet itself has done, so the words are true whether
   *  or not the server has caught up. */
  const scannedIn = useRef<Set<string>>(new Set());
  const origin = useSyncExternalStore(subscribeNever, readOrigin, readServerOrigin);

  /* ⚠ the two form states that drove "Join the waitlist" / "Leave the waitlist"
     went with the waitlist (4 Oct 2026) — booking here is the pay sheet's, and a
     seat's cancel is the refund sheet's, each with its own error line */

  /* SPEND A PASS ON THIS SEAT — one RPC books the seat and takes the units under
     the class's own lock, so two presses cannot spend the same unit twice. */
  const spendPass = async (p: PassForSession) => {
    if (!c.session) return;
    setPassPending(p.passId);
    const out = await bookWithMembershipAction({ passId: p.passId, sessionId: c.session.id });
    setPassPending(null);
    if (out.error) return fire(out.error);
    fire("🎟 Booked with your membership");
    router.refresh();
  };

  /* the design the studio chose, or the one the class draws from its own name */
  const posterK = c.poster && c.poster !== "none" ? c.poster : dosPosterAuto(c.title);

  /* the people. A name reaches a stranger only once its classPerson is confirmed —
     RLS already filters that for the public, and a member sees the asks too, so
     the page only prints unconfirmed rows to people who can act on them. */
  const artist = classPeople.find((cl) => cl.kind === "artist" && cl.status === "confirmed") ?? null;
  const assistants = classPeople.filter((cl) => cl.kind === "assistant" && cl.status === "confirmed");
  /** ⚠⚠ THE ASKS ARE SPLIT BY KIND, AND NOT SPLITTING THEM WAS THE BUG (28 Sep
   *  2026, the user: "right now when adding one it puts it on the assistant list
   *  which it shouldnt do").
   *
   *  `pendingAsks` was every asked classPerson of ANY kind, and the one section that
   *  rendered it is headed CLASS ASSISTANTS — so the moment a studio named
   *  somebody as the person TAKING the class, that person appeared in the
   *  assistants list, reading "⏳ Asked" with nothing to say they had been asked
   *  to teach it. The artist column above prints a CONFIRMED classPerson only, so
   *  until they answered there was nowhere else on the page they could be. The
   *  form was always right (`reconcileClassPeople` asks `kind: "artist"`) and
   *  the database was always right; only this page filed them under the wrong
   *  heading. */
  const askedArtist = isMember ? classPeople.find((cl) => cl.kind === "artist" && cl.status === "asked") ?? null : null;
  const pendingAssistants = isMember ? classPeople.filter((cl) => cl.kind === "assistant" && cl.status === "asked") : [];
  /** who is down to take it — confirmed if they have answered, the ask if not */
  const whoTakes = artist ?? askedArtist;
  const posterItem = { title: c.title, style: c.style, styleColor: col, posterUrl: photoUrl(c.posterPath) };
  /* the team's own reading of the page (11822): a confirmed assistant who does not
     RUN the class sees what is theirs to do, and the register / refunds tabs say so */
  /* ⚠ EITHER GRANT PATH COUNTS (28 Sep 2026). `assisting` is still what decides
     whether this viewer reads the page as a helper rather than as its manager;
     what it may NOT decide is where the power came from. A power is theirs if
     the class gave it to them (`myClassPerson`) OR if the Team desk did
     (`standing…`) — which is exactly the OR the two database functions have
     been applying all along, so the tab now appears wherever the register would
     actually open. Both are re-checked server-side; this only draws the tab. */
  const assisting = !canManage && myClassPerson?.status === "confirmed" && myClassPerson.kind === "assistant";
  const canAtt = assisting && (Boolean(myClassPerson?.canAttendance) || standingAttendance);
  const canRef = assisting && (Boolean(myClassPerson?.canRefunds) || standingRefunds);
  const paidSet = new Set(paidUserIds);
  const [posterOpen, setPosterOpen] = useState(false);
  /* the walk-in name field on the register (29 Sep 2026, shape 2) */
  const [walkName, setWalkName] = useState("");
  const [walkBusy, setWalkBusy] = useState(false);
  const [posterBusy, setPosterBusy] = useState(false);
  useCloseOnBack(() => setPosterOpen(false), posterOpen);
  const initialsOf = (name: string) => name.split(" ").filter(Boolean).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const setPoster = async (poster: "bold" | "split" | "quiet" | "none", said: string) => {
    if (posterBusy) return;
    setPosterBusy(true);
    const out = await setClassPosterAction({ classId: c.id, businessId: c.businessId, poster });
    setPosterBusy(false);
    fire(out.error ?? said);
    if (!out.error) router.refresh();
  };
  const levelWord = DOS_LEVEL_LABEL[c.level] ?? c.level;
  /** ⚠⚠ A CLASS IS OVER WHEN ITS SESSION IS OVER (30 Sep 2026), not when somebody
   *  marks it. Nothing in this app has ever written `status = 'completed'` — no
   *  screen, no trigger, no cron (`classPhaseAt` carries the measurement) — so
   *  this read `false` for every class that has ever run, and everything behind
   *  it was UNREACHABLE: the completed card, FINAL METRICS, "the register below
   *  is final", the Refunds line. `sessionPhase` has been computed on the server
   *  and handed in all along; it just was not the thing this asked. */
  const done = c.status === "completed" || sessionPhase === "ended";
  const isDraft = c.status === "draft";
  const isFree = c.priceInr === 0;
  const price = isFree ? "Free" : `₹${c.priceInr}`;
  /* the seats are written on the card's own `SeatBar` (4 Oct 2026) */
  const soldOut = filled >= c.capacity && c.capacity > 0;
  const booked = mine?.status === "enrolled";

  const when = c.session ? dateParts(c.session.startsAt) : null;
  const time = c.session ? timeRangeOf(c.session.startsAt, c.session.endsAt) : null;
  const durNice = c.session ? durText(c.session.startsAt, c.session.endsAt) : null;

  /* ⚠⚠ A TEAM MEMBER MAY BOOK A CLASS AT THEIR OWN STUDIO (30 Sep 2026, the
     user's decision). This was `!isMember`, which is the prototype's own rule
     (12405: "not yours") — and the DATABASE has never refused it:
     `book_class_session` has no membership test of any kind. So faculty who
     wanted to TRAIN where they teach met a page with nothing to press and no
     sentence saying why, which is the dead end that was reported.

     What is still refused is a seat on a class you are RUNNING, and that is two
     different people rather than one:
       · the OWNER of the business — it is their class, so a Book button on it
         would be the app offering to sell them their own seat;
       · anybody CONFIRMED on this class, whichever kind. An outside artist who
         accepts is seated `visiting_faculty` (R19), so without this clause the
         change would have offered the teacher a ticket to the class they are
         about to teach.
     ⚠ A trainer or a manager NOT on this class is a dancer here like anybody
     else, which is the whole point of the change. */
  const runsThisClass = isOwner || myClassPerson?.status === "confirmed";
  const showBar = !runsThisClass && !done && c.session !== null;

  /* THE PLACE IS THE VENUE (19 Sep 2026, the user: "right Studio inside the class
     section"): an artist's class held in a studio's room names THE STUDIO THAT
     SAID YES, not the artist page that owns the class — the room is theirs. A
     studio's own class names the studio; an artist's class at a place of their
     own names the artist and opens their profile (`ownerHref`), and its Maps
     link is the pin they placed. */
  const atVenue = Boolean(c.venueName && c.venueBusinessId && c.venueStatus === "accepted");
  const placeName = atVenue ? (c.venueName as string) : c.businessName;
  const placeArea = atVenue ? c.venueArea : c.businessArea;
  const placeCity = atVenue ? c.venueCity : c.businessCity;
  const placeIsStudio = atVenue || c.businessType === "studio";
  const placeHref = atVenue ? `/studio/${c.venueBusinessId}` : c.businessType === "studio" ? `/studio/${c.businessId}` : (ownerHref ?? `/artist/${c.businessId}`);
  const whereBits = [c.room, placeCity].filter(Boolean).join(" · ");
  const mapsQuery = [c.room, placeName, placeArea, placeCity].filter(Boolean).join(", ");
  const mapsLink = !placeIsStudio && c.mapsUrl ? c.mapsUrl : `https://maps.google.com/?q=${encodeURIComponent(mapsQuery)}`;

  /* THE TWO HALVES (4 Oct 2026) — the card's own rule (`ClassTile`), with the
     page's door on the artist half. The artist is whoever is down to take it
     (the ask, dimmed, for the studio's own people), else the maker when the maker
     IS an artist, else nobody yet. The studio is the maker when the maker is a
     studio, else the venue that said yes, else nothing — and the artist half
     spans the card. ⚠ The studio half is NOT a link: AT THE STUDIO below is the
     studio's door, and a second link with the same name is one control too many
     for a screen reader (and a strict locator). */
  const classOwner = c.owner ?? null;
  const artistMade = classOwner?.kind === "artist";
  const studioMade = classOwner?.kind === "studio";
  const studioHalf = studioMade ? classOwner : (c.venue ?? null);
  const madeBy = classOwner ? `Created by ${classOwner.name} — ${classOwner.kind === "artist" ? "an artist" : "a studio"}` : undefined;
  const artistHalf: { name: string; photoPath: string | null; icon?: ReactNode; eyebrow: string; dim: boolean; href?: string; hrefLabel?: string } = whoTakes
    ? { name: whoTakes.personName, photoPath: whoTakes.avatarPath, eyebrow: artist ? "Artist" : "Artist · Asked", dim: !artist, href: `/person/${whoTakes.userId}`, hrefLabel: `Open ${whoTakes.personName}` }
    : artistMade && classOwner
      ? { name: classOwner.name, photoPath: classOwner.photoPath, eyebrow: "Artist", dim: false, href: ownerHref ?? undefined, hrefLabel: `${classOwner.name} — their profile` }
      : { name: "No teacher yet", photoPath: null, icon: DancerIcon, eyebrow: "Artist", dim: false };

  /* one grammar for the money sheets — the same date/time the card prints */
  const whenText = when
    ? `${when.weekday} ${when.day} ${when.month}${time ? ` · ${time}` : ""}`
    : (time ?? "—");
  const whereText = [c.room, c.businessCity].filter(Boolean).join(", ");

  /* Details / Attendance tabs — what YOU can do here (prototype 11755-11757;
     Earnings/Refunds arrive with Step 13, assistant classPeople with Step 11) */
  /* the strip appears for whoever has something behind it: the register
     (owner/trainer) or the refund queue (owner, or the refunds job) */
  const ownerTabs = !isDraft && (register !== null || canSettleRefunds || classMoney !== null);
  const showDetails = !ownerTabs || ownerSeg === "details";
  const checkedInCount = register?.checkedInCount ?? 0;

  /** ⚠⚠ THE POSTER OPENS THE POSTER, AND SHARING IS A BLOCK IN THE DETAILS
   *  (29 Sep 2026, the user: "when clicking on the poster right now we get
   *  poster and a qr code for the class which should not happen — should just
   *  open poster in that. share should be part of the details with qr code with
   *  link and option to copy the link as well … scan this at door text not
   *  required as your personal qr code for user or artist profile is being used
   *  to enter the classes").
   *
   *  Three things were behind the poster from 24 Aug (prototype 12001, "one
   *  place instead of three"): the art, the booking link, and — for a booked
   *  viewer — a DOS-CL-#### entry code under "Scan this at the door." The
   *  entry-code half was a classPerson the product does not keep: a door scans the
   *  PERSON's own profile code (`ScanSheet` → `can_run_register_for_class`),
   *  never a per-booking square, so nothing anywhere ever read one. It is gone
   *  rather than restyled — the code itself survives as what it always really
   *  was, a booking reference printed beside "You're booked".
   *
   *  ⚠ The link is built with the scheme, because it is the thing COPIED and a
   *  scheme-less string pasted into a chat is not a link. `ClassShare` drops the
   *  scheme for the eye and copies what it was given. */
  const shareLink = `${origin}/c/${c.shareSlug}`;

  const answerAsk = async (classPersonId: string, accept: boolean) => {
    if (opPending) return;
    setOpPending(classPersonId);
    const out = await respondToClassAskAction({ classPersonId, accept });
    setOpPending(null);
    fire(out.error ?? (accept ? "You’re on this class" : "Declined — they’ve been told"));
    router.refresh();
  };

  /** ⚠⚠ CHECK SOMEBODY IN BY SCANNING THEIR CODE (28 Sep 2026, the other half of
   *  the user's own ask: "when scanning any persons qr code for entry for a class
   *  or event … after confirmation only should check them in").
   *
   *  The confirm step landed with the scan sheet; what did not exist anywhere was
   *  a scanner ON a register, so "check them in" had no door at all. This is it,
   *  and it writes nothing the row's own Check in button could not: the scan
   *  RESOLVES a person and the register decides what that person is to this
   *  class. Everything the RPC refuses it still refuses — the scan is a way of
   *  finding the row, never a way past `can_run_register_for_class`.
   *
   *  ⚠ A SCAN IS AN ARRIVAL, NEVER A DEPARTURE. Scanning somebody already in
   *  says so and leaves them in — the row's button is how somebody is checked
   *  OUT. A door that scans the same code twice must not undo the first scan.
   *
   *  ⚠ AND IT TELLS THE "NO"s APART, because they need different answers at a
   *  door: booked for a DIFFERENT class, or not booked at all. (A third, "on the
   *  waitlist", went with the waitlist on 4 Oct 2026.)
   *
   *  ⚠⚠ AND THE LAST ONE IS A DOOR NOW (29 Sep 2026). It used to end the errand
   *  — "a class has no walk-in yet" — which is the one thing a person standing
   *  at the door cannot act on. `book_class_session_for_person` books them and
   *  they are checked in in the same press, because the confirm card they just
   *  passed IS the consent step (the user's own 28 Sep wording: "after
   *  confirmation only should check them in OR ADD THEM").
   *
   *  ⚠ Everything that decides still lives in the database: the register's own
   *  window, capacity, and who may run the door. A refusal comes back in the
   *  RPC's own words and the confirm card stays up wearing it, which is what
   *  `ok: false` means to this sheet. */
  const scanCheckIn = async (personId: string, personName: string): Promise<ScanOutcome> => {
    if (!register) return { ok: false, message: "This register is not open." };
    const row = register.rows.find((r) => r.userId === personId);
    if (!row) {
      if (!c.session) {
        return { ok: false, message: "This class has no session to book against." };
      }
      /* ⚠ the id is remembered BEFORE the refresh lands, exactly as a check-in
         is: `register` is a prop, so scanning two people in a second would
         otherwise read a stale one and offer to book somebody twice. */
      const booked = await bookAtTheDoorAction({ sessionId: c.session.id, userId: personId });
      if (booked.error) {
        return { ok: false, message: booked.error };
      }
      scannedIn.current.add(personId);
      router.refresh();
      return { ok: true, message: `✓ ${personName} booked in at the door` };
    }
    if (row.checkedIn || scannedIn.current.has(personId)) {
      return { ok: true, message: `${row.learnerName} was already checked in` };
    }
    const out = await checkInAction({ classBookingId: row.classBookingId });
    if (out.error) {
      return { ok: false, message: out.error };
    }
    scannedIn.current.add(personId);
    router.refresh();
    return { ok: true, message: `✓ ${row.learnerName} checked in` };
  };

  /** ⚠ THE OTHER HALF OF THE DOOR (29 Sep 2026, shape 2): somebody with no
   *  DanceOS account at all. The scanner cannot help them — there is no code to
   *  scan — so the register asks for a name instead, and recording them checks
   *  them in in the same press, exactly as a scan does. */
  const addWalkIn = async () => {
    const name = walkName.trim();
    if (!name || walkBusy || !c.session) return;
    setWalkBusy(true);
    const out = await addWalkInAction({ sessionId: c.session.id, name });
    setWalkBusy(false);
    if (out.error) {
      fire(out.error);
      return;
    }
    setWalkName("");
    fire(`✓ ${name} is in`);
    router.refresh();
  };

  const removeWalkIn = async (classBookingId: string, name: string) => {
    if (opPending) return;
    setOpPending(classBookingId);
    const out = await removeWalkInAction({ classBookingId });
    setOpPending(null);
    fire(out.error ?? `${name} removed`);
    router.refresh();
  };

  const runRegisterOp = async (
    classBookingId: string,
    op: (input: { classBookingId: string }) => Promise<{ error: string | null }>,
    doneMsg: string | null
  ) => {
    if (opPending) return;
    setOpPending(classBookingId);
    const out = await op({ classBookingId });
    setOpPending(null);
    if (out.error) {
      fire(out.error);
    } else if (doneMsg) {
      fire(doneMsg);
    }
    router.refresh();
  };

  return (
    <div
      style={{
        /* relative so the Delete chip sits on the page's own top-right corner */
        position: "relative",
        background: "var(--bg)",
        maxWidth: 430,
        margin: "0 auto",
        color: "var(--text)",
        paddingBottom: showBar || (canManage && isDraft) ? 130 : 40,
        fontFamily: DOS_UI,
        transition: "background .25s",
      }}
    >
      {/* ── THE SLEEVE, LIT LIKE A PLAYER (prototype 11799-11814). Tapping the
          poster opens THE POSTER — sharing is a block in the details and entry
          is the person's own profile code (29 Sep 2026; see `shareLink`). ── */}
      <DosPosterSleeve
        item={posterItem}
        design={posterK}
        col={col}
        heroGone={heroGone}
        onOpen={() => setPosterViewOpen(true)}
        label="Open the poster"
      >
        {canManage && !done ? (
          <button
            type="button"
            aria-label="Change the poster"
            onClick={(e) => {
              e.stopPropagation();
              setPosterOpen(true);
            }}
            style={{ position: "absolute", right: 6, top: 6, padding: "4px 9px", borderRadius: 999, cursor: "pointer", background: "rgba(0,0,0,.6)", color: "#fff", fontSize: 9, fontWeight: 800, border: "none", fontFamily: "inherit" }}
          >
            Poster
          </button>
        ) : null}
      </DosPosterSleeve>

      {/* ── DELETE, TOP RIGHT OF THE PAGE (4 Oct 2026, the user: "delete class
          removed from class card and goes on top right of class detail page").
          The owner's alone, and never once the class is over — calling off a
          finished class would refund every paid seat for a class that already
          happened ("cancel / refund class should not be possible if class is
          over"). The register's row no longer carries it. ── */}
      {isOwner && !done ? (
        <div style={{ position: "absolute", top: 12, right: 16, zIndex: 3 }}>
          <ClassDeleteChip classId={c.id} businessId={c.businessId} title={c.title} isDraft={isDraft} enrolled={filled} />
        </div>
      ) : null}

      {/* ── A STATUS IS NOT A BUTTON: a finished class — or the fact that you are on
          its team — is said once, at the top (11816-11843), as a band in the
          card's own anatomy. ⚠ NO "Refunds ›" ON IT (4 Oct 2026, the user:
          "remove refunds button on class cards") — the Refunds tab under the
          card is the queue, one press away, and a second door to it here was
          the same subject twice. ── */}
      {(done || assisting) && (
        <div style={{ padding: "14px 16px 0", position: "relative", zIndex: 1, background: "var(--bg)" }}>
          <div
            data-testid={done ? "class-over-band" : "class-assisting-band"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "13px 14px",
              borderRadius: 20,
              background: done ? "var(--card)" : `linear-gradient(135deg, ${col}26, ${col}0d)`,
              border: `1.5px solid ${done ? "var(--el)" : col + "55"}`,
            }}
          >
            <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, background: done ? "var(--el)" : `${col}2e` }}>
              {done ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--sub)" strokeWidth="2.4" strokeLinecap="round">
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              ) : (
                "🤝"
              )}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: DOS_DISPLAY, fontSize: 15, fontWeight: 900, letterSpacing: -0.2 }}>{done ? "Class completed" : "You're assisting on this class"}</div>
              <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 2, lineHeight: 1.4 }}>
                {done
                  ? `${when ? `${when.weekday} ${when.day} ${when.month}` : "This session is over"} · it can no longer be cancelled or refunded`
                  : canAtt && canRef
                    ? "You manage attendance and refunds."
                    : canAtt
                      ? "You manage attendance."
                      : canRef
                        ? "You manage refunds."
                        : `Assisting ${artist?.personName ?? "the artist"} — no admin tools on this one.`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── THE CARD, OPENED — ON THE CLASS CARD'S OWN ANATOMY (4 Oct 2026, the
          user: "revamp class detail page also in new theme like class cards").
          The same two halves (the artist on the left, the studio on the right,
          the maker's half shaded), the style's name at display size, the day,
          the date and the time in ONE tile, and the seats written on the bar
          with the price beside it — `Half`, `WhenTile` and `SeatBar` are the
          card's own components, so the page and the card cannot describe one
          class two ways. ── */}
      <div style={{ padding: "0 16px 10px", position: "relative", zIndex: 1, background: "var(--bg)" }}>
        <div style={{ height: 1, background: "var(--el)", margin: "16px 0 18px" }} />
        <div
          data-testid="class-page-card"
          style={{
            borderRadius: 22,
            overflow: "hidden",
            border: liveNow && !done ? "2.5px solid #22C55E" : "1.5px solid var(--el)",
            background: "var(--card)",
            boxShadow: liveNow && !done ? "0 0 0 3px rgba(34,197,94,.18), 0 4px 16px -4px rgba(34,197,94,.45)" : "0 1px 3px rgba(0,0,0,.25)",
          }}
        >
          {/* BAND 1 — the two profiles. The artist half is a door to the person
              (11900), and the studio's own people also see an unanswered ask,
              dimmed — nobody outside the team does (`askedArtist` is null
              unless `isMember`). */}
          <div data-testid="class-head" style={{ display: "flex", alignItems: "stretch" }}>
            <Half
              side="artist"
              tint={col}
              big
              name={artistHalf.name}
              photoPath={artistHalf.photoPath}
              icon={artistHalf.icon}
              eyebrow={artistHalf.eyebrow}
              made={artistMade}
              mirrored={false}
              dim={artistHalf.dim}
              href={artistHalf.href}
              hrefLabel={artistHalf.hrefLabel}
              title={artistMade ? madeBy : undefined}
            />
            {studioHalf ? (
              <Half
                side="studio"
                tint={col}
                big
                name={studioHalf.name}
                photoPath={studioHalf.photoPath}
                eyebrow="Studio"
                made={studioMade}
                mirrored
                title={studioMade ? madeBy : undefined}
              />
            ) : null}
          </div>

          {/* BAND 2 — the class */}
          <div style={{ padding: "14px 14px 15px" }}>
            <div data-testid="class-title-row" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 9px", minWidth: 0 }}>
              {/* ⚠ THE PAGE'S OWN `<h1>` (28 Sep 2026) — the style IS this page's
                  name. Bigger since 4 Oct 2026 ("Bigger Style Name"). */}
              <h1 style={{ margin: 0, minWidth: 0, fontFamily: DOS_DISPLAY, fontSize: 31, fontWeight: 900, letterSpacing: -1.1, lineHeight: 1.04, color: ink, overflowWrap: "normal", wordBreak: "normal" }}>{c.style}</h1>
              <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 900, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--muted)" }}>{levelWord}</span>
              <span style={{ marginLeft: "auto", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
                {liveNow && !done ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 900, letterSpacing: 0.7, textTransform: "uppercase", padding: "4px 9px", borderRadius: 999, background: GREEN, color: "#fff" }}>Live</span>
                ) : done ? (
                  <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.7, textTransform: "uppercase", padding: "4px 9px", borderRadius: 999, background: "var(--el)", color: "var(--sub)" }}>Completed</span>
                ) : isDraft ? (
                  <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.7, textTransform: "uppercase", padding: "4px 9px", borderRadius: 999, background: "rgba(245,158,11,.18)", color: "#F59E0B" }}>Draft</span>
                ) : null}
              </span>
            </div>

            {/* the owner's two moves on the person taking it: a STUDIO's owner may
                pick somebody else (18 Sep 2026), and the job chips on a confirmed
                artist — `20260928100000` made the register a default an owner may
                take back, and this is its only door */}
            {(isOwner && !done && c.businessType === "studio") || (isOwner && !done && artist) ? (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8, minWidth: 0 }}>
                {isOwner && !done && artist ? <AssistantControls classPerson={artist} isOwner={isOwner} col={col} remove={false} /> : null}
                {isOwner && !done && c.businessType === "studio" ? (
                  <Link href={`/business/${c.businessId}/classes/${c.id}/edit`} aria-label="Change the artist taking this class" style={{ marginLeft: "auto", flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: col, padding: "4px 10px", borderRadius: 999, border: `1.5px solid ${col}66`, textDecoration: "none" }}>
                    Change artist
                  </Link>
                ) : null}
              </div>
            ) : null}

            {/* THE DAY, THE DATE AND THE TIME IN ONE TILE, with how long it runs */}
            <div style={{ marginTop: 12 }}>
              <WhenTile startsAt={c.session?.startsAt ?? null} tint={col} big extra={durNice} />
            </div>

            {/* THE SEATS WRITTEN ON THE BAR, THE PRICE BESIDE IT (4 Oct 2026). A
                class that is over has no spots to offer, so the bar says so. */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, minWidth: 0 }}>
              <SeatBar taken={filled} cap={c.capacity} tint={col} height={30} leftWord={done ? "Class over" : undefined} />
              <span
                data-testid="class-fact-price"
                style={{
                  flexShrink: 0,
                  fontSize: 18,
                  fontWeight: 900,
                  letterSpacing: -0.3,
                  // Ink, as on the card: #4ADE80 measured ~1.6:1 on the light card.
                  color: "var(--text)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {price}
              </span>
            </div>
          </div>
        </div>

        {/* ── Details / Attendance belongs to the card, not the page under it
            (prototype 11961-11970) ── */}
        {ownerTabs && (
          <>
          <div style={{ display: "flex", gap: 2, background: "var(--el)", borderRadius: 14, padding: 3, marginTop: 10 }}>
            {(
              [
                ["details", "Details"],
                ...(register !== null ? ([["att", "Attendance"]] as Array<["att", string]>) : []),
                /* Earnings sits between Attendance and Refunds, as it does in the
                   prototype's SEGS (11757) — and behind `isMine` there, so it is
                   the owner's alone while the two beside it ride grantable jobs. */
                ...(classMoney !== null ? ([["money", "Earnings"]] as Array<["money", string]>) : []),
                /* Refunds is its own segment in the prototype's SEGS
                   (11755-11757), and it only appears for somebody who may
                   actually settle: the owner, or a confirmed classPerson holding the
                   refunds job. A trainer without it does not get a tab that
                   would only refuse them. */
                ...(canSettleRefunds ? ([["ref", "Refunds"]] as Array<["ref", string]>) : []),
              ] as Array<["details" | "att" | "money" | "ref", string]>
            ).map(([k, l]) => (
              <div
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                key={k}
                onClick={() => setOwnerSeg(k)}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "7px 4px",
                  borderRadius: 9,
                  cursor: "pointer",
                  fontSize: 11.5,
                  fontWeight: 800,
                  background: ownerSeg === k ? "var(--solid)" : "transparent",
                  color: ownerSeg === k ? "var(--text)" : "var(--sub)",
                  boxShadow: ownerSeg === k ? "0 1px 4px rgba(0,0,0,.3)" : "none",
                  transition: "all .15s",
                }}
              >
                {l}
              </div>
            ))}
          </div>
          {/* the count travels with the switch (11974-11991): scroll into a register
              forty names long and the tabs still say how many of them are in the room */}
          {(() => {
            const openRefunds = refunds.filter((r) => r.status === "requested");
            const owed = openRefunds.reduce((a, r) => a + (r.amountInr ?? 0), 0);
            const line =
              ownerSeg === "att"
                ? `${checkedInCount} of ${c.capacity} in the room · ${sessionPhase === "live" ? "session running" : sessionPhase === "ended" ? "session over" : "not started yet"}`
                : ownerSeg === "ref"
                  ? openRefunds.length
                    ? `${openRefunds.length} to settle · ₹${owed.toLocaleString("en-IN")} owed`
                    : "Nothing to settle"
                  : ownerSeg === "money"
                    ? `${filled} of ${c.capacity} booked · ${price}`
                    : `${filled} of ${c.capacity} booked · ${c.style} · ${levelWord}`;
            const dot = ownerSeg === "att" && sessionPhase === "live" ? "#22C55E" : ownerSeg === "ref" && openRefunds.length ? "#F59E0B" : col;
            return (
              <div aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 10, fontWeight: 700, color: "var(--muted)", minWidth: 0 }}>
                <span style={{ flexShrink: 0, width: 5, height: 5, borderRadius: 3, background: dot }} />
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</span>
              </div>
            );
          })()}
          </>
        )}
      </div>

      <div style={{ padding: "12px 16px 0", position: "relative", zIndex: 1, background: "var(--bg)" }}>
        {/* ── YOU HAVE BEEN ASKED — consent is the person's own answer, so it is
            asked where the class is (prototype 15455: "They are asked to
            confirm. A class does not go on Discover until they do."). ── */}
        {myClassPerson && myClassPerson.status === "asked" && (
          <div
            style={{
              background: `linear-gradient(135deg, ${GOLD}24, ${GOLD}08), var(--card)`,
              border: `1.5px solid ${GOLD}66`,
              borderRadius: 20,
              padding: "13px 14px",
              marginBottom: 12,
            }}
          >
            <div style={{ fontFamily: DOS_DISPLAY, fontSize: 14, fontWeight: 900 }}>
              {c.businessName} wants you {myClassPerson.kind === "artist" ? "taking this class" : "assisting on this session"}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 2, lineHeight: 1.45 }}>
              {myClassPerson.kind === "artist"
                ? "Your name goes on the public class once you say yes."
                : [
                    myClassPerson.canAttendance ? "checking people in" : null,
                    myClassPerson.canRefunds ? "settling refunds" : null,
                  ]
                    .filter(Boolean)
                    .join(" and ")
                  ? `You would hold ${[
                      myClassPerson.canAttendance ? "attendance" : null,
                      myClassPerson.canRefunds ? "refunds" : null,
                    ]
                      .filter(Boolean)
                      .join(" and ")} on this class.`
                  : "You would be on the team for this session."}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <span
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                aria-label="Decline this ask"
                onClick={() => void answerAsk(myClassPerson.id, false)}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "10px",
                  borderRadius: 999,
                  background: "var(--solid)",
                  border: "1.5px solid var(--el)",
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
                aria-label="Accept this ask"
                onClick={() => void answerAsk(myClassPerson.id, true)}
                style={{
                  flex: 1.3,
                  textAlign: "center",
                  padding: "10px",
                  borderRadius: 999,
                  background: "var(--text)",
                  color: "var(--solid)",
                  fontWeight: 900,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Yes, I&rsquo;m in
              </span>
            </div>
          </div>
        )}

        {/* ── a booking you hold (prototype BookingActions 6408-6448): neutral card,
            the confirmed dot, and the two money actions MERGED into one segmented
            pill — the invoice and the cancel-and-refund are two halves of one
            subject. ── */}
        {/* ⚠ `runsThisClass`, not `isMember` (30 Sep 2026): a member who books is
            offered the bar now, so gating their own booked card on membership
            would have taken the seat AND hidden it — no code, no invoice and no
            way to cancel. Whoever may book may see what they booked. */}
        {mine && !runsThisClass && !done && booked && (
          <div style={{ background: "linear-gradient(135deg, rgba(34,197,94,.16), rgba(34,197,94,.04)), var(--card)", border: "1.5px solid rgba(34,197,94,.42)", borderRadius: 20, padding: "13px 14px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
              <span style={{ width: 9, height: 9, borderRadius: 5, background: GREEN, flexShrink: 0 }} />
              <span style={{ fontFamily: DOS_DISPLAY, fontSize: 14, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                You’re booked
              </span>
              <span style={{ fontFamily: DOS_MONO, fontSize: 10, color: "var(--muted)", marginLeft: "auto", flexShrink: 0 }}>
                {bookingCodeOf(mine.id)}
              </span>
            </div>
            {/* ⚠ This read "Tap the poster above for your code" until 29 Sep
                2026, when the poster stopped being a ticket. What gets somebody
                through the door is their OWN profile code, which the register's
                scanner reads — so the line says where that is, and the mono
                string above it is what it always really was: a reference for
                this booking, not a credential. */}
            <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 3 }}>
              Your own profile QR is what gets you in — it is on your profile.
            </div>
            {/* one bordered pill, two segments, a hairline between */}
            <div
              style={{
                display: "flex",
                alignItems: "stretch",
                marginTop: 10,
                border: "1.5px solid var(--el)",
                borderRadius: 999,
                overflow: "hidden",
                background: "var(--solid)",
              }}
            >
              <span
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                aria-label="Invoice"
                onClick={() => setInvoiceOpen(true)}
                style={{
                  flex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "10px 6px",
                  fontSize: 11.5,
                  fontWeight: 800,
                  cursor: "pointer",
                  color: "var(--text)",
                }}
              >
                Invoice
              </span>
              <span aria-hidden="true" style={{ width: 1, background: "var(--el)" }} />
              <span
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                aria-label="Cancel booking"
                onClick={() => setRefundOpen(true)}
                style={{
                  flex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "10px 6px",
                  fontSize: 11.5,
                  fontWeight: 800,
                  cursor: "pointer",
                  color: "#F87171",
                }}
              >
                Cancel booking
              </span>
            </div>
          </div>
        )}
        {/* ⚠ the "You're on the waitlist" card went with the waitlist (4 Oct 2026) */}

        {showDetails && (
          <>
        {/* ── HOW IT WENT, NOT WHAT IT TOOK (12166-12188): two bars, for whoever holds
            the register — the eye gets the answer before it reads the numbers ── */}
        {done && register && showDetails && (() => {
          const present = register.rows.filter((r) => r.checkedIn);
          const rows: Array<[string, number, number, string]> = [
            ["Attended", present.length, register.rows.length, register.rows.length && (100 * present.length) / register.rows.length >= 75 ? "#22C55E" : "#F59E0B"],
            ["Seats filled", filled, c.capacity, col],
          ];
          return (
            <Sec
              col={col}
              label="CLASS COMPLETED · FINAL METRICS"
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="m8.5 12.5 2.5 2.5 4.5-5" />
                </svg>
              }
            >
              {rows.map(([l, now, max, tone]) => {
                const p = max ? Math.min(100, Math.round((100 * now) / max)) : 0;
                return (
                  <div key={l} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.5, color: "var(--muted)", textTransform: "uppercase" }}>{l}</span>
                      <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 900, fontFamily: DOS_MONO }}>
                        {now}
                        <span style={{ color: "var(--muted)", fontWeight: 700 }}> / {max}</span>
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: tone }}>{p}%</span>
                    </div>
                    <div style={{ height: 7, borderRadius: 4, background: "var(--el)", overflow: "hidden" }}>
                      <div style={{ height: 7, borderRadius: 4, width: `${p}%`, background: tone }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 9, lineHeight: 1.5 }}>
                This class is finished. Nothing on it can be changed now — the register is final on the Attendance tab{canSettleRefunds ? " and any refunds still open are on the Refunds tab" : ""}.
              </div>
            </Sec>
          );
        })()}
        {done && register && ownerTabs && ownerSeg === "att" && (() => {
          const present = register.rows.filter((r) => r.checkedIn);
          const absent = register.rows.filter((r) => !r.checkedIn);
          const chip = (r: (typeof register.rows)[number], on: boolean) => (
            <Link key={r.classBookingId} href={`/person/${r.userId}`} aria-label={`Open ${r.learnerName}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--el)", borderRadius: 999, padding: "3px 11px 3px 3px", color: on ? "var(--text)" : "var(--sub)", textDecoration: "none", opacity: on ? 1 : 0.6 }}>
              <span style={{ width: 22, height: 22, borderRadius: 7, overflow: "hidden", background: on ? "linear-gradient(135deg,#22C55E,#0D9488)" : "var(--card)", border: on ? "none" : "1.5px solid var(--el)", display: "flex", alignItems: "center", justifyContent: "center", color: on ? "#fff" : "var(--sub)", fontSize: 8.5, fontWeight: 900 }}>
                {photoUrl(r.avatarPath) ? <Image src={photoUrl(r.avatarPath)!} alt="" width={22} height={22} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : initialsOf(r.learnerName)}
              </span>
              <span style={{ fontSize: 11, fontWeight: 800 }}>{r.learnerName}</span>
            </Link>
          );
          return (
            <Sec
              col={col}
              label={`WHO ATTENDED · ${present.length} OF ${register.rows.length}`}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="8.5" r="3" />
                  <path d="M3.5 19c.6-2.9 2.8-4.5 5.5-4.5S13.9 16.1 14.5 19" />
                  <path d="m16 9.5 1.8 1.8 3.2-3.6" />
                </svg>
              }
            >
              <div style={{ fontSize: 10.5, color: "var(--sub)", marginBottom: 9, lineHeight: 1.5 }}>The final register, as it stood when the class ended. It cannot be edited.</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{present.map((r) => chip(r, true))}</div>
              {absent.length > 0 ? (
                <>
                  <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.7, color: "var(--muted)", margin: "9px 0 5px" }}>NO-SHOW · {absent.length}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{absent.map((r) => chip(r, false))}</div>
                </>
              ) : null}
            </Sec>
          );
        })()}

        {/* ── AT THE STUDIO — one place says where, and says it properly (12273-12320) ── */}
        <Sec
          col={col}
          label={placeName ? (placeIsStudio ? "AT THE STUDIO" : "WHERE") : `THE ROOM · ${(c.room ?? "").toUpperCase()}`}
          icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3.5h9a1.5 1.5 0 0 1 1.5 1.5v15H6z" />
              <path d="M4.5 20.5h15" />
              <circle cx="13.5" cy="12.2" r=".9" fill={col} />
            </svg>
          }
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              paddingBottom: 9,
              marginBottom: 9,
              borderBottom: "1.5px solid var(--el)",
            }}
          >
            <Link href={placeHref} aria-label={`Open ${placeName}`} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, color: "var(--text)", textDecoration: "none" }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  flexShrink: 0,
                  background: `linear-gradient(135deg,${STUDIO_RING[0]},${STUDIO_RING[1]})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 11.5,
                  fontWeight: 900,
                }}
              >
                {placeName.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {placeName}
                </div>
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    letterSpacing: 0.5,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {whereBits}
                </div>
              </div>
            </Link>
            <a
              href={mapsLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open this venue in Maps"
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10.5,
                fontWeight: 800,
                color: col,
                cursor: "pointer",
                border: `1.5px solid ${col}44`,
                borderRadius: 999,
                padding: "5px 11px",
                textDecoration: "none",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round">
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
              Maps
            </a>
          </div>
          {/* what the room HAS — the amenities the studio set on it (12278-12354) */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            {roomAmenities.length > 0 ? (
              /* the app's one amenity chip — the drawn icon in the style's colour
                 (4 Oct 2026, "revamp icon for amenities everywhere") */
              roomAmenities.map((a) => <AmenityChip key={a} value={a} tint={col} />)
            ) : (
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                Nothing listed for {c.room ?? "this venue"} yet.
              </span>
            )}
          </div>
        </Sec>

        {/* ── WHAT THIS CLASS IS TAUGHT FROM (19 Sep 2026, the user: "Artist
            should be able to add Routines from the class detail page and should
            be visible"). The prototype puts the routine below the team and
            above the poster (12322-12330: "who is teaching, then what you will
            dance — that is the order somebody reads a class in"), and a routine
            is CHOSEN here, never typed: it is a thing you already made, in
            Routines. Drawn whenever there is one, or for whoever may add one. ── */}
        {(routines.length > 0 || canSetRoutines) && (
          <Sec
            col={col}
            label="ROUTINES"
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="6" width="13" height="12" rx="2.5" />
                <path d="m16 11 5-3v8l-5-3z" />
              </svg>
            }
          >
            <ClassRoutines classId={c.id} shareSlug={c.shareSlug} col={col} routines={routines} mine={myRoutines} canEdit={canSetRoutines} />
          </Sec>
        )}

        {/* ── THE CLASS TEAM (12356-12391) — an assistant is a person with a job
            (81-91). Who is on the floor with the artist; the right-hand word is the
            whole permission model made visible: "Edit ›" only where you may change
            it, "View ›" everywhere else. Confirmed names only reach a stranger; the
            studio's own people see the asks too. ── */}
        {(!isDraft || canManage || canAddAssistant) && (
          <Sec
            col={col}
            label="CLASS ASSISTANTS"
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="8.5" r="3" />
                <path d="M3.5 19c.6-2.9 2.8-4.5 5.5-4.5S13.9 16.1 14.5 19" />
                <circle cx="17" cy="9.5" r="2.4" />
                <path d="M15.5 14.6c2.5.2 4.3 1.6 5 4.4" />
              </svg>
            }
          >
            {[...assistants, ...pendingAssistants].map((cl) => {
              /* every row here is an assistant now — the artist's own ask is
                 drawn in the WHO column above, where it belongs */
              const job = [cl.canAttendance ? "Attendance" : null, cl.canRefunds ? "Refunds" : null].filter(Boolean).join(" · ") || "Assisting";
              const face = photoUrl(cl.avatarPath);
              return (
                <div key={cl.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
                  <Link href={`/person/${cl.userId}`} aria-label={`Open ${cl.personName}`} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, color: "var(--text)", textDecoration: "none" }}>
                    <div style={{ width: 34, height: 34, borderRadius: 11, overflow: "hidden", background: `linear-gradient(135deg,${col},#7C3AED)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 900, flexShrink: 0 }}>
                      {face ? <Image src={face} alt="" width={34} height={34} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : initialsOf(cl.personName)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cl.personName}
                        {myClassPerson && cl.id === myClassPerson.id ? <span style={{ color: "var(--muted)", fontWeight: 700 }}>{"  you"}</span> : null}
                      </div>
                      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, color: cl.status === "confirmed" ? "var(--muted)" : GOLD, textTransform: "uppercase" }}>
                        {cl.status === "confirmed" ? job : "⏳ Asked"}
                      </div>
                    </div>
                  </Link>
                  {/* the jobs and Remove, for whoever may (18 Sep 2026): the owner on
                      any assistant, the teacher on the assistants they asked; the
                      teacher's own row is changed from the form, not here */}
                  {cl.kind === "assistant" && (isOwner || canAddAssistant) ? (
                    <AssistantControls classPerson={cl} isOwner={isOwner} col={col} />
                  ) : (
                    <Link href={`/person/${cl.userId}`} aria-label={`View ${cl.personName}`} style={{ fontSize: 10.5, fontWeight: 800, color: col, flexShrink: 0, textDecoration: "none" }}>
                      View ›
                    </Link>
                  )}
                </div>
              );
            })}
            {assistants.length === 0 && pendingAssistants.length === 0 && !canAddAssistant ? <div style={{ fontSize: 11, color: "var(--muted)", padding: "6px 0" }}>No assistants on this class.</div> : null}
            {/* the owner, or the person taking the class, asks somebody — from here,
                not from the form (18 Sep 2026) */}
            {canAddAssistant ? <AddAssistant classId={c.id} col={col} exclude={classPeople.filter((cl) => cl.status !== "rejected").map((cl) => cl.userId)} /> : null}
            {assisting ? (
              <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 8, paddingTop: 8, borderTop: "1.5px solid var(--el)" }}>
                You are assisting on this class{canAtt || canRef ? ` — you hold ${[canAtt ? "attendance" : null, canRef ? "refunds" : null].filter(Boolean).join(" and ")}.` : "."}
              </div>
            ) : null}
          </Sec>
        )}

        {/* ── POLICY — what the price does NOT tell you (12399-12402). The
            Memberships row waits for passes to exist (see backlog). ── */}
        {!done && (
          <Sec
            col={col}
            label="POLICY"
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="7" width="16" height="13" rx="2.5" />
                <path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7M4 12.5h16" />
              </svg>
            }
          >
            <Row k="Refund" v={isFree ? "Not applicable — free" : "Full refund until 48 h before"} />
            {/* ── MEMBERSHIPS (19 Sep 2026, the user: "Memberships should be
                allowed … in Class form and Policy section in Class Detail as
                well"). The class's own two switches, said to the person about to
                book — and the same booleans the database reads when a pass is
                spent, so the page cannot promise what the RPC refuses. ── */}
            <Row
              k="Memberships"
              /* only a studio sells a pass since 4 Oct 2026 */
              v={c.allowsStudioMemberships ? "A studio's pass covers a seat" : "Not accepted — this one is booked seat by seat"}
            />
          </Sec>
        )}

        {/* ── SHARE — the code, the address and one press to copy (29 Sep 2026;
            the reasoning is on `shareLink`). ⚠ PUBLISHED ONLY: a draft's
            `/c/{slug}` resolves for the studio's own people and 404s for
            everybody else, so handing its owner a code to point somebody at
            would be a link that works for exactly the person holding it. ── */}
        {!isDraft && (
          <Sec
            col={col}
            label="SHARE"
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="2.6" />
                <circle cx="6" cy="12" r="2.6" />
                <circle cx="18" cy="19" r="2.6" />
                <path d="M8.4 10.8 15.6 6.4M8.4 13.2l7.2 4.4" />
              </svg>
            }
          >
            <ClassShare link={shareLink} title={c.title} fire={fire} />
          </Sec>
        )}
          </>
        )}

        {/* ── EARNINGS — what this session made (prototype 12008-12042). The
            price was on the card, the fill on the register and the refunds on a
            third tab; this is the one place they are added up. ── */}
        {ownerTabs && ownerSeg === "money" && classMoney && (
          <ClassEarnings
            styleColor={col}
            priceInr={c.priceInr}
            /* attended if the register has more, else booked — prototype 12013 */
            seatsTaken={Math.max(checkedInCount, filled)}
            capacity={c.capacity}
            figures={classMoney}
            earningsHref={`/business/${c.businessId}/earnings`}
          />
        )}

        {/* ── REFUNDS — the requests Step 9 filed and nothing could answer
            (prototype 12219-12262). Approve fires the real refund; declining is
            a decision, not a failure; "Mark refunded" is for money handed back
            at the desk. ── */}
        {ownerTabs && ownerSeg === "ref" && canSettleRefunds && (
          <RefundQueue refunds={refunds} paidSeats={filled} />
        )}

        {/* ── ATTENDANCE — the register and the queue (prototype 12043-12138).
            The QR scanner is the pill on the register's head since 28 Sep 2026;
            a class WALK-IN still has no door, and needs a migration (`class_bookings`
            has no nullable `user_id` and no name column — events have
            `add_event_walk_in` and classes have no equivalent at all). ── */}
        {ownerTabs && ownerSeg === "att" && register && (
          <>
            {/* the clock starts the session, not a button (12050-12063) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: sessionPhase === "live" ? "rgba(34,197,94,.10)" : "var(--card)",
                border: `1.5px solid ${sessionPhase === "live" ? "rgba(34,197,94,.32)" : "var(--el)"}`,
                borderRadius: 16,
                padding: "11px 13px",
                marginBottom: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 900, color: sessionPhase === "live" ? "#22C55E" : "var(--text)" }}>
                  {sessionPhase === "ended" ? "Session ended" : sessionPhase === "live" ? "Session live" : "Not started yet"}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>
                  {sessionPhase === "ended"
                    ? "The register below is final."
                    : sessionPhase === "live"
                      ? `${checkedInCount} checked in · check-in is open`
                      : time
                        ? `Opens by itself at ${time.split("–")[0].trim()} — nothing to press.`
                        : "Opens by itself at the start time — nothing to press."}
                </div>
              </div>
              {sessionPhase === "live" && (
                <span style={{ position: "relative", width: 10, height: 10, flexShrink: 0, marginRight: 4 }}>
                  <span style={{ position: "absolute", inset: 0, borderRadius: 5, background: "#22C55E" }} />
                  <span
                    style={{
                      position: "absolute",
                      inset: -4,
                      borderRadius: 9,
                      border: "2px solid #22C55E",
                      opacity: 0.4,
                      animation: "dosPulse 1.4s ease-out infinite",
                    }}
                  />
                  <style>{`@keyframes dosPulse{0%{transform:scale(.8);opacity:.6}100%{transform:scale(1.9);opacity:0}}`}</style>
                </span>
              )}
            </div>

            {/* ⚠ SCAN TO CHECK IN — the door's own control (28 Sep 2026). Only
                while check-in is OPEN: `check_in` refuses a session that has
                ended, and a button that can only ever be refused is not a
                button. A register with nobody on it has nothing to scan
                against, so it says so rather than opening a camera. */}
            {sessionPhase !== "ended" && (
              <button
                type="button"
                onClick={() => {
                  /* ⚠ NO "nothing to scan against" GUARD ANY MORE (29 Sep 2026).
                     It refused to open the sheet while `register.rows` was
                     empty, which was true while the only thing a scan could do
                     was find an existing booking — and is exactly backwards for
                     a door: an empty class is precisely when the first walk-in
                     arrives. The feature made its own guard wrong. */
                  /* ⚠ CLEARED ON EVERY OPEN, not on close: the set is only ever
                     right for ONE sitting at the door. Somebody checked in by a
                     scan and then checked OUT on their row would otherwise still
                     be "already checked in" to the next scan. Nothing can check
                     out while the sheet is up, because the sheet is modal. */
                  scannedIn.current.clear();
                  setScanOpen(true);
                }}
                aria-label="Scan a code to check somebody in"
                data-testid="scan-check-in"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  width: "100%",
                  padding: "12px",
                  marginBottom: 10,
                  borderRadius: 999,
                  border: "1.5px solid var(--el)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontWeight: 900,
                  fontSize: 12.5,
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3.5 8.5v-3a2 2 0 0 1 2-2h3M15.5 3.5h3a2 2 0 0 1 2 2v3M20.5 15.5v3a2 2 0 0 1-2 2h-3M8.5 20.5h-3a2 2 0 0 1-2-2v-3" />
                  <path d="M7 12h10" />
                </svg>
                Scan to check in
              </button>
            )}

            {/* ⚠⚠ AND THE PERSON WITH NO CODE TO SCAN (29 Sep 2026, shape 2).
                The scanner resolves a DanceOS profile, so it can do nothing at
                all for somebody who walks in off the street — the commonest
                thing at a door. A name is what there is, so a name is what it
                asks for, and recording them checks them in in the same press.
                ⚠ The button NAMES the missing answer while the field is empty,
                which is this app's own form grammar (`ClassForm`, 21 Sep). */}
            {sessionPhase !== "ended" && c.session ? (
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <input
                  value={walkName}
                  onChange={(e) => setWalkName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addWalkIn();
                    }
                  }}
                  maxLength={80}
                  placeholder="Somebody at the door…"
                  aria-label="The name of somebody walking in"
                  data-testid="walk-in-name"
                  style={{ flex: 1, minWidth: 0, padding: "11px 13px", borderRadius: 999, border: "1.5px solid var(--el)", background: "var(--card)", color: "var(--text)", fontFamily: "inherit", fontSize: 12.5, textTransform: "none" }}
                />
                <button
                  type="button"
                  onClick={() => void addWalkIn()}
                  disabled={walkName.trim().length === 0 || walkBusy}
                  aria-label={walkName.trim().length === 0 ? "Type a name first" : `Add ${walkName.trim()} at the door`}
                  data-testid="walk-in-add"
                  style={{ flexShrink: 0, padding: "11px 15px", borderRadius: 999, border: "none", background: walkName.trim().length === 0 ? "var(--el)" : "var(--text)", color: walkName.trim().length === 0 ? "var(--sub)" : "var(--solid)", fontWeight: 900, fontSize: 12.5, fontFamily: "inherit", cursor: walkName.trim().length === 0 ? "default" : "pointer", opacity: walkBusy ? 0.5 : 1 }}
                >
                  {walkName.trim().length === 0 ? "Name first" : walkBusy ? "Adding…" : "Add"}
                </button>
              </div>
            ) : null}

            {/* the register itself (12117-12137) */}
            <Sec
              col={col}
              label={`${sessionPhase === "ended" ? "FINAL REGISTER" : "LIVE REGISTER"} · ${checkedInCount}/${c.capacity} IN`}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
                  <path d="M3.5 9.5h17M8.5 4.5v-2M15.5 4.5v-2" />
                  <path d="m8.5 14.5 2.3 2.3 4.7-4.7" />
                </svg>
              }
            >
              <div style={{ height: 6, borderRadius: 3, background: "var(--el)", marginBottom: 10 }}>
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    width: `${Math.min(100, (100 * checkedInCount) / Math.max(1, c.capacity))}%`,
                    background: soldOut ? "#EF4444" : `linear-gradient(90deg,${col},${col}88)`,
                  }}
                />
              </div>
              {register.rows.map((r, i) => {
                /* ⚠⚠ A WALK-IN HAS NO PAGE TO OPEN (29 Sep 2026, shape 2).
                   `href={`/person/${r.userId}`}` renders `/person/null` for one,
                   and NOTHING TYPED CAN SEE IT — a template literal swallows a
                   null without complaint. So the identity block is a Link only
                   when there is somebody to link to, and a plain row otherwise. */
                const identityStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, color: "var(--text)", textDecoration: "none" };
                /* ⚠ AND THE MONEY LINE HAS TO SAY SOMETHING TRUE ABOUT A WALK-IN.
                   They have no `payments` row, so `paidSet` says no — which on a
                   priced class would print "₹300 due" in amber about somebody who
                   handed over cash at the door. The door collected it; DanceOS
                   did not move it (Step 13's limit), and that is what it says. */
                const paidOnline = r.userId !== null && paidSet.has(r.userId);
                /* ⚠ A SEAT TAKEN AT THE DOOR CAN BE MARKED PAID (2 Oct 2026, the
                   user: "option to complete due in attendance sheet for walk in
                   students with button next to check in called paid. for booked
                   students it cant change") — a walk-in, or somebody the register
                   booked in. A seat the person booked themselves is the rail's. */
                const doorSeat = r.atDoor && !paidOnline && !isFree;
                const paid = paidOnline || (doorSeat && r.doorPaidAt !== null);
                const meta = isFree
                  ? r.walkIn
                    ? "walk-in"
                    : "free seat"
                  : doorSeat
                    ? r.doorPaidAt
                      ? `${r.walkIn ? "walk-in · " : ""}paid at the door · ${price}`
                      : `${r.walkIn ? "walk-in · " : ""}${price} due at the door`
                    : paid
                      ? `paid · ${price}`
                      : `${price} due`;
                const identity = (
                  <>
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 9,
                        flexShrink: 0,
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 900,
                        background: r.checkedIn ? `linear-gradient(135deg,${col},#7C3AED)` : "var(--el)",
                        color: r.checkedIn ? "#fff" : "var(--sub)",
                      }}
                    >
                      {photoUrl(r.avatarPath) ? <Image src={photoUrl(r.avatarPath)!} alt="" width={28} height={28} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : initialsOf(r.learnerName)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800 }}>{r.learnerName}</div>
                      {/* the payment meta (12126-12127): what the seat cost and whether it is in */}
                      <div data-testid="register-money" style={{ fontSize: 9.5, color: !isFree && !paid ? "#F59E0B" : paid && doorSeat ? "#22C55E" : "var(--sub)" }}>{meta}</div>
                    </div>
                  </>
                );
                return (
                <div
                  key={r.classBookingId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 0",
                    borderBottom: i === register.rows.length - 1 ? "none" : "1.5px solid var(--el)",
                  }}
                >
                  {r.userId !== null ? (
                    <Link href={`/person/${r.userId}`} aria-label={`Open ${r.learnerName}`} style={identityStyle}>
                      {identity}
                    </Link>
                  ) : (
                    <div style={identityStyle}>{identity}</div>
                  )}
                  {/* PAID, beside Check in — a door seat only, and it can be
                      taken back the same way (a cash slip is easily mis-pressed) */}
                  {doorSeat ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onKeyDown={dosKey}
                      aria-pressed={r.doorPaidAt !== null}
                      aria-label={r.doorPaidAt ? `Mark ${r.learnerName} not paid` : `Mark ${r.learnerName} paid`}
                      onClick={() =>
                        void runRegisterOp(
                          r.classBookingId,
                          (input) => setDoorPaidAction({ ...input, paid: r.doorPaidAt === null }),
                          r.doorPaidAt ? `${r.learnerName} marked not paid` : `${r.learnerName} paid · ${price}`
                        )
                      }
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: "6px 12px",
                        borderRadius: 999,
                        cursor: "pointer",
                        flexShrink: 0,
                        background: r.doorPaidAt ? "rgba(34,197,94,.22)" : "rgba(245,158,11,.16)",
                        color: r.doorPaidAt ? "#22C55E" : "#F59E0B",
                        opacity: opPending === r.classBookingId ? 0.5 : 1,
                      }}
                    >
                      {r.doorPaidAt ? "✓ Paid" : "Paid"}
                    </span>
                  ) : null}
                  {sessionPhase === "ended" ? (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: "6px 12px",
                        borderRadius: 999,
                        flexShrink: 0,
                        background: r.checkedIn ? "rgba(34,197,94,.22)" : "var(--el)",
                        color: r.checkedIn ? "#22C55E" : "var(--sub)",
                      }}
                    >
                      {r.checkedIn ? "✓ In" : "—"}
                    </span>
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      onKeyDown={dosKey}
                      aria-label={r.checkedIn ? `Check ${r.learnerName} out` : `Check ${r.learnerName} in`}
                      onClick={() =>
                        void runRegisterOp(
                          r.classBookingId,
                          r.checkedIn ? undoCheckInAction : checkInAction,
                          r.checkedIn ? `${r.learnerName} checked out` : `${r.learnerName} checked in`
                        )
                      }
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: "6px 12px",
                        borderRadius: 999,
                        cursor: "pointer",
                        flexShrink: 0,
                        background: r.checkedIn ? "rgba(34,197,94,.22)" : "var(--el)",
                        color: r.checkedIn ? "#22C55E" : "var(--text)",
                        opacity: opPending === r.classBookingId ? 0.5 : 1,
                      }}
                    >
                      {r.checkedIn ? "✓ In" : "Check in"}
                    </span>
                  )}
                  {/* ⚠⚠ A WALK-IN IS THE ONE SEAT A STUDIO MAY TAKE BACK OFF.
                      A real learner cancels their own (`cancel_class_booking` is
                      `user_id = auth.uid()`), so a studio has never needed to —
                      but a walk-in has NO account to do it, and a name typed
                      wrongly at a door would otherwise hold a seat for ever.
                      `remove_class_walk_in` refuses anything with a user_id, so
                      this control cannot reach a real person's booking. */}
                  {r.walkIn && sessionPhase !== "ended" ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onKeyDown={dosKey}
                      aria-label={`Remove ${r.learnerName} from the register`}
                      onClick={() => void removeWalkIn(r.classBookingId, r.learnerName)}
                      style={{ fontSize: 10, fontWeight: 800, padding: "6px 10px", borderRadius: 999, cursor: "pointer", flexShrink: 0, background: "var(--el)", color: "var(--sub)", opacity: opPending === r.classBookingId ? 0.5 : 1 }}
                    >
                      ✕
                    </span>
                  ) : null}
                </div>
                );
              })}
              {register.rows.length === 0 && (
                <div style={{ fontSize: 11, color: "var(--muted)" }}>Nobody has booked yet.</div>
              )}
            </Sec>
          </>
        )}
      </div>

      {/* ── ROOM FOR THE ONE THING YOU CAN PRESS — the booking bar (12405-12444).
          The two-step pay flow is Step 9's (Cashfree since 28 Aug 2026). ── */}
      {showBar && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "100%",
            maxWidth: 430,
            boxSizing: "border-box",
            padding: "12px 16px 22px",
            zIndex: 400,
            background: "var(--solid)",
            borderTop: "1.5px solid var(--el)",
            boxShadow: "0 -6px 22px rgba(0,0,0,.28)",
          }}
        >
          {!isSignedIn ? (
            <Link
              href="/login"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "15px",
                borderRadius: 999,
                fontWeight: 900,
                fontSize: 14.5,
                background: "var(--text)",
                color: "var(--solid)",
                textDecoration: "none",
                boxShadow: "0 5px 16px rgba(0,0,0,.32)",
              }}
            >
              Sign in to book
            </Link>
          ) : !viewerCanBook && !booked ? (
            /* A BUSINESS DOES NOT BOOK (19 Sep 2026). It reads the page — this
               is its own studio's class as often as not — and the bar says so
               rather than offering a press that would be refused. */
            <div data-testid="org-cannot-book" style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderRadius: 16, background: "var(--card)", border: "1.5px solid var(--el)" }}>
              <span aria-hidden="true" style={{ flexShrink: 0, fontSize: 15 }}>🏛</span>
              <div style={{ fontSize: 11, color: "var(--sub)", lineHeight: 1.45 }}>{cannotBookWhy ?? "This profile does not book classes. Switch to your own to take a place."}</div>
            </div>
          ) : sessionPhase === "live" && !booked ? (
            /* ⚠⚠ A CLASS THAT HAS STARTED CANNOT BE BOOKED, AND NOW SAYS SO
               (30 Sep 2026). `book_class_session` refuses `starts_at <= now()`
               in the database and always has — but nothing on this page tested
               the clock (`done` was `status === "completed"`, which nothing ever
               sets), so the bar went on offering "Book a spot" and the refusal
               arrived as a raw sentence AFTER the press. Every other closed door
               in this app says why before it: `why_no_class`, `why_no_publish`,
               `cannotBookWhy`, `why_no_membership`. This is that one.
               ⚠ The DOOR is the way in now, which is what the line names — the
               studio can book somebody at the register until the session ends. */
            <div data-testid="class-already-started" style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderRadius: 16, background: "var(--card)", border: "1.5px solid var(--el)" }}>
              <span aria-hidden="true" style={{ flexShrink: 0, fontSize: 15 }}>⏱</span>
              <div style={{ fontSize: 11, color: "var(--sub)", lineHeight: 1.45 }}>
                This class has already started, so it cannot be booked here. If you are at the door, the studio can still take you in on its register.
              </div>
            </div>
          ) : soldOut && !booked ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "13px 14px",
                borderRadius: 16,
                background: "rgba(239,68,68,.12)",
                border: "1.5px solid rgba(239,68,68,.4)",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#F87171"
                strokeWidth="1.9"
                strokeLinecap="round"
                style={{ flexShrink: 0 }}
              >
                <circle cx="12" cy="12" r="8.5" />
                <path d="m8.5 8.5 7 7M15.5 8.5l-7 7" />
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* ⚠ NO WAITLIST (4 Oct 2026, the user: "remove waitlist
                    mechanism") — a full class is full, and the bar offers nothing */}
                <div style={{ fontSize: 13, fontWeight: 900, color: "#F87171" }}>Class full</div>
                <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>
                  All {c.capacity} spots are taken.
                </div>
              </div>
            </div>
          ) : (
            <>
            {/* ── SPEND A MEMBERSHIP INSTEAD OF PAYING (19 Sep 2026). Offered only
                when the database says this viewer holds a pass this class admits
                with a unit left on it; the seat is booked and the unit taken in
                one RPC, and cancelling puts the unit back. ── */}
            {!booked && passes.length > 0 && c.session ? (
              <div data-testid="pass-strip" style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                {passes.map((p) => (
                  <button
                    key={p.passId}
                    type="button"
                    disabled={passPending !== null}
                    aria-label={`Use ${p.membershipName}`}
                    onClick={() => spendPass(p)}
                    style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 13px", borderRadius: 14, background: `${col}18`, border: `1.5px solid ${col}55`, cursor: passPending ? "wait" : "pointer", fontFamily: DOS_UI, color: "var(--text)", textAlign: "left" }}
                  >
                    <span aria-hidden="true" style={{ flexShrink: 0, fontSize: 15 }}>🎟</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.membershipName}</span>
                      <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>
                        {p.unit === "hours"
                          ? `${p.unitsTotal - p.unitsUsed} hours left · this takes ${p.unitsNeeded}`
                          : `${p.unitsTotal - p.unitsUsed} classes left · this takes ${p.unitsNeeded}`}
                      </span>
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 900, color: col }}>{passPending === p.passId ? "…" : "Use it ›"}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)" }}>
                  {isFree ? "FREE TRIAL" : "PER SESSION"}
                </div>
                <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: -0.3, lineHeight: 1.15 }}>{price}</div>
              </div>
              {booked ? (
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={dosKey}
                  onClick={() => fire("Already booked — see it on your calendar")}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "15px",
                    borderRadius: 999,
                    cursor: "pointer",
                    fontWeight: 900,
                    fontSize: 14.5,
                    background: "var(--card)",
                    color: "var(--text)",
                    border: "1.5px solid var(--el)",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                  Booked
                </div>
              ) : (
                /* two steps now, in the order a person thinks in (12439): free goes
                   straight to the confirm sheet, paid chooses how it's paying first */
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={dosKey}
                  onClick={() => setFlowOpen(true)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "15px",
                    borderRadius: 999,
                    cursor: "pointer",
                    fontWeight: 900,
                    fontSize: 14.5,
                    background: "var(--text)",
                    color: "var(--solid)",
                    boxShadow: "0 5px 16px rgba(0,0,0,.32)",
                    fontFamily: DOS_UI,
                  }}
                >
                  {isFree ? "Book free trial" : "Book this class"}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M5 12h13M13 6.5 18.5 12 13 17.5" />
                  </svg>
                </div>
              )}
            </div>
            </>
          )}
        </div>
      )}

      {/* ── a draft has no attendance and no refunds — editing it is the only move (12446-12455) ── */}
      {canManage && isDraft && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 400,
            maxWidth: 430,
            margin: "0 auto",
            background: "var(--solid)",
            borderTop: "1.5px solid var(--el)",
            padding: "12px 16px 26px",
            boxShadow: "0 -6px 20px rgba(0,0,0,.32)",
          }}
        >
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", marginBottom: 8, fontFamily: DOS_UI }}>
            YOUR DRAFT · PUBLISH TO OPEN BOOKINGS
          </div>
          <Link
            href={`/business/${c.businessId}/classes/${c.id}/edit`}
            style={{
              display: "block",
              textAlign: "center",
              padding: "13px",
              borderRadius: 999,
              background: "var(--text)",
              color: "var(--solid)",
              fontWeight: 900,
              fontSize: 13,
              cursor: "pointer",
              textDecoration: "none",
            }}
          >
            Edit class
          </Link>
        </div>
      )}

      {/* the register's scanner — the sheet resolves the code and shows WHO it
          found, and `scanCheckIn` decides what that person is to this class.

          ⚠ THE LABEL STILL SAYS "Check in" THOUGH THE PRESS MAY ALSO BOOK
          (29 Sep 2026), and that is this file's own rule rather than an
          oversight: the 28 Sep re-cut of "Save & ask" → "Send request" said a
          button names what the person is DOING, not the steps the code takes to
          do it. Here the act is letting somebody into the room; the booking is
          the mechanism, the way the draft was there. What happened IS said —
          the outcome message reads "booked in at the door". */}
      {scanOpen && register && (
        <ScanSheet
          heading="Check somebody in"
          confirmLabel="Check in"
          onCode={scanCheckIn}
          onClose={() => setScanOpen(false)}
        />
      )}
      {posterViewOpen && (
        <PosterSheet
          posterItem={posterItem}
          posterK={posterK}
          col={col}
          title={c.title}
          styleName={c.style}
          levelWord={levelWord}
          onClose={() => setPosterViewOpen(false)}
        />
      )}
      {flowOpen && c.session && (
        <PayFlow
          sessionId={c.session.id}
          isFree={isFree}
          priceInr={c.priceInr}
          posterItem={posterItem}
          posterK={posterK}
          col={col}
          metaTop={`${c.style} · ${levelWord}${time ? ` · ${time}` : ""}`}
          metaBottom={`${c.room ?? c.businessName}${c.businessCity ? `, ${c.businessCity}` : ""}${artist ? ` · ${artist.personName}` : ""}`}
          businessName={c.businessName}
          classLabel={c.title}
          onClose={() => setFlowOpen(false)}
          onDone={(msg) => {
            setFlowOpen(false);
            fire(msg);
          }}
        />
      )}
      {posterOpen && (
        <div onClick={() => setPosterOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 660 }}>
          <div role="dialog" aria-modal="true" aria-label="Poster" onClick={(e) => e.stopPropagation()} style={{ background: "var(--solid)", borderRadius: "24px 24px 0 0", padding: "16px 16px 26px", width: "100%", maxWidth: 430, boxSizing: "border-box", color: "var(--text)", maxHeight: "82vh", overflowY: "auto", animation: "dosSheetUp .28s cubic-bezier(.22,.9,.34,1)" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
            <b style={{ fontSize: 16, fontFamily: DOS_DISPLAY }}>Poster</b>
            {/* ⚠ YOUR OWN PICTURE SITS FIRST, as it does in the prototype
                (12772-12781) — the posters slice landed 27 Sep 2026. Upload one
                and it IS the poster everywhere the class is drawn; take it down
                and the drawn sleeve comes back, which is why the designs stay
                below rather than being replaced. */}
            {canManage ? (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)", margin: "0 0 8px" }}>YOUR OWN</div>
                <PhotoPicker
                  owner={{ kind: "poster", id: c.businessId, subject: { kind: "class", id: c.id } }}
                  hasPhoto={Boolean(c.posterPath)}
                  label={c.posterPath ? "Change the picture" : "Upload a picture"}
                  cropLabel="Poster"
                  compact
                />
              </div>
            ) : null}
            <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)", margin: "0 0 8px" }}>A DRAWN ONE</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              {DOS_POSTERS.map(([k, l]) => (
                <button
                  type="button"
                  key={k}
                  aria-pressed={c.poster === k}
                  aria-label={`Poster design ${l}`}
                  disabled={posterBusy}
                  onClick={() => void setPoster(k as "bold" | "split" | "quiet", `Poster set — ${l}`)}
                  style={{ flex: 1, minWidth: 0, textAlign: "center", cursor: "pointer", padding: 6, borderRadius: 14, border: `1.5px solid ${c.poster === k ? col : "var(--el)"}`, background: c.poster === k ? "var(--el)" : "var(--card)", fontFamily: "inherit", color: "var(--text)" }}
                >
                  <PosterBlock item={posterItem} design={k} size={96} />
                  <div style={{ fontSize: 10.5, fontWeight: 800, marginTop: 6 }}>{l}</div>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {c.poster && c.poster !== "none" ? (
                <button type="button" disabled={posterBusy} onClick={() => void setPoster("none", "Poster removed")} style={{ flex: 1, textAlign: "center", padding: 12, borderRadius: 999, background: "var(--card)", border: "1.5px solid var(--el)", fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", color: "var(--text)" }}>
                  Remove
                </button>
              ) : null}
              <button type="button" onClick={() => setPosterOpen(false)} style={{ flex: 1.4, textAlign: "center", padding: 12, borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 12.5, cursor: "pointer", border: "none", fontFamily: "inherit" }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {invoiceOpen && mine && (
        <InvoiceSheet
          title={c.title}
          whenText={whenText}
          whereText={whereText}
          classBookingId={mine.id}
          amountInr={receipt?.amountInr ?? null}
          method={receipt?.method ?? null}
          onClose={() => setInvoiceOpen(false)}
        />
      )}
      {refundOpen && mine && (
        <RefundSheet
          classBookingId={mine.id}
          title={c.title}
          timeText={whenText}
          amountInr={receipt?.amountInr ?? 0}
          onClose={() => setRefundOpen(false)}
          onDone={(msg) => {
            setRefundOpen(false);
            fire(msg);
            router.refresh();
          }}
        />
      )}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 110,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--el)",
            border: "1.5px solid #EC4899",
            color: "var(--text)",
            padding: "11px 18px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 700,
            maxWidth: 390,
            textAlign: "center",
            zIndex: 650,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
