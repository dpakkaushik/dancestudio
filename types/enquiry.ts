import type { BusinessType } from "@/types/business";

/** Step 18 — the enquiry system, lifted from the prototype's ENQ_TYPES
 *  (DanceOSApp.jsx:4900-4923): five types, each with its own fields, each
 *  deciding its own audience ("asking the TYPES rather than hardcoding a list
 *  means adding a type decides its own audience", 4934). */

/** ⚠⚠ THREE KINDS SINCE 4 Oct 2026 (the user: "3 broad enquiries — as a
 *  Choreographer, Performer, Judge/guest … limit the options or list will be
 *  huge"). They are the only kinds there are: every enquiry sent before was
 *  taken down ("remove all old enquiries entirely so the data doesnt clash"),
 *  and `enquiries_type_key_check` keeps a LIVE row to these three. The old four
 *  words (celebration · corporate · private · collab) survive only on
 *  soft-deleted rows, which no screen reads. */
export type EnquiryTypeKey = "choreographer" | "performer" | "judge";
/** the same three — kept as its own name because the sheet and the action say "sendable" */
export type SendableEnquiryTypeKey = EnquiryTypeKey;

export type EnquiryField =
  /** `notes` sit under each option, in the same order — a few words saying what the option covers */
  | { k: string; t: "select"; label: string; opts: string[]; notes?: string[] }
  | { k: string; t: "count"; label: string; min: number; max: number; def: number }
  | { k: string; t: "event"; label: string };

export interface EnquiryType<K extends EnquiryTypeKey = EnquiryTypeKey> {
  k: K;
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
export const ENQ_TYPES: EnquiryType<SendableEnquiryTypeKey>[] = [
  /* ⚠⚠ THE OPTIONS WERE CUT FROM ~50 TO 7 (4 Oct 2026, the user, three rounds
     of "trim down even more"). Celebrations, corporate, private sessions and
     collaboration are CLUBBED into what the person is asked to DO — make the
     dance, or dance it — and the occasion is one short choice. Group size,
     dance style and the rest go in the message every enquiry already carries. */
  {
    k: "choreographer",
    label: "Choreographer",
    sub: "events · classes · shoots",
    c: "#8B5CF6",
    to: ["studio", "artist_page"],
    fields: [
      {
        k: "for",
        t: "select",
        label: "What for",
        opts: ["Event", "Classes", "Shoot"],
        notes: ["wedding, party, show or festival", "private or corporate, any size", "music video, ad, content or campaign"],
      },
      { k: "sessions", t: "count", label: "How many sessions", min: 1, max: 40, def: 1 },
    ],
  },
  {
    k: "performer",
    label: "Performer",
    sub: "events · shoots",
    c: "#EC4899",
    to: ["studio", "artist_page"],
    fields: [
      {
        k: "for",
        t: "select",
        label: "What for",
        opts: ["Event", "Shoot"],
        notes: ["wedding, party, corporate or festival", "music video, ad, content or campaign"],
      },
      { k: "perfs", t: "count", label: "Number of performances", min: 1, max: 12, def: 1 },
    ],
  },
  /* ⚠ JUDGE / GUEST keeps the key `judge` (the old "Invite as Judge"). Its "Which event" is free text — an event out in the world, never
     one hosted here (there are none since 29 Sep). A person's job, so an
     artist's alone (`send_enquiry` refuses a studio). */
  {
    k: "judge",
    label: "Judge / Guest",
    sub: "battles · workshops · guest appearances",
    c: "#F59E0B",
    to: ["artist_page"],
    fields: [
      {
        k: "as",
        t: "select",
        label: "As",
        opts: ["Judge", "Guest"],
        notes: ["battle, tournament or competition", "workshop, chief guest or speaker"],
      },
      { k: "event", t: "event", label: "Which event" },
    ],
  },
];

export const ENQ_TINT: Record<EnquiryTypeKey, string> = {
  choreographer: "#8B5CF6",
  performer: "#EC4899",
  judge: "#F59E0B",
};

export const enquiryTypeOf = (k: string): EnquiryType | null => ENQ_TYPES.find((t) => t.k === k) ?? null;

/** the types a business of this kind may be sent (dosEnqTypesFor 4935) */
export const enquiryTypesFor = (kind: BusinessType): EnquiryType<SendableEnquiryTypeKey>[] => ENQ_TYPES.filter((t) => t.to.includes(kind));

/* ⚠ A CREW TAKES NO ENQUIRIES since 4 Oct 2026 (the user: "remove enquiries for
   crew") — its three-kind list went with it; `send_enquiry` refuses a crew. The
   `crewId` field on `Enquiry` stays so an old row still reads. */

/** THE STAGES (3 Oct 2026, the user's end-to-end enquiry, agreed point by point).
 *
 *  An enquiry travels New → Accepted → Quoted → Ongoing → (Advance paid → Paid,
 *  read off the MONEY, never stored) → Completing → Completed, and ends one of
 *  three other ways: Declined (the business, at the start), Withdrawn (the
 *  sender), Called off (the business, later). The legacy words stay in the union
 *  because old closed rows still carry them — Lost and Cancelled are printed as
 *  they always were; nothing new writes any of the legacy six. */
export type EnquiryStatus =
  | "new"
  | "accepted"
  | "quoted"
  | "ongoing"
  | "advance_paid"
  | "paid"
  | "completing"
  | "completed"
  | "declined"
  | "withdrawn"
  | "called_off"
  // legacy, read only
  | "in_talks"
  | "confirmed"
  | "lost"
  | "cancelled";

export const ENQ_STAGE_WORD: Record<EnquiryStatus, string> = {
  new: "New",
  accepted: "Accepted",
  quoted: "Quoted",
  ongoing: "Ongoing",
  advance_paid: "Advance paid",
  paid: "Paid",
  completing: "Completing",
  completed: "Completed",
  declined: "Declined",
  withdrawn: "Withdrawn",
  called_off: "Called off",
  in_talks: "In talks",
  confirmed: "Confirmed",
  lost: "Lost",
  cancelled: "Cancelled",
};

/** THE ROAD AN ENQUIRY TRAVELS, in the order it is travelled. The tracker on
 *  every card and the detail page draws this; the endings are the road ending. */
export const ENQ_ROAD: EnquiryStatus[] = ["new", "accepted", "quoted", "ongoing", "advance_paid", "paid", "completing", "completed"];

/** every way an enquiry ENDS — the Inbox's Completed side holds these */
export const ENQ_CLOSED: ReadonlySet<EnquiryStatus> = new Set(["completed", "declined", "withdrawn", "called_off", "lost", "cancelled"]);
/** the three that end it WITHOUT the job being done */
export const ENQ_ENDED: ReadonlySet<EnquiryStatus> = new Set(["declined", "withdrawn", "called_off", "lost", "cancelled"]);

/** every stage a screen may show, road first, then the endings (filters, the breakup) */
export const ENQ_STAGES: EnquiryStatus[] = [...ENQ_ROAD, "declined", "withdrawn", "called_off", "lost", "cancelled"];

/** how far along the road a stage is — an ending answers -1 */
export const roadStep = (s: EnquiryStatus): number => ENQ_ROAD.indexOf(s);

export type QuoteStatus = "sent" | "accepted" | "declined" | "superseded" | "cancelled";
export type QuoteKind = "quote" | "addition";

/** one line of a quote or an addition: a name, a whole quantity, a whole-rupee price */
export interface QuoteItem {
  sort: number;
  name: string;
  qty: number;
  unitInr: number;
  lineInr: number;
}

export interface EnquiryQuote {
  id: string;
  n: number;
  /** a quote is the job's price; an addition is something added to a project already on (may be a reduction) */
  kind: QuoteKind;
  costInr: number;
  advancePct: number;
  advanceInr: number;
  status: QuoteStatus;
  advancePaidAt: string | null;
  /** a quote: when it was settled in full; an addition: when it was paid */
  fullPaidAt: string | null;
  /** the balance actually paid, stamped when it was (a reduction can move it) */
  balancePaidInr: number | null;
  /** the person quoted asked for a revised one (a quote) */
  revisionAskedAt: string | null;
  /** the last day a quote can be accepted, YYYY-MM-DD; null on legacy quotes */
  validUntil: string | null;
  note: string | null;
  /** the sender's reason — for a revision, or for declining an addition */
  answerReason: string | null;
  answeredAt: string | null;
  /** an addition revised from a declined one */
  revises: string | null;
  items: QuoteItem[];
  createdAt: string;
}

/** proposed terms for ending an enquiry after money moved */
export interface EnquiryEnding {
  id: string;
  outcome: "withdrawn" | "called_off";
  side: "sender" | "business";
  refundInr: number;
  reason: string;
  status: "open" | "accepted" | "countered" | "refused" | "retracted";
  counterOf: string | null;
  answerReason: string | null;
  refundOnlineInr: number | null;
  refundHandInr: number | null;
  createdAt: string;
  answeredAt: string | null;
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
  /** when it was closed and by whom */
  closedAt: string | null;
  closedBy: string | null;
  /** why it ended: the decline reason, or the withdrawal's / call-off's */
  closeReason: string | null;
  /** which side marked the project complete first */
  completeAskedSide: "sender" | "business" | null;
  completeAskedAt: string | null;
  createdAt: string;
  /** quotes AND additions, in the order they were sent */
  quotes: EnquiryQuote[];
  /** every set of ending terms ever proposed, oldest first */
  endings: EnquiryEnding[];
}

/** the IST day as YYYY-MM-DD — what a quote's valid-until is compared with */
export const istDayKey = (iso: string): string => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);

/** The live QUOTE: the newest base quote that has not been superseded (enqQuote 5001). Additions never count. */
export const liveQuoteOf = (e: { quotes: EnquiryQuote[] }): EnquiryQuote | null =>
  [...e.quotes].filter((q) => q.kind === "quote" && q.status !== "superseded").sort((a, b) => a.n - b.n).pop() ?? null;

/** the accepted base quote — the price of the project once it is on */
export const baseQuoteOf = (e: { quotes: EnquiryQuote[] }): EnquiryQuote | null =>
  [...e.quotes].filter((q) => q.kind === "quote" && q.status === "accepted").sort((a, b) => a.n - b.n).pop() ?? null;

export const additionsOf = (e: { quotes: EnquiryQuote[] }): EnquiryQuote[] => e.quotes.filter((q) => q.kind === "addition").sort((a, b) => a.n - b.n);

/** a quote waiting on an answer past its last day — derived, no cron */
export const quoteExpired = (q: EnquiryQuote, nowIso: string): boolean =>
  q.status === "sent" && Boolean(q.validUntil) && (q.validUntil as string) < istDayKey(nowIso);

/** THE MONEY OF ONE ENQUIRY — the same arithmetic as the database's
 *  `enquiry_money`, so a screen never says a different number from the door. */
export interface EnquiryMoney {
  totalInr: number;
  paidInr: number;
  outstandingInr: number;
  advanceDueInr: number;
  /** what the base asks for after the advance and every accepted reduction */
  balanceInr: number;
  balancePaid: boolean;
  additionsDueInr: number;
  additionsWaiting: number;
  readyToComplete: boolean;
}

export function enquiryMoney(e: { quotes: EnquiryQuote[] }): EnquiryMoney {
  const b = baseQuoteOf(e);
  const acc = additionsOf(e).filter((a) => a.status === "accepted");
  const neg = acc.filter((a) => a.costInr < 0).reduce((s, a) => s + a.costInr, 0);
  const pos = acc.filter((a) => a.costInr > 0).reduce((s, a) => s + a.costInr, 0);
  const posPaid = acc.filter((a) => a.costInr > 0 && a.fullPaidAt).reduce((s, a) => s + a.costInr, 0);
  const waiting = additionsOf(e).filter((a) => a.status === "sent").length;
  if (!b) {
    return { totalInr: 0, paidInr: 0, outstandingInr: 0, advanceDueInr: 0, balanceInr: 0, balancePaid: false, additionsDueInr: 0, additionsWaiting: waiting, readyToComplete: false };
  }
  const balancePaid = Boolean(b.fullPaidAt);
  const paid =
    (b.advancePaidAt ? b.advanceInr : 0) + (balancePaid ? (b.balancePaidInr ?? Math.max(b.costInr - b.advanceInr, 0)) : 0) + posPaid;
  const total = b.costInr + neg + pos;
  return {
    totalInr: total,
    paidInr: paid,
    outstandingInr: Math.max(total - paid, 0),
    advanceDueInr: b.advanceInr > 0 && !b.advancePaidAt ? b.advanceInr : 0,
    balanceInr: b.costInr - b.advanceInr + neg,
    balancePaid,
    additionsDueInr: pos - posPaid,
    additionsWaiting: waiting,
    readyToComplete: balancePaid && pos === posPaid && waiting === 0,
  };
}

/** What the enquiry is on, for a screen: the stored stage, with the money read
 *  into a project that is on (Advance paid · Paid) and the legacy words mapped. */
export const enquiryStage = (e: { status: EnquiryStatus; quotes: EnquiryQuote[] }): EnquiryStatus => {
  if (ENQ_CLOSED.has(e.status)) return e.status;
  if (e.status === "in_talks") return "accepted";
  if (e.status === "ongoing" || e.status === "confirmed" || e.status === "advance_paid" || e.status === "paid") {
    const b = baseQuoteOf(e);
    if (b?.fullPaidAt) return "paid";
    if (b?.advancePaidAt && b.advanceInr > 0) return "advance_paid";
    return "ongoing";
  }
  return e.status;
};

/** the live quote was sent back with a revision asked for, and nothing newer sent */
export const revisionAsked = (e: { quotes: EnquiryQuote[]; status: EnquiryStatus }): boolean => {
  const live = liveQuoteOf(e);
  return Boolean(live && live.status === "declined" && live.revisionAskedAt && !ENQ_CLOSED.has(e.status));
};

/** what an enquiry is worth on the desk: the project's total once on, else the live quote */
export const enquiryValueInr = (e: { quotes: EnquiryQuote[] }): number => {
  const m = enquiryMoney(e);
  return m.totalInr || liveQuoteOf(e)?.costInr || 0;
};

/** the open ending terms, if any */
export const openEndingOf = (e: { endings: EnquiryEnding[] }): EnquiryEnding | null => e.endings.find((x) => x.status === "open") ?? null;
