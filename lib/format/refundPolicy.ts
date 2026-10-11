/** ONE SENTENCE FOR A STUDIO'S REFUND WINDOW (11 Oct 2026, B7).
 *
 *  `_cancel_one_class_booking` refunds a paid seat automatically when it is
 *  cancelled at least `refund_window_hours` before the start, and leaves it to
 *  the studio inside that window; a started class cannot be cancelled at all. So
 *  a window of 0 means "automatic until the class starts" — the class page used
 *  to print "No automatic refund" for it, which said the opposite of the rule.
 *
 *  Every screen that prints the rule reads it here: the class page's POLICY row,
 *  the refund sheet, the class form's confirm and the terms page. A pass follows
 *  the same window (D6): before it the hours come back, inside it they are kept. */

/** "12 hours" / "1 hour" — the window in words. */
export function windowWords(hours: number): string {
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/** The POLICY row's short line: "Refund until 12 h before start" /
 *  "Refund until the class starts". */
export function refundPolicyWords(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "Refund until the class starts";
  return `Refund until ${hours} h before start`;
}

/** The whole rule as a sentence, for the terms page and the refund sheet. */
export function refundPolicySentence(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) {
    return "Cancel any time before the class starts and you are refunded automatically.";
  }
  return `Cancel at least ${windowWords(hours)} before the class and you are refunded automatically; inside ${windowWords(hours)} the studio decides.`;
}

/** Which side of the window a learner is on RIGHT NOW. `msToStart` is the
 *  start minus now, measured by the caller (a component cannot read the clock
 *  during render). */
export function refundSideNow(hours: number, msToStart: number): "automatic" | "studio" | "started" {
  if (msToStart <= 0) return "started";
  if (hours <= 0) return "automatic";
  return msToStart >= hours * 3_600_000 ? "automatic" : "studio";
}
