/** WHERE AN ORGANIZATION STANDS, IN ONE WORD (R13, 9 Sep 2026).
 *
 *  A pure module on purpose. Home is a SERVER component and needs this for the
 *  badge on the organization's name; `OrgStanding` is a CLIENT component and
 *  needs it for the card's title. Exporting it from the client component and
 *  importing it into Home compiled and typechecked cleanly, then failed at
 *  runtime — "attempted to call orgStandingWords() from the server but
 *  orgStandingWords is on the client" — which is why it lives here instead.
 *  Nothing in this file imports React. */

export interface OrgStandingWords {
  /** the card's title, and the aria-label both surfaces are found by */
  title: string;
  /** the colour of the state: green verified, amber waiting, red refused */
  tone: string;
  /** the short badge worn beside the organization's own name on Home */
  chip: string;
}

export function orgStandingWords(verifiedAt: string | null, status: string | undefined): OrgStandingWords {
  if (verifiedAt) return { title: "Verified organization", tone: "#22C55E", chip: "VERIFIED" };
  if (status === "pending") return { title: "Under verification", tone: "#F59E0B", chip: "UNDER VERIFICATION" };
  if (status === "rejected") return { title: "Not approved", tone: "#EF4444", chip: "NOT APPROVED" };
  return { title: "Not verified yet", tone: "var(--sub)", chip: "NOT VERIFIED" };
}
