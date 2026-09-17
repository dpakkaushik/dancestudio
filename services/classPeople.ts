import type { SupabaseClient } from "@supabase/supabase-js";
import { claimPerson, findClaimsByClass, setClaimPay, withdrawClaim } from "@/repositories/claims";

/** What the class form says about WHO IS TAKING IT. Since 18 Sep 2026 that is
 *  the only person the form names: the teacher, anyone on DanceOS (the RPC
 *  refuses an organization account and re-checks the caller is the owner).
 *  Assistants are not the form's business any more — they are added from the
 *  class page, by the owner or the teacher, and this service never touches them.
 *
 *  `artistPayInr` is only ever sent by an OWNER — the RPCs refuse a rate from
 *  anybody else. */
export interface ClassPeopleIntent {
  artistUserId: string | null;
  artistPayInr?: number;
}

/** Make the class's TEACHER match what the form asked for.
 *
 *  The form states an intent; the claim is the record. Reconciling rather than
 *  re-asking matters because a claim carries CONSENT: somebody who already said
 *  yes must not be asked again just because the owner re-saved the form. So:
 *    · the same person still named keeps their answer; only the rate may move
 *    · a different person named: the old ask is withdrawn, the new person ASKED
 *    · nobody named: the old ask is withdrawn (the class waits for a teacher)
 *  Assistant claims on the class are left exactly as they are. */
export async function reconcileClassPeople(
  supabase: SupabaseClient,
  classId: string,
  intent: ClassPeopleIntent
): Promise<void> {
  const current = await findClaimsByClass(supabase, classId);
  const teacher = current.find((c) => c.kind === "artist") ?? null;

  if (teacher && teacher.userId === intent.artistUserId) {
    // a rate change is not a re-ask, and it only moves sessions that have not
    // been settled — paid ones are frozen by their payout line
    if (intent.artistPayInr !== undefined && intent.artistPayInr !== teacher.payPerSessionInr) {
      await setClaimPay(supabase, teacher.id, intent.artistPayInr);
    }
    return;
  }
  if (teacher) {
    await withdrawClaim(supabase, teacher.id);
  }
  if (intent.artistUserId) {
    await claimPerson(supabase, {
      classId,
      userId: intent.artistUserId,
      kind: "artist",
      /* the teacher takes the register by default; the owner may take it back on the class page */
      canAttendance: true,
      canRefunds: false,
      payPerSessionInr: intent.artistPayInr,
    });
  }
}
