/** ONE WORD LIST FOR THE CLASS CARD, WHEREVER IT IS DRAWN (4 Oct 2026, the
 *  user: "solves the nomenclature problem for these tiles when viewing from
 *  different pages").
 *
 *  Before this file the same fact had a different name on every page: a seat
 *  you hold read "Booked" on Home, "Enrolled ✓" on its button and "Train" on the
 *  calendar; a class you teach read "Teaching", "Teach" and "THE ARTIST TAKING
 *  IT"; an artist's class in your room read "At your studio", "Hosted" and "THE
 *  ROOM FOR A CLASS". Each page had picked its own word.
 *
 *  The rule now: every label belongs to ONE of three kinds, and each kind has
 *  one word per fact, one colour and one place on the card.
 *    1. WHAT THE CLASS IS TO YOU — the chip under the style name (`relation`).
 *    2. WHERE IT STANDS IN TIME — the badge top left (Live · Upcoming ·
 *       Completed) and the note under the seats (Draft · Completed).
 *    3. WHERE AN ASK STANDS — Asked · Confirmed · Declined · Withdrawn.
 *
 *  ⚠ Words only. Nothing here decides what a button does, who may press it or
 *  what is stored: `class_bookings.status = 'enrolled'` is still the stored
 *  value for a booked seat — the screen just says "Booked". */

export type ClassRelation =
  | "booked"
  | "teaching"
  | "assisting"
  | "atYourStudio"
  | "askedToTeach"
  | "askedToAssist"
  | "roomRequest";

export const CLASS_RELATION: Record<ClassRelation, { word: string; tint: string }> = {
  booked: { word: "Booked", tint: "#22C55E" },
  teaching: { word: "Teaching", tint: "#0EA5E9" },
  assisting: { word: "Assisting", tint: "#8B5CF6" },
  atYourStudio: { word: "At your studio", tint: "#6366F1" },
  /* the three asks share amber: each one is waiting on somebody's answer */
  askedToTeach: { word: "Asked to teach", tint: "#F59E0B" },
  askedToAssist: { word: "Asked to assist", tint: "#F59E0B" },
  roomRequest: { word: "Room request", tint: "#F59E0B" },
};

/** where an ask stands — the Inbox's stamps and the register's chips say the
 *  same four words */
export const ASK_STATUS_WORD = {
  asked: "Asked",
  confirmed: "Confirmed",
  rejected: "Declined",
  declined: "Declined",
  withdrawn: "Withdrawn",
} as const;

/** the calendar's three sides speak the card's words (`CalendarSide` is the
 *  stored key; this is only what is printed) */
export const SIDE_RELATION = {
  attending: "booked",
  hosting: "teaching",
  assisting: "assisting",
} as const satisfies Record<string, ClassRelation>;
