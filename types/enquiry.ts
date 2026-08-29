import type { TenantType } from "@/types/tenant";

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
  /** who may be sent one — the prototype's entity kinds, mapped onto our tenants */
  to: TenantType[];
  fields: EnquiryField[];
}

export const ENQ_TYPES: EnquiryType[] = [
  {
    k: "celebration",
    label: "Celebrations",
    sub: "weddings · birthdays · anniversaries",
    c: "#EC4899",
    to: ["studio", "trainer_business"],
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
    to: ["studio", "trainer_business"],
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
    to: ["trainer_business"],
    fields: [
      { k: "event", t: "event", label: "Which event" },
      { k: "panel", t: "count", label: "Judges on the panel", min: 1, max: 9, def: 3 },
    ],
  },
  {
    k: "private",
    label: "Private Sessions",
    sub: "one-on-one or small group",
    c: "#22C55E",
    to: ["studio", "trainer_business"],
    fields: [
      { k: "format", t: "select", label: "Session format", opts: ["One-on-one", "Couple", "Small group (3–6)", "Group (7+)"] },
      {
        k: "style",
        t: "select",
        label: "Dance style",
        opts: ["Hip-Hop", "Breaking", "Contemporary", "Bollywood", "Kathak", "Bharatanatyam", "Salsa", "Popping", "Freestyle"],
      },
      { k: "level", t: "select", label: "Level", opts: ["Absolute beginner", "Beginner", "Intermediate", "Advanced"] },
      { k: "mode", t: "select", label: "Where they train", opts: ["At the studio", "At my place", "Online"] },
      { k: "sessions", t: "count", label: "How many sessions", min: 1, max: 40, def: 8 },
    ],
  },
  {
    k: "collab",
    label: "Collaboration",
    sub: "content · workshops · campaigns",
    c: "#8B5CF6",
    to: ["studio", "trainer_business"],
    fields: [
      {
        k: "kind",
        t: "select",
        label: "Type of collaboration",
        opts: ["Content shoot", "Guest workshop", "Co-choreography", "Brand campaign", "Music video", "Festival showcase"],
      },
      { k: "deliver", t: "select", label: "What's needed", opts: ["Choreography only", "Perform on camera", "Teach a batch", "Full production"] },
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
export const enquiryTypesFor = (kind: TenantType): EnquiryType[] => ENQ_TYPES.filter((t) => t.to.includes(kind));

/** The stages, in the prototype's own words and order (ENQ_STATUSES 4938). */
export type EnquiryStatus = "new" | "in_talks" | "quoted" | "advance_paid" | "confirmed" | "won" | "lost";

export const ENQ_STAGE_WORD: Record<EnquiryStatus, string> = {
  new: "New",
  in_talks: "In talks",
  quoted: "Quoted",
  advance_paid: "Advance paid",
  confirmed: "Confirmed",
  won: "Won",
  lost: "Lost",
};

export const ENQ_STAGES: EnquiryStatus[] = ["new", "in_talks", "quoted", "advance_paid", "confirmed", "won", "lost"];

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
  createdAt: string;
}

export interface Enquiry {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantType: TenantType;
  /** the business's published number, so the person who ASKED can ring back (I4) */
  tenantPhone: string | null;
  fromUserId: string;
  fromName: string;
  typeKey: EnquiryTypeKey;
  /** the exact fields this type collected, as [label, value] pairs */
  fields: Array<[string, string]>;
  dates: string[];
  whereText: string | null;
  message: string;
  mobile: string | null;
  status: EnquiryStatus;
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
  const live = liveQuoteOf(e);
  if (!live) return e.status;
  if (live.fullPaidAt) return "won";
  if (live.advancePaidAt) return "advance_paid";
  if (live.status === "accepted") return "confirmed";
  if (live.status === "declined") return "lost";
  return "quoted";
};

/** what an enquiry is worth on the desk: the live quote, else nothing yet */
export const enquiryValueInr = (e: { quotes: EnquiryQuote[] }): number => liveQuoteOf(e)?.costInr ?? 0;
