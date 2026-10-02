import type { BusinessType } from "@/types/business";

/** Step 18 — the enquiry system, lifted from the prototype's ENQ_TYPES
 *  (DanceOSApp.jsx:4900-4923): five types, each with its own fields, each
 *  deciding its own audience ("asking the TYPES rather than hardcoding a list
 *  means adding a type decides its own audience", 4934). */

export type EnquiryTypeKey = "celebration" | "corporate" | "judge" | "private" | "collab";

export type EnquiryField =
  | { k: string; t: "select"; label: string; opts: string[] }
  | { k: string; t: "count"; label: string; min: number; max: number; def: number }
  | { k: string; t: "event"; label: string };

export interface EnquiryType {
  k: EnquiryTypeKey;
  label: string;
  sub: string;
  /** the type's tint (ENQ_TINT 5208) */
  c: string;
  /** who may be sent one — the prototype's entity kinds, mapped onto our businesses */
  to: BusinessType[];
  fields: EnquiryField[];
}

/* ⚠⚠ SHORTER, ON PURPOSE (2 Oct 2026, the user: "shorter forms for every kind
   of enquiry"). Each kind keeps only the questions that change the PRICE —
   what it is, and how much of it — and the rest is the conversation the quote
   starts. Gone: a judge's panel size, a private session's level and where they
   train, a collaboration's "what's needed". Old enquiries keep every field they
   were sent with, because `fields` stores [label, value] pairs and is read back
   whole; nothing about them changes. */
export const ENQ_TYPES: EnquiryType[] = [
  /* ⚠ AN ORGANIZATION COULD BE ASKED THREE OF THESE (19 Sep 2026) and cannot be
     asked anything now, because there is no organization (29 Sep 2026). What is
     left is a studio, an artist page and a crew — a crew's three kinds are fixed
     inside `send_enquiry` and never read from here.
     ⚠⚠ THE JUDGE TYPE STAYS, and that is a decision rather than an oversight:
     its "Which event" is a FREE-TEXT field naming an event out in the world (the
     prototype's own "Pick from DanceOS" picker was never built, 18 Sep), so
     being invited to judge somebody else's battle is a job an artist can still
     be asked to do. It never depended on this app hosting events. */
  {
    k: "celebration",
    label: "Celebrations",
    sub: "weddings · birthdays · anniversaries",
    c: "#EC4899",
    to: ["studio", "artist_page"],
    fields: [
      {
        k: "occasion",
        t: "select",
        label: "Type of event",
        opts: ["Wedding", "Sangeet", "Reception", "Anniversary", "Birthday", "Baby shower", "House party", "Festival", "Other"],
      },
      { k: "perfs", t: "count", label: "Number of performances", min: 1, max: 12, def: 1 },
    ],
  },
  {
    k: "corporate",
    label: "Corporate",
    sub: "brand shoots · offsites · employee classes",
    c: "#0EA5E9",
    to: ["studio", "artist_page"],
    fields: [
      {
        k: "kind",
        t: "select",
        label: "Type of enquiry",
        opts: ["Advertisement", "Corporate Event", "Dance Class for Employees", "Product launch", "Conference", "Team offsite"],
      },
    ],
  },
  {
    k: "judge",
    label: "Invite as Judge",
    sub: "battles · tournaments",
    c: "#F59E0B",
    /* judging is a person's job — offered to artists only (4934) */
    to: ["artist_page"],
    fields: [{ k: "event", t: "event", label: "Which event" }],
  },
  {
    k: "private",
    label: "Private Sessions",
    sub: "one-on-one or small group",
    c: "#22C55E",
    to: ["studio", "artist_page"],
    fields: [
      { k: "format", t: "select", label: "Session format", opts: ["One-on-one", "Couple", "Small group (3–6)", "Group (7+)"] },
      {
        k: "style",
        t: "select",
        label: "Dance style",
        opts: ["Hip-Hop", "Breaking", "Contemporary", "Bollywood", "Kathak", "Bharatanatyam", "Salsa", "Popping", "Freestyle"],
      },
      { k: "sessions", t: "count", label: "How many sessions", min: 1, max: 40, def: 8 },
    ],
  },
  {
    k: "collab",
    label: "Collaboration",
    sub: "content · workshops · campaigns",
    c: "#8B5CF6",
    to: ["studio", "artist_page"],
    fields: [
      {
        k: "kind",
        t: "select",
        label: "Type of collaboration",
        opts: ["Content shoot", "Guest workshop", "Co-choreography", "Brand campaign", "Music video", "Festival showcase"],
      },
    ],
  },
];

export const ENQ_TINT: Record<EnquiryTypeKey, string> = {
  celebration: "#EC4899",
  corporate: "#0EA5E9",
  judge: "#F59E0B",
  private: "#22C55E",
  collab: "#8B5CF6",
};

export const enquiryTypeOf = (k: string): EnquiryType | null => ENQ_TYPES.find((t) => t.k === k) ?? null;

/** the types a business of this kind may be sent (dosEnqTypesFor 4935) */
export const enquiryTypesFor = (kind: BusinessType): EnquiryType[] => ENQ_TYPES.filter((t) => t.to.includes(kind));

/** A CREW CAN BE ASKED (18 Sep 2026, the user: "crews can also get enquiries"):
 *  a crew dances at a celebration, a corporate show or a collaboration. Judging
 *  is a person's job and private sessions are a teacher's — `send_enquiry`
 *  refuses both for a crew, and this is the same list so the sheet never offers
 *  what the database would refuse. */
export const CREW_ENQUIRY_TYPES: EnquiryTypeKey[] = ["celebration", "corporate", "collab"];
export const enquiryTypesForCrew = (): EnquiryType[] => ENQ_TYPES.filter((t) => CREW_ENQUIRY_TYPES.includes(t.k));

/** The stages, in the prototype's own words and order (ENQ_STATUSES 4938). */
/** ⚠ 3 Oct 2026: **Won is gone** — Paid is the money landing in full and
 *  Completed is the business saying the job is done, which were one word before
 *  and are two moments. **Cancelled** is the third way an enquiry ends: either
 *  end may call it off (the sender only before any money has moved). */
export type EnquiryStatus = "new" | "in_talks" | "quoted" | "confirmed" | "advance_paid" | "paid" | "completed" | "lost" | "cancelled";

export const ENQ_STAGE_WORD: Record<EnquiryStatus, string> = {
  new: "New",
  in_talks: "In talks",
  quoted: "Quoted",
  confirmed: "Confirmed",
  advance_paid: "Advance paid",
  paid: "Paid",
  completed: "Completed",
  lost: "Lost",
  cancelled: "Cancelled",
};

export const ENQ_STAGES: EnquiryStatus[] = ["new", "in_talks", "quoted", "confirmed", "advance_paid", "paid", "completed", "lost", "cancelled"];

/** the three ways an enquiry ENDS — everything under Completed in the Inbox */
export const ENQ_CLOSED: ReadonlySet<EnquiryStatus> = new Set(["completed", "lost", "cancelled"]);

/** ⚠ THE ROAD AN ENQUIRY TRAVELS, in the order it is travelled (2 Oct 2026, the
 *  user: "better status update"). `ENQ_STAGES` is the order the prototype's
 *  status MENU lists them, which puts Advance paid before Confirmed — the
 *  opposite of what happens. The tracker on every card and the detail page draws
 *  THIS one; Lost and Cancelled are not steps on it but the road ending. */
export const ENQ_ROAD: EnquiryStatus[] = ["new", "in_talks", "quoted", "confirmed", "advance_paid", "paid", "completed"];

/** how far along the road a stage is — Lost and Cancelled answer -1 */
export const roadStep = (s: EnquiryStatus): number => ENQ_ROAD.indexOf(s);

export type QuoteStatus = "sent" | "accepted" | "declined" | "superseded";

export interface EnquiryQuote {
  id: string;
  n: number;
  costInr: number;
  advancePct: number;
  advanceInr: number;
  status: QuoteStatus;
  advancePaidAt: string | null;
  fullPaidAt: string | null;
  /** the person quoted declined this one and asked for a revised quote (3 Oct 2026) */
  revisionAskedAt: string | null;
  createdAt: string;
}

export interface Enquiry {
  id: string;
  /** the business asked — "" when the enquiry went to a CREW (exactly one of the two is set) */
  businessId: string;
  /** who was asked, in words: the business's name, or the crew's */
  businessName: string;
  businessType: BusinessType;
  /** the business's published number, so the person who ASKED can ring back (I4); a crew has none */
  businessPhone: string | null;
  /** the crew asked (18 Sep 2026) — null when the enquiry went to a business */
  crewId: string | null;
  fromUserId: string;
  fromName: string;
  /** ⚠ BOTH FACES (2 Oct 2026, the user: "profile photos of people") — the
   *  sender's profile picture, and the asked business's or crew's. Null draws
   *  initials; a picture whose row the reader may not see is null, never an error */
  fromPhotoPath: string | null;
  toPhotoPath: string | null;
  typeKey: EnquiryTypeKey;
  /** the exact fields this type collected, as [label, value] pairs */
  fields: Array<[string, string]>;
  dates: string[];
  whereText: string | null;
  message: string;
  mobile: string | null;
  status: EnquiryStatus;
  /** when it was closed and by whom — the sender (cancelled) or somebody on the business's side */
  closedAt: string | null;
  closedBy: string | null;
  createdAt: string;
  quotes: EnquiryQuote[];
}

/** The live quote: the newest one that has not been superseded (enqQuote 5001). */
export const liveQuoteOf = (e: { quotes: EnquiryQuote[] }): EnquiryQuote | null =>
  [...e.quotes].filter((q) => q.status !== "superseded").sort((a, b) => a.n - b.n).pop() ?? null;

/** What the enquiry is ACTUALLY on, derived from the quotes rather than typed
 *  in twice (enqStage 4977): a quote can be accepted and paid while the status
 *  menu still says New because nobody touched it. */
export const enquiryStage = (e: { status: EnquiryStatus; quotes: EnquiryQuote[] }): EnquiryStatus => {
  /* ⚠ A CLOSE WINS (2 Oct 2026, found while redesigning the status control):
     with a live quote the derived stage used to override a hand-set close — so
     pressing "Lost" on a quoted enquiry changed the row and nothing on screen. A
     close is a decision; the quote's own state is only the default. */
  if (ENQ_CLOSED.has(e.status)) return e.status;
  const live = liveQuoteOf(e);
  if (!live) return e.status;
  if (live.fullPaidAt) return "paid";
  if (live.advancePaidAt) return "advance_paid";
  if (live.status === "accepted") return "confirmed";
  /* ⚠ a declined quote no longer ends the enquiry (3 Oct 2026): it is the sender
     asking for a revised one, and the enquiry is back in talks */
  if (live.status === "declined") return "in_talks";
  return "quoted";
};

/** the live quote was declined with a revision asked for, and nothing newer sent */
export const revisionAsked = (e: { quotes: EnquiryQuote[]; status: EnquiryStatus }): boolean => {
  const live = liveQuoteOf(e);
  return Boolean(live && live.status === "declined" && live.revisionAskedAt && !ENQ_CLOSED.has(e.status));
};

/** what an enquiry is worth on the desk: the live quote, else nothing yet */
export const enquiryValueInr = (e: { quotes: EnquiryQuote[] }): number => liveQuoteOf(e)?.costInr ?? 0;
