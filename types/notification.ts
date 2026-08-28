/** Step 24 — notifications. The prototype's NOTIF_KINDS (DanceOSApp.jsx:13642)
 *  and NOTIF_PREFS (13700): six kinds, each with its own tint, stacked one card
 *  per kind on S_notif, and a settings sheet — "What reaches you". */

export type NotificationKind = "enquiry" | "booking" | "money" | "people" | "event" | "class";

/** NOTIF_KINDS, in the prototype's own order and colours */
export const NOTIF_KINDS: Array<{ k: NotificationKind; label: string; tint: string }> = [
  { k: "enquiry", label: "Enquiries", tint: "#8B5CF6" },
  { k: "booking", label: "Bookings", tint: "#22C55E" },
  { k: "money", label: "Money", tint: "#22C55E" },
  { k: "people", label: "People", tint: "#3B82F6" },
  { k: "event", label: "Events", tint: "#F59E0B" },
  { k: "class", label: "Classes", tint: "#5AC8FA" },
];
export const NOTIF_TINT: Record<NotificationKind, string> = Object.fromEntries(NOTIF_KINDS.map((k) => [k.k, k.tint])) as Record<NotificationKind, string>;
export const NOTIF_LABEL: Record<NotificationKind, string> = Object.fromEntries(NOTIF_KINDS.map((k) => [k.k, k.label])) as Record<NotificationKind, string>;

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  /** where pressing it goes, in-app */
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

/** HOW THEY REACH YOU (13800) — stored, and honest about what is wired: in-app
 *  is the only delivery this slice makes, so the three channels are a person's
 *  recorded answer for when each one lands. */
export interface NotificationPrefs {
  kinds: Record<NotificationKind, boolean>;
  push: boolean;
  whatsapp: boolean;
  email: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  kinds: { enquiry: true, booking: true, money: true, people: true, event: true, class: true },
  push: true,
  whatsapp: true,
  email: false,
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
