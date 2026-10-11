/** Notifications, grouped BY APP AREA (11 Oct 2026, `20261019090000`).
 *
 *  The user: "fix notifications completely revamp it according to new needs
 *  with notification history and settings managed properly", choosing groups by
 *  the area of the app a notification opens — not the prototype's six kinds
 *  (NOTIF_KINDS 13642: Enquiries · Bookings · Money · People · Events · Classes),
 *  which mixed "who" (People) with "what" (Bookings) and split one area across
 *  two stacks. A BEFORE INSERT trigger (`notification_group`) files every row
 *  into its group, so the thirty-odd functions that raise one keep writing what
 *  they write and land in the right place.
 *
 *  ⚠ `event` stays as HISTORY ONLY: the retired Events feature's old rows carry
 *  it (all marked read by the migration). It is drawn as "Events (retired)" and
 *  has no settings row — nothing can raise a new one. */
export type NotificationGroup = "class" | "team" | "crew" | "enquiry" | "money" | "danceos";
export type NotificationKind = NotificationGroup | "event";

export type NotificationGlyph = "class" | "team" | "crew" | "enquiry" | "money" | "danceos" | "event";

export interface NotificationGroupDef {
  k: NotificationKind;
  label: string;
  /** what lands here, one short line — said in the settings sheet */
  about: string;
  tint: string;
  glyph: NotificationGlyph;
}

/** the six groups, in the order the app's areas are reached */
export const NOTIF_GROUPS: NotificationGroupDef[] = [
  { k: "class", label: "Classes", about: "Asks, bookings, reminders, step-downs", tint: "#0D9488", glyph: "class" },
  { k: "team", label: "Studios & team", about: "Team invites, who joined", tint: "#EA580C", glyph: "team" },
  { k: "crew", label: "Crews & practice", about: "Crew asks, practices", tint: "#DC2626", glyph: "crew" },
  { k: "enquiry", label: "Enquiries", about: "Enquiries, quotes, endings", tint: "#7C3AED", glyph: "enquiry" },
  { k: "money", label: "Money", about: "Payments, refunds, payouts", tint: "#16A34A", glyph: "money" },
  { k: "danceos", label: "DanceOS", about: "Support, verification", tint: "#64748B", glyph: "danceos" },
];

/** the retired Events feature's rows — history, never a setting */
export const NOTIF_EVENT_GROUP: NotificationGroupDef = { k: "event", label: "Events (retired)", about: "History", tint: "#F59E0B", glyph: "event" };

/** every group a row can carry, the retired one last */
export const NOTIF_KINDS: NotificationGroupDef[] = [...NOTIF_GROUPS, NOTIF_EVENT_GROUP];

export const groupOf = (k: NotificationKind): NotificationGroupDef => NOTIF_KINDS.find((g) => g.k === k) ?? NOTIF_EVENT_GROUP;

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  /** where pressing it goes, in-app — the screen where you act */
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Per group: shown HERE (`kinds`) and pushed to the phone (`pushKinds`, while
 *  `push` is on). Every group defaults on. ⚠ WhatsApp and email are columns the
 *  database still holds and the app no longer shows (11 Oct 2026). */
export interface NotificationPrefs {
  kinds: Record<NotificationGroup, boolean>;
  pushKinds: Record<NotificationGroup, boolean>;
  push: boolean;
}

const ALL_ON: Record<NotificationGroup, boolean> = { class: true, team: true, crew: true, enquiry: true, money: true, danceos: true };

export const DEFAULT_PREFS: NotificationPrefs = {
  kinds: { ...ALL_ON },
  pushKinds: { ...ALL_ON },
  push: true,
};

/** a stored map read back: only the six groups' booleans, every missing one on */
export const groupMap = (raw: unknown): Record<NotificationGroup, boolean> => {
  const out = { ...ALL_ON };
  if (raw && typeof raw === "object") {
    for (const g of NOTIF_GROUPS) {
      const v = (raw as Record<string, unknown>)[g.k];
      if (typeof v === "boolean") out[g.k as NotificationGroup] = v;
    }
  }
  return out;
};

/** "4 h ago" — the prototype prints a relative age (`at`), computed here from
 *  the row's timestamp against a clock the server stamped. */
export const agoWords = (iso: string, nowIso: string): string => {
  const mins = Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 d ago" : `${days} d ago`;
};
