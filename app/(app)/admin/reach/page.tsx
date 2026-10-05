import type { Metadata } from "next";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { ReachDesk, type ReachTab } from "@/features/admin/components/ReachDesk";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { isResendWebhookConfigured } from "@/lib/resend/signature";
import {
  findAdminAccounts,
  findAdminBusinesses,
  findEmailDeliveryPulse,
  findEmailHistoryFor,
  findImpressionsForBusiness,
  findImpressionsForPerson,
  findSearchTermsWithNoAnswer,
  type AdminAccount,
  type AdminBusiness,
  type EmailEventRow,
  type EmailPulseRow,
  type ImpressionRow,
  type SearchTermRow,
} from "@/repositories/adminPanel";

export const metadata: Metadata = { title: "Reach — DanceOS admin" };

const TABS: ReachTab[] = ["searches", "shown", "email"];
const WINDOWS = [7, 30, 90];

/** /admin/reach — the desk over the three tables that had writers and no reader
 *  (30 Sep 2026).
 *
 *  `search_events`, `impressions` and `email_events` have been collecting since
 *  29–30 Sep and nothing could look at any of them: the four SECURITY DEFINER
 *  reads shipped with the migrations and had no caller, which is the same
 *  "an export nothing calls is sometimes a feature nobody can reach" shape the
 *  28 Sep sweep deliberately kept two dead actions for.
 *
 *  ⚠ ONLY THE OPEN TAB'S READS ARE MADE. Three tabs over three tables would
 *  otherwise be five round trips on every visit for one answer.
 *
 *  ⚠⚠ EVERY READ USES THE CALLER'S CLIENT, NEVER THE SERVICE ROLE. All four
 *  functions are gated on `is_platform_admin()`, and a definer function gated
 *  that way answers the service role with EMPTINESS rather than an error
 *  (10 Sep 2026) — so a service-role read here would draw a desk of zeros and
 *  look like no traffic. `requireAdmin()` hands back the admin's own client. */
export default async function AdminReachPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; id?: string; kind?: string; days?: string }>;
}) {
  const { supabase, badges } = await requireAdmin();
  const params = await searchParams;

  const tab: ReachTab = TABS.includes(params.tab as ReachTab) ? (params.tab as ReachTab) : "searches";
  const q = (params.q ?? "").trim();
  const days = WINDOWS.includes(Number(params.days)) ? Number(params.days) : 30;

  let terms: SearchTermRow[] = [];
  let businesses: AdminBusiness[] = [];
  let chosen: AdminBusiness | null = null;
  let people: AdminAccount[] = [];
  let chosenPerson: AdminAccount | null = null;
  let impressions: ImpressionRow[] = [];
  let pulse: EmailPulseRow[] = [];
  let history: EmailEventRow[] = [];
  let needsMigration = false;

  if (tab === "searches") {
    const r = await findSearchTermsWithNoAnswer(supabase, { days, limit: 50 });
    terms = r.rows;
    needsMigration = r.needsMigration;
  } else if (tab === "shown") {
    if (q) {
      /* ARTISTS TOO (6 Oct 2026, decision 7): an artist is a PERSON with a live
         plan (R24), recorded under `person` — so the term is looked up among the
         accounts as well, and only the ones holding the plan are offered */
      [businesses, people] = await Promise.all([
        findAdminBusinesses(supabase, { q, limit: 100 }),
        findAdminAccounts(supabase, { q, limit: 50 }).then((a) => a.filter((p) => p.hasPlan && !p.isAdmin)),
      ]);
      /* the link that opened this carries both the term and the id, so the
         business or the artist is found in the list the term already returned —
         no second read, and an id that is not in it simply falls back to the list */
      if (params.id && params.kind === "person") {
        chosenPerson = people.find((p) => p.id === params.id) ?? null;
      } else if (params.id) {
        chosen = businesses.find((b) => b.id === params.id) ?? null;
      }
      if (chosen || chosenPerson) {
        const r = chosen
          ? await findImpressionsForBusiness(supabase, chosen.id, days)
          : await findImpressionsForPerson(supabase, chosenPerson!.id, days);
        impressions = r.rows;
        needsMigration = r.needsMigration;
      }
    }
  } else {
    const [p, h] = await Promise.all([
      findEmailDeliveryPulse(supabase, days),
      /* an address, not a name — a blank box asks for nothing */
      q ? findEmailHistoryFor(supabase, q, 50) : Promise.resolve({ rows: [] as EmailEventRow[], needsMigration: false }),
    ]);
    pulse = p.rows;
    history = h.rows;
    needsMigration = p.needsMigration;
  }

  return (
    <AdminShell badges={badges}>
      <ReachDesk
        tab={tab}
        q={q}
        days={days}
        terms={terms}
        businesses={businesses}
        chosen={chosen}
        people={people}
        chosenPerson={chosenPerson}
        impressions={impressions}
        pulse={pulse}
        history={history}
        needsMigration={needsMigration}
        webhookConfigured={isResendWebhookConfigured()}
      />
    </AdminShell>
  );
}
