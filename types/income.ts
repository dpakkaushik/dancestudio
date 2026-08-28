/** Step 13b part 2b — the studio's money IN, the other half of the prototype's
 *  S_earn (17877-18205). Everything here is a SUM of rows Step 9 already keeps:
 *  captured payments are the gross, processed refunds are the deductions, and
 *  what is still being asked back is the open queue. Nothing is derived from a
 *  price list — the prototype's own rule for this screen is "counted, not
 *  guessed" (18037-18047). */

/** One payment method's share of a month — the HOW STUDENTS PAID bar. The
 *  `method` is the rail's word for it (Cashfree: upi, credit_card, net_banking, wallet, ...),
 *  normalised to lower case; the UI decides the label and the colour. */
export interface MethodShare {
  method: string;
  amountInr: number;
  count: number;
}

/** One calendar month of a studio's income, read in IST. */
export interface MonthIncome {
  /** "2026-08" — the bucket key */
  key: string;
  /** "August" — the period chip and the card label */
  monthName: string;
  /** "August 2026" — the statement heading */
  label: string;
  /** captured payments (a refunded payment still CAME IN; its refund is a deduction) */
  grossInr: number;
  paymentCount: number;
  /** refunds actually processed in this month — the statement's one real deduction */
  refundedInr: number;
  refundCount: number;
  byMethod: MethodShare[];
}

export interface TenantIncome {
  /** the month the clock is in */
  current: MonthIncome;
  /** the three months before it, most recent first — the period chips */
  previous: MonthIncome[];
  /** refunds requested or pending right now, whatever month they were filed —
   *  a live queue figure, like the prototype's In transit tile */
  openRefundsInr: number;
  openRefundCount: number;
  /** false when a query hit its runaway guard, so a total might be short — the
   *  screen says so rather than printing a wrong number as if it were right */
  complete: boolean;
}
